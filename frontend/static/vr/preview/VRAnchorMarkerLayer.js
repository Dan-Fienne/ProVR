import * as THREE from '../../libs/three.module.js';

export class VRAnchorMarkerLayer {
    constructor({scene} = {}) {
        this.root = new THREE.Group();
        this.root.name = 'vr-anchor-marker-layer';
        scene.add(this.root);
    }

    setAnchors(points = []) {
        this.clear();
        for (const p of points) {
            const mesh = new THREE.Mesh(
                new THREE.RingGeometry(0.06, 0.078, 32),
                new THREE.MeshBasicMaterial({color: 0xfacc15, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false})
            );
            mesh.position.copy(p);
            this.root.add(mesh);
        }
    }

    clear() {
        while (this.root.children.length) {
            const c = this.root.children.pop();
            c.geometry?.dispose?.();
            c.material?.dispose?.();
        }
    }
}
