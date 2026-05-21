import * as THREE from '../../libs/three.module.js';
import {EventTypes} from '../../core/event/EventTypes.js';
import {resolveTargetAtomIds} from '../targeting/VRTargetDescriptor.js';
import {intersectControllerPlane, snapshotPositions, translatePositions, worldToProteinLocal, maxDisplacement} from './VRDragMath.js';

export class VRRigidTransformEngine {
    constructor({runtime, rig, context, proteinStageGroup, previewLayer, committer, surfaceController, state, onStatus = () => {}} = {}) {
        this.runtime = runtime;
        this.rig = rig;
        this.context = context;
        this.proteinStageGroup = proteinStageGroup;
        this.previewLayer = previewLayer;
        this.committer = committer;
        this.surfaceController = surfaceController;
        this.state = state;
        this.onStatus = onStatus;
        this.session = null;
        this.plane = new THREE.Plane();
        this.tmp = new THREE.Vector3();
    }

    get active() { return !!this.session; }

    begin({controller, pick, tool, selectedTarget = null} = {}) {
        const model = pick.model || this.context.activeModel;
        const atomIds = resolveTargetAtomIds({target: pick.target, model, tool, selectedTarget});
        if (!atomIds.length) return this.onStatus('Rigid transform failed: no atoms resolved.');

        const pose = this.runtime.getViewerPose();
        this.plane.setFromNormalAndCoplanarPoint(pose.forward.clone().negate(), pick.point);
        const startWorld = intersectControllerPlane({controller, rig: this.rig, plane: this.plane});
        if (!startWorld) return this.onStatus('Rigid transform failed: controller ray did not hit drag plane.');

        const startLocal = worldToProteinLocal(this.proteinStageGroup, startWorld);
        const previousPositions = snapshotPositions(model, atomIds);
        if (!previousPositions.size) return this.onStatus('Rigid transform failed: empty coordinate snapshot.');

        this.previewLayer?.clear?.();
        this.session = {
            controller,
            model,
            proteinId: model.id,
            atomIds,
            previousPositions,
            startLocal,
            nextPositions: new Map(previousPositions),
            tool,
            target: pick.target,
            totalDelta: new THREE.Vector3(),
            surfaceDeltaApplied: new THREE.Vector3(),
        };

        this.surfaceController?.beginRigidPreview?.({target: pick.target, atomIds, tool, model});
        this.onStatus(`Rigid transform started: ${atomIds.length} atoms. Hold trigger and move controller.`);
    }

    update() {
        if (!this.session) return;
        const hit = intersectControllerPlane({controller: this.session.controller, rig: this.rig, plane: this.plane, out: this.tmp});
        if (!hit) return;

        const local = worldToProteinLocal(this.proteinStageGroup, hit);
        const totalDelta = local.sub(this.session.startLocal);
        const next = translatePositions(this.session.previousPositions, totalDelta);
        this.session.nextPositions = next;
        this.session.totalDelta.copy(totalDelta);

        this._applyPositions(this.session.model, next);

        // SurfaceRepresentation applies event transforms incrementally, so send only
        // the delta since the last frame, while coordinates use total delta from start.
        const incrementalSurfaceDelta = totalDelta.clone().sub(this.session.surfaceDeltaApplied);
        if (incrementalSurfaceDelta.lengthSq() > 1e-12) {
            this._emitTransformEvent(this.session.model, this.session.atomIds, this.session.target, 'preview', incrementalSurfaceDelta);
            this.session.surfaceDeltaApplied.copy(totalDelta);
        } else {
            this._emitPreviewOnly(this.session.model, this.session.atomIds, this.session.target, 'preview');
        }

        this.surfaceController?.updateRigidPreview?.({delta: incrementalSurfaceDelta, totalDelta, tool: this.session.tool});
    }

    commit() {
        if (!this.session) return false;
        const moved = maxDisplacement(this.session.previousPositions, this.session.nextPositions);
        this.previewLayer?.clear?.();

        if (moved < 1e-5) {
            this._rewindSurfacePreview();
            this._applyPositions(this.session.model, this.session.previousPositions);
            this._emitPreviewOnly(this.session.model, this.session.atomIds, this.session.target, 'cancel');
            this.surfaceController?.endRigidPreview?.({commit: false});
            this.session = null;
            this.onStatus('Rigid transform ignored: movement too small. Tool remains active.');
            return false;
        }

        const translation = this.session.totalDelta.toArray();

        // Surface was already moved during preview. Rewind it once; the command event
        // will then move it to the final place. This also makes undo/redo surface-safe.
        this._rewindSurfacePreview();

        const ok = this.committer.commit({
            proteinId: this.session.proteinId,
            atomIds: this.session.atomIds,
            previousPositions: this.session.previousPositions,
            nextPositions: this.session.nextPositions,
            translation,
            source: 'vr-rigid-transform',
            description: `VR rigid transform ${this.session.tool}`,
        });

        this.surfaceController?.endRigidPreview?.({commit: true});
        this.onStatus(ok ? 'Rigid transform committed. Tool remains active.' : 'Rigid transform failed.');
        this.session = null;
        return ok;
    }

    cancel() {
        if (this.session) {
            this._rewindSurfacePreview();
            this._applyPositions(this.session.model, this.session.previousPositions);
            this._emitPreviewOnly(this.session.model, this.session.atomIds, this.session.target, 'cancel');
        }
        this.previewLayer?.clear?.();
        this.surfaceController?.endRigidPreview?.({commit: false});
        this.session = null;
    }

    _rewindSurfacePreview() {
        if (!this.session?.surfaceDeltaApplied) return;
        const inverse = this.session.surfaceDeltaApplied.clone().multiplyScalar(-1);
        if (inverse.lengthSq() > 1e-12) {
            this._emitTransformEvent(this.session.model, this.session.atomIds, this.session.target, 'preview', inverse);
        }
        this.session.surfaceDeltaApplied.set(0, 0, 0);
    }

    _applyPositions(model, positions) {
        for (const [atomId, p] of positions.entries()) model.setAtomPosition(atomId, p[0], p[1], p[2]);
    }

    _emitTransformEvent(model, atomIds, target, phase, delta) {
        const revision = model.bumpRevision?.() ?? null;
        const residueIds = target?.residueIds || [];
        const chainIds = target?.chainIds || [];
        const translation = delta.toArray();
        const matrix = new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z).toArray();
        const payload = {
            proteinId: model.id,
            atomIds: [...atomIds],
            residueIds: [...residueIds],
            chainIds: [...chainIds],
            phase,
            source: 'vr-rigid-transform-preview',
            translation,
            matrix,
            transform: {translation: {x: delta.x, y: delta.y, z: delta.z}, matrix},
            revision,
        };

        this.context.eventBus?.emit?.(EventTypes.ATOM_SET_TRANSFORMED, {type: EventTypes.ATOM_SET_TRANSFORMED, ...payload});
        this.context.eventBus?.emit?.(EventTypes.ATOM_POSITION_CHANGED, {type: EventTypes.ATOM_POSITION_CHANGED, ...payload});
    }

    _emitPreviewOnly(model, atomIds, target, phase) {
        const revision = model.bumpRevision?.() ?? null;
        const residueIds = target?.residueIds || [];
        const chainIds = target?.chainIds || [];
        const payload = {
            proteinId: model.id,
            atomIds: [...atomIds],
            residueIds: [...residueIds],
            chainIds: [...chainIds],
            phase,
            source: 'vr-rigid-transform-preview',
            revision,
        };
        this.context.eventBus?.emit?.(EventTypes.ATOM_POSITION_CHANGED, {type: EventTypes.ATOM_POSITION_CHANGED, ...payload});
    }
}
