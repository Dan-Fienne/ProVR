import * as THREE from '../../libs/three.module.js';
import {RepresentationBase} from '../common/RepresentationBase.js';
import {createStructureFilter} from '../../domain/protein/StructureFilter.js';
import {buildBondTopology, getBondTopologyRecords} from '../geometry/BondTopologyBuilder.js';
import {targetFromBond} from '../interaction/PickTarget.js';
import {RepDirtyFlags} from '../common/DirtyPolicy.js';
import {EventTypes} from '../../core/event/EventTypes.js';

const ELEMENT_COLORS = Object.freeze({
    H: 0xffffff,
    C: 0x909090,
    N: 0x3050f8,
    O: 0xff0d0d,
    S: 0xffff30,
    P: 0xff8000,
    F: 0x50f850,
    CL: 0x1ff01f,
    BR: 0xa62929,
    I: 0x940094,
    FE: 0xe06633,
    MG: 0x8aff00,
    CA: 0x3dff00,
    ZN: 0x7d80b0,
    CU: 0xc88033,
    MN: 0x9c7ac7,
    X: 0x9ca3af,
});

const CHAIN_PALETTE = [
    0x4e79a7, 0xf28e2b, 0xe15759, 0x76b7b2, 0x59a14f,
    0xedc948, 0xb07aa1, 0xff9da7, 0x9c755f, 0xbab0ac,
];

function normalizeElement(element = '') {
    const e = String(element || '').trim().toUpperCase();
    if (!e) return 'X';
    if (e.length === 1) return e;
    const two = e.slice(0, 2);
    if (ELEMENT_COLORS[two] != null) return two;
    return e[0];
}

function chainColor(chainId = '') {
    let hash = 0;
    for (const ch of String(chainId)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return CHAIN_PALETTE[Math.abs(hash) % CHAIN_PALETTE.length];
}

function residueKindColor(residue) {
    if (!residue) return 0x9ca3af;
    if (residue.isProtein) return 0x4e79a7;
    if (residue.isNucleic) return 0xb07aa1;
    if (residue.isHeterogen) return 0xf28e2b;
    if (residue.isWater) return 0x74b9ff;
    return 0x9ca3af;
}

function colorForAtom(model, atom, colorScheme = 'element') {
    const residue = atom ? model.residues.get(atom.residueId) : null;
    switch (colorScheme) {
        case 'chain':
            return new THREE.Color(chainColor(residue?.chainId || 'X'));
        case 'kind':
        case 'residueKind':
            return new THREE.Color(residueKindColor(residue));
        case 'element':
        default:
            return new THREE.Color(ELEMENT_COLORS[normalizeElement(atom?.element || atom?.name)] ?? ELEMENT_COLORS.X);
    }
}

function addColor(colors, c) {
    colors.push(c.r, c.g, c.b);
}

export class LineRepresentation extends RepresentationBase {
    constructor({spec, context}) {
        super({spec, context});
        this.lineSegments = null;
        this._geometry = null;
        this._material = null;
        this._bondRecords = [];
        this._summary = null;
    }

    build() {
        if (this._built) return;
        const model = this.model;
        if (!model) throw new Error(`[LineRepresentation] protein not found: ${this.proteinId}`);

        buildBondTopology(model, this.spec.geometry?.bondTopology || {});

        const filter = createStructureFilter(this.spec.filter || {});
        const records = getBondTopologyRecords(model);
        const positions = [];
        const colors = [];
        const colorScheme = this.spec.style?.colorScheme || 'element';
        const pickable = this.spec.interaction?.pickable !== false;
        const selectedRecords = [];

        this.root = new THREE.Group();
        this.root.name = `LineRepresentation:${this.id}`;
        this.root.userData = {
            representationId: this.id,
            proteinId: this.proteinId,
            representationType: this.spec.type,
        };

        for (const record of records) {
            const [aId, bId] = record.atomIds || [];
            const atomA = model.getAtom(aId);
            const atomB = model.getAtom(bId);
            if (!atomA || !atomB) continue;
            if (!filter.acceptBond(atomA, atomB, model)) continue;

            const pA = model.getAtomPosition(aId);
            const pB = model.getAtomPosition(bId);
            if (!pA || !pB) continue;

            positions.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2]);
            addColor(colors, colorForAtom(model, atomA, colorScheme));
            addColor(colors, colorForAtom(model, atomB, colorScheme));

            selectedRecords.push(record);

            if (pickable) {
                const target = targetFromBond(model, aId, bId, {
                    sourceRepresentation: 'line',
                    representationId: this.id,
                    bondSource: record.source,
                    bondKind: record.kind,
                });
                if (target) {
                    const pickProxy = {
                        name: `LinePickProxy:${this.id}:${aId}-${bId}`,
                        type: 'LinePickProxy',
                        visible: false,
                        userData: {},
                        atomIds: [aId, bId],
                        start: [pA[0], pA[1], pA[2]],
                        end: [pB[0], pB[1], pB[2]],
                    };
                    this.registerPickable(pickProxy, target);
                }
            }
        }

        this._geometry = new THREE.BufferGeometry();
        this._geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this._geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        this._geometry.computeBoundingSphere();

        const opacity = this.spec.style?.opacity ?? 1.0;
        this._material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: opacity < 1,
            opacity,
            depthTest: this.spec.style?.depthTest ?? true,
            depthWrite: this.spec.style?.depthWrite ?? true,
        });

        this.lineSegments = new THREE.LineSegments(this._geometry, this._material);
        this.lineSegments.name = `LineSegments:${this.id}`;
        this.lineSegments.userData = {
            representationId: this.id,
            proteinId: this.proteinId,
            representationType: this.spec.type,
            segmentCount: selectedRecords.length,
        };
        this.root.add(this.lineSegments);

        this._bondRecords = selectedRecords;
        this._summary = {
            representationId: this.id,
            proteinId: this.proteinId,
            type: this.spec.type,
            visibleBonds: selectedRecords.length,
            lineSegments: selectedRecords.length,
            pickTargets: this._pickables.size,
            colorScheme,
            filter: {...this.spec.filter},
            lastUpdatedRevision: model.revision,
        };
        this.root.userData.summary = this._summary;

        if (this.context.scene) this.context.scene.add(this.root);
        this._built = true;
        this._disposed = false;
    }

    update(evt) {
        if (!evt || evt.proteinId !== this.proteinId) return;

        switch (evt.type) {
            case EventTypes.ATOM_POSITION_CHANGED:
            case EventTypes.ATOM_SET_TRANSFORMED:
            case EventTypes.CHAIN_TRANSFORMED:
            case EventTypes.GEOMETRY_CHANGED:
                this._refreshPositionsFromModel();
                break;
            case EventTypes.RESIDUE_MODIFIED:
            case EventTypes.STRUCTURE_REBUILT:
                this.markDirty(RepDirtyFlags.FULL_REBUILD);
                break;
            default:
                break;
        }
    }

    summary() {
        return {...(this._summary || {})};
    }

    getBondRecords({limit = Infinity} = {}) {
        return this._bondRecords.slice(0, limit);
    }

    _refreshPositionsFromModel() {
        if (!this._geometry || !this._bondRecords.length) return false;
        const model = this.model;
        if (!model) return false;

        const positionAttr = this._geometry.getAttribute('position');
        if (!positionAttr) return false;

        const arr = positionAttr.array;
        let offset = 0;
        for (const record of this._bondRecords) {
            const [aId, bId] = record.atomIds || [];
            const pA = model.getAtomPosition(aId);
            const pB = model.getAtomPosition(bId);
            if (!pA || !pB) {
                offset += 6;
                continue;
            }
            arr[offset++] = pA[0];
            arr[offset++] = pA[1];
            arr[offset++] = pA[2];
            arr[offset++] = pB[0];
            arr[offset++] = pB[1];
            arr[offset++] = pB[2];
        }

        positionAttr.needsUpdate = true;
        this._geometry.computeBoundingSphere();
        this._geometry.computeBoundingBox?.();

        if (this._summary) this._summary.lastUpdatedRevision = model.revision;
        return true;
    }

    disposeObjectsOnly() {
        if (this._geometry) {
            this._geometry.dispose();
            this._geometry = null;
        }
        if (this._material) {
            this._material.dispose();
            this._material = null;
        }
        this.lineSegments = null;
        this._bondRecords = [];
        this._summary = null;
        super.disposeObjectsOnly();
    }
}
