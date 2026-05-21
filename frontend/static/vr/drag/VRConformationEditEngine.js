import * as THREE from '../../libs/three.module.js';
import {collectResidueAtomIds, first} from '../targeting/VRTargetDescriptor.js';
import {intersectControllerPlane, snapshotPositions, worldToProteinLocal, maxDisplacement} from './VRDragMath.js';
import {localResidueWindowAtomIds, solveAtomConstraint, solveResidueLocal, solveLoopRange} from './VRConformationSolvers.js';

export class VRConformationEditEngine {
    constructor({runtime, rig, context, proteinStageGroup, previewLayer, committer, state, onStatus = () => {}} = {}) {
        this.runtime = runtime; this.rig = rig; this.context = context; this.proteinStageGroup = proteinStageGroup;
        this.previewLayer = previewLayer; this.committer = committer; this.state = state; this.onStatus = onStatus;
        this.session = null; this.plane = new THREE.Plane(); this.tmp = new THREE.Vector3();
    }

    get active(){return !!this.session;}

    begin({controller, pick, tool} = {}) {
        const model = pick.model || this.context.activeModel;
        const target = pick.target;
        let atomIds = [];

        if (tool === 'conform_atom_constraint') {
            const center = first(target.atomIds);
            if (!center) return this.onStatus('Pick an atom.');
            atomIds = [...model.atoms.keys()].slice(0); // solver will falloff by distance; okay for small proteins.
        } else if (tool === 'conform_residue_local' || tool === 'conform_residue_sidechain') {
            const residueId = first(target.residueIds);
            if (!residueId) return this.onStatus('Pick a residue.');
            atomIds = localResidueWindowAtomIds(model, residueId, 3);
        } else {
            atomIds = target.atomIds || [];
        }

        if (!atomIds.length) return this.onStatus('Conformation edit failed: no atoms resolved.');
        const pose = this.runtime.getViewerPose();
        this.plane.setFromNormalAndCoplanarPoint(pose.forward.clone().negate(), pick.point);
        const startWorld = intersectControllerPlane({controller, rig: this.rig, plane: this.plane});
        if (!startWorld) return;
        const startLocal = worldToProteinLocal(this.proteinStageGroup, startWorld);
        const previousPositions = snapshotPositions(model, atomIds);

        this.session = {controller, model, proteinId: model.id, atomIds, previousPositions, nextPositions: previousPositions, target, tool, startLocal};
        this.onStatus(`Conformation edit: ${tool}`);
    }

    beginLoopRange({rangeTarget, model, controller = null} = {}) {
        // Loop drag is enabled after range picking. The next selectstart can be wired to call begin() with this fixed range.
        this.state.selectedTarget = rangeTarget;
        this.onStatus(`Loop range selected: ${rangeTarget.label}. Use Conform > Loop again to drag.`);
    }

    update() {
        if (!this.session) return;
        const hit = intersectControllerPlane({controller: this.session.controller, rig: this.rig, plane: this.plane, out: this.tmp});
        if (!hit) return;
        const local = worldToProteinLocal(this.proteinStageGroup, hit);
        const delta = local.sub(this.session.startLocal);

        let next = this.session.previousPositions;
        if (this.session.tool === 'conform_atom_constraint') {
            next = solveAtomConstraint({model: this.session.model, target: this.session.target, previousPositions: this.session.previousPositions, delta});
        } else if (this.session.tool === 'conform_residue_local' || this.session.tool === 'conform_residue_sidechain') {
            next = solveResidueLocal({model: this.session.model, centerResidueId: first(this.session.target.residueIds), previousPositions: this.session.previousPositions, delta});
        } else if (this.session.tool === 'conform_loop_range_start') {
            next = solveLoopRange({previousPositions: this.session.previousPositions, orderedAtomIds: this.session.atomIds, delta});
        }

        this.session.nextPositions = next;
        this.previewLayer.showPositions(this.session.model, this.session.atomIds, next);
    }

    commit() {
        if (!this.session) return false;
        const moved = maxDisplacement(this.session.previousPositions, this.session.nextPositions);
        this.previewLayer.clear();
        if (moved < 1e-5) { this.cancel(); return false; }
        const ok = this.committer.commit({
            proteinId: this.session.proteinId,
            atomIds: this.session.atomIds,
            previousPositions: this.session.previousPositions,
            nextPositions: this.session.nextPositions,
            source: 'vr-conformation-edit',
            description: `VR conformation edit ${this.session.tool}`,
        });
        this.onStatus(ok ? 'Conformation edit committed.' : 'Conformation edit failed.');
        this.session = null;
        return ok;
    }

    cancel() {
        this.previewLayer.clear();
        this.session = null;
    }
}
