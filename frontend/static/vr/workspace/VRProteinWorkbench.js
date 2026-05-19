import * as THREE from '../../libs/three.module.js';

function computeModelBounds(model) {
    if (!model || !model.atoms?.size) return null;

    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const v = new THREE.Vector3();
    let count = 0;

    for (const atom of model.atoms.values()) {
        const p = model.getAtomPosition(atom.id);
        if (!p) continue;
        v.set(p[0], p[1], p[2]);
        min.min(v);
        max.max(v);
        count += 1;
    }

    if (!count) return null;

    const box = new THREE.Box3(min, max);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    return {
        box,
        center,
        size,
        maxDim: Math.max(size.x, size.y, size.z, 1),
        count,
    };
}

/**
 * Owns the protein stage transform in VR.
 *
 * RepresentationManager receives `stageGroup` as scene so all representation roots
 * are added under a single movable/scalable protein workbench group.
 */
export class VRProteinWorkbench {
    constructor({runtime, stageGroup} = {}) {
        if (!runtime) throw new Error('[VRProteinWorkbench] runtime is required');
        if (!stageGroup) throw new Error('[VRProteinWorkbench] stageGroup is required');

        this.runtime = runtime;
        this.stageGroup = stageGroup;
        this.targetVisualSize = 1.10;
        this.distance = 1.85;
        this.yOffset = -0.10;
        this.lastPlacement = null;

        this._halo = null;
        this._ensureHalo();
    }

    placeModel(model) {
        const bounds = computeModelBounds(model);
        if (!bounds) return null;

        const scale = this.targetVisualSize / bounds.maxDim;
        this.stageGroup.scale.setScalar(scale);

        const target = this._targetInFrontOfViewer();
        this.stageGroup.position.copy(target).sub(bounds.center.clone().multiplyScalar(scale));

        this._updateHalo(bounds, scale);
        this.lastPlacement = {bounds, scale, target};
        return this.lastPlacement;
    }

    bringProteinHere(model) {
        return this.placeModel(model);
    }

    reset(model) {
        this.stageGroup.rotation.set(0, 0, 0);
        return this.placeModel(model);
    }

    rotate(deltaYaw = 0, deltaPitch = 0) {
        this.stageGroup.rotation.y += deltaYaw;
        this.stageGroup.rotation.x += deltaPitch;
    }

    summary() {
        return {
            targetVisualSize: this.targetVisualSize,
            distance: this.distance,
            yOffset: this.yOffset,
            placed: !!this.lastPlacement,
            scale: this.lastPlacement?.scale || null,
        };
    }

    _targetInFrontOfViewer() {
        const camera = this.runtime.renderer?.xr?.isPresenting
            ? this.runtime.renderer.xr.getCamera(this.runtime.camera)
            : this.runtime.camera;

        const pos = new THREE.Vector3();
        const dir = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion();

        camera.getWorldPosition(pos);
        camera.getWorldDirection(dir);
        camera.getWorldQuaternion(quat);
        up.applyQuaternion(quat).normalize();

        return pos
            .add(dir.multiplyScalar(this.distance))
            .add(up.multiplyScalar(this.yOffset));
    }

    _ensureHalo() {
        if (this._halo) return;
        this._halo = new THREE.Mesh(
            new THREE.RingGeometry(0.55, 0.62, 96),
            new THREE.MeshBasicMaterial({
                color: 0x7dd3fc,
                transparent: true,
                opacity: 0.20,
                side: THREE.DoubleSide,
                depthWrite: false,
            })
        );
        this._halo.name = 'vr:proteinWorkbenchHalo';
        this._halo.rotation.x = -Math.PI / 2;
        this._halo.position.y = -0.56;
        this.stageGroup.add(this._halo);
    }

    _updateHalo(bounds, scale) {
        this._ensureHalo();
        const radius = Math.max(bounds.size.x, bounds.size.z, 1) * scale * 0.55;
        this._halo.scale.setScalar(Math.max(0.8, radius));
        this._halo.visible = true;
    }
}
