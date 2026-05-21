import * as THREE from '../../libs/three.module.js';
import {XRControllerModelFactory as FallbackControllerModelFactory} from './XRControllerModelFactory.js';
import {OculusHandModel as FallbackHandModel} from './OculusHandModel.js';
import {createLiquidRayLine, setRayVisualState, VRRayVisualState} from '../ui/VRLiquidRay.js';

const CONTROLLER_FACTORY_CANDIDATES = [
    '/static/libs/webxr/XRControllerModelFactory.js',
];

const HAND_FACTORY_CANDIDATES = [
    '/static/libs/webxr/XRHandModelFactory.js',
];

const CONTROLLER_PROFILE_PATH_CANDIDATES = [
    '/static/libs/',
];

const HAND_PROFILE_PATH_CANDIDATES = [
    '/static/libs/generic-hand/',
];

async function importFirst(urls, exportName) {
    const errors = [];
    for (const url of urls) {
        try {
            const mod = await import(url);
            if (mod?.[exportName]) return {value: mod[exportName], url};
            errors.push(`${url}: missing ${exportName}`);
        } catch (err) {
            errors.push(`${url}: ${err.message}`);
        }
    }
    return {value: null, url: null, errors};
}

async function urlExists(url) {
    try {
        const res = await fetch(url, {method: 'HEAD'});
        return res.ok;
    } catch {
        return false;
    }
}

async function firstExistingProfilePath(paths, probe = 'profilesList.json') {
    for (const path of paths) {
        const url = `${path.replace(/\/?$/, '/')}${probe}`;
        if (await urlExists(url)) return path.replace(/\/?$/, '/');
    }
    // Return first candidate anyway; XRControllerModelFactory can still fallback internally.
    return paths[0];
}

export class VRControllerRig {
    constructor({runtime, preferOfficialModels = true} = {}) {
        if (!runtime) throw new Error('[VRControllerRig] runtime required');
        this.runtime = runtime;
        this.preferOfficialModels = preferOfficialModels;
        this.controllers = [];
        this.grips = [];
        this.hands = [];
        this.usingOfficialControllerModels = false;
        this.usingOfficialHandModels = false;
        this.controllerFactoryUrl = null;
        this.handFactoryUrl = null;
        this.controllerProfilePath = null;
        this.handProfilePath = null;
        this._controllerFactory = null;
        this._handFactory = null;
    }

    async init() {
        await this._loadFactories();

        for (let i = 0; i < 2; i += 1) {
            const controller = this.runtime.renderer.xr.getController(i);
            controller.name = `controller-${i}`;
            controller.userData.index = i;
            controller.userData.inputSource = null;
            controller.userData.gamepad = null;
            controller.userData.profiles = [];
            controller.add(createLiquidRayLine());
            this.runtime.scene.add(controller);
            this.controllers.push(controller);

            const grip = this.runtime.renderer.xr.getControllerGrip(i);
            grip.name = `controller-grip-${i}`;
            try {
                const model = this._controllerFactory.createControllerModel(grip);
                grip.add(model);
            } catch (err) {
                console.warn('[ProVR] controller model creation failed; using empty grip.', err);
            }
            this.runtime.scene.add(grip);
            this.grips.push(grip);

            const hand = this.runtime.renderer.xr.getHand(i);
            hand.name = `hand-${i}`;
            const handModel = this._createHandModel(hand);
            if (handModel) hand.add(handModel);
            this.runtime.scene.add(hand);
            this.hands.push(hand);

            controller.addEventListener('connected', (event) => {
                controller.userData.inputSource = event.data;
                controller.userData.gamepad = event.data?.gamepad || null;
                controller.userData.profiles = event.data?.profiles || [];
            });

            controller.addEventListener('disconnected', () => {
                controller.userData.inputSource = null;
                controller.userData.gamepad = null;
                controller.userData.profiles = [];
            });
        }

        console.info('[ProVR] VRControllerRig diagnostics', this.diagnostics());
        return this;
    }

    on(eventName, handler) {
        for (const c of this.controllers) c.addEventListener(eventName, handler);
        return () => {
            for (const c of this.controllers) c.removeEventListener(eventName, handler);
        };
    }

    setRayState(controller, state) {
        if (!controller) return;
        setRayVisualState(controller, state);
    }

    setAllRayStates(state) {
        for (const c of this.controllers) this.setRayState(c, state);
    }

    controllerRay(controller, outRay = new THREE.Ray()) {
        controller.updateMatrixWorld(true);
        const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
        const direction = new THREE.Vector3(0, 0, -1).transformDirection(controller.matrixWorld).normalize();
        outRay.set(origin, direction);
        return outRay;
    }

    controllerPoint(controller, out = new THREE.Vector3()) {
        controller.updateMatrixWorld(true);
        return out.setFromMatrixPosition(controller.matrixWorld);
    }

    pulse(controller, {intensity = 0.22, duration = 28} = {}) {
        const gamepad = controller?.userData?.inputSource?.gamepad || controller?.userData?.gamepad;
        const actuator = gamepad?.hapticActuators?.[0];
        try {
            actuator?.pulse?.(intensity, duration);
        } catch {}
    }

    diagnostics() {
        return {
            usingOfficialControllerModels: this.usingOfficialControllerModels,
            usingOfficialHandModels: this.usingOfficialHandModels,
            controllerFactoryUrl: this.controllerFactoryUrl,
            handFactoryUrl: this.handFactoryUrl,
            controllerProfilePath: this.controllerProfilePath,
            handProfilePath: this.handProfilePath,
            controllers: this.controllers.map((c) => ({
                index: c.userData.index,
                profiles: c.userData.profiles || [],
                hasInputSource: !!c.userData.inputSource,
            })),
        };
    }

    async _loadFactories() {
        if (this.preferOfficialModels) {
            const controller = await importFirst(CONTROLLER_FACTORY_CANDIDATES, 'XRControllerModelFactory');
            if (controller.value) {
                this._controllerFactory = new controller.value();
                this.controllerFactoryUrl = controller.url;
                this.controllerProfilePath = await firstExistingProfilePath(CONTROLLER_PROFILE_PATH_CANDIDATES, 'profilesList.json');
                this._controllerFactory.setPath?.(this.controllerProfilePath);
                this.usingOfficialControllerModels = true;
            } else {
                console.warn('[ProVR] Official XRControllerModelFactory unavailable; using fallback.', controller.errors);
            }

            const hand = await importFirst(HAND_FACTORY_CANDIDATES, 'XRHandModelFactory');
            if (hand.value) {
                this._handFactory = new hand.value();
                this.handFactoryUrl = hand.url;
                this.handProfilePath = await firstExistingProfilePath(HAND_PROFILE_PATH_CANDIDATES, 'left.glb');
                this._handFactory.setPath?.(this.handProfilePath);
                this.usingOfficialHandModels = true;
            } else {
                console.warn('[ProVR] Official XRHandModelFactory unavailable; using fallback.', hand.errors);
            }
        }

        if (!this._controllerFactory) this._controllerFactory = new FallbackControllerModelFactory();
        if (!this.controllerProfilePath) this.controllerProfilePath = CONTROLLER_PROFILE_PATH_CANDIDATES[0];
    }

    _createHandModel(hand) {
        if (this._handFactory) {
            try {
                // Spheres are stable and do not require full hand mesh assets.
                return this._handFactory.createHandModel(hand, 'spheres');
            } catch (err) {
                console.warn('[ProVR] Official hand model failed; using fallback.', err);
            }
        }
        return new FallbackHandModel(hand);
    }
}
