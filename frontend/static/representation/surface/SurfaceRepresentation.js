import * as THREE from '../../libs/three.webgpu.js';

import {RepresentationBase} from '../common/RepresentationBase.js';
import {EventTypes} from '../../core/event/EventTypes.js';
import {makePickTarget, PickTargetKind} from '../interaction/PickTarget.js';

import {
    SurfaceMeshKind,
    countResidueColorRules,
    materialSideFromStyle,
    normalizeResidueColorRules,
    resolveSurfaceStyle,
} from './SurfaceStyle.js';
import {
    boundingBoxForSurfaceAtoms,
    buildSurfaceAtomSet,
    normalizeSurfaceLayers,
    selectResiduesForSurfaceLayer,
} from './SurfaceRangeBuilder.js';
import {buildSurfaceMeshData, createSurfaceBufferGeometry} from './SurfaceVolumeBuilder.js';
import {buildSurfaceOwnershipMap, ownershipSummaryForUserData} from './SurfaceOwnershipMap.js';
import {buildSurfaceVertexColors} from './SurfaceColorMapper.js';
import {analyzeSurfaceLayerContacts} from './SurfaceLayerContactAnalyzer.js';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function mergeOptions(spec = {}) {
    const style = resolveSurfaceStyle(spec.style || {});
    const interaction = spec.interaction || {};
    const geometry = spec.geometry || {};
    return {
        style,
        geometry: {livePreview: geometry.livePreview ?? style.livePreview},
        pickable: interaction.pickable !== false,
        visualMeshPickable: interaction.visualMeshPickable !== false,
        targetLevel: interaction.targetLevel || 'residueRange',
    };
}

function intersects(a = [], b = []) {
    if (!a?.length || !b?.length) return false;
    const set = new Set(a);
    return b.some((x) => set.has(x));
}

function matrixFromEvent(evt) {
    const raw = evt?.matrix || evt?.transformMatrix || evt?.transform?.matrix || evt?.operation?.matrix;
    const matrix = new THREE.Matrix4();
    if (raw instanceof THREE.Matrix4) return raw.clone();
    if (Array.isArray(raw) && raw.length === 16) return matrix.fromArray(raw);
    if (raw?.elements && Array.isArray(raw.elements) && raw.elements.length === 16) return matrix.fromArray(raw.elements);

    const t = evt?.translation || evt?.transform?.translation || evt?.operation?.translation;
    if (Array.isArray(t) && t.length >= 3) return matrix.makeTranslation(Number(t[0]) || 0, Number(t[1]) || 0, Number(t[2]) || 0);
    if (t && typeof t === 'object') return matrix.makeTranslation(Number(t.x) || 0, Number(t.y) || 0, Number(t.z) || 0);
    return null;
}

function matrixArray(matrix) {
    return matrix?.elements ? Array.from(matrix.elements) : new THREE.Matrix4().toArray();
}

function materialKey(color, opacity, style, vertexColors) {
    return `${color.getHexString()}:${opacity}:${style.roughness}:${style.metalness}:${style.wireframe}:${style.side}:${vertexColors}`;
}

function mergeColorRules(globalRules = [], range = {}) {
    return [
        ...normalizeResidueColorRules(globalRules).map((rule) => rule.raw || rule),
        ...(Array.isArray(range.residueColorRules) ? range.residueColorRules : []),
        ...(Array.isArray(range.colorRules) ? range.colorRules : []),
    ];
}

/**
 * ProVR Surface v5.
 *
 * The old df/w3m surface idea was useful because vertices inherited an atom id
 * from the volume surface.  This version makes that mapping a first-class
 * ownership artifact:
 *
 * surface layer -> atom set -> surface mesh -> vertexAtomIds/vertexResidueKeys
 * -> residue-number coloring, RESIDUE_RANGE pick target and rigid layer transform.
 *
 * Dragging a surface for inspection never rebuilds surface geometry.  The layer
 * stores a rigid transform matrix, so users can compare surface gaps, clashes and
 * interface complementarity without changing ProteinModel coordinates.  If a
 * later command commits the same rigid transform to atom coordinates, the pick
 * target still carries the atomIds/residueIds that generated the layer.
 */
export class SurfaceRepresentation extends RepresentationBase {
    constructor({spec, context}) {
        super({spec, context});
        this.opts = mergeOptions(this.spec);
        this._materials = new Map();
        this._meshes = [];
        this._rangeRecords = [];
        this._summary = null;
    }

    build() {
        if (this._built) return;
        const model = this.model;
        if (!model) throw new Error(`[SurfaceRepresentation] protein not found: ${this.proteinId}`);

        this.opts = mergeOptions(this.spec);
        const globalResidueColorRules = [
            ...(Array.isArray(this.spec.residueColorRules) ? this.spec.residueColorRules : []),
            ...(Array.isArray(this.spec.colorRules) ? this.spec.colorRules : []),
        ];
        const layers = normalizeSurfaceLayers(model, this.spec, {
            filter: this.spec.filter || {},
        }).map((layer) => ({
            ...layer,
            residueColorRules: mergeColorRules(globalResidueColorRules, layer),
        }));

        this.root = new THREE.Group();
        this.root.name = `Surface:${this.proteinId}:${this.id}`;
        this.root.visible = this.visible;
        this.root.userData = {
            kind: 'proteinRepresentation',
            representation: 'Surface',
            representationId: this.id,
            proteinId: this.proteinId,
            surfaceMode: 'surface-layer-v5-full-chain-range-rigid-transform',
            layerPolicy: 'full-chain-multichain-range-layers-coexist; drag-updates-rigid-layer-transform-only',
            version: 'surface-layer-v5',
        };

        this._meshes.length = 0;
        this._rangeRecords.length = 0;

        const group = new THREE.Group();
        group.name = 'LayeredResidueOwnedSurfaceMeshes';

        layers.forEach((layer, index) => {
            const record = this._createLayerSurfaceRecord(model, layer, index);
            if (!record) return;
            group.add(record.mesh);
            this._meshes.push(record.mesh);
            this._rangeRecords.push(record);
        });

        this.root.add(group);
        this._refreshSummary();

        if (this.context.scene && typeof this.context.scene.add === 'function') this.context.scene.add(this.root);

        this._built = true;
        this._disposed = false;
    }

    update(evt) {
        if (!this._built || !evt) return;
        if (evt.proteinId && evt.proteinId !== this.proteinId) return;

        switch (evt.type) {
            case EventTypes.ATOM_SET_TRANSFORMED:
            case EventTypes.CHAIN_TRANSFORMED: {
                if (evt.atomIds?.length && !this._touchesAtoms(evt.atomIds)) return;
                const matrix = matrixFromEvent(evt);
                if (matrix && !this.opts.style.rebuildOnRigidTransform) {
                    this.applySurfaceLayerMatrixToAtoms(evt.atomIds || [], matrix, {
                        source: evt.source || evt.type,
                        commit: evt.phase !== 'preview',
                    });
                    return;
                }
                // If no transform matrix is provided, keep surface geometry stable.
                // Surface inspection drag should not rebuild.  Non-rigid changes must
                // emit RESIDUE_MODIFIED / STRUCTURE_REBUILT or explicitly call rebuild().
                this._refreshSummary();
                break;
            }
            case EventTypes.ATOM_POSITION_CHANGED:
                if (evt.phase === 'preview') return;
                if (evt.atomIds?.length && !this._touchesAtoms(evt.atomIds)) return;
                if (this.opts.style.rebuildOnRigidTransform) this.rebuild();
                else this._refreshSummary();
                break;
            case EventTypes.RESIDUE_MODIFIED:
            case EventTypes.STRUCTURE_REBUILT:
                this.rebuild();
                break;
            default:
                break;
        }
    }

    rebuild() {
        this.dispose();
        this._disposed = false;
        this._built = false;
        this.build();
    }

    dispose() {
        if (this._disposed) return;
        this.unregisterPickables();

        if (this.root) {
            this.root.traverse((obj) => obj.geometry?.dispose?.());
        }
        for (const material of this._materials.values()) material.dispose?.();
        this._materials.clear();

        if (this.root && this.context.scene && typeof this.context.scene.remove === 'function') this.context.scene.remove(this.root);
        this.root?.clear?.();
        this.root = null;
        this._meshes.length = 0;
        this._rangeRecords.length = 0;
        this._summary = null;
        this._disposed = true;
        this._built = false;
    }

    summary() {
        this._refreshSummary();
        return this._summary;
    }

    getSurfaceLayerMeshes({pickableOnly = false, visibleOnly = false} = {}) {
        return this._meshes.filter((mesh) => {
            if (!mesh) return false;
            if (visibleOnly && !mesh.visible) return false;
            if (pickableOnly && !mesh.userData?.visualMeshPickable) return false;
            return true;
        });
    }

    getSurfaceLayerRecord(layerId) {
        return this._rangeRecords.find((record) => record.layer?.id === layerId || record.mesh?.userData?.layerId === layerId) || null;
    }

    translateSurfaceLayer(layerId, delta, metadata = {}) {
        const d = delta instanceof THREE.Vector3 ? delta : new THREE.Vector3(delta?.[0] || 0, delta?.[1] || 0, delta?.[2] || 0);
        if (d.lengthSq() < 1e-12) return false;
        const matrix = new THREE.Matrix4().makeTranslation(d.x, d.y, d.z);
        return this.applySurfaceLayerMatrix(layerId, matrix, {source: metadata.source || 'translateSurfaceLayer'});
    }

    applySurfaceLayerMatrix(layerId, matrix, {source = 'surface-layer-transform'} = {}) {
        const record = this.getSurfaceLayerRecord(layerId);
        if (!record?.mesh || !(matrix instanceof THREE.Matrix4)) return false;
        const mesh = record.mesh;
        mesh.matrixAutoUpdate = false;
        mesh.matrix.premultiply(matrix);
        mesh.matrixWorldNeedsUpdate = true;
        mesh.updateMatrixWorld(true);
        mesh.userData.surfaceTransform = {
            ...(mesh.userData.surfaceTransform || {}),
            mode: 'rigid-layer-transform',
            source,
            committedMatrix: matrixArray(mesh.matrix),
            geometryRebuiltDuringDrag: false,
            lastUpdatedAt: Date.now(),
        };
        this._refreshSummary();
        return true;
    }

    applySurfaceLayerMatrixToAtoms(atomIds = [], matrix, metadata = {}) {
        if (!(matrix instanceof THREE.Matrix4) || !atomIds?.length) return 0;
        let moved = 0;
        for (const record of this._rangeRecords) {
            const layerAtomIds = record.mesh?.userData?.atomIds || [];
            if (!intersects(layerAtomIds, atomIds)) continue;
            this.applySurfaceLayerMatrix(record.layer.id, matrix, metadata);
            moved += 1;
        }
        return moved;
    }

    resetSurfaceLayerTransform(layerId) {
        const record = this.getSurfaceLayerRecord(layerId);
        if (!record?.mesh) return false;
        record.mesh.matrix.identity();
        record.mesh.matrixAutoUpdate = false;
        record.mesh.matrixWorldNeedsUpdate = true;
        record.mesh.updateMatrixWorld(true);
        record.mesh.userData.surfaceTransform = {
            mode: 'identity',
            source: 'resetSurfaceLayerTransform',
            committedMatrix: matrixArray(record.mesh.matrix),
            geometryRebuiltDuringDrag: false,
            lastUpdatedAt: Date.now(),
        };
        this._refreshSummary();
        return true;
    }

    resetAllSurfaceLayerTransforms() {
        let count = 0;
        for (const record of this._rangeRecords) {
            if (this.resetSurfaceLayerTransform(record.layer.id)) count += 1;
        }
        return count;
    }

    setSurfaceLayerVisible(layerId, visible) {
        const record = this.getSurfaceLayerRecord(layerId);
        if (!record?.mesh) return false;
        record.mesh.visible = !!visible;
        this._refreshSummary();
        return true;
    }

    updateSurfaceLayerMaterial(layerId, {color = null, opacity = null, visible = null} = {}) {
        const record = this.getSurfaceLayerRecord(layerId);
        if (!record?.mesh) return false;
        const mesh = record.mesh;
        if (visible !== null && visible !== undefined) mesh.visible = !!visible;
        if (color !== null || opacity !== null) {
            const nextColor = color ? new THREE.Color(color) : mesh.material.color.clone();
            const nextOpacity = opacity === null || opacity === undefined ? mesh.material.opacity : clamp(Number(opacity), 0.02, 1.0);
            mesh.material = this._materialFor(nextColor, nextOpacity, !!mesh.material.vertexColors);
            mesh.userData.opacity = nextOpacity;
            mesh.userData.fixedColor = `#${nextColor.getHexString()}`;
        }
        this._refreshSummary();
        return true;
    }

    _createLayerSurfaceRecord(model, layer, layerIndex) {
        const style = this.opts.style;
        const layerStyle = {...style, colorMode: layer.colorMode || style.colorMode};
        const residues = selectResiduesForSurfaceLayer(model, layer, {filter: this.spec.filter || {}});
        if (residues.length < layerStyle.minRangeResidues) return null;

        const atomSet = buildSurfaceAtomSet(model, residues, layer, layerStyle, layerIndex);
        if (!atomSet.atoms.length) return null;

        if (atomSet.atoms.length > layerStyle.maxAtomsPerRange) {
            console.warn(`[SurfaceRepresentation] layer ${layer.id} has ${atomSet.atoms.length} atoms; capped by maxAtomsPerRange=${layerStyle.maxAtomsPerRange}. Use smaller explicit layers or increase maxAtomsPerRange for full-complex surface work.`);
            const kept = atomSet.atoms.slice(0, layerStyle.maxAtomsPerRange);
            atomSet.atoms = kept;
            atomSet.atomIds = kept.map((atom) => atom.atomId);
            atomSet.atomById = new Map(kept.map((atom) => [atom.atomId, atom]));
            atomSet.residueIds = [...new Set(kept.map((atom) => atom.residueId))];
            atomSet.residueKeys = [...new Set(kept.map((atom) => atom.residueKey))];
        }

        const bounds = boundingBoxForSurfaceAtoms(atomSet.atoms, layerStyle);
        const meshData = buildSurfaceMeshData({atoms: atomSet.atoms, bounds, style: layerStyle});
        if (!meshData.positions.length) return null;

        const ownership = buildSurfaceOwnershipMap({atomSet, meshData});
        const colorData = buildSurfaceVertexColors({range: layer, rangeIndex: layerIndex, style: layerStyle, atomSet, ownership});
        meshData.vertexColorRuleIds = colorData.vertexColorRuleIds;

        const geometry = createSurfaceBufferGeometry(meshData, {colors: colorData.useVertexColors ? colorData.colors : null});
        const opacity = clamp(Number(layer.opacity ?? layerStyle.opacity), 0.02, 1.0);
        const materialColor = colorData.useVertexColors ? new THREE.Color(0xffffff) : colorData.fixedColor;
        const material = this._materialFor(materialColor, opacity, colorData.useVertexColors);
        material.userData = {
            ...(material.userData || {}),
            surfaceColorMode: layerStyle.colorMode,
            usesVertexColors: colorData.useVertexColors,
        };

        const effectivePickable = layer.pickable ?? layer.editable ?? (layer.role !== 'context');
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `SurfaceLayer:${layer.id}:${layer.scope}:${(layer.chainIds || []).join('|') || layer.chainId || 'all'}:${layer.start ?? ''}-${layer.end ?? ''}`;
        mesh.renderOrder = 20 + layerIndex;
        mesh.visible = layer.visible !== false;
        mesh.matrixAutoUpdate = false;
        mesh.matrix.identity();
        mesh.userData = {
            kind: SurfaceMeshKind.LAYER_SURFACE,
            representationId: this.id,
            proteinId: this.proteinId,
            chainId: layer.chainId,
            chainIds: layer.chainIds || [],
            rangeId: layer.id,
            rangeName: layer.name,
            layerId: layer.id,
            layerName: layer.name,
            layerScope: layer.scope,
            layerRole: layer.role,
            residueIds: [...atomSet.residueIds],
            residueKeys: [...atomSet.residueKeys],
            atomIds: [...atomSet.atomIds],
            start: layer.start,
            end: layer.end,
            residueCount: atomSet.residueIds.length,
            atomCount: atomSet.atomIds.length,
            surfaceMode: 'surface-layer-v5-full-chain-range-rigid-transform',
            layerPolicy: 'full-chain-multichain-range-layers-coexist; drag-updates-rigid-layer-transform-only',
            ownershipPolicy: 'mesh-userData-and-geometry-store-vertex-atom-residue-ownership-plus-layer-transform',
            colorMode: layerStyle.colorMode,
            fixedColor: `#${colorData.fixedColor.getHexString()}`,
            usesVertexColors: colorData.useVertexColors,
            residueColorRuleCount: countResidueColorRules(layer),
            residueColorStats: colorData.stats,
            ownership: ownershipSummaryForUserData(ownership),
            opacity,
            bounds,
            surfaceStats: {
                ...meshData.stats,
                ownership: ownership.stats,
                color: colorData.stats,
            },
            pickable: this.opts.visualMeshPickable && effectivePickable,
            visualMeshPickable: this.opts.visualMeshPickable && effectivePickable,
            dragPolicy: 'inspection-drag-rigid-layer-transform-no-geometry-rebuild; optional-commit-uses-layer-atomIds',
            transformPolicy: 'rigid-layer-transform-only-during-drag; no-marching-cubes-rebuild',
            surfaceTransform: {
                mode: 'identity',
                committedMatrix: matrixArray(mesh.matrix),
                geometryRebuiltDuringDrag: false,
                lastUpdatedAt: Date.now(),
            },
            metadata: {...(layer.metadata || {})},
        };

        if (this.opts.pickable && this.opts.visualMeshPickable && effectivePickable) {
            this._registerResidueRangeTarget(mesh, {
                atomIds: atomSet.atomIds,
                residueIds: atomSet.residueIds,
                chainIds: [...new Set(atomSet.atoms.map((atom) => atom.chainId).filter(Boolean))],
                metadata: {
                    sourceRepresentation: 'surface',
                    sourceType: this.spec.type,
                    layerId: layer.id,
                    layerName: layer.name,
                    layerScope: layer.scope,
                    layerRole: layer.role,
                    targetLevel: 'layer-owned-residue-set-surface-v5-rigid-transform',
                    dragPolicy: 'surface-inspection-drag-moves-layer-matrix-only; optional-commit-transforms-same-residue-atoms',
                    label: layer.name,
                    selectedResidueKeys: atomSet.residueKeys,
                    visibleResidueCount: ownership.stats.visibleResidueCount,
                    hiddenSelectedResidueCount: ownership.stats.hiddenSelectedResidueCount,
                },
            });
        }

        return {mesh, layer, layerIndex, atomSet, meshData, ownership, colorData};
    }

    _registerResidueRangeTarget(mesh, {atomIds, residueIds, chainId, chainIds, metadata}) {
        const target = makePickTarget({
            proteinId: this.proteinId,
            representationId: this.id,
            kind: PickTargetKind.RESIDUE_RANGE,
            atomIds,
            residueIds,
            chainIds: chainIds?.length ? chainIds : (chainId ? [chainId] : []),
            metadata,
        });
        this.registerPickable(mesh, target);
    }

    _touchesAtoms(atomIds) {
        for (const mesh of this._meshes) {
            if (intersects(mesh.userData?.atomIds || [], atomIds)) return true;
        }
        return false;
    }

    _materialFor(color, opacity, vertexColors = false) {
        const style = this.opts.style;
        const key = materialKey(color, opacity, style, vertexColors);
        if (this._materials.has(key)) return this._materials.get(key);

        const material = new THREE.MeshStandardMaterial({
            color,
            vertexColors,
            transparent: opacity < 1,
            opacity,
            roughness: style.roughness,
            metalness: style.metalness,
            wireframe: style.wireframe,
            side: materialSideFromStyle(style),
            depthWrite: opacity >= 0.82,
        });
        this._materials.set(key, material);
        return material;
    }

    _refreshSummary() {
        const ranges = [];
        let vertices = 0;
        let faces = 0;
        let atoms = 0;
        let residues = 0;
        let visualPickTargets = 0;
        let adjustedGridRanges = 0;
        let coloredVertices = 0;
        let effectiveVertexColors = 0;
        let residuePaletteVertices = 0;
        let atomColoredVertices = 0;
        let ownedVertices = 0;
        let hiddenSelectedResidues = 0;

        for (const mesh of this._meshes) {
            const stats = mesh.userData?.surfaceStats || {};
            const ownership = mesh.userData?.ownership?.stats || {};
            const colorStats = mesh.userData?.residueColorStats || {};
            vertices += stats.vertices || 0;
            faces += stats.faces || 0;
            atoms += mesh.userData?.atomCount || 0;
            residues += mesh.userData?.residueCount || 0;
            coloredVertices += colorStats.coloredVertices || 0;
            effectiveVertexColors += colorStats.effectiveVertexColors || 0;
            residuePaletteVertices += colorStats.residuePaletteVertices || 0;
            atomColoredVertices += colorStats.atomColoredVertices || 0;
            ownedVertices += ownership.ownedVertexCount || 0;
            hiddenSelectedResidues += ownership.hiddenSelectedResidueCount || 0;
            if (mesh.userData?.visualMeshPickable) visualPickTargets += 1;
            if (stats.grid?.adjustedSpacing) adjustedGridRanges += 1;
            ranges.push({
                rangeId: mesh.userData?.rangeId,
                name: mesh.userData?.rangeName,
                layerId: mesh.userData?.layerId,
                layerName: mesh.userData?.layerName,
                layerScope: mesh.userData?.layerScope,
                layerRole: mesh.userData?.layerRole,
                chainId: mesh.userData?.chainId,
                chainIds: mesh.userData?.chainIds || [],
                start: mesh.userData?.start,
                end: mesh.userData?.end,
                color: mesh.userData?.fixedColor,
                colorMode: mesh.userData?.colorMode,
                usesVertexColors: !!mesh.userData?.usesVertexColors,
                residueColorRuleCount: mesh.userData?.residueColorRuleCount || 0,
                residueColorStats: colorStats,
                ownershipStats: ownership,
                residueVertexCounts: mesh.userData?.ownership?.residueVertexCounts || {},
                residueCount: mesh.userData?.residueCount,
                atomCount: mesh.userData?.atomCount,
                vertices: stats.vertices || 0,
                faces: stats.faces || 0,
                grid: stats.grid || null,
                pickable: !!mesh.userData?.visualMeshPickable,
                dragPolicy: mesh.userData?.dragPolicy,
                transformPolicy: mesh.userData?.transformPolicy,
                surfaceTransform: mesh.userData?.surfaceTransform,
                transformMatrix: matrixArray(mesh.matrix),
                transformIsIdentity: mesh.matrix.equals(new THREE.Matrix4()),
            });
        }

        const contacts = analyzeSurfaceLayerContacts(this._meshes, {
            contactThreshold: this.opts.style.contactThreshold,
            clashThreshold: this.opts.style.clashThreshold,
            maxSamplesPerLayer: this.opts.style.maxContactSamplesPerLayer,
        });

        this._summary = {
            representationId: this.id,
            proteinId: this.proteinId,
            type: this.spec.type,
            version: 'surface-layer-v5',
            surfaceMode: 'surface-layer-v5-full-chain-range-rigid-transform',
            layerPolicy: 'full-chain-multichain-range-layers-coexist; drag-updates-rigid-layer-transform-only',
            rangeSurfaceMeshes: this._meshes.length,
            layerSurfaceMeshes: this._meshes.length,
            ranges,
            layers: ranges,
            atoms,
            residues,
            vertices,
            faces,
            ownedVertices,
            coloredVertices,
            effectiveVertexColors,
            residuePaletteVertices,
            atomColoredVertices,
            hiddenSelectedResidues,
            visualPickTargets,
            pickTargets: this._pickables?.size || 0,
            adjustedGridRanges,
            contacts,
            transformedLayerCount: this._meshes.filter((mesh) => !mesh.matrix.equals(new THREE.Matrix4())).length,
            geometryRebuildDuringDrag: false,
            rigidDragPolicy: 'dragging-surface-layer-updates-mesh-matrix-only; no-surface-regeneration; contact-analysis-uses-world-matrix',
            options: {
                colorMode: this.opts.style.colorMode,
                layerPolicy: 'multiple independently generated full/chain/range surfaces can coexist',
                ownershipPolicy: this.opts.style.ownershipPolicy,
                colorPolicy: 'geometry stores vertex ownership first; color is applied from range/atom/residue rules using that ownership',
                opacity: this.opts.style.opacity,
                probeRadius: this.opts.style.probeRadius,
                gridSpacing: this.opts.style.gridSpacing,
                maxGridPoints: this.opts.style.maxGridPoints,
                contactThreshold: this.opts.style.contactThreshold,
                clashThreshold: this.opts.style.clashThreshold,
                maxContactSamplesPerLayer: this.opts.style.maxContactSamplesPerLayer,
                livePreview: this.opts.geometry.livePreview,
                visualMeshPickable: this.opts.visualMeshPickable,
                dragPolicy: 'surface layer inspection drag changes rigid layer matrix only; geometry is generated only on add/rebuild/scope-or-parameter-change',
                rebuildOnRigidTransform: this.opts.style.rebuildOnRigidTransform,
            },
            lastUpdatedRevision: this.model?.revision ?? null,
        };

        if (this.root) this.root.userData.summary = this._summary;
        return this._summary;
    }
}
