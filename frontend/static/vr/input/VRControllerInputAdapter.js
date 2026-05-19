import * as THREE from '../../libs/three.module.js';

export const VRInputEvents = Object.freeze({
    SELECT_START: 'selectstart',
    SELECT_END: 'selectend',
    SQUEEZE_START: 'squeezestart',
    SQUEEZE_END: 'squeezeend',
    FRAME: 'frame',
});

/**
 * VRControllerInputAdapter converts WebXR controllers into clean input events.
 * It does not know molecular targets, commands, representations or UI business actions.
 */
export class VRControllerInputAdapter {
    constructor({runtime} = {}) {
        if (!runtime) throw new Error('[VRControllerInputAdapter] runtime is required');
        this.runtime = runtime;
        this.controllers = [];
        this.controllerGrips = [];
        this._listeners = new Map();
        this._raycaster = new THREE.Raycaster();
        this._raycaster.params.Line = {threshold: 0.45};
        this._frameOff = null;
    }

    init() {
        const {renderer, scene} = this.runtime;
        if (!renderer || !scene) throw new Error('[VRControllerInputAdapter] runtime is not initialized');

        for (let i = 0; i < 2; i += 1) {
            const controller = renderer.xr.getController(i);
            controller.name = `vr:controller:${i}`;
            controller.userData.index = i;

            controller.addEventListener('selectstart', (rawEvent) => this._emit(VRInputEvents.SELECT_START, {controller, rawEvent}));
            controller.addEventListener('selectend', (rawEvent) => this._emit(VRInputEvents.SELECT_END, {controller, rawEvent}));
            controller.addEventListener('squeezestart', (rawEvent) => this._emit(VRInputEvents.SQUEEZE_START, {controller, rawEvent}));
            controller.addEventListener('squeezeend', (rawEvent) => this._emit(VRInputEvents.SQUEEZE_END, {controller, rawEvent}));

            const ray = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, -22),
                ]),
                new THREE.LineBasicMaterial({
                    color: i === 0 ? 0x93c5fd : 0xa7f3d0,
                    transparent: true,
                    opacity: 0.82,
                })
            );
            ray.name = `vr:controllerRay:${i}`;
            controller.add(ray);
            scene.add(controller);
            this.controllers.push(controller);

            const grip = renderer.xr.getControllerGrip(i);
            grip.name = `vr:controllerGrip:${i}`;
            const handle = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.085, 0.18, 8, 16),
                new THREE.MeshStandardMaterial({
                    color: i === 0 ? 0x64748b : 0x475569,
                    roughness: 0.42,
                    metalness: 0.08,
                })
            );
            handle.rotation.x = Math.PI / 2;
            grip.add(handle);
            scene.add(grip);
            this.controllerGrips.push(grip);
        }

        this._frameOff = this.runtime.onFrame((frame) => this._emit(VRInputEvents.FRAME, frame));
        return this;
    }

    on(type, fn) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(fn);
        return () => this._listeners.get(type)?.delete(fn);
    }

    getRay(controller, targetRay = new THREE.Ray()) {
        controller.updateMatrixWorld(true);
        const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
        const direction = new THREE.Vector3(0, 0, -1)
            .applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()))
            .normalize();
        targetRay.origin.copy(origin);
        targetRay.direction.copy(direction);
        return targetRay;
    }

    controllerPoint(controller, out = new THREE.Vector3()) {
        controller.updateMatrixWorld(true);
        return out.setFromMatrixPosition(controller.matrixWorld);
    }

    raycast(controller, objects, {recursive = false} = {}) {
        this._raycaster.ray.copy(this.getRay(controller));
        return this._raycaster.intersectObjects(objects.filter(Boolean), recursive);
    }

    dispose() {
        this._frameOff?.();
        this._listeners.clear();
    }

    _emit(type, payload) {
        for (const fn of this._listeners.get(type) || []) fn({type, input: this, ...payload});
    }
}
