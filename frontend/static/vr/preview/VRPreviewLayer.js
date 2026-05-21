import * as THREE from '../../libs/three.module.js';

export class VRPreviewLayer {
    constructor({scene, proteinStageGroup} = {}) {
        this.scene = scene;
        this.proteinStageGroup = proteinStageGroup;
        this.root = new THREE.Group();
        this.root.name = 'vr-preview-layer';
        scene.add(this.root);
        this.material = new THREE.MeshBasicMaterial({color: 0x22b8ff, transparent: true, opacity: 0.35, depthWrite: false});
        this.points = [];
    }

    showPositions(model, atomIds, positions, {maxPoints = 320} = {}) {
        this.clear();
        const stride = Math.max(1, Math.ceil(atomIds.length / maxPoints));
        for (let i = 0; i < atomIds.length; i += stride) {
            const atomId = atomIds[i];
            const p = positions.get(atomId);
            if (!p) continue;
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), this.material);
            mesh.position.set(p[0], p[1], p[2]);
            this.proteinStageGroup.localToWorld(mesh.position);
            this.root.add(mesh);
            this.points.push(mesh);
        }
    }

    clear() {
        while (this.root.children.length) {
            const c = this.root.children.pop();
            c.geometry?.dispose?.();
        }
        this.points.length = 0;
    }
}
