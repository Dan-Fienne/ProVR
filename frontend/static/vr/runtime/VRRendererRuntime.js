import * as THREE from '../../libs/three.module.js';

export class VRRendererRuntime {
    constructor({container, background = 0xf7fbff, cameraPosition = [0, 0, 3.2]} = {}) {
        if (!container) throw new Error('[VRRendererRuntime] container required');
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(background);

        this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000);
        this.camera.position.set(...cameraPosition);

        this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        this.renderer.xr.enabled = true;

        // Critical for real headsets: use floor-aware stable local space when available.
        // This must be set before the session starts in three.js.
        try { this.renderer.xr.setReferenceSpaceType?.('local-floor'); } catch {}

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
        container.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();
        this.frameHandlers = new Set();
        this.lastXRFrame = null;
        this.lastFrameTime = 0;
        this._setupLights();
        this._setupResize();
    }

    async init() { return this; }

    _setupLights() {
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd7e3ef, 1.0));
        const key = new THREE.DirectionalLight(0xffffff, 0.7);
        key.position.set(3, 4, 5);
        this.scene.add(key);
    }

    _setupResize() {
        const resize = () => {
            const w = this.container.clientWidth || window.innerWidth;
            const h = this.container.clientHeight || window.innerHeight;
            this.camera.aspect = w / Math.max(h, 1);
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        };
        window.addEventListener('resize', resize);
        resize();
    }

    onFrame(fn) {
        this.frameHandlers.add(fn);
        return () => this.frameHandlers.delete(fn);
    }

    start() {
        this.renderer.setAnimationLoop((time, frame) => {
            this.lastXRFrame = frame || null;
            this.lastFrameTime = time || performance.now();
            const dt = this.clock.getDelta();
            for (const fn of this.frameHandlers) fn({time, frame, dt});
            this.renderer.render(this.scene, this.camera);
        });
    }

    async enterVR() {
        if (!navigator.xr) throw new Error('WebXR is not available in this browser.');
        try { this.renderer.xr.setReferenceSpaceType?.('local-floor'); } catch {}
        const session = await navigator.xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
        });
        await this.renderer.xr.setSession(session);
        return session;
    }

    getViewerPose() {
        const camera = this.renderer.xr?.isPresenting
            ? this.renderer.xr.getCamera(this.camera)
            : this.camera;

        camera.updateMatrixWorld(true);

        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        camera.getWorldPosition(position);
        camera.getWorldQuaternion(quaternion);

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();

        return {camera, position, quaternion, forward, up, right, isPresenting: !!this.renderer.xr?.isPresenting};
    }

    dispose() {
        this.renderer.setAnimationLoop(null);
        this.renderer.dispose();
        this.container.removeChild(this.renderer.domElement);
    }
}
