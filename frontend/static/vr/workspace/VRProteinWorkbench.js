import * as THREE from '../../libs/three.module.js';

export const ProteinScalePreset = Object.freeze({overview: 1.0, residue: 1.75, atom: 2.65, pocket: 2.15});

function bounds(model) {
    if (!model?.atoms?.size) return null;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const v = new THREE.Vector3();
    for (const atom of model.atoms.values()) {
        const p = model.getAtomPosition(atom.id);
        if (!p) continue;
        v.set(p[0], p[1], p[2]);
        min.min(v); max.max(v);
    }
    const box = new THREE.Box3(min, max);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center); box.getSize(size);
    return {box, center, size, maxDim: Math.max(size.x, size.y, size.z, 1)};
}

export class VRProteinWorkbench {
    constructor({runtime, stageGroup, targetVisualSize = 1.08} = {}) {
        this.runtime = runtime;
        this.stageGroup = stageGroup;
        this.targetVisualSize = targetVisualSize;
        this.baseScale = 1;
        this.viewScale = 1;
        this.model = null;
        this.bounds = null;
        this._placementOff = null;
    }

    placeModelInFront(model, {distance = 1.45, y = -0.08, resetRotation = true, minDistance = 0.85} = {}) {
        const b = bounds(model);
        if (!b) return null;
        this.model = model;
        this.bounds = b;

        if (resetRotation) this.stageGroup.rotation.set(0, 0, 0);
        this.baseScale = this.targetVisualSize / b.maxDim;
        this._applyScale();

        const pose = this.runtime.getViewerPose();
        const d = Math.max(minDistance, Number(distance) || 1.45);
        const target = pose.position.clone()
            .addScaledVector(pose.forward, d)
            .addScaledVector(pose.up, y);

        this.stageGroup.position.copy(target).sub(b.center.clone().multiplyScalar(this.stageGroup.scale.x));
        return target;
    }

    /**
     * Real headset fix:
     * In Pico/Quest/etc, viewer pose may be stale before the first XR frames settle.
     * We therefore place repeatedly inside the XR animation loop for a short window.
     */
    placeWhenReady(model, {distance = 1.45, y = -0.08, resetRotation = true, frames = 36, intervalMs = 0} = {}) {
        this._placementOff?.();
        this._placementOff = null;

        let count = 0;
        const place = () => {
            this.placeModelInFront(model, {distance, y, resetRotation: count === 0 ? resetRotation : false});
            count += 1;
            if (count >= frames) {
                this._placementOff?.();
                this._placementOff = null;
            }
        };

        // Browser preview path.
        requestAnimationFrame(place);
        setTimeout(place, 80);
        setTimeout(place, 180);

        // XR headset path.
        this._placementOff = this.runtime.onFrame?.(() => place()) || null;
    }

    bringProteinHere() {
        if (this.model) this.placeWhenReady(this.model, {resetRotation: false, frames: 18});
    }

    fitProtein() {
        this.viewScale = 1;
        this._applyScale();
        this.bringProteinHere();
        return this.viewScale;
    }

    setProteinViewScale(scale) {
        this.viewScale = THREE.MathUtils.clamp(Number(scale) || 1, 0.35, 5.0);
        this._applyScale();
        return this.viewScale;
    }

    zoomProteinView(factor) { return this.setProteinViewScale(this.viewScale * factor); }

    _applyScale() { this.stageGroup.scale.setScalar(this.baseScale * this.viewScale); }

    summary() {
        return {
            baseScale: this.baseScale,
            viewScale: this.viewScale,
            finalScale: this.stageGroup.scale.x,
            note: 'visual scale only; placement follows current XR viewer pose after loading',
        };
    }
}
