import * as THREE from '../../libs/three.module.js';

/**
 * Fallback factory used only when official three.js XRControllerModelFactory
 * is not installed under static/vr/vendor.
 */
export class XRControllerModelFactory {
    createControllerModel(controllerGrip) {
        const group = new THREE.Group();
        group.name = 'fallback-liquid-controller-model';

        const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.028, 0.12, 10, 18),
            new THREE.MeshStandardMaterial({
                color: 0xf8fbff,
                roughness: 0.22,
                metalness: 0.08,
                transparent: true,
                opacity: 0.94,
            })
        );
        body.rotation.x = Math.PI / 2;

        const glass = new THREE.Mesh(
            new THREE.SphereGeometry(0.023, 24, 12),
            new THREE.MeshBasicMaterial({color: 0x6edcff, transparent: true, opacity: 0.88})
        );
        glass.position.set(0, 0, -0.086);

        group.add(body, glass);
        return group;
    }
}
