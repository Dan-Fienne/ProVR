import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {makeInfoTexture} from './SpatialCanvasTexture.js';

export class SpatialToast {
    constructor() {
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(T.sizes.toastWidth, T.sizes.toastHeight),
            new THREE.MeshBasicMaterial({
                map: makeInfoTexture({
                    title: 'Ready',
                    subtitle: 'Load a structure to begin',
                    rows: [],
                    kind: 'ok',
                    width: 900,
                    height: 260,
                }),
                transparent: true,
                depthWrite: false,
            })
        );
        this.mesh.name = 'vr:toast';
        this.mesh.renderOrder = 130;
    }

    show(message, {kind = 'info'} = {}) {
        const title = kind === 'error' ? 'Error' : kind === 'ok' ? 'Ready' : 'Status';
        const old = this.mesh.material.map;
        this.mesh.material.map = makeInfoTexture({
            title,
            subtitle: String(message || ''),
            rows: [],
            kind,
            width: 900,
            height: 260,
        });
        old?.dispose?.();
        this.mesh.material.needsUpdate = true;
        this.mesh.visible = true;
    }
}
