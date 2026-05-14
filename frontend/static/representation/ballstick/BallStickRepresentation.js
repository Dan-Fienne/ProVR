import * as THREE from "../../libs/three.webgpu.js";

import {getBallStickRadius, getElementColor} from "./ElementStyle.js";
import {RepresentationBase} from "../common/RepresentationBase.js";
import {EventTypes} from "../../core/event/EventTypes.js";
import {createStructureFilter} from "../../domain/protein/StructureFilter.js";
import {targetFromAtom, targetFromBond} from "../interaction/PickTarget.js";
import {buildBondTopology, getBondTopologyRecords} from "../geometry/BondTopologyBuilder.js";

function finiteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
    return clamp(finiteNumber(value, 0), 0, 1);
}

function bondKey(a, b) {
    return String(a) < String(b) ? `${a}:${b}` : `${b}:${a}`;
}

function distance3(a, b) {
    if (!a || !b) return 0;
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function arrayToMatrix4(arr) {
    const m = new THREE.Matrix4();
    if (arr && arr.length === 16) m.fromArray(arr);
    return m;
}

function mergeOptions(spec) {
    const style = spec?.style || {};
    const geometry = spec?.geometry || {};
    const interaction = spec?.interaction || {};

    return {
        atomRadiusScale: finiteNumber(style.atomRadiusScale, 1.0),
        minAtomRadius: finiteNumber(style.minAtomRadius, 0.12),
        maxAtomRadius: finiteNumber(style.maxAtomRadius, 0.42),
        bondRadius: finiteNumber(style.bondRadius ?? geometry.bondRadius, 0.075),
        halfBondColor: style.halfBondColor ?? geometry.halfBondColor ?? true,
        bondInsetRatio: finiteNumber(style.bondInsetRatio ?? geometry.bondInsetRatio, 0.62),

        atomSegments: finiteNumber(geometry.atomSegments, 20),
        bondSegments: finiteNumber(geometry.bondSegments, 12),
        minBondSegmentLength: finiteNumber(geometry.minBondSegmentLength, 1e-4),
        stretchedBondFactor: finiteNumber(geometry.stretchedBondFactor, 2.25),
        bondTopology: geometry.bondTopology || {},

        opacity: finiteNumber(style.opacity, 1.0),
        atomMetallic: finiteNumber(style.atomMetallic, 0.02),
        atomRoughness: finiteNumber(style.atomRoughness, 0.36),
        bondMetallic: finiteNumber(style.bondMetallic, 0.0),
        bondRoughness: finiteNumber(style.bondRoughness, 0.48),
        castShadow: style.castShadow ?? false,
        receiveShadow: style.receiveShadow ?? false,

        pickAtoms: interaction.pickable !== false && interaction.pickAtoms !== false,
        pickBonds: interaction.pickable !== false && interaction.pickBonds !== false,
    };
}

function sharedKey(opts) {
    return JSON.stringify({
        atomSegments: opts.atomSegments,
        bondSegments: opts.bondSegments,
        atomMetallic: opts.atomMetallic,
        atomRoughness: opts.atomRoughness,
        bondMetallic: opts.bondMetallic,
        bondRoughness: opts.bondRoughness,
        opacity: opts.opacity,
    });
}

const SHARED = new Map();

function acquireShared(opts) {
    const key = sharedKey(opts);
    let entry = SHARED.get(key);

    if (!entry) {
        entry = {
            key,
            refs: 0,
            sphereGeometry: new THREE.SphereGeometry(1, opts.atomSegments, opts.atomSegments),
            cylinderGeometry: new THREE.CylinderGeometry(1, 1, 1, opts.bondSegments, 1, false),
            atomMaterials: new Map(),
            bondMaterials: new Map(),
        };
        SHARED.set(key, entry);
    }

    entry.refs += 1;
    return entry;
}

function releaseShared(entry) {
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;

    entry.sphereGeometry.dispose?.();
    entry.cylinderGeometry.dispose?.();

    for (const mat of entry.atomMaterials.values()) mat.dispose?.();
    for (const mat of entry.bondMaterials.values()) mat.dispose?.();

    SHARED.delete(entry.key);
}

function materialFor(shared, color, kind, opts) {
    const materials = kind === 'atom' ? shared.atomMaterials : shared.bondMaterials;
    const key = `${kind}:${color}:${opts.opacity}`;
    if (materials.has(key)) return materials.get(key);

    const material = new THREE.MeshStandardMaterial({
        color,
        metalness: kind === 'atom' ? opts.atomMetallic : opts.bondMetallic,
        roughness: kind === 'atom' ? opts.atomRoughness : opts.bondRoughness,
        transparent: opts.opacity < 1,
        opacity: opts.opacity,
    });

    materials.set(key, material);
    return material;
}

/**
 * BallStickRepresentation
 *
 * This representation renders one mature default ball-stick style.
 *
 * Responsibilities:
 * - atom sphere rendering
 * - naturally connected half-bond cylinder rendering
 * - atom/bond PickTarget registration through PickRegistry
 * - incremental visual update when ProteinModel coordinates change
 *
 * Non-responsibilities:
 * - does not directly edit ProteinModel coordinates
 * - does not decide user design intent
 * - does not delete/re-infer bonds during ordinary drag
 */
export class BallStickRepresentation extends RepresentationBase {
    constructor({spec, context}) {
        super({spec, context});

        this.opts = mergeOptions(this.spec);
        this._shared = null;

        this._chainRuntime = new Map();
        this._atomRefById = new Map();
        this._bondRefByKey = new Map();
        this._bondsByAtom = new Map();
        this._summary = null;

        this._tmpV1 = new THREE.Vector3();
        this._tmpV2 = new THREE.Vector3();
        this._tmpA = new THREE.Vector3();
        this._tmpB = new THREE.Vector3();
        this._tmpDir = new THREE.Vector3();
        this._tmpMid = new THREE.Vector3();
        this._tmpQ = new THREE.Quaternion();
        this._yAxis = new THREE.Vector3(0, 1, 0);
    }

    build() {
        if (this._built) return;

        const model = this.model;
        if (!model) throw new Error(`[BallStickRepresentation] protein not found: ${this.proteinId}`);

        this.opts = mergeOptions(this.spec);
        this._shared = acquireShared(this.opts);

        buildBondTopology(model, this.opts.bondTopology);

        const filter = createStructureFilter(this.spec.filter || {});

        this.root = new THREE.Group();
        this.root.name = `BallStick:${this.proteinId}:${this.id}`;
        this.root.visible = this.visible;
        this.root.userData = {
            kind: 'proteinRepresentation',
            proteinId: this.proteinId,
            representationId: this.id,
            representation: 'BallStick',
            version: 2,
        };

        this._chainRuntime.clear();
        this._atomRefById.clear();
        this._bondRefByKey.clear();
        this._bondsByAtom.clear();

        for (const [chainId, chain] of model.chains.entries()) {
            const chainRuntime = this._buildChainRuntime(model, chainId, chain, filter);
            this._chainRuntime.set(chainId, chainRuntime);
            this.root.add(chainRuntime.group);
            this._applyChainPreviewTransform(chainId);
        }

        this._refreshSummary();

        if (this.context.scene && typeof this.context.scene.add === 'function') {
            this.context.scene.add(this.root);
        }

        this._built = true;
        this._disposed = false;
    }

    rebuild() {
        this.dispose();
        this._disposed = false;
        this._built = false;
        this.build();
    }

    update(evt) {
        if (!this._built || !evt) return;
        if (evt.proteinId && evt.proteinId !== this.proteinId) return;

        switch (evt.type) {
            case EventTypes.ATOM_POSITION_CHANGED:
            case EventTypes.ATOM_SET_TRANSFORMED:
                this._onAtomSetChanged(evt);
                break;
            case EventTypes.CHAIN_TRANSFORMED:
                this._onChainTransformed(evt);
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

    dispose() {
        if (this._disposed) return;

        this.unregisterPickables();

        if (this.root && this.context.scene && typeof this.context.scene.remove === 'function') {
            this.context.scene.remove(this.root);
        }

        this.root?.clear?.();

        this._chainRuntime.clear();
        this._atomRefById.clear();
        this._bondRefByKey.clear();
        this._bondsByAtom.clear();

        if (this._shared) {
            releaseShared(this._shared);
            this._shared = null;
        }

        this.root = null;
        this._summary = null;
        this._disposed = true;
        this._built = false;
    }

    getPickableObjects() {
        return this.getPickables();
    }

    summary() {
        this._refreshSummary();
        return this._summary;
    }

    _buildChainRuntime(model, chainId, chain, filter) {
        const group = new THREE.Group();
        group.name = `Chain:${chainId}`;
        group.userData = {
            kind: 'chain',
            proteinId: this.proteinId,
            representationId: this.id,
            chainId,
        };

        const bondsGroup = new THREE.Group();
        bondsGroup.name = `Bonds:${chainId}`;

        const atomsGroup = new THREE.Group();
        atomsGroup.name = `Atoms:${chainId}`;

        // Bonds first, atoms second: atoms visually cover stick ends.
        group.add(bondsGroup);
        group.add(atomsGroup);

        const atomIds = this._collectChainAtomIds(model, chainId, chain);
        const acceptedAtomIds = [];

        for (const atomId of atomIds) {
            const atom = model.getAtom(atomId);
            if (!atom || !filter.acceptAtom(atom, model)) continue;

            const residue = model.residues.get(atom.residueId);
            const mesh = this._createAtomMesh(model, atom, residue, chainId);
            atomsGroup.add(mesh);
            acceptedAtomIds.push(atomId);
        }

        const accepted = new Set(acceptedAtomIds);

        for (const record of getBondTopologyRecords(model)) {
            const [a, b] = record.atomIds || [];
            if (!accepted.has(a) && !accepted.has(b)) continue;

            const atomA = model.getAtom(a);
            const atomB = model.getAtom(b);
            if (!atomA || !atomB) continue;
            if (!filter.acceptBond(atomA, atomB, model)) continue;

            const residueA = model.residues.get(atomA.residueId);
            const residueB = model.residues.get(atomB.residueId);
            const ownerChainId = residueA?.chainId || residueB?.chainId || chainId;
            if (ownerChainId !== chainId) continue;

            const key = bondKey(a, b);
            if (this._bondRefByKey.has(key)) continue;

            const ref = this._createBondRef(model, a, b, chainId, record);
            if (!ref) continue;
            for (const mesh of ref.meshes) bondsGroup.add(mesh);
        }

        return {
            group,
            atomsGroup,
            bondsGroup,
            atomIds: acceptedAtomIds,
        };
    }

    _collectChainAtomIds(model, chainId, chain) {
        if (model.getChainAtomIds) return model.getChainAtomIds(chainId) || [];

        const out = [];
        for (const residueId of chain.residueIds || []) {
            const residue = model.residues?.get(residueId);
            if (!residue) continue;
            for (const atomId of residue.atomIds || []) out.push(atomId);
        }
        return out;
    }

    _createAtomMesh(model, atom, residue, chainId) {
        const color = getElementColor(atom.element || atom.name);
        const material = materialFor(this._shared, color, 'atom', this.opts);
        const mesh = new THREE.Mesh(this._shared.sphereGeometry, material);
        const radius = this._atomRadius(atom.element || atom.name);

        const p = model.getAtomPosition(atom.id, [0, 0, 0]);
        mesh.position.set(p[0], p[1], p[2]);
        mesh.scale.setScalar(radius);

        mesh.castShadow = this.opts.castShadow;
        mesh.receiveShadow = this.opts.receiveShadow;
        mesh.name = `Atom:${atom.id}:${atom.name}`;
        mesh.userData = {
            kind: 'atom',
            pickable: this.opts.pickAtoms,
            proteinId: this.proteinId,
            representationId: this.id,
            atomId: atom.id,
            atomName: atom.name,
            element: atom.element,
            residueId: atom.residueId,
            residueName: residue?.name || '',
            residueLabel: residue?.label || '',
            chainId,
            ballStickVersion: 2,
        };

        this._atomRefById.set(atom.id, {
            mesh,
            atomId: atom.id,
            residueId: atom.residueId,
            chainId,
            element: atom.element,
            radius,
        });

        if (this.opts.pickAtoms) {
            const target = targetFromAtom(model, atom.id, {
                sourceRepresentation: 'ballstick',
                sourceType: this.spec.type,
                representationId: this.id,
            });
            if (target) this.registerPickable(mesh, target);
        }

        return mesh;
    }

    _atomRadius(element) {
        const r = getBallStickRadius(element) * this.opts.atomRadiusScale;
        return clamp(r, this.opts.minAtomRadius, this.opts.maxAtomRadius);
    }

    _createBondRef(model, a, b, chainId, record = null) {
        const atomA = model.getAtom(a);
        const atomB = model.getAtom(b);
        if (!atomA || !atomB) return null;

        const key = bondKey(a, b);
        const meshes = [];

        if (this.opts.halfBondColor) {
            meshes.push(this._createBondMesh(model, a, b, atomA.element || atomA.name, `${key}:A`, record));
            meshes.push(this._createBondMesh(model, a, b, atomB.element || atomB.name, `${key}:B`, record));
        } else {
            meshes.push(this._createBondMesh(model, a, b, 'C', key, record));
        }

        const ref = {
            key,
            a,
            b,
            chainId,
            meshes,
            record,
            baseDistance: this._bondBaseDistance(model, a, b, record),
            currentDistance: 0,
            stretched: false,
        };

        this._bondRefByKey.set(key, ref);
        this._indexBondForAtom(a, key);
        this._indexBondForAtom(b, key);
        this._updateBondGeometry(ref);
        return ref;
    }

    _createBondMesh(model, a, b, elementForColor, name, record = null) {
        const color = getElementColor(elementForColor);
        const material = materialFor(this._shared, color, 'bond', this.opts);
        const mesh = new THREE.Mesh(this._shared.cylinderGeometry, material);

        mesh.castShadow = this.opts.castShadow;
        mesh.receiveShadow = this.opts.receiveShadow;
        mesh.name = `Bond:${name}`;
        mesh.userData = {
            kind: 'bond',
            pickable: this.opts.pickBonds,
            proteinId: this.proteinId,
            representationId: this.id,
            atomIds: [a, b],
            bondSource: record?.source || 'bondGraph',
            bondKind: record?.kind || 'bondGraph',
            ballStickVersion: 2,
        };

        if (this.opts.pickBonds) {
            const target = targetFromBond(model, a, b, {
                sourceRepresentation: 'ballstick',
                sourceType: this.spec.type,
                representationId: this.id,
                bondSource: record?.source || 'bondGraph',
                bondKind: record?.kind || 'bondGraph',
            });
            if (target) this.registerPickable(mesh, target);
        }

        return mesh;
    }

    _bondBaseDistance(model, a, b, record) {
        const d = Number(record?.distance);
        if (Number.isFinite(d) && d > 0) return d;
        return distance3(model.getAtomPosition(a), model.getAtomPosition(b));
    }

    _indexBondForAtom(atomId, key) {
        if (!this._bondsByAtom.has(atomId)) this._bondsByAtom.set(atomId, new Set());
        this._bondsByAtom.get(atomId).add(key);
    }

    _onAtomSetChanged(evt) {
        const atomIds = evt.atomIds || (evt.atomId ? [evt.atomId] : []);
        const touchedBondKeys = new Set();

        for (const atomId of atomIds) {
            this._updateAtomMesh(atomId);
            const keys = this._bondsByAtom.get(atomId);
            if (keys) for (const key of keys) touchedBondKeys.add(key);
        }

        for (const key of touchedBondKeys) {
            const ref = this._bondRefByKey.get(key);
            if (ref) this._updateBondGeometry(ref);
        }

        this._refreshSummary();
    }

    _onChainTransformed(evt) {
        if (evt.chainId) this._applyChainPreviewTransform(evt.chainId);

        if (evt.bake) {
            const atomIds = evt.atomIds?.length ? evt.atomIds : this.model.getChainAtomIds(evt.chainId);
            this._onAtomSetChanged({...evt, atomIds});
        }
    }

    _applyChainPreviewTransform(chainId) {
        const model = this.model;
        const chain = model?.chains.get(chainId);
        const runtime = this._chainRuntime.get(chainId);
        if (!chain || !runtime) return;

        if (chain.previewTransform) {
            runtime.group.matrixAutoUpdate = false;
            runtime.group.matrix.copy(arrayToMatrix4(chain.previewTransform));
        } else {
            runtime.group.matrixAutoUpdate = true;
            runtime.group.position.set(0, 0, 0);
            runtime.group.rotation.set(0, 0, 0);
            runtime.group.scale.set(1, 1, 1);
            runtime.group.matrix.identity();
        }

        runtime.group.matrixWorldNeedsUpdate = true;
    }

    _updateAtomMesh(atomId) {
        const model = this.model;
        const ref = this._atomRefById.get(atomId);
        if (!model || !ref) return;

        const p = model.getAtomPosition(atomId, [0, 0, 0]);
        if (!p) return;

        ref.mesh.position.set(p[0], p[1], p[2]);
    }

    _updateBondGeometry(ref) {
        const model = this.model;
        if (!model) return;

        const a = model.getAtomPosition(ref.a, [0, 0, 0]);
        const b = model.getAtomPosition(ref.b, [0, 0, 0]);
        if (!a || !b) return;

        this._tmpV1.set(a[0], a[1], a[2]);
        this._tmpV2.set(b[0], b[1], b[2]);

        const dist = this._tmpA.subVectors(this._tmpV2, this._tmpV1).length();
        ref.currentDistance = dist;
        ref.stretched = ref.baseDistance > 0 && dist > ref.baseDistance * this.opts.stretchedBondFactor;

        if (dist <= this.opts.minBondSegmentLength) {
            for (const mesh of ref.meshes) mesh.visible = false;
            return;
        }

        this._tmpDir.subVectors(this._tmpV2, this._tmpV1).normalize();

        const refA = this._atomRefById.get(ref.a);
        const refB = this._atomRefById.get(ref.b);
        const rA = refA?.radius ?? this.opts.minAtomRadius;
        const rB = refB?.radius ?? this.opts.minAtomRadius;

        const maxInset = dist * 0.42;
        const insetA = Math.min(rA * clamp01(this.opts.bondInsetRatio), maxInset);
        const insetB = Math.min(rB * clamp01(this.opts.bondInsetRatio), maxInset);

        const start = this._tmpA.copy(this._tmpV1).addScaledVector(this._tmpDir, insetA);
        const end = this._tmpB.copy(this._tmpV2).addScaledVector(this._tmpDir, -insetB);
        const mid = this._tmpMid.copy(start).add(end).multiplyScalar(0.5);

        if (this.opts.halfBondColor && ref.meshes.length === 2) {
            this._placeCylinder(ref.meshes[0], start, mid);
            this._placeCylinder(ref.meshes[1], mid, end);
        } else {
            this._placeCylinder(ref.meshes[0], start, end);
        }

        for (const mesh of ref.meshes) {
            mesh.userData.baseDistance = ref.baseDistance;
            mesh.userData.currentDistance = ref.currentDistance;
            mesh.userData.stretched = ref.stretched;
        }
    }

    _placeCylinder(mesh, start, end) {
        this._tmpDir.subVectors(end, start);
        const len = this._tmpDir.length();

        if (len <= this.opts.minBondSegmentLength) {
            mesh.visible = false;
            return;
        }

        mesh.visible = true;
        mesh.position.copy(start).add(end).multiplyScalar(0.5);
        this._tmpDir.normalize();
        this._tmpQ.setFromUnitVectors(this._yAxis, this._tmpDir);
        mesh.quaternion.copy(this._tmpQ);
        mesh.scale.set(this.opts.bondRadius, len, this.opts.bondRadius);
    }

    _refreshSummary() {
        let stretchedBondCount = 0;
        const stretchedBonds = [];

        for (const ref of this._bondRefByKey.values()) {
            if (!ref.stretched) continue;
            stretchedBondCount += 1;
            stretchedBonds.push({
                atomIds: [ref.a, ref.b],
                baseDistance: ref.baseDistance,
                currentDistance: ref.currentDistance,
                ratio: ref.baseDistance > 0 ? ref.currentDistance / ref.baseDistance : null,
            });
        }

        this._summary = {
            representationId: this.id,
            proteinId: this.proteinId,
            type: this.spec.type,
            atoms: this._atomRefById.size,
            bonds: this._bondRefByKey.size,
            pickTargets: this._pickables.size,
            atomPickTargets: [...this._pickables].filter((obj) => obj.userData?.target?.kind === 'atom').length,
            bondPickTargets: [...this._pickables].filter((obj) => obj.userData?.target?.kind === 'bond').length,
            stretchedBondCount,
            stretchedBonds,
            lastUpdatedRevision: this.model?.revision ?? null,
            options: {
                atomRadiusScale: this.opts.atomRadiusScale,
                bondRadius: this.opts.bondRadius,
                halfBondColor: this.opts.halfBondColor,
                bondInsetRatio: this.opts.bondInsetRatio,
                stretchedBondFactor: this.opts.stretchedBondFactor,
            },
        };

        if (this.root) this.root.userData.summary = this._summary;
        return this._summary;
    }
}
