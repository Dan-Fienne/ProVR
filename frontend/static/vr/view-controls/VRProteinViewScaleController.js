import * as THREE from '../../libs/three.module.js';

export class VRProteinViewScaleController {
    constructor({runtime, rig, proteinStageGroup, workbench, state, onStatus = () => {}} = {}) {
        this.runtime = runtime;
        this.rig = rig;
        this.proteinStageGroup = proteinStageGroup;
        this.workbench = workbench;
        this.state = state;
        this.onStatus = onStatus;
        this.squeezing = new Set();
        this.twoHandSession = null;
        this.viewGrab = null;
    }

    bigger() {
        const s = this.workbench.zoomProteinView(1.12);
        this.onStatus(`Protein view scale ${s.toFixed(2)}×`);
    }

    smaller() {
        const s = this.workbench.zoomProteinView(1 / 1.12);
        this.onStatus(`Protein view scale ${s.toFixed(2)}×`);
    }

    markSqueezing(controller, active) {
        active ? this.squeezing.add(controller) : this.squeezing.delete(controller);
        if (!active) this.twoHandSession = null;
    }

    update() {
        if (this.state.currentTool !== 'view_two_hand_scale') return;
        const controllers = [...this.squeezing];
        if (controllers.length < 2) {
            this.twoHandSession = null;
            return;
        }
        const a = this.rig.controllerPoint(controllers[0], new THREE.Vector3());
        const b = this.rig.controllerPoint(controllers[1], new THREE.Vector3());
        const dist = a.distanceTo(b);
        if (!this.twoHandSession) {
            this.twoHandSession = {distance: Math.max(dist, 1e-6), scale: this.workbench.viewScale};
            return;
        }
        const ratio = dist / this.twoHandSession.distance;
        this.workbench.setProteinViewScale(this.twoHandSession.scale * ratio);
    }

    beginViewGrab({controller}) {
        this.viewGrab = {
            controller,
            startController: this.rig.controllerPoint(controller, new THREE.Vector3()).clone(),
            startPosition: this.proteinStageGroup.position.clone(),
        };
    }

    updateViewGrab() {
        if (!this.viewGrab) return;
        const p = this.rig.controllerPoint(this.viewGrab.controller, new THREE.Vector3());
        this.proteinStageGroup.position.copy(this.viewGrab.startPosition).add(p.sub(this.viewGrab.startController));
    }

    endViewGrab() {
        this.viewGrab = null;
    }

    cancel() {
        this.viewGrab = null;
        this.twoHandSession = null;
    }
}
