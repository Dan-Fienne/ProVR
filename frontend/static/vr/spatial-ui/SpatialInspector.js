import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {makeInfoTexture} from './SpatialCanvasTexture.js';

export class SpatialInspector {
    constructor() {
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(T.sizes.inspectorWidth, T.sizes.inspectorHeight),
            new THREE.MeshBasicMaterial({
                map: makeInfoTexture({
                    title: 'How to use',
                    subtitle: 'Trigger selects. Squeeze toggles menu.',
                    rows: [
                        ['Panel', 'grab Move handle to reposition'],
                        ['Close', 'hide panel; orb reopens it'],
                    ],
                    width: 900,
                    height: 320,
                }),
                transparent: true,
                depthWrite: false,
            })
        );
        this.mesh.name = 'vr:contextInspector';
        this.mesh.renderOrder = 130;
    }

    set({title = 'Context', subtitle = '', rows = [], kind = 'default'} = {}) {
        const old = this.mesh.material.map;
        this.mesh.material.map = makeInfoTexture({title, subtitle, rows, kind, width: 900, height: 320});
        old?.dispose?.();
        this.mesh.material.needsUpdate = true;
    }
}
