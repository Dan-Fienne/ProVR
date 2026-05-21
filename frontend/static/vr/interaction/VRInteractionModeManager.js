import {VRPhase, VRTool} from './VRInteractionState.js';
import {buildRangeTarget} from '../targeting/VRTargetDescriptor.js';

const PERSISTENT_DRAG_TOOLS = new Set([
    VRTool.TRANSFORM_PROTEIN_COORDINATES,
    VRTool.TRANSFORM_CHAIN,
    VRTool.TRANSFORM_SELECTED_RIGID,
    VRTool.TRANSFORM_FRAGMENT_RIGID,
    VRTool.CONFORM_ATOM_CONSTRAINT,
    VRTool.CONFORM_RESIDUE_LOCAL,
    VRTool.CONFORM_RESIDUE_SIDECHAIN,
    VRTool.VIEW_GRAB_PROTEIN,
]);

export class VRInteractionModeManager {
    constructor({state, targeting, rigidEngine, conformationEngine, surfaceController, viewScaleController, actionManager, onStatus = () => {}} = {}) {
        this.state = state;
        this.targeting = targeting;
        this.rigidEngine = rigidEngine;
        this.conformationEngine = conformationEngine;
        this.surfaceController = surfaceController;
        this.viewScaleController = viewScaleController;
        this.actionManager = actionManager;
        this.onStatus = onStatus;
    }

    selectStart({controller, pick}) {
        if (!pick?.target) return;
        this._rememberPickedProtein(pick);
        this.state.selectedTarget = pick.target;

        switch (this.state.currentTool) {
            case VRTool.INSPECT:
                this.status(`Selected ${pick.label || pick.target.kind}`);
                return;
            case VRTool.SURFACE_PICK_CHAIN:
                this.surfaceController?.buildChainSurfaceForTarget?.(pick.target);
                this.state.clearTool();
                return;
            case VRTool.SURFACE_PICK_RANGE_START:
            case VRTool.FRAGMENT_CUT_START:
            case VRTool.FRAGMENT_REPLACE_START:
            case VRTool.DESIGN_REGION_START:
            case VRTool.CONFORM_LOOP_RANGE_START:
                return this._handleRangePick(pick);
            case VRTool.TRANSFORM_PROTEIN_COORDINATES:
            case VRTool.TRANSFORM_CHAIN:
            case VRTool.TRANSFORM_SELECTED_RIGID:
            case VRTool.TRANSFORM_FRAGMENT_RIGID:
                this.rigidEngine.begin({controller, pick, tool: this.state.currentTool, selectedTarget: this.state.selectedTarget});
                this.state.currentPhase = VRPhase.RIGID_DRAG;
                return;
            case VRTool.CONFORM_ATOM_CONSTRAINT:
            case VRTool.CONFORM_RESIDUE_LOCAL:
            case VRTool.CONFORM_RESIDUE_SIDECHAIN:
                this.conformationEngine.begin({controller, pick, tool: this.state.currentTool});
                this.state.currentPhase = VRPhase.CONFORMATION_DRAG;
                return;
            case VRTool.VIEW_GRAB_PROTEIN:
                this.viewScaleController?.beginViewGrab?.({controller});
                this.state.currentPhase = VRPhase.RIGID_DRAG;
                return;
            default:
                this.status(`Tool reserved: ${this.state.currentTool}`);
        }
    }

    selectEnd() {
        const toolBeforeCommit = this.state.currentTool;

        if (this.rigidEngine?.active) {
            this.rigidEngine.commit();
            return this._finishDragTool(toolBeforeCommit);
        }
        if (this.conformationEngine?.active) {
            this.conformationEngine.commit();
            return this._finishDragTool(toolBeforeCommit);
        }
        if (this.viewScaleController?.viewGrabActive) {
            this.viewScaleController.endViewGrab();
            return this._finishDragTool(toolBeforeCommit);
        }
    }

    frame() {
        if (this.rigidEngine?.active) this.rigidEngine.update();
        if (this.conformationEngine?.active) this.conformationEngine.update();
        if (this.viewScaleController?.viewGrabActive) this.viewScaleController.updateViewGrab();
    }

    cancel() {
        this.rigidEngine?.cancel?.();
        this.conformationEngine?.cancel?.();
        this.viewScaleController?.cancel?.();
        this.state.clearTool();
        this.status('Cancelled current operation.');
    }

    _finishDragTool(tool) {
        if (PERSISTENT_DRAG_TOOLS.has(tool)) {
            this.state.currentTool = tool;
            this.state.currentPhase = VRPhase.TARGETING;
            this.state.pendingRangeStart = null;
            this.state.pendingRangeEnd = null;
            this.status(`${this._toolLabel(tool)} remains active. Point at another target and hold trigger again.`);
            return;
        }
        this.state.clearTool();
    }

    _handleRangePick(pick) {
        this._rememberPickedProtein(pick);
        if (!this.state.pendingRangeStart) {
            this.state.pendingRangeStart = pick.target;
            this.state.currentPhase = VRPhase.RANGE_END;
            this.status('Start residue selected. Pick end residue.');
            return;
        }

        const model = pick.model;
        const rangeTarget = buildRangeTarget(model, this.state.pendingRangeStart, pick.target);
        if (!rangeTarget) {
            this.status('Invalid range. Pick two residues on the same chain/protein.');
            this.state.pendingRangeStart = null;
            return;
        }

        const tool = this.state.currentTool;
        this.state.selectedTarget = rangeTarget;

        if (tool === VRTool.SURFACE_PICK_RANGE_START) this.surfaceController?.buildRangeSurface?.(rangeTarget);
        else if (tool === VRTool.CONFORM_LOOP_RANGE_START) {
            this.conformationEngine.beginLoopRange({rangeTarget, model});
            this.state.currentPhase = VRPhase.CONFORMATION_DRAG;
            return;
        } else if (tool === VRTool.FRAGMENT_CUT_START) this.actionManager?.cutRange?.(rangeTarget);
        else if (tool === VRTool.FRAGMENT_REPLACE_START) this.actionManager?.replaceRange?.(rangeTarget);
        else if (tool === VRTool.DESIGN_REGION_START) this.actionManager?.markDesignRegion?.(rangeTarget);

        this.state.clearTool();
    }

    _rememberPickedProtein(pick) {
        const proteinId = pick?.target?.proteinId || pick?.model?.id || null;
        if (!proteinId) return;
        this.state.lastPickedProteinId = proteinId;
        this.state.selectedProteinId = proteinId;
        this.state.activeProteinId = proteinId;
    }

    _toolLabel(tool) {
        return String(tool || '').replace(/_/g, ' ');
    }

    status(message) {
        this.state.status = message;
        this.onStatus(message);
    }
}
