import * as THREE from '../../libs/three.module.js';
import {makeTooltipTexture} from './VRLiquidGlassCanvas.js';

export class VRFloatingTooltip {
    constructor({scene} = {}) {
        this.scene = scene;
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.48, 0.108),
            new THREE.MeshBasicMaterial({transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide})
        );
        this.mesh.name = 'vr-floating-tooltip';
        this.mesh.renderOrder = 2800;
        this.scene.add(this.mesh);
        this.lastText = '';
        this.hide();
    }

    show({text, point, camera, offset = [0.05, 0.075, 0.025]} = {}) {
        if (!text || !point) return this.hide();
        if (text !== this.lastText) {
            this.mesh.material.map?.dispose?.();
            this.mesh.material.map = makeTooltipTexture({text});
            this.mesh.material.needsUpdate = true;
            this.lastText = text;
        }
        this.mesh.visible = true;
        this.mesh.position.copy(point).add(new THREE.Vector3(...offset));
        const p = new THREE.Vector3();
        camera.getWorldPosition(p);
        this.mesh.lookAt(p);
    }

    hide() {
        this.mesh.visible = false;
        this.lastText = '';
    }
}
