import * as THREE from '../libs/three.module.js';
import {OrbitControls} from '../libs/controls/OrbitControls.js';

export class MolecularViewport {
    constructor({
                    container,
                    background = 0xffffff,
                    enableControls = true,
                    cameraPosition = [0, 0, 120],
                    antialias = true,
                } = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) throw new Error('[MolecularViewport] container is required');

        this.background = background;
        this.enableControls = enableControls;
        this.OrbitControls = OrbitControls;
        this.cameraPosition = cameraPosition;
        this.antialias = antialias;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this._running = false;
        this._initialized = false;
        this._onResize = () => this.resize();
    }

    async init() {
        if (this._initialized) return this;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.background);

        const {width, height} = this._measure();
        this.camera = new THREE.PerspectiveCamera(55, width / height, 0.01, 100000);
        this.camera.position.set(this.cameraPosition[0], this.cameraPosition[1], this.cameraPosition[2]);

        this.renderer = new THREE.WebGLRenderer({antialias: this.antialias});
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(width, height);
        if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) {
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        }

        this.container.appendChild(this.renderer.domElement);

        if (this.enableControls && this.OrbitControls) {
            this.controls = new this.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.08;
        }

        this._addDefaultLights();
        window.addEventListener('resize', this._onResize);

        this._initialized = true;
        return this;
    }

    _measure() {
        const rect = this.container.getBoundingClientRect();
        return {
            width: Math.max(1, rect.width || window.innerWidth),
            height: Math.max(1, rect.height || window.innerHeight),
        };
    }

    _addDefaultLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        ambient.name = 'viewport:ambientLight';
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 1.0);
        directional.name = 'viewport:directionalLight';
        directional.position.set(1, 1, 1).normalize();
        this.scene.add(directional);
    }

    start() {
        if (!this.renderer || !this.scene || !this.camera) {
            throw new Error('[MolecularViewport] call await viewport.init() before start()');
        }
        if (this._running) return;
        this._running = true;

        this.renderer.setAnimationLoop(() => {
            if (this.controls) this.controls.update();
            this.renderer.render(this.scene, this.camera);
        });
    }

    stop() {
        this._running = false;
        if (this.renderer) this.renderer.setAnimationLoop(null);
    }

    resize() {
        if (!this.camera || !this.renderer) return;

        const {width, height} = this._measure();
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    centerOnModel(model, {padding = 1.35} = {}) {
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
        this.camera.far = Math.max(1000, distance * 20);
        this.camera.updateProjectionMatrix();

        if (this.controls) {
            this.controls.target.copy(center);
            this.controls.update();
        }

        return {box, center, size, radius, distance};
    }

    sceneSummary() {
        const rows = [];
        this.scene.traverse((obj) => {
            rows.push({
                name: obj.name || '',
                type: obj.type || obj.constructor?.name || '',
                visible: obj.visible,
                children: obj.children?.length || 0,
                hasTarget: !!obj.userData?.target,
            });
        });
        return rows;
    }

    dispose() {
        this.stop();
        window.removeEventListener('resize', this._onResize);
        if (this.controls) {
            this.controls.dispose();
            this.controls = null;
        }
        if (this.scene) {
            this.scene.traverse((obj) => {
                if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
                const material = obj.material;
                if (Array.isArray(material)) material.forEach((m) => m?.dispose?.());
                else if (material && typeof material.dispose === 'function') material.dispose();
            });
        }
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement?.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this._initialized = false;
    }
}
