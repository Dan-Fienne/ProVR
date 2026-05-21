import * as THREE from '../../libs/three.module.js';

export class OculusHandModel extends THREE.Object3D {
    constructor(hand) {
        super();
        this.hand = hand;
        this.name = 'fallback-liquid-generic-hand-model';
        this.tip = new THREE.Mesh(
            new THREE.SphereGeometry(0.014, 18, 10),
            new THREE.MeshBasicMaterial({color: 0x7cffd1, transparent: true, opacity: 0.92})
        );
        this.add(this.tip);
    }

    updateMatrixWorld(force) {
        const joint = this.hand?.joints?.['index-finger-tip'];
        if (joint) this.tip.position.copy(joint.position);
        super.updateMatrixWorld(force);
    }
}
