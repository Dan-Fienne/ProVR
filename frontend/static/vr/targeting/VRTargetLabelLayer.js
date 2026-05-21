import * as THREE from '../../libs/three.module.js';
import {makeLiquidCalloutTexture} from '../ui/VRLiquidGlassCanvas.js';

export class VRTargetLabelLayer {
    constructor({scene} = {}) {
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.54, 0.164),
            new THREE.MeshBasicMaterial({transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide})
        );
        this.mesh.name = 'vr-liquid-target-callout';
        this.mesh.renderOrder = 2500;
        scene.add(this.mesh);
        this.lastKey = '';
        this.hide();
    }

    show({point, label, subtitle, camera, dragging = false} = {}) {
        if (dragging) return this.hide();
        const key = `${label}|${subtitle}`;
        if (key !== this.lastKey) {
            this.mesh.material.map?.dispose?.();
            this.mesh.material.map = makeLiquidCalloutTexture({title: label, subtitle});
            this.mesh.material.needsUpdate = true;
            this.lastKey = key;
        }
        this.mesh.visible = true;

        // Offset away from protein target to avoid blocking structural view.
        this.mesh.position.copy(point).add(new THREE.Vector3(0.15, 0.105, 0.035));
        const p = new THREE.Vector3();
        camera.getWorldPosition(p);
        this.mesh.lookAt(p);
    }

    hide() {
        this.mesh.visible = false;
        this.lastKey = '';
    }
}
