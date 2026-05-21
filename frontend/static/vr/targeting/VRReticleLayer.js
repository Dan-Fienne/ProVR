import * as THREE from '../../libs/three.module.js';

export class VRReticleLayer {
    constructor({scene} = {}) {
        this.group = new THREE.Group();
        this.group.name = 'vr-liquid-reticle-layer';

        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 24, 12),
            new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.96, depthTest: false})
        );

        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.032, 24, 12),
            new THREE.MeshBasicMaterial({color: 0x6edcff, transparent: true, opacity: 0.34, depthWrite: false, depthTest: false})
        );

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.044, 0.060, 52),
            new THREE.MeshBasicMaterial({color: 0x7cffd1, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthTest: false})
        );

        this.group.add(glow, dot, ring);
        this.group.renderOrder = 2400;
        scene.add(this.group);
        this.hide();
    }

    show(point, camera) {
        this.group.visible = true;
        this.group.position.copy(point);
        const p = new THREE.Vector3();
        camera.getWorldPosition(p);
        this.group.lookAt(p);
    }

    hide() {
        this.group.visible = false;
    }
}
