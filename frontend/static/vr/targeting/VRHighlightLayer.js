import * as THREE from '../../libs/three.module.js';

/**
 * Lightweight molecule hover affordance.
 *
 * Previous versions used a blue bounding/corner box. It was visible but visually
 * too heavy for molecular work. This layer now uses a small glass-like focus
 * point and a thin halo near the hit location / target center, so the user still
 * sees that the ray is targeting a molecule without covering the structure.
 */
export class VRHighlightLayer {
    constructor({scene, proteinStageGroup} = {}) {
        this.proteinStageGroup = proteinStageGroup;
        this.group = new THREE.Group();
        this.group.name = 'vr-subtle-target-highlight';
        this.group.renderOrder = 2200;

        this.halo = new THREE.Mesh(
            new THREE.RingGeometry(0.055, 0.073, 48),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.70,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false,
            })
        );

        this.glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.030, 20, 10),
            new THREE.MeshBasicMaterial({
                color: 0x5ac8fa,
                transparent: true,
                opacity: 0.42,
                depthWrite: false,
                depthTest: false,
            })
        );

        this.dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.014, 18, 8),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.96,
                depthWrite: false,
                depthTest: false,
            })
        );

        this.group.add(this.halo, this.glow, this.dot);
        scene.add(this.group);
        this.lastKey = '';
        this.hide();
    }

    show({target, model, fallbackPoint}) {
        const key = `${target?.kind}|${(target?.atomIds || []).slice(0, 3).join(',')}|${target?.atomIds?.length || 0}`;
        if (key !== this.lastKey) {
            this._place(target, model, fallbackPoint);
            this.lastKey = key;
        }
        this.group.visible = true;
    }

    hide() {
        this.group.visible = false;
        this.lastKey = '';
    }

    _place(target, model, fallbackPoint) {
        const center = this._computeTargetCenter(target, model, fallbackPoint);
        this.group.position.copy(center);

        // Size hint only: residue/range gets slightly larger halo, never a box.
        const n = target?.atomIds?.length || 1;
        const scale = Math.min(1.8, Math.max(1.0, Math.sqrt(n) * 0.16));
        this.group.scale.setScalar(scale);
    }

    _computeTargetCenter(target, model, fallbackPoint) {
        const atomIds = target?.atomIds || [];
        if (!atomIds.length || !model) return fallbackPoint?.clone?.() || new THREE.Vector3();

        const center = new THREE.Vector3();
        const v = new THREE.Vector3();
        let n = 0;

        // Use a small sample for speed and keep the focus close to the actual target.
        const sampleCount = Math.min(atomIds.length, 80);
        const stride = Math.max(1, Math.floor(atomIds.length / sampleCount));

        for (let i = 0; i < atomIds.length; i += stride) {
            const atomId = atomIds[i];
            const p = model.getAtomPosition(atomId);
            if (!p) continue;
            v.set(p[0], p[1], p[2]);
            this.proteinStageGroup.localToWorld(v);
            center.add(v);
            n += 1;
            if (n >= sampleCount) break;
        }

        if (!n) return fallbackPoint?.clone?.() || new THREE.Vector3();
        return center.multiplyScalar(1 / n);
    }

    updateBillboard(camera) {
        if (!this.group.visible || !camera) return;
        const p = new THREE.Vector3();
        camera.getWorldPosition(p);
        this.group.lookAt(p);
    }
}
