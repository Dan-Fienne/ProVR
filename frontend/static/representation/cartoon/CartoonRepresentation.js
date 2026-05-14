import * as THREE from "../../libs/three.webgpu.js";

import {SSEType} from "../../domain/protein/ProteinConstants.js";
import {RepresentationBase} from "../common/RepresentationBase.js";
import {EventTypes} from "../../core/event/EventTypes.js";
import {makePickTarget, PickTargetKind, targetFromAtom} from "../interaction/PickTarget.js";

import {buildBackboneTrace} from "./BackboneTraceBuilder.js";
import {buildBackboneFrames, paddedSegmentPoints} from "./BackboneFrameBuilder.js";
import {buildEndpointAwareLoopFrames} from "./EndpointLoopPathBuilder.js";
import {buildSecondaryBoundaryTubeFrames} from "./SecondaryBoundaryTubeBuilder.js";
import {
    CartoonMeshKind,
    cartoonColor,
    resolveCartoonStyle,
    scaled,
} from "./CartoonStyle.js";
import {
    createLegacyHelixEllipseGeometry,
    createLegacyLoopTubeGeometry,
    createLegacySheetArrowGeometry,
    fitFramesByLegacyZigzag,
} from "./CartoonGeometryBuilder.js";

function finiteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function mergeOptions(spec) {
    const style = resolveCartoonStyle(spec?.style || {});
    const geometry = spec?.geometry || {};
    const interaction = spec?.interaction || {};

    return {
        style,
        curveType: geometry.curveType || 'legacyHermite',
        livePreview: geometry.livePreview ?? false,

        pickable: interaction.pickable !== false,
        pickProxies: interaction.pickProxies !== false,
        visualMeshPickable: interaction.visualMeshPickable !== false,
    };
}

function materialKey(color, opacity, opts) {
    const s = opts.style;
    return `${color}:${opacity}:${s.roughness}:${s.metalness}`;
}

function isSecondarySSE(sse) {
    return sse === SSEType.HELIX || sse === SSEType.SHEET;
}

function safeUnit(v, fallback = new THREE.Vector3(1, 0, 0)) {
    if (!v || v.length() < 1e-8) return fallback.clone().normalize();
    return v.clone().normalize();
}

function projectPerpendicular(v, tangent) {
    return v.clone().addScaledVector(tangent, -v.dot(tangent));
}

function normalizeFrame(frame) {
    const tangent = safeUnit(frame.tangent);
    let normal = frame.normal?.clone?.() || new THREE.Vector3(0, 1, 0);
    normal = projectPerpendicular(normal, tangent);
    if (normal.length() < 1e-8) normal = new THREE.Vector3(0, 1, 0);
    normal.normalize();

    let binormal = new THREE.Vector3().crossVectors(tangent, normal);
    if (binormal.length() < 1e-8) binormal = frame.binormal?.clone?.() || new THREE.Vector3(0, 0, 1);
    binormal.normalize();

    normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

    return {
        ...frame,
        tangent,
        normal,
        binormal,
    };
}

/**
 * Endpoint-aware ProVR cartoon.
 *
 * The key boundary rule is now:
 * - HELIX/SHEET meshes keep their own exact residue ranges;
 * - LOOP is sampled once as a single multi-anchor Hermite tube path;
 * - neighboring helix/sheet visual endpoints are only boundary anchors;
 * - every real LOOP CA/backbone point remains inside the same spline.
 *
 * This removes the visible seam caused by drawing left bridge + loop body + right
 * bridge as independent meshes, while avoiding endpoint-only interpolation, SSE
 * range expansion, and any full-chain loop overlay.
 */
export class CartoonRepresentation extends RepresentationBase {
    constructor({spec, context}) {
        super({spec, context});

        this.opts = mergeOptions(this.spec);
        this._trace = null;
        this._materials = new Map();
        this._meshes = [];
        this._proxyMeshes = [];
        this._segmentRecords = [];
        this._frameCount = 0;
        this._summary = null;
        this._proxyGeometry = null;
        this._proxyMaterial = null;
    }

    build() {
        if (this._built) return;

        const model = this.model;
        if (!model) throw new Error(`[CartoonRepresentation] protein not found: ${this.proteinId}`);

        this.opts = mergeOptions(this.spec);
        this._trace = buildBackboneTrace(model, {
            filter: this.spec.filter || {},
            includeFallbackCentroid: true,
        });

        this.root = new THREE.Group();
        this.root.name = `Cartoon:${this.proteinId}:${this.id}`;
        this.root.visible = this.visible;
        this.root.userData = {
            kind: 'proteinRepresentation',
            representation: 'Cartoon',
            representationId: this.id,
            proteinId: this.proteinId,
            cartoonStyle: 'legacy-loop-owned-all-point-spline',
            version: 'legacy-loop-owned-all-point-spline-cartoon+sse-boundary-tube+fixed-sheet-arrow',
        };

        this._meshes.length = 0;
        this._proxyMeshes.length = 0;
        this._segmentRecords.length = 0;
        this._frameCount = 0;

        const visualGroup = new THREE.Group();
        visualGroup.name = 'CartoonCanonicalCartoonMeshes';

        const proxyGroup = new THREE.Group();
        proxyGroup.name = 'CartoonPickProxies';

        for (const chain of this._trace.chains) {
            const chainGroup = new THREE.Group();
            chainGroup.name = `CartoonChain:${chain.chainId}`;

            const chainRecords = [];

            // Build each biological visual segment once.
            // LOOP meshes own their boundary smoothing: when a loop touches
            // helix/sheet, its path is one multi-anchor Hermite spline:
            // secondary visual endpoint -> every loop residue point -> secondary
            // visual endpoint.  No separate bridge/body/bridge connector meshes.
            for (let i = 0; i < chain.segments.length; i += 1) {
                const segment = chain.segments[i];
                const record = this._createExactSegmentMesh(chain, segment, i);
                if (!record) continue;

                chainGroup.add(record.mesh);
                this._meshes.push(record.mesh);
                this._segmentRecords.push(record);
                chainRecords.push(record);
            }

            // Explicit LOOP segments now own their whole all-point spline.  If no
            // LOOP segment exists between two adjacent secondary-structure
            // segments, we still need a short Hermite tube so HELIX -> SHEET (or
            // SHEET -> HELIX) does not visually disconnect.
            for (let i = 0; i < chainRecords.length - 1; i += 1) {
                const boundaryRecord = this._createSecondaryBoundaryTubeRecord(chainRecords[i], chainRecords[i + 1]);
                if (!boundaryRecord) continue;

                chainGroup.add(boundaryRecord.mesh);
                this._meshes.push(boundaryRecord.mesh);
                this._segmentRecords.push(boundaryRecord);
            }

            visualGroup.add(chainGroup);

            if (this.opts.pickable && this.opts.pickProxies) {
                for (const point of chain.points) {
                    const proxy = this._createTracePickProxy(point);
                    if (!proxy) continue;
                    proxyGroup.add(proxy);
                    this._proxyMeshes.push(proxy);
                }
            }
        }

        this.root.add(visualGroup);
        this.root.add(proxyGroup);

        this._refreshSummary();

        if (this.context.scene && typeof this.context.scene.add === 'function') {
            this.context.scene.add(this.root);
        }

        this._built = true;
        this._disposed = false;
    }

    update(evt) {
        if (!this._built || !evt) return;
        if (evt.proteinId && evt.proteinId !== this.proteinId) return;

        switch (evt.type) {
            case EventTypes.ATOM_POSITION_CHANGED:
            case EventTypes.ATOM_SET_TRANSFORMED:
            case EventTypes.CHAIN_TRANSFORMED:
                if (evt.phase === 'preview' && !this.opts.livePreview) return;
                this.rebuild();
                break;
            case EventTypes.RESIDUE_MODIFIED:
            case EventTypes.STRUCTURE_REBUILT:
                this.rebuild();
                break;
            default:
                break;
        }
    }

    setOptions(patch = {}) {
        super.setOptions(patch);
        this.opts = mergeOptions(this.spec);
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
            this.root.traverse((obj) => {
                if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
            });
        }

        for (const material of this._materials.values()) material.dispose?.();
        this._materials.clear();

        this._proxyGeometry?.dispose?.();
        this._proxyMaterial?.dispose?.();
        this._proxyGeometry = null;
        this._proxyMaterial = null;

        if (this.root && this.context.scene && typeof this.context.scene.remove === 'function') {
            this.context.scene.remove(this.root);
        }

        this.root?.clear?.();
        this.root = null;
        this._trace = null;
        this._meshes.length = 0;
        this._proxyMeshes.length = 0;
        this._segmentRecords.length = 0;
        this._summary = null;
        this._frameCount = 0;
        this._disposed = true;
        this._built = false;
    }

    summary() {
        this._refreshSummary();
        return this._summary;
    }

    _createExactSegmentMesh(chain, segment, segmentIndex) {
        if (!segment?.points?.length) return null;

        const style = this.opts.style;
        const endpointLoop = segment.sse === SSEType.LOOP && style.endpointBridgeEnabled
            ? buildEndpointAwareLoopFrames({chain, segment, segmentIndex, style})
            : null;

        let rawFrames;
        let endpointLoopMeta = null;

        if (endpointLoop) {
            rawFrames = endpointLoop.frames;
            endpointLoopMeta = endpointLoop.meta;
        } else {
            const points = paddedSegmentPoints(chain.points, segment, 0);
            if (!points || points.length < 2) return null;

            rawFrames = buildBackboneFrames(points, {
                smoothSegment: style.smoothSegment,
                smoothCurvature: style.smoothCurvature,
                sourceIndexOffset: points[0]?.index || 0,
            });
        }

        if (rawFrames.length < 2) return null;
        this._frameCount += rawFrames.length;

        let geometry = null;
        let meshKind = CartoonMeshKind.LOOP;
        let visualFrames = rawFrames;

        if (segment.sse === SSEType.HELIX) {
            geometry = createLegacyHelixEllipseGeometry(rawFrames, {
                radius: scaled(style.helixEllipseRadius, style),
                widthMultiple: style.helixEllipseWidthMultiple,
                segments: style.helixEllipseSegments,
            });
            meshKind = CartoonMeshKind.HELIX;
        } else if (segment.sse === SSEType.SHEET) {
            visualFrames = fitFramesByLegacyZigzag(rawFrames, style.smoothSegment);
            geometry = createLegacySheetArrowGeometry(rawFrames, {
                bodyWidth: scaled(style.sheetBodyWidth, style),
                thickness: scaled(style.sheetThickness, style),
                arrowBaseWidth: scaled(style.sheetArrowBaseWidth, style),
                arrowTipWidth: scaled(style.sheetArrowTipWidth, style),
                arrowHeight: scaled(style.sheetArrowHeight, style),
                smoothSegment: style.smoothSegment,
            });
            meshKind = CartoonMeshKind.SHEET;
        } else {
            geometry = createLegacyLoopTubeGeometry(rawFrames, {
                radius: scaled(style.loopRadius, style),
                radialSegments: style.loopRadialSegments,
                capStart: !endpointLoopMeta?.startUsesSecondaryEndpoint,
                capEnd: !endpointLoopMeta?.endUsesSecondaryEndpoint,
            });
            meshKind = CartoonMeshKind.LOOP;
        }

        if (!geometry) return null;

        const first = segment.points[0];
        const color = cartoonColor({
            chainId: segment.chainId,
            sse: segment.sse,
            residueKind: first?.residueKind,
            colorScheme: style.colorScheme,
        });

        const material = this._materialFor(color, style.opacity);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `Cartoon:${meshKind}:${segment.chainId}:${segment.sse}:${segmentIndex}`;
        mesh.renderOrder = isSecondarySSE(segment.sse) ? 10 : 0;
        mesh.userData = {
            kind: meshKind,
            representationId: this.id,
            proteinId: this.proteinId,
            chainId: segment.chainId,
            sse: segment.sse,
            residueIds: [...segment.residueIds],
            atomIds: [...segment.atomIds],
            startIndex: segment.startIndex,
            endIndex: segment.endIndex,
            residueCount: segment.residueIds.length,
            atomCount: segment.atomIds.length,
            frameCount: rawFrames.length,
            visualFrameCount: visualFrames.length,
            endpointAwareLoop: !!endpointLoopMeta?.endpointAware,
            endpointLoopMode: endpointLoopMeta?.mode || null,
            endpointLoopAnchorCount: endpointLoopMeta?.anchorCount || 0,
            endpointLoopRenderAnchorCount: endpointLoopMeta?.renderAnchorCount || endpointLoopMeta?.anchorCount || 0,
            endpointLoopLoopResidueAnchorCount: endpointLoopMeta?.loopResidueAnchorCount || 0,
            endpointLoopUsesAllLoopResidueAnchors: !!endpointLoopMeta?.usesAllLoopResidueAnchors,
            endpointLoopTangentPolicy: endpointLoopMeta?.tangentPolicy || null,
            endpointLoopHasLeftTangentContext: !!endpointLoopMeta?.leftTangentContextOnly,
            endpointLoopHasRightTangentContext: !!endpointLoopMeta?.rightTangentContextOnly,
            endpointLoopSeparateConnectorMeshes: !!endpointLoopMeta?.separateConnectorMeshes,
            endpointLoopStartUsesSecondaryEndpoint: !!endpointLoopMeta?.startUsesSecondaryEndpoint,
            endpointLoopEndUsesSecondaryEndpoint: !!endpointLoopMeta?.endUsesSecondaryEndpoint,
            endpointLoopStartBoundarySSE: endpointLoopMeta?.startBoundarySSE || null,
            endpointLoopEndBoundarySSE: endpointLoopMeta?.endBoundarySSE || null,
            endpointLoopCapStart: !endpointLoopMeta?.startUsesSecondaryEndpoint,
            endpointLoopCapEnd: !endpointLoopMeta?.endUsesSecondaryEndpoint,
            sheetGeometryMode: segment.sse === SSEType.SHEET ? 'fixed-legacy-body-arrowhead' : null,
            pickable: this.opts.visualMeshPickable,
            visualMeshPickable: this.opts.visualMeshPickable,
            cartoonStyle: endpointLoopMeta?.endpointAware ? 'legacy-loop-owned-all-point-spline' : 'legacy-exact-segment',
        };

        if (this.opts.pickable && this.opts.visualMeshPickable) {
            this._registerResidueRangeTarget(mesh, {
                atomIds: segment.atomIds,
                residueIds: segment.residueIds,
                chainId: segment.chainId,
                metadata: {
                    sourceRepresentation: 'cartoon',
                    sourceType: this.spec.type,
                    meshKind,
                    sse: segment.sse,
                    segmentIndex,
                    targetLevel: isSecondarySSE(segment.sse) ? 'secondary-structure-segment' : 'loop-segment',
                    label: `${segment.chainId}:${segment.sse}:${segment.points[0]?.residueLabel || ''}-${segment.points[segment.points.length - 1]?.residueLabel || ''}`,
                },
            });
        }

        return {
            mesh,
            chain,
            segment,
            segmentIndex,
            kind: meshKind,
            sse: segment.sse,
            firstFrame: normalizeFrame(visualFrames[0]),
            lastFrame: normalizeFrame(visualFrames[visualFrames.length - 1]),
            visualFrames: visualFrames.map((frame) => normalizeFrame(frame)),
        };
    }

    _createSecondaryBoundaryTubeRecord(leftRecord, rightRecord) {
        if (!leftRecord || !rightRecord) return null;

        const style = this.opts.style;
        const built = buildSecondaryBoundaryTubeFrames({leftRecord, rightRecord, style});
        if (!built?.frames?.length) return null;

        const geometry = createLegacyLoopTubeGeometry(built.frames, {
            radius: scaled(style.loopRadius * style.secondaryBoundaryTubeRadiusScale, style),
            radialSegments: style.loopRadialSegments,
            capStart: false,
            capEnd: false,
        });
        if (!geometry) return null;

        const chainId = leftRecord.chain?.chainId || leftRecord.segment?.chainId || rightRecord.segment?.chainId || '';
        const color = cartoonColor({
            chainId,
            sse: SSEType.LOOP,
            residueKind: leftRecord.segment?.points?.[leftRecord.segment.points.length - 1]?.residueKind,
            colorScheme: style.colorScheme,
        });

        const material = this._materialFor(color, style.opacity);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `Cartoon:${CartoonMeshKind.LOOP}:${chainId}:SSE_BOUNDARY:${leftRecord.segmentIndex}-${rightRecord.segmentIndex}`;
        mesh.renderOrder = 5;

        const leftResidueIds = leftRecord.segment?.residueIds?.length ? [leftRecord.segment.residueIds[leftRecord.segment.residueIds.length - 1]] : [];
        const rightResidueIds = rightRecord.segment?.residueIds?.length ? [rightRecord.segment.residueIds[0]] : [];
        const residueIds = [...leftResidueIds, ...rightResidueIds].filter(Boolean);
        const atomIds = [];
        for (const residueId of residueIds) {
            const residue = this.model?.residues?.get?.(residueId);
            if (residue?.atomIds?.length) atomIds.push(...residue.atomIds);
        }

        mesh.userData = {
            kind: CartoonMeshKind.LOOP,
            representationId: this.id,
            proteinId: this.proteinId,
            chainId,
            sse: SSEType.LOOP,
            residueIds,
            atomIds,
            startIndex: leftRecord.segment?.endIndex ?? null,
            endIndex: rightRecord.segment?.startIndex ?? null,
            residueCount: residueIds.length,
            atomCount: atomIds.length,
            frameCount: built.frames.length,
            visualFrameCount: built.frames.length,
            secondaryBoundaryTube: true,
            secondaryBoundaryTubeMode: built.meta?.mode || 'sse-sse-boundary-hermite-tube',
            secondaryBoundaryLeftSSE: built.meta?.leftSSE || leftRecord.sse,
            secondaryBoundaryRightSSE: built.meta?.rightSSE || rightRecord.sse,
            secondaryBoundaryLeftSegmentIndex: built.meta?.leftSegmentIndex ?? leftRecord.segmentIndex,
            secondaryBoundaryRightSegmentIndex: built.meta?.rightSegmentIndex ?? rightRecord.segmentIndex,
            secondaryBoundaryHasLeftContext: !!built.meta?.hasLeftContext,
            secondaryBoundaryHasRightContext: !!built.meta?.hasRightContext,
            secondaryBoundaryTangentPolicy: built.meta?.tangentPolicy || '',
            endpointAwareLoop: false,
            endpointLoopMode: null,
            endpointLoopSeparateConnectorMeshes: false,
            pickable: this.opts.visualMeshPickable,
            visualMeshPickable: this.opts.visualMeshPickable,
            cartoonStyle: 'secondary-boundary-hermite-tube',
        };

        if (this.opts.pickable && this.opts.visualMeshPickable && residueIds.length) {
            this._registerResidueRangeTarget(mesh, {
                atomIds,
                residueIds,
                chainId,
                metadata: {
                    sourceRepresentation: 'cartoon',
                    sourceType: this.spec.type,
                    meshKind: CartoonMeshKind.LOOP,
                    sse: SSEType.LOOP,
                    targetLevel: 'secondary-boundary-tube',
                    leftSSE: leftRecord.sse,
                    rightSSE: rightRecord.sse,
                    label: `${chainId}:secondary-boundary:${leftRecord.sse}->${rightRecord.sse}`,
                },
            });
        }

        return {
            mesh,
            chain: leftRecord.chain,
            segment: null,
            segmentIndex: `${leftRecord.segmentIndex}-${rightRecord.segmentIndex}`,
            kind: CartoonMeshKind.LOOP,
            sse: SSEType.LOOP,
            firstFrame: normalizeFrame(built.frames[0]),
            lastFrame: normalizeFrame(built.frames[built.frames.length - 1]),
            visualFrames: built.frames.map((frame) => normalizeFrame(frame)),
            secondaryBoundaryTube: true,
        };
    }


    _registerResidueRangeTarget(mesh, {atomIds, residueIds, chainId, metadata}) {
        const target = makePickTarget({
            proteinId: this.proteinId,
            representationId: this.id,
            kind: PickTargetKind.RESIDUE_RANGE,
            atomIds,
            residueIds,
            chainIds: [chainId],
            metadata,
        });

        this.registerPickable(mesh, target);
    }

    _createTracePickProxy(point) {
        if (!point?.atomId || !point.position) return null;

        const style = this.opts.style;

        if (!this._proxyGeometry) {
            this._proxyGeometry = new THREE.SphereGeometry(
                scaled(style.pickProxyRadius, style),
                12,
                12
            );
        }

        if (!this._proxyMaterial) {
            this._proxyMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: clamp(style.pickProxyOpacity, 0, 1),
                depthWrite: false,
            });
        }

        const mesh = new THREE.Mesh(this._proxyGeometry, this._proxyMaterial);
        mesh.name = `CartoonPickProxy:${point.chainId}:${point.residueLabel}`;
        mesh.position.set(point.position[0], point.position[1], point.position[2]);
        mesh.userData = {
            kind: 'atom',
            cartoonProxyKind: CartoonMeshKind.PICK_PROXY,
            pickable: true,
            proteinId: this.proteinId,
            representationId: this.id,
            atomId: point.atomId,
            residueId: point.residueId,
            chainId: point.chainId,
            residueLabel: point.residueLabel,
            sourceRepresentation: 'cartoon',
        };

        const target = targetFromAtom(this.model, point.atomId, {
            sourceRepresentation: 'cartoon',
            sourceType: this.spec.type,
            representationId: this.id,
            proxy: true,
            residueId: point.residueId,
            residueLabel: point.residueLabel,
        });

        if (target) this.registerPickable(mesh, target);
        return mesh;
    }

    _materialFor(color, opacity) {
        const key = materialKey(color, opacity, this.opts);
        if (this._materials.has(key)) return this._materials.get(key);

        const s = this.opts.style;
        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: s.roughness,
            metalness: s.metalness,
            transparent: opacity < 1,
            opacity: clamp(opacity, 0, 1),
            side: THREE.DoubleSide,
        });

        this._materials.set(key, material);
        return material;
    }

    _visualResidueCollisions() {
        const ownerByResidue = new Map();

        for (const mesh of this._meshes) {
            const kind = mesh.userData?.kind;
            if (kind !== CartoonMeshKind.HELIX && kind !== CartoonMeshKind.SHEET) continue;

            for (const residueId of mesh.userData?.residueIds || []) {
                if (!ownerByResidue.has(residueId)) ownerByResidue.set(residueId, []);
                ownerByResidue.get(residueId).push({
                    kind,
                    sse: mesh.userData?.sse,
                    name: mesh.name,
                });
            }
        }

        const collisions = [];
        for (const [residueId, owners] of ownerByResidue.entries()) {
            if (owners.length > 1) collisions.push({residueId, owners});
        }

        return collisions;
    }

    _refreshSummary() {
        const byMeshKind = {};
        const bySSE = {};
        const byChain = {};

        let loopMeshes = 0;
        let helixMeshes = 0;
        let sheetArrowMeshes = 0;
        let transitionMeshes = 0;
        let visualPickTargets = 0;
        let allPointLoopSplineMeshes = 0;
        let endpointAwareLoopMeshes = 0;
        let secondaryBoundaryTubeMeshes = 0;
        let fixedSheetArrowMeshes = 0;

        for (const mesh of this._meshes) {
            const kind = mesh.userData?.kind || 'UNKNOWN';
            const sse = mesh.userData?.sse || 'UNKNOWN';
            const chainId = mesh.userData?.chainId || 'UNKNOWN';

            byMeshKind[kind] = (byMeshKind[kind] || 0) + 1;
            bySSE[sse] = (bySSE[sse] || 0) + 1;
            byChain[chainId] = (byChain[chainId] || 0) + 1;

            if (kind === CartoonMeshKind.LOOP) loopMeshes += 1;
            if (kind === CartoonMeshKind.HELIX) helixMeshes += 1;
            if (kind === CartoonMeshKind.SHEET) sheetArrowMeshes += 1;
            if (kind === CartoonMeshKind.TRANSITION) transitionMeshes += 1;
            if (mesh.userData?.endpointAwareLoop) endpointAwareLoopMeshes += 1;
            if (mesh.userData?.secondaryBoundaryTube) secondaryBoundaryTubeMeshes += 1;
            if (mesh.userData?.sheetGeometryMode === 'fixed-legacy-body-arrowhead') fixedSheetArrowMeshes += 1;
            if (mesh.userData?.endpointLoopUsesAllLoopResidueAnchors) allPointLoopSplineMeshes += 1;
            if (mesh.userData?.visualMeshPickable) visualPickTargets += 1;
        }

        const visualResidueCollisions = this._visualResidueCollisions();

        this._summary = {
            representationId: this.id,
            proteinId: this.proteinId,
            type: this.spec.type,
            version: 'legacy-loop-owned-all-point-spline-cartoon+sse-boundary-tube+fixed-sheet-arrow',
            chains: this._trace?.chains?.length || 0,
            tracePoints: this._trace?.points?.length || 0,
            frames: this._frameCount,
            visualMeshes: this._meshes.length,
            loopMeshes,
            helixMeshes,
            sheetArrowMeshes,
            transitionMeshes,
            endpointAwareLoopMeshes,
            allPointLoopSplineMeshes,
            secondaryBoundaryTubeMeshes,
            fixedSheetArrowMeshes,
            visualPickTargets,
            pickProxies: this._proxyMeshes.length,
            pickTargets: this._pickables.size,
            visualResidueCollisionCount: visualResidueCollisions.length,
            visualResidueCollisions: visualResidueCollisions.slice(0, 20),
            byMeshKind,
            bySSE,
            byChain,
            lastUpdatedRevision: this.model?.revision ?? null,
            options: {
                colorScheme: this.opts.style.colorScheme,
                scale: this.opts.style.scale,
                curveType: this.opts.curveType,
                livePreview: this.opts.livePreview,
                visualMeshPickable: this.opts.visualMeshPickable,
                smoothSegment: this.opts.style.smoothSegment,
                smoothCurvature: this.opts.style.smoothCurvature,
                endpointBridgeEnabled: this.opts.style.endpointBridgeEnabled,
                endpointBridgeSamples: this.opts.style.endpointBridgeSamples,
                endpointBridgeTangentScale: this.opts.style.endpointBridgeTangentScale,
                endpointBridgeRadiusScale: this.opts.style.endpointBridgeRadiusScale,
                endpointBridgeContextResidues: this.opts.style.endpointBridgeContextResidues,
                endpointBridgeUseContextTangents: this.opts.style.endpointBridgeUseContextTangents,
                endpointBridgeMode: 'loop-owned-multi-anchor-spline-no-connector-mesh',
                loopSplineSamplesPerResidue: this.opts.style.loopSplineSamplesPerResidue,
                loopSplineTangentScale: this.opts.style.loopSplineTangentScale,
                loopSplineMaxTangentFactor: this.opts.style.loopSplineMaxTangentFactor,
                loopSplineAnchorPolicy: 'secondary-visual-endpoints-plus-every-loop-residue-point',
                secondaryBoundaryTubeEnabled: this.opts.style.secondaryBoundaryTubeEnabled,
                secondaryBoundaryTubeSamples: this.opts.style.secondaryBoundaryTubeSamples,
                secondaryBoundaryTubeRadiusScale: this.opts.style.secondaryBoundaryTubeRadiusScale,
                secondaryBoundaryTubeContextResidues: this.opts.style.secondaryBoundaryTubeContextResidues,
                secondaryBoundaryTubeMode: 'sse-sse-hermite-tube-only-when-no-real-loop-segment',
                sheetGeometryMode: 'fixed-legacy-body-arrowhead',
                segmentPaddingResidues: 0,
            },
        };

        if (this.root) this.root.userData.summary = this._summary;
        return this._summary;
    }
}
