import * as THREE from '../../libs/three.module.js';

export class VRMenuPlacementController {
    constructor({runtime, menuRoot, distance = 0.7, verticalOffset = -0.05} = {}) {
        if (!runtime) throw new Error('[VRMenuPlacementController] runtime required');
        if (!menuRoot) throw new Error('[VRMenuPlacementController] menuRoot required');
        this.runtime = runtime;
        this.menuRoot = menuRoot;
        this.distance = distance;
        this.verticalOffset = verticalOffset;
        this.dragSession = null;
        this.ray = new THREE.Ray();
        this.plane = new THREE.Plane();
        this.tmp = new THREE.Vector3();
    }

    summonInFrontOfViewer() {
        const pose = this.runtime.getViewerPose();
        this.menuRoot.position.copy(pose.position)
            .addScaledVector(pose.forward, this.distance)
            .addScaledVector(pose.up, this.verticalOffset);
        this.menuRoot.lookAt(pose.position);
        this.menuRoot.visible = true;
    }

    bringToFront() {
        this.summonInFrontOfViewer();
    }

    beginDrag(controller, rig) {
        const pose = this.runtime.getViewerPose();
        this.plane.setFromNormalAndCoplanarPoint(pose.forward.clone().negate(), this.menuRoot.position);
        const hit = rig.controllerRay(controller, this.ray).intersectPlane(this.plane, this.tmp);
        if (!hit) return false;
        this.dragSession = {
            controller,
            offset: this.menuRoot.position.clone().sub(this.tmp),
        };
        return true;
    }

    updateDrag(rig) {
        if (!this.dragSession) return;
        const hit = rig.controllerRay(this.dragSession.controller, this.ray).intersectPlane(this.plane, this.tmp);
        if (!hit) return;
        this.menuRoot.position.copy(this.tmp).add(this.dragSession.offset);
        const pose = this.runtime.getViewerPose();
        this.menuRoot.lookAt(pose.position);
    }

    endDrag() {
        this.dragSession = null;
    }
}
