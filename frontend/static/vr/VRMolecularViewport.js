import * as THREE from '../libs/three.module.js';
import {OrbitControls} from '../libs/controls/OrbitControls.js';

function roundedRectShape(w, h, r) {
    const x = -w / 2;
    const y = -h / 2;
    const s = new THREE.Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
}

function makeCanvasTexture({title = '', subtitle = '', active = false, width = 512, height = 192} = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, height);
    if (active) {
        g.addColorStop(0, 'rgba(110,231,183,0.96)');
        g.addColorStop(1, 'rgba(52,211,153,0.86)');
    } else {
        g.addColorStop(0, 'rgba(255,255,255,0.20)');
        g.addColorStop(1, 'rgba(255,255,255,0.08)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = active ? 'rgba(236,253,245,0.76)' : 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, width - 4, height - 4);
    ctx.fillStyle = active ? '#042f2e' : '#f8fafc';
    ctx.font = '700 44px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText(title, 32, 76);
    if (subtitle) {
        ctx.fillStyle = active ? 'rgba(4,47,46,0.78)' : 'rgba(226,232,240,0.78)';
        ctx.font = '500 25px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
        ctx.fillText(subtitle, 32, 124);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

export class VRMolecularViewport {
    constructor({container, background = 0x05070d, cameraPosition = [0, 0, 120], antialias = true} = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) throw new Error('[VRMolecularViewport] container is required');
        this.background = background;
        this.cameraPosition = cameraPosition;
        this.antialias = antialias;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.controllers = [];
        this.controllerGrips = [];
        this.uiRoot = null;
        this.uiButtons = [];
        this._running = false;
        this._initialized = false;
        this._frameCallbacks = new Set();
        this._onResize = () => this.resize();
        this._controllerListeners = {selectstart: new Set(), selectend: new Set(), squeezestart: new Set(), squeezeend: new Set()};
    }

    async init() {
        if (this._initialized) return this;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.background);
        this.scene.fog = new THREE.FogExp2(0x05070d, 0.0016);

        const {width, height} = this._measure();
        this.camera = new THREE.PerspectiveCamera(55, width / height, 0.01, 100000);
        this.camera.position.set(...this.cameraPosition);
        this.scene.add(this.camera);

        this.renderer = new THREE.WebGLRenderer({antialias: this.antialias, alpha: false});
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(width, height);
        this.renderer.xr.enabled = true;
        this.renderer.xr.setReferenceSpaceType?.('local-floor');
        if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;

        this._addEnvironment();
        this._setupControllers();
        this._buildSpatialConsole();
        window.addEventListener('resize', this._onResize);
        this._initialized = true;
        return this;
    }

    _measure() {
        const rect = this.container.getBoundingClientRect();
        return {width: Math.max(1, rect.width || window.innerWidth), height: Math.max(1, rect.height || window.innerHeight)};
    }

    _addEnvironment() {
        const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x111827, 0.78);
        hemi.name = 'vr:hemisphereLight';
        this.scene.add(hemi);
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(3, 5, 6);
        key.castShadow = true;
        key.name = 'vr:keyLight';
        this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x93c5fd, 0.7);
        rim.position.set(-5, 3, -4);
        rim.name = 'vr:rimLight';
        this.scene.add(rim);

        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(90, 96),
            new THREE.MeshStandardMaterial({color: 0x0b1220, metalness: 0.0, roughness: 0.72, transparent: true, opacity: 0.70})
        );
        floor.name = 'vr:softFloor';
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -18;
        floor.receiveShadow = true;
        this.scene.add(floor);

        const grid = new THREE.GridHelper(180, 36, 0x334155, 0x1e293b);
        grid.name = 'vr:floorGrid';
        grid.position.y = -17.99;
        grid.material.transparent = true;
        grid.material.opacity = 0.24;
        this.scene.add(grid);
    }

    _setupControllers() {
        for (let i = 0; i < 2; i += 1) {
            const controller = this.renderer.xr.getController(i);
            controller.name = `vr:controller:${i}`;
            controller.userData.index = i;
            controller.addEventListener('selectstart', (evt) => this._emitController('selectstart', controller, evt));
            controller.addEventListener('selectend', (evt) => this._emitController('selectend', controller, evt));
            controller.addEventListener('squeezestart', (evt) => this._emitController('squeezestart', controller, evt));
            controller.addEventListener('squeezeend', (evt) => this._emitController('squeezeend', controller, evt));
            const ray = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -22)]),
                new THREE.LineBasicMaterial({color: i === 0 ? 0x93c5fd : 0xa7f3d0, transparent: true, opacity: 0.82})
            );
            ray.name = `vr:controllerRay:${i}`;
            controller.add(ray);
            this.scene.add(controller);
            this.controllers.push(controller);

            const grip = this.renderer.xr.getControllerGrip(i);
            const handle = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.085, 0.18, 8, 16),
                new THREE.MeshStandardMaterial({color: i === 0 ? 0x64748b : 0x475569, roughness: 0.4, metalness: 0.08})
            );
            handle.rotation.x = Math.PI / 2;
            grip.add(handle);
            this.scene.add(grip);
            this.controllerGrips.push(grip);
        }
    }

    _emitController(type, controller, rawEvent) {
        for (const fn of this._controllerListeners[type] || []) fn({type, controller, rawEvent, viewport: this});
    }

    onController(type, fn) {
        if (!this._controllerListeners[type]) throw new Error(`[VRMolecularViewport] unknown controller event: ${type}`);
        this._controllerListeners[type].add(fn);
        return () => this._controllerListeners[type].delete(fn);
    }

    onFrame(fn) {
        this._frameCallbacks.add(fn);
        return () => this._frameCallbacks.delete(fn);
    }

    start() {
        if (!this.renderer || !this.scene || !this.camera) throw new Error('[VRMolecularViewport] call await init() first');
        if (this._running) return;
        this._running = true;
        this.renderer.setAnimationLoop((time, frame) => {
            if (!this.renderer.xr.isPresenting && this.controls) this.controls.update();
            for (const fn of this._frameCallbacks) fn({time, frame, viewport: this});
            this.renderer.render(this.scene, this.camera);
        });
    }

    stop() {
        this._running = false;
        this.renderer?.setAnimationLoop(null);
    }

    resize() {
        if (!this.camera || !this.renderer) return;
        const {width, height} = this._measure();
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    async enterVR() {
        if (!navigator.xr) throw new Error('This browser does not expose WebXR. Use Meta Quest Browser, Chrome with WebXR, or a supported headset browser.');
        if (this.renderer.xr.getSession()) return this.renderer.xr.getSession();
        const session = await navigator.xr.requestSession('immersive-vr', {optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']});
        await this.renderer.xr.setSession(session);
        return session;
    }

    getControllerRay(controller, targetRay = new THREE.Ray()) {
        controller.updateMatrixWorld(true);
        const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion())).normalize();
        targetRay.origin.copy(origin);
        targetRay.direction.copy(direction);
        return targetRay;
    }

    raycastObjectsFromController(controller, objects, {recursive = true} = {}) {
        const raycaster = new THREE.Raycaster();
        raycaster.ray.copy(this.getControllerRay(controller));
        return raycaster.intersectObjects(objects.filter(Boolean), recursive);
    }

    _buildSpatialConsole() {
        this.uiRoot = new THREE.Group();
        this.uiRoot.name = 'vr:spatialGlassConsole';
        this.uiRoot.position.set(-18, 16, 10);
        this.uiRoot.rotation.set(0, THREE.MathUtils.degToRad(18), 0);
        this.scene.add(this.uiRoot);

        const back = new THREE.Mesh(
            new THREE.ShapeGeometry(roundedRectShape(11.4, 7.0, 0.42)),
            new THREE.MeshPhysicalMaterial({color: 0x0f172a, transparent: true, opacity: 0.62, roughness: 0.25, metalness: 0.0, transmission: 0.18, side: THREE.DoubleSide})
        );
        back.name = 'vr:spatialConsoleBackplate';
        back.renderOrder = 90;
        this.uiRoot.add(back);

        const title = this._makeTextPlane('ProVR Spatial Console', 'Representation • Editing • Surface', 5.8, 1.0, false);
        title.position.set(0, 2.75, 0.04);
        this.uiRoot.add(title);

        const specs = [
            ['ballstick', 'Ball', 'atoms'], ['cartoon', 'Cartoon', 'ribbon'], ['surface', 'Surface', 'layers'],
            ['scope:atom', 'Atom', 'drag'], ['scope:residue', 'Residue', 'drag'], ['scope:chain', 'Chain', 'drag'],
            ['scope:protein', 'Protein', 'drag all'], ['undo', 'Undo', 'history'], ['redo', 'Redo', 'history'],
            ['center', 'Center', 'view'], ['export', 'Export', 'PDB'], ['surfaceInspect', 'Inspect', 'surface']
        ];
        specs.forEach(([action, titleText, sub], index) => {
            const col = index % 3;
            const row = Math.floor(index / 3);
            const b = this._makeButton(action, titleText, sub);
            b.position.set(-3.7 + col * 3.7, 1.55 - row * 1.28, 0.08);
            this.uiRoot.add(b);
            this.uiButtons.push(b);
        });
    }

    _makeTextPlane(title, subtitle, w, h, active) {
        const tex = makeCanvasTexture({title, subtitle, active});
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false}));
        mesh.renderOrder = 100;
        return mesh;
    }

    _makeButton(action, title, subtitle) {
        const mesh = this._makeTextPlane(title, subtitle, 3.2, 0.88, false);
        mesh.name = `vr:button:${action}`;
        mesh.userData.vrButtonAction = action;
        mesh.userData.refreshTexture = (active = false) => {
            const old = mesh.material.map;
            mesh.material.map = makeCanvasTexture({title, subtitle, active});
            old?.dispose?.();
            mesh.material.needsUpdate = true;
        };
        return mesh;
    }

    setUIButtonActive(action, active) {
        for (const b of this.uiButtons) {
            if (b.userData.vrButtonAction === action) b.userData.refreshTexture?.(active);
        }
    }

    getUIButtonHits(controller) {
        return this.raycastObjectsFromController(controller, this.uiButtons, {recursive: false});
    }

    setSpatialConsoleNearModel(center = new THREE.Vector3(), radius = 20) {
        const r = Math.max(8, Math.min(38, radius));
        this.uiRoot.position.set(center.x - r * 0.86, center.y + r * 0.58, center.z + r * 0.65);
        this.uiRoot.lookAt(new THREE.Vector3(center.x, center.y, center.z));
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
        this.setSpatialConsoleNearModel(center, radius);
        return {box, center, size, radius, distance};
    }

    sceneSummary() {
        const rows = [];
        this.scene.traverse((obj) => rows.push({name: obj.name || '', type: obj.type || obj.constructor?.name || '', visible: obj.visible, children: obj.children?.length || 0, hasTarget: !!obj.userData?.target}));
        return rows;
    }
}
