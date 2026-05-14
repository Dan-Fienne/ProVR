import * as THREE from '../../libs/three.module.js';
import {EventTypes} from '../../core/event/EventTypes.js';
import {TransformAtomSetCommand} from '../../core/command/TransformAtomSetCommand.js';
import {applyPositionMap, clonePositionMap, maxDisplacement, snapshotAtomPositions, translateSnapshot} from './CoordinateSnapshot.js';
import {AtomRayPicker} from './AtomRayPicker.js';
import {EditTargetResolver} from './EditTargetResolver.js';

export class MouseEditController {
    constructor({
                    viewport,
                    proteinSystem,
                    eventBus,
                    commandManager,
                    getModel = null,
                    getMode = () => 'atom',
                    getResidueWindow = () => 5,
                    pickRadiusWorld = 1.35,
                    minCommitDistance = 1e-4,
                    onStatus = null,
                    onCommit = null,
                    onPreview = null,
                } = {}) {
        if (!viewport?.camera || !viewport?.renderer?.domElement) {
            throw new Error('[MouseEditController] viewport with camera and renderer.domElement is required');
        }
        if (!proteinSystem) throw new Error('[MouseEditController] proteinSystem is required');
        if (!commandManager) throw new Error('[MouseEditController] commandManager is required');

        this.viewport = viewport;
        this.proteinSystem = proteinSystem;
        this.eventBus = eventBus;
        this.commandManager = commandManager;
        this.getModel = getModel;
        this.getMode = getMode;
        this.getResidueWindow = getResidueWindow;
        this.minCommitDistance = minCommitDistance;
        this.onStatus = onStatus;
        this.onCommit = onCommit;
        this.onPreview = onPreview;

        this.picker = new AtomRayPicker({
            camera: viewport.camera,
            domElement: viewport.renderer.domElement,
            proteinSystem,
            getModel,
            pickRadiusWorld,
        });
        this.resolver = new EditTargetResolver({getMode, getResidueWindow});

        this.enabled = false;
        this.dragging = false;
        this.session = null;

        this._raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._plane = new THREE.Plane();
        this._planeHit = new THREE.Vector3();

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onPointerCancel = this._onPointerCancel.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
    }

    enable() {
        if (this.enabled) return;
        const el = this.viewport.renderer.domElement;
        el.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        window.addEventListener('pointercancel', this._onPointerCancel);
        window.addEventListener('keydown', this._onKeyDown);
        this.enabled = true;
        this._status('mouse edit enabled');
    }

    disable() {
        if (!this.enabled) return;
        this.cancel();
        const el = this.viewport.renderer.domElement;
        el.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
        window.removeEventListener('pointercancel', this._onPointerCancel);
        window.removeEventListener('keydown', this._onKeyDown);
        this.enabled = false;
        this._status('mouse edit disabled');
    }

    setPickRadiusWorld(value) {
        this.picker.setPickRadiusWorld(value);
    }

    cancel() {
        if (!this.session) return;
        const {model, originalPositions} = this.session;
        applyPositionMap(model, originalPositions);
        this._emitPreview(model, this.session.target, 'cancel');
        this._endSessionState();
        this._status('drag cancelled');
    }

    _onPointerDown(event) {
        if (!this.enabled || event.button !== 0) return;
        const hit = this.picker.pick(event);
        if (!hit) {
            this._status('no atom picked');
            return;
        }
        const target = this.resolver.resolve(hit);
        if (!target?.atomIds?.length) {
            this._status('empty edit target');
            return;
        }

        const model = hit.model;
        const originalPositions = snapshotAtomPositions(model, target.atomIds);
        if (!originalPositions.size) {
            this._status('no coordinates in edit target');
            return;
        }

        const startPoint = new THREE.Vector3(hit.position[0], hit.position[1], hit.position[2]);
        const normal = new THREE.Vector3();
        this.viewport.camera.getWorldDirection(normal);
        this._plane.setFromNormalAndCoplanarPoint(normal, startPoint);
        const startPlanePoint = this._intersectPlane(event) || startPoint.clone();

        this.session = {
            pointerId: event.pointerId,
            model,
            proteinId: model.id,
            hit,
            target,
            originalPositions: clonePositionMap(originalPositions),
            latestPositions: clonePositionMap(originalPositions),
            startPlanePoint,
            currentTranslation: [0, 0, 0],
        };
        this.dragging = true;

        try { this.viewport.renderer.domElement.setPointerCapture?.(event.pointerId); } catch (_err) {}
        if (this.viewport.controls) this.viewport.controls.enabled = false;
        event.preventDefault();
        this._status(`picked ${target.kind}: ${target.label || target.atomIds.length + ' atoms'}`);
    }

    _onPointerMove(event) {
        if (!this.dragging || !this.session) return;
        const currentPoint = this._intersectPlane(event);
        if (!currentPoint) return;

        const s = this.session;
        const t = currentPoint.clone().sub(s.startPlanePoint);
        const translation = [t.x, t.y, t.z];
        const nextPositions = translateSnapshot(s.originalPositions, translation);
        applyPositionMap(s.model, nextPositions);
        s.latestPositions = nextPositions;
        s.currentTranslation = translation;

        this._emitPreview(s.model, s.target, 'preview');
        this.onPreview?.({target: s.target, translation, atomCount: s.target.atomIds.length});
        event.preventDefault();
    }

    _onPointerUp(event) {
        if (!this.dragging || !this.session) return;
        const s = this.session;
        const moved = maxDisplacement(s.originalPositions, s.latestPositions);
        if (moved <= this.minCommitDistance) {
            applyPositionMap(s.model, s.originalPositions);
            this._emitPreview(s.model, s.target, 'cancel');
            this._endSessionState();
            this._status('drag ignored: movement too small');
            return;
        }

        const command = new TransformAtomSetCommand({
            proteinId: s.proteinId,
            atomIds: s.target.atomIds,
            previousPositions: s.originalPositions,
            nextPositions: s.latestPositions,
            phase: 'final',
            source: 'mouse',
            description: `Mouse drag ${s.target.kind}: ${s.target.label || ''}`,
            intent: {input: 'mouse', targetKind: s.target.kind, label: s.target.label || ''},
        });
        const ok = this.commandManager.execute(command);
        this._endSessionState();
        this.onCommit?.({ok, command, target: s.target, moved, translation: s.currentTranslation});
        this._status(`committed ${s.target.kind}: ${s.target.atomIds.length} atoms, max displacement ${moved.toFixed(3)}`);
        event.preventDefault();
    }

    _onPointerCancel(_event) { this.cancel(); }
    _onKeyDown(event) { if (event.key === 'Escape') this.cancel(); }

    _setRayFromEvent(event) {
        const rect = this.viewport.renderer.domElement.getBoundingClientRect();
        this._ndc.set(
            ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
            -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)
        );
        this._raycaster.setFromCamera(this._ndc, this.viewport.camera);
        return this._raycaster.ray;
    }

    _intersectPlane(event) {
        const ray = this._setRayFromEvent(event);
        const hit = ray.intersectPlane(this._plane, this._planeHit);
        return hit ? this._planeHit.clone() : null;
    }

    _emitPreview(model, target, action = 'preview') {
        const revision = model.bumpRevision();
        const payload = {
            commandType: 'mousePreviewTransformAtomSet',
            action,
            proteinId: model.id,
            atomIds: [...target.atomIds],
            residueIds: [...(target.residueIds || [])],
            chainIds: [...(target.chainIds || [])],
            phase: action === 'preview' ? 'preview' : 'final',
            source: 'mouse-preview',
            revision,
        };
        this.eventBus?.emit?.(EventTypes.ATOM_SET_TRANSFORMED, {type: EventTypes.ATOM_SET_TRANSFORMED, ...payload});
        this.eventBus?.emit?.(EventTypes.ATOM_POSITION_CHANGED, {type: EventTypes.ATOM_POSITION_CHANGED, ...payload});
    }

    _endSessionState() {
        try {
            if (this.session?.pointerId != null) this.viewport.renderer.domElement.releasePointerCapture?.(this.session.pointerId);
        } catch (_err) {}
        if (this.viewport.controls) this.viewport.controls.enabled = true;
        this.dragging = false;
        this.session = null;
    }

    _status(message) { this.onStatus?.(message); }
}
