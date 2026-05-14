import * as THREE from '../../libs/three.module.js';

function domElementFromViewport(viewport) {
    return viewport?.renderer?.domElement || viewport?.domElement || viewport?.container || null;
}

function cameraFromViewport(viewport) {
    return viewport?.camera || viewport?.activeCamera || null;
}

function pointerNdc(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    return new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
}

function raycastPlane(raycaster, plane) {
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, out) ? out : null;
}

function layerIdFromMesh(mesh) {
    return mesh?.userData?.layerId || mesh?.userData?.rangeId || null;
}

/**
 * Surface inspection drag controller.
 *
 * This controller intentionally does not edit ProteinModel coordinates.  It only
 * changes the selected surface layer's rigid transform matrix.  The use case is
 * visual interface fitting: drag a chain/range/full surface layer to inspect
 * gaps, clashes and complementarity.  Geometry is not rebuilt during drag.
 */
export class SurfaceLayerTransformController {
    constructor({viewport, representation, getRepresentation = null, onStatus = null, onChange = null} = {}) {
        this.viewport = viewport;
        this.representation = representation;
        this.getRepresentation = getRepresentation;
        this.onStatus = onStatus || (() => {});
        this.onChange = onChange || (() => {});
        this.enabled = false;
        this.dragging = false;
        this.selectedLayerId = null;
        this.selectedMesh = null;
        this.domElement = null;
        this.raycaster = new THREE.Raycaster();
        this.dragPlane = new THREE.Plane();
        this.lastPoint = new THREE.Vector3();
        this._boundPointerDown = (event) => this._onPointerDown(event);
        this._boundPointerMove = (event) => this._onPointerMove(event);
        this._boundPointerUp = (event) => this._onPointerUp(event);
        this._boundKeyDown = (event) => this._onKeyDown(event);
    }

    currentRepresentation() {
        return this.getRepresentation?.() || this.representation || null;
    }

    enable() {
        if (this.enabled) return;
        this.domElement = domElementFromViewport(this.viewport);
        if (!this.domElement) throw new Error('[SurfaceLayerTransformController] viewport renderer DOM element not found');
        this.domElement.addEventListener('pointerdown', this._boundPointerDown);
        window.addEventListener('pointermove', this._boundPointerMove);
        window.addEventListener('pointerup', this._boundPointerUp);
        window.addEventListener('keydown', this._boundKeyDown);
        this.enabled = true;
        this.onStatus('surface layer inspection drag enabled: drag a pickable surface layer; geometry is not rebuilt');
    }

    disable() {
        if (!this.enabled) return;
        this.domElement?.removeEventListener('pointerdown', this._boundPointerDown);
        window.removeEventListener('pointermove', this._boundPointerMove);
        window.removeEventListener('pointerup', this._boundPointerUp);
        window.removeEventListener('keydown', this._boundKeyDown);
        this.enabled = false;
        this.dragging = false;
        this.selectedMesh = null;
        this.selectedLayerId = null;
        this.onStatus('surface layer inspection drag disabled');
    }

    _pickSurface(event) {
        const rep = this.currentRepresentation();
        const camera = cameraFromViewport(this.viewport);
        const dom = this.domElement;
        if (!rep || !camera || !dom) return null;
        const meshes = typeof rep.getSurfaceLayerMeshes === 'function'
            ? rep.getSurfaceLayerMeshes({pickableOnly: true, visibleOnly: true})
            : [];
        if (!meshes.length) return null;
        this.raycaster.setFromCamera(pointerNdc(event, dom), camera);
        const hits = this.raycaster.intersectObjects(meshes, false);
        return hits[0] || null;
    }

    _onPointerDown(event) {
        if (!this.enabled || event.button !== 0) return;
        const hit = this._pickSurface(event);
        if (!hit?.object) return;
        const layerId = layerIdFromMesh(hit.object);
        if (!layerId) return;

        const camera = cameraFromViewport(this.viewport);
        const normal = new THREE.Vector3();
        camera.getWorldDirection(normal).normalize();
        this.dragPlane.setFromNormalAndCoplanarPoint(normal, hit.point);
        this.lastPoint.copy(hit.point);
        this.dragging = true;
        this.selectedMesh = hit.object;
        this.selectedLayerId = layerId;
        this.domElement?.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        this.onStatus(`dragging surface layer ${layerId}; rigid layer transform only, no surface rebuild`);
    }

    _onPointerMove(event) {
        if (!this.enabled || !this.dragging || !this.selectedLayerId) return;
        const camera = cameraFromViewport(this.viewport);
        const dom = this.domElement;
        const rep = this.currentRepresentation();
        if (!camera || !dom || !rep) return;
        this.raycaster.setFromCamera(pointerNdc(event, dom), camera);
        const point = raycastPlane(this.raycaster, this.dragPlane);
        if (!point) return;
        const delta = new THREE.Vector3().subVectors(point, this.lastPoint);
        if (delta.lengthSq() < 1e-12) return;
        if (typeof rep.translateSurfaceLayer === 'function') {
            rep.translateSurfaceLayer(this.selectedLayerId, delta, {source: 'SurfaceLayerTransformController'});
        } else {
            this.selectedMesh.position.add(delta);
            this.selectedMesh.updateMatrixWorld(true);
        }
        this.lastPoint.copy(point);
        this.onChange({type: 'surface-layer-drag', layerId: this.selectedLayerId, delta: delta.toArray()});
        event.preventDefault();
    }

    _onPointerUp(event) {
        if (!this.dragging) return;
        const layerId = this.selectedLayerId;
        this.dragging = false;
        this.selectedMesh = null;
        this.selectedLayerId = null;
        this.domElement?.releasePointerCapture?.(event.pointerId);
        this.onChange({type: 'surface-layer-drag-end', layerId});
        this.onStatus(`surface layer ${layerId} moved for inspection; geometry was not rebuilt`);
    }

    _onKeyDown(event) {
        const rep = this.currentRepresentation();
        if (!rep || !this.selectedLayerId) return;
        if (event.key === 'Escape') {
            rep.resetSurfaceLayerTransform?.(this.selectedLayerId);
            this.onChange({type: 'surface-layer-reset', layerId: this.selectedLayerId});
            this.onStatus(`surface layer ${this.selectedLayerId} transform reset`);
        }
    }
}
