import * as THREE from '../../libs/three.module.js';
import {OrbitControls} from '../../libs/controls/OrbitControls.js';

/**
 * VRRendererRuntime owns only rendering/runtime concerns:
 * scene, camera, renderer, WebXR session, desktop orbit controls, frame loop and centering.
 *
 * It does not know ProteinSystem, CommandManager, RepresentationManager or UI actions.
 */
export class VRRendererRuntime {
    constructor({
                    container,
                    background = 0x030712,
                    cameraPosition = [0, 0, 120],
                    antialias = true,
                } = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) throw new Error('[VRRendererRuntime] container is required');

        this.background = background;
        this.cameraPosition = cameraPosition;
        this.antialias = antialias;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.stageRoot = null;

        this._frameHandlers = new Set();
        this._running = false;
        this._initialized = false;
        this._resizeHandler = () => this.resize();
    }

    async init() {
        if (this._initialized) return this;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.background);
        this.scene.fog = new THREE.FogExp2(0x030712, 0.0015);

        const {width, height} = this._measure();
        this.camera = new THREE.PerspectiveCamera(54, width / height, 0.01, 100000);
        this.camera.position.set(...this.cameraPosition);
        this.scene.add(this.camera);

        this.renderer = new THREE.WebGLRenderer({antialias: this.antialias, alpha: false});
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(width, height);
        this.renderer.xr.enabled = true;
        this.renderer.xr.setReferenceSpaceType?.('local-floor');

        if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) {
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        }

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.container.innerHTML = '';
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;

        this._buildStage();
        window.addEventListener('resize', this._resizeHandler);
        this._initialized = true;
        return this;
    }

    start() {
        if (!this.renderer || !this.scene || !this.camera) throw new Error('[VRRendererRuntime] call init() first');
        if (this._running) return;
        this._running = true;
        this.renderer.setAnimationLoop((time, frame) => {
            if (!this.renderer.xr.isPresenting && this.controls) this.controls.update();
            for (const fn of this._frameHandlers) fn({time, frame, runtime: this});
            this.renderer.render(this.scene, this.camera);
        });
    }

    stop() {
        this._running = false;
        this.renderer?.setAnimationLoop(null);
    }

    onFrame(fn) {
        if (typeof fn !== 'function') throw new Error('[VRRendererRuntime] frame handler must be a function');
        this._frameHandlers.add(fn);
        return () => this._frameHandlers.delete(fn);
    }

    async enterVR() {
        if (!navigator.xr) {
            throw new Error('This browser does not expose WebXR. Use a WebXR-capable headset browser.');
        }

        if (this.renderer.xr.getSession()) return this.renderer.xr.getSession();

        const supported = await navigator.xr.isSessionSupported?.('immersive-vr');
        if (supported === false) throw new Error('immersive-vr is not supported in this browser/device.');

        const session = await navigator.xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
        });

        try {
            await this.renderer.xr.setSession(session);
            return session;
        } catch (err) {
            try { await session.end(); } catch (_) {}
            throw err;
        }
    }

    resize() {
        if (!this.camera || !this.renderer) return;
        const {width, height} = this._measure();
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    centerOnModel(model, {padding = 1.45} = {}) {
        if (!model || model.atoms.size === 0) return null;

        const box = new THREE.Box3();
        const v = new THREE.Vector3();

        for (const atom of model.atoms.values()) {
            const p = model.getAtomPosition(atom.id);
            if (!p) continue;
            v.set(p[0], p[1], p[2]);
            box.expandByPoint(v);
        }

        if (box.isEmpty()) return null;

        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        const radius = Math.max(size.x, size.y, size.z, 1) * padding;
        const fov = THREE.MathUtils.degToRad(this.camera.fov);
        const distance = radius / (2 * Math.tan(fov / 2));

        this.camera.position.set(center.x, center.y, center.z + Math.max(distance, 10));
        this.camera.near = Math.max(0.01, distance / 1000);
        this.camera.far = Math.max(1000, distance * 24);
        this.camera.updateProjectionMatrix();

        if (this.controls) {
            this.controls.target.copy(center);
            this.controls.update();
        }

        return {box, center, size, radius, distance};
    }

    dispose() {
        this.stop();
        window.removeEventListener('resize', this._resizeHandler);
        this.controls?.dispose?.();
        this.renderer?.dispose?.();
        this.container.innerHTML = '';
        this._frameHandlers.clear();
    }

    _measure() {
        const rect = this.container.getBoundingClientRect();
        return {
            width: Math.max(1, rect.width || window.innerWidth),
            height: Math.max(1, rect.height || window.innerHeight),
        };
    }

    _buildStage() {
        this.stageRoot = new THREE.Group();
        this.stageRoot.name = 'vr:stageRoot';
        this.scene.add(this.stageRoot);

        const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x111827, 0.82);
        hemi.name = 'vr:hemisphereLight';
        this.stageRoot.add(hemi);

        const key = new THREE.DirectionalLight(0xffffff, 1.45);
        key.position.set(4, 6, 6);
        key.castShadow = true;
        key.name = 'vr:keyLight';
        this.stageRoot.add(key);

        const rim = new THREE.DirectionalLight(0x93c5fd, 0.72);
        rim.position.set(-5, 3, -4);
        rim.name = 'vr:rimLight';
        this.stageRoot.add(rim);

        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(90, 128),
            new THREE.MeshStandardMaterial({
                color: 0x07111f,
                metalness: 0.0,
                roughness: 0.74,
                transparent: true,
                opacity: 0.68,
            })
        );
        floor.name = 'vr:softFloor';
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -18;
        floor.receiveShadow = true;
        this.stageRoot.add(floor);

        const grid = new THREE.GridHelper(180, 36, 0x334155, 0x1e293b);
        grid.name = 'vr:floorGrid';
        grid.position.y = -17.985;
        grid.material.transparent = true;
        grid.material.opacity = 0.20;
        this.stageRoot.add(grid);
    }
}
