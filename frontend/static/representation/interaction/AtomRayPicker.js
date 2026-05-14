import * as THREE from '../../libs/three.module.js';

function defaultAcceptAtom(atom, residue, _model) {
    if (!atom || !residue) return false;
    if (residue.isWater) return false;
    return true;
}

function getPointerNDC(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        y: -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1),
    };
}

export class AtomRayPicker {
    constructor({
                    camera,
                    domElement,
                    proteinSystem,
                    getModel = null,
                    pickRadiusWorld = 1.35,
                    acceptAtom = defaultAcceptAtom,
                } = {}) {
        this.camera = camera;
        this.domElement = domElement;
        this.proteinSystem = proteinSystem;
        this.getModel = getModel;
        this.pickRadiusWorld = pickRadiusWorld;
        this.acceptAtom = acceptAtom;

        this.raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._point = new THREE.Vector3();
        this._tmpClosest = new THREE.Vector3();
    }

    setPickRadiusWorld(value) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) this.pickRadiusWorld = n;
    }

    pick(event) {
        const model = this._resolveModel();
        if (!model || !this.camera || !this.domElement) return null;

        const ndc = getPointerNDC(event, this.domElement);
        this._ndc.set(ndc.x, ndc.y);
        this.raycaster.setFromCamera(this._ndc, this.camera);

        const ray = this.raycaster.ray;
        let best = null;
        let bestScore = Infinity;

        for (const atom of model.atoms.values()) {
            const residue = model.residues.get(atom.residueId);
            if (!this.acceptAtom(atom, residue, model)) continue;

            const p = model.getAtomPosition(atom.id);
            if (!p) continue;

            this._point.set(p[0], p[1], p[2]);
            const distanceToRay = ray.distanceToPoint(this._point);
            if (distanceToRay > this.pickRadiusWorld) continue;

            ray.closestPointToPoint(this._point, this._tmpClosest);
            const depth = this._tmpClosest.distanceTo(ray.origin);
            const score = distanceToRay * 1000 + depth * 0.001;

            if (score < bestScore) {
                bestScore = score;
                best = {
                    proteinId: model.id,
                    atomId: atom.id,
                    residueId: atom.residueId,
                    chainId: residue?.chainId || null,
                    atomName: atom.name,
                    element: atom.element,
                    residueName: residue?.name || '',
                    residueLabel: residue?.label || '',
                    position: [p[0], p[1], p[2]],
                    distanceToRay,
                    depth,
                    model,
                };
            }
        }
        return best;
    }

    _resolveModel() {
        if (typeof this.getModel === 'function') return this.getModel();
        const ids = this.proteinSystem?.listProteinIds?.() || [];
        return ids.length ? this.proteinSystem.getProtein(ids[ids.length - 1]) : null;
    }
}
