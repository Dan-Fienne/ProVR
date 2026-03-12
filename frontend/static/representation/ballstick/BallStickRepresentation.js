import * as THREE from "../../libs/three.webgpu.js"

import {getElementColor, getElementRadius} from "./ElementStyle.js";
import {RepresentationBase} from "../common/RepresentationBase.js";
import {EventTypes} from "../../core/event/EventTypes.js";


export class BallStickRepresentation extends RepresentationBase {
    constructor(params = {}) {
        super(params);
        this.opts = {
            atomRadiusScale: params.options?.atomRadiusScale ?? 1.0,
            bondRadius: params.options?.bondRadius ?? 0.09,
            atomSegments: params.options?.atomSegments ?? 12,
            bondSegments: params.options?.bondSegments ?? 10,
            atomMetallic: params.options?.atomMetallic ?? 0.05,
            atomRoughness: params.options?.atomRoughness ?? 0.35,
            bondMetallic: params.options?.bondMetallic ?? 0.0,
            bondRoughness: params.options?.bondRoughness ?? 0.45,
            receiveShadow: params.options?.receiveShadow ?? false,
            castShadow: params.options?.castShadow ?? false,
            halfBondColor: params.options?.halfBondColor ?? true,
        };

        this._chainRuntime = new Map();
        this._atomRefById = new Map();
        this._bondRefByKey = new Map();
        this._bondsByAtom = new Map();

        this._shared = null;

        this._tmpObj = new THREE.Object3D();
        this._tmpV1 = new THREE.Vector3();
        this._tmpV2 = new THREE.Vector3();
        this._tmpDir = new THREE.Vector3();
        this._tmpMid = new THREE.Vector3();
        this._tmpQ = new THREE.Quaternion();
        this._tmpS = new THREE.Vector3();
        this._tmpColor = new THREE.Color();

        this._yAxis = new THREE.Vector3(0, 1, 0);
    }

    build() {
        if (this._built) return;
        const model = this.model;
        if (!model) throw new Error(`[BallStickRepresentation] protein not found: ${this.proteinId}`);

        this._shared = acquireShared(this.opts);

        this.root = new THREE.Group()
        this.root.name = `BallStick:${this.proteinId}`;
        this.scene.add(this.root);

        this._chainRuntime.clear();
        this._atomRefById.clear();
        this._bondRefByKey.clear();
        this._bondsByAtom.clear();

        for (const [chainId, chain] of model.chains.entries()) {
            const chainRuntime = this._buildChainRuntime(model, chainId, chain);
            this._chainRuntime.set(chainId, chainRuntime);
            this.root.add(chainRuntime.group);
            this._applyChainPreviewTransform(chainId);
        }
        this._built = true;
    }

    update(evt) {
        if (!this._built || !evt) return;
        if (evt.proteinId && evt.proteinId !== this.proteinId) return;

        switch (evt.type) {
            case EventTypes.ATOM_POSITION_CHANGED:
                this._onAtomPositionChanged(evt);
                break;
            case EventTypes.CHAIN_TRANSFORMED:
                this._onChainTransformed(evt);
                break;
            case EventTypes.RESIDUE_MODIFIED:
                this._onResidueModified(evt);
                break;
            case EventTypes.STRUCTURE_REBUILT:
                this._rebuildAll();
                break;
            default:
                break;
        }
    }

    dispose() {

        if (this._disposed) return;
        if (this.root && this.scene) {
            this.scene.remove(this.root);
        }

        for (const rt of this._chainRuntime.values()) {
            if (rt.group) rt.group.clear();
        }

        this._chainRuntime.clear();
        this._atomRefById.clear();
        this._bondRefByKey.clear();
        this._bondsByAtom.clear();

        if (this._shared) {
            releaseShared(this._shared);
            this._shared = null;
        }

        this.root = null;
        super.dispose();
    }

    _rebuildAll() {
        this.dispose();
        this._disposed = false;
        this._built = false;
        this.build();
    }

    _buildChainRuntime(model, chainId, _chain) {
        const group = new THREE.Group();
    }
}