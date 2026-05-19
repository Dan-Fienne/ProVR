import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {makeInfoTexture} from './SpatialCanvasTexture.js';

export class SpatialInspector {
    constructor() {
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(T.sizes.inspectorWidth, T.sizes.inspectorHeight),
            new THREE.MeshBasicMaterial({
                map: makeInfoTexture({
                    title: 'Context',
                    subtitle: 'No selection yet',
                    rows: ['Point at a protein representation', 'Trigger to select and drag'],
                }),
                transparent: true,
                depthWrite: false,
            })
        );
        this.mesh.name = 'vr:contextInspector';
        this.mesh.renderOrder = 125;
    }

    set({title = 'Context', subtitle = '', rows = [], kind = 'default'} = {}) {
        const old = this.mesh.material.map;
        this.mesh.material.map = makeInfoTexture({title, subtitle, rows, kind});
        old?.dispose?.();
        this.mesh.material.needsUpdate = true;
    }
}
