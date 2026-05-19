import * as THREE from '../../libs/three.module.js';

import {EventTypes} from '../../core/event/EventTypes.js';
import {ProVRAppContext} from '../../app/ProVRAppContext.js';

import {StructureFeature} from '../../features/structure/StructureFeature.js';
import {RepresentationFeature} from '../../features/representation/RepresentationFeature.js';
import {EditingFeature} from '../../features/editing/EditingFeature.js';
import {SurfaceFeature} from '../../features/surface/SurfaceFeature.js';
import {ExportFeature} from '../../features/export/ExportFeature.js';
import {HistoryFeature} from '../../features/history/HistoryFeature.js';
import {ProteinDesignFeature} from '../../features/protein-design/ProteinDesignFeature.js';

import {EditOperation, SelectionScope, SurfaceOperation, VRWorkflowPhase} from '../../domain/design/EditOperationTypes.js';

import {VRRendererRuntime} from '../runtime/VRRendererRuntime.js';
import {VRControllerInputAdapter} from '../input/VRControllerInputAdapter.js';
import {VRSelectionController} from '../interaction/VRSelectionController.js';
import {VRManipulationController} from '../interaction/VRManipulationController.js';
import {VRHoverFeedbackSystem} from '../feedback/VRHoverFeedbackSystem.js';
import {SpatialUISystem} from '../spatial-ui/SpatialUISystem.js';
import {VRProteinWorkbench} from './VRProteinWorkbench.js';
import {ProVRVRWorkspaceState} from './ProVRVRWorkspaceState.js';

function $(id) { return document.getElementById(id); }

function modelSummary(model) {
    return {
        atoms: model?.atoms?.size || 0,
        residues: model?.residues?.size || 0,
        chains: model?.chains?.size || 0,
    };
}

function firstResidueId(target) {
    return target?.residueIds?.[0] || null;
}

function firstChainId(target) {
    return target?.chainIds?.[0] || null;
}

export class ProVRVRWorkspace {
    constructor({
                    viewportSelector = '#viewport',
                    statusSelector = '#status',
                    summarySelector = '#summary',
                    demoUrl = '/static/assets/demo/1cwa.pdb',
                } = {}) {
        this.viewportEl = document.querySelector(viewportSelector);
        this.statusEl = document.querySelector(statusSelector);
        this.summaryEl = document.querySelector(summarySelector);
        this.demoUrl = demoUrl;

        this.state = new ProVRVRWorkspaceState();

        this.runtime = null;
        this.context = null;
        this.input = null;
        this.selection = null;
        this.manipulation = null;
        this.hover = null;
        this.spatialUI = null;
        this.workbench = null;

        this.proteinStageGroup = new THREE.Group();
        this.proteinStageGroup.name = 'vr:proteinStageGroup';
    }

    async init() {
        this.runtime = new VRRendererRuntime({
            container: this.viewportEl,
            background: 0xf8fbff,
            cameraPosition: [0, 0, 3.5],
        });
        await this.runtime.init();

        this.runtime.scene.add(this.proteinStageGroup);

        this.context = new ProVRAppContext({
            scene: this.proteinStageGroup,
            renderer: this.runtime.renderer,
            projectName: 'ProVR VR Protein Workbench',
        });

        this.context.registerFeature('structure', new StructureFeature());
        this.context.registerFeature('representation', new RepresentationFeature());
        this.context.registerFeature('editing', new EditingFeature({
            getMode: () => this.state.editScope,
            getResidueWindow: () => 6,
        }));
        this.context.registerFeature('surface', new SurfaceFeature());
        this.context.registerFeature('export', new ExportFeature());
        this.context.registerFeature('history', new HistoryFeature());
        this.context.registerFeature('proteinDesign', new ProteinDesignFeature());

        this.workbench = new VRProteinWorkbench({
            runtime: this.runtime,
            stageGroup: this.proteinStageGroup,
        });

        this.spatialUI = new SpatialUISystem({runtime: this.runtime}).init();
        this.input = new VRControllerInputAdapter({runtime: this.runtime}).init();
        this.selection = new VRSelectionController({
            context: this.context,
            inputAdapter: this.input,
            spatialUI: this.spatialUI,
        });

        this.manipulation = new VRManipulationController({
            context: this.context,
            inputAdapter: this.input,
            selectionController: this.selection,
            spatialUI: this.spatialUI,
            getEditScope: () => this.state.editScope,
            getResidueWindow: () => 6,
            shouldCoordinateDrag: () => this.state.editOperation === EditOperation.MOVE,
            routeAction: (action, meta) => this.routeAction(action, meta),
            routeMoleculePick: (pick, meta) => this.routeMoleculePick(pick, meta),
            onStatus: (message) => this.setStatus(message),
            onPreview: () => this.refreshSummary(),
            onCommit: () => this.refreshSummary(),
        });
        this.manipulation.enable();

        this.hover = new VRHoverFeedbackSystem({
            inputAdapter: this.input,
            selectionController: this.selection,
            spatialUI: this.spatialUI,
        });
        this.hover.enable();

        this._bindDOM();
        this._bindEvents();
        this._bindKeyboardDebug();

        this.runtime.start();
        this.state.setPhase(VRWorkflowPhase.BOOT);
        this.setStatus('Ready. Enter VR first; load protein inside VR.', 'info');
        this.refreshSummary();
        return this;
    }

    async enterVR() {
        try {
            await this.runtime.enterVR();
            this.state.setPhase(VRWorkflowPhase.START_SPACE);
            this.spatialUI.show();
            this.spatialUI.showStartSpace();
            this.spatialUI.recenter({silent: true});
            this.setStatus('Entered VR. Choose Load 1CWA inside the VR Start Space.', 'ok');
        } catch (err) {
            this.setStatus(err.message || String(err), 'error');
        }
    }

    async loadDemoProteinInsideVR() {
        this.state.setPhase(VRWorkflowPhase.LOADING_PROTEIN);
        this.setStatus('Loading 1CWA demo protein inside VR...', 'info');

        const res = await fetch(this.demoUrl);
        if (!res.ok) throw new Error(`Failed to load 1CWA demo: ${res.status}`);
        const text = await res.text();

        return this.context.getFeature('structure').loadText({
            text,
            proteinId: '1cwa',
            filename: '1cwa.pdb',
            format: 'pdb',
            replace: true,
            active: true,
        });
    }

    createDefaultRepresentations(proteinId) {
        const ids = this.context.getFeature('representation').createDefaultRepresentations(proteinId, {
            visible: this.state.visible,
            colorScheme: 'chain',
        });
        this.state.repIds = ids;
        this.updateUIState();
    }

    enterWorkbench(model) {
        this.state.activeProteinLoaded = true;
        this.state.setPhase(VRWorkflowPhase.WORKBENCH);

        this.workbench.placeModel(model);

        const summary = modelSummary(model);
        this.spatialUI.showWorkbench({
            proteinName: model.name || model.id,
            summary,
        });

        this.spatialUI.recenter({silent: true});
        this.setEditScope(SelectionScope.RESIDUE);
        this.setEditOperation(EditOperation.NONE);
        this.setStatus(`Loaded ${model.name || model.id}: ${summary.chains} chains, ${summary.residues} residues, ${summary.atoms} atoms.`, 'ok');
        this.refreshSummary();
    }

    routeAction(action, meta = {}) {
        try {
            if (action === 'protein:load-demo-1cwa') return this.loadDemoProteinInsideVR();
            if (action === 'protein:my-files') return this.setStatus('Project file picker will connect to backend dashboard/files next.', 'info');
            if (action === 'protein:bring-here') return this.bringProteinHere();

            if (action === 'view:ballstick') return this.toggleRepresentation('ballstick');
            if (action === 'view:cartoon') return this.toggleRepresentation('cartoon');
            if (action === 'view:line') return this.toggleRepresentation('line');

            if (action === 'surface:full') return this.buildFullSurface();
            if (action === 'surface:chain-pick') return this.startChainSurfacePick();
            if (action === 'surface:range-pick') return this.startRangeSurfacePick();
            if (action === 'surface:clear') return this.clearSurface();

            if (action === 'edit:move') return this.setEditOperation(EditOperation.MOVE);
            if (action === 'edit:mutate-ala') return this.setEditOperation(EditOperation.MUTATE);
            if (action === 'edit:cut-fragment') return this.setEditOperation(EditOperation.CUT_FRAGMENT);
            if (action === 'edit:replace-fragment') return this.setEditOperation(EditOperation.REPLACE_FRAGMENT);
            if (action === 'edit:snap-fragment') return this.setEditOperation(EditOperation.SNAP_FRAGMENT);
            if (action === 'design:mark-region') return this.setEditOperation(EditOperation.MARK_DESIGN_REGION);

            if (action === 'history:undo') return this.undo();
            if (action === 'ui:back') return this.back();
            if (action === 'ui:cancel') return this.cancelCurrentOperation();
            if (action === 'ui:near') return this.setUINear();
            if (action === 'ui:far') return this.setUIFar();
            if (action === 'ui:hide') return this.spatialUI.hide();
        } catch (err) {
            this.setStatus(err.message || String(err), 'error');
        }
    }

    routeMoleculePick(pick, meta = {}) {
        const target = pick.target;
        this.state.setSelectedTarget(target);

        if (this.state.surfaceOperation === SurfaceOperation.CHAIN_PICK) {
            const chainId = firstChainId(target);
            if (!chainId) {
                this.setStatus('Pick a chain/residue belonging to a chain.', 'info');
                return true;
            }
            this.context.getFeature('surface').buildChainSurface({chainId});
            this.state.setVisible('surface', true);
            this.state.setSurfaceOperation(SurfaceOperation.NONE);
            this.setStatus(`Built Chain ${chainId} surface.`, 'ok');
            this.refreshSummary();
            return true;
        }

        if (this.state.surfaceOperation === SurfaceOperation.RANGE_PICK_START) {
            const residueId = firstResidueId(target);
            if (!residueId) {
                this.setStatus('Pick a residue to start the range.', 'info');
                return true;
            }
            this.state.surfaceRangeStart = residueId;
            this.state.setSurfaceOperation(SurfaceOperation.RANGE_PICK_END);
            this.setStatus('Range start selected. Pick the end residue. Back exits range mode.', 'info');
            this.spatialUI.setContextCard({
                title: 'Range surface',
                subtitle: 'Pick end residue',
                rows: [['Back', 'exit range mode']],
            });
            return true;
        }

        if (this.state.surfaceOperation === SurfaceOperation.RANGE_PICK_END) {
            const endResidueId = firstResidueId(target);
            if (!endResidueId || !this.state.surfaceRangeStart) {
                this.setStatus('Pick a valid end residue.', 'info');
                return true;
            }

            this.context.getFeature('surface').buildResidueRangeSurface({
                residueAId: this.state.surfaceRangeStart,
                residueBId: endResidueId,
            });

            this.state.setVisible('surface', true);
            this.state.setSurfaceOperation(SurfaceOperation.NONE);
            this.state.clearSurfaceRange();
            this.setStatus('Built residue range surface.', 'ok');
            this.refreshSummary();
            return true;
        }

        if (this.state.editOperation === EditOperation.MUTATE) {
            this.context.getFeature('proteinDesign').mutateTarget(target, {toResidueName: 'ALA'});
            this.setStatus('Mutation intent applied: selected residue → ALA. Undo is available.', 'ok');
            this.refreshSummary();
            return true;
        }

        if (this.state.editOperation === EditOperation.CUT_FRAGMENT) {
            this.context.getFeature('proteinDesign').cutFragment(target);
            this.setStatus('Fragment cut intent recorded. Undo is available.', 'ok');
            this.refreshSummary();
            return true;
        }

        if (this.state.editOperation === EditOperation.REPLACE_FRAGMENT) {
            this.context.getFeature('proteinDesign').replaceFragment(target, {fragmentId: 'builtin_loop_6'});
            this.setStatus('Fragment replacement intent recorded. Undo is available.', 'ok');
            this.refreshSummary();
            return true;
        }

        if (this.state.editOperation === EditOperation.SNAP_FRAGMENT) {
            this.context.getFeature('proteinDesign').snapFragment(target);
            this.setStatus('Magnet snap intent recorded. Undo is available.', 'ok');
            this.refreshSummary();
            return true;
        }

        if (this.state.editOperation === EditOperation.MARK_DESIGN_REGION) {
            this.context.getFeature('proteinDesign').markDesignRegion(target);
            this.setStatus('Design region marked. Undo not yet structural; region metadata recorded.', 'ok');
            this.refreshSummary();
            return true;
        }

        return false;
    }

    back() {
        if (this.state.surfaceOperation !== SurfaceOperation.NONE) {
            this.state.setSurfaceOperation(SurfaceOperation.NONE);
            this.state.clearSurfaceRange();
            this.spatialUI.setContextCard({
                title: 'Back',
                subtitle: 'Surface pick cancelled.',
                rows: [['State', 'Workbench idle']],
                kind: 'ok',
            });
            this.setStatus('Surface selection cancelled. Back to workbench.', 'ok');
            this.refreshSummary();
            return true;
        }

        if (this.state.editOperation !== EditOperation.NONE) {
            this.setEditOperation(EditOperation.NONE);
            this.setStatus('Edit tool cleared. Back to workbench.', 'ok');
            return true;
        }

        this.setStatus('Already at workbench level.', 'info');
        return false;
    }

    cancelCurrentOperation() {
        this.manipulation?.cancel?.();
        this.state.setSurfaceOperation(SurfaceOperation.NONE);
        this.state.clearSurfaceRange();
        this.state.setEditOperation(EditOperation.NONE);
        this.spatialUI.setContextCard({
            title: 'Cancelled',
            subtitle: 'Current operation cleared.',
            rows: [['Next', 'Choose a new action']],
            kind: 'ok',
        });
        this.setStatus('Cancelled current operation.', 'ok');
        this.refreshSummary();
        return true;
    }

    setUINear() {
        this.spatialUI.near();
        this.setStatus('UI Near mode: 0.5m.', 'ok');
    }

    setUIFar() {
        this.spatialUI.far();
        this.setStatus('UI Far mode: 0.95m.', 'ok');
    }

    setEditScope(scope) {
        this.state.setEditScope(scope);
        this.refreshSummary();
    }

    setEditOperation(operation) {
        this.state.setEditOperation(operation);
        this.state.setSurfaceOperation(SurfaceOperation.NONE);

        const instructions = {
            [EditOperation.NONE]: 'Choose an action.',
            [EditOperation.MOVE]: 'Point at target and hold trigger to drag. Back exits Move.',
            [EditOperation.MUTATE]: 'Point at residue and trigger to mutate to ALA. Back exits Mutate.',
            [EditOperation.CUT_FRAGMENT]: 'Point at residue/range and trigger to cut fragment intent. Back exits Cut.',
            [EditOperation.REPLACE_FRAGMENT]: 'Point at residue/range and trigger to replace. Back exits Replace.',
            [EditOperation.SNAP_FRAGMENT]: 'Point at fragment/range and trigger to record magnet snap. Back exits Snap.',
            [EditOperation.MARK_DESIGN_REGION]: 'Point at residue/range and trigger to mark design region. Back exits Design.',
        };

        this.spatialUI.setContextCard({
            title: operation === EditOperation.NONE ? 'Workbench' : 'Edit tool',
            subtitle: operation,
            rows: [['Back', 'exit this tool']],
        });

        this.setStatus(instructions[operation] || `Edit operation: ${operation}`, 'info');
        this.refreshSummary();
    }

    buildFullSurface() {
        this.context.getFeature('surface').buildFullSurface();
        this.state.setVisible('surface', true);
        this.state.setSurfaceOperation(SurfaceOperation.NONE);
        this.setStatus('Built full protein surface.', 'ok');
        this.refreshSummary();
    }

    startChainSurfacePick() {
        this.state.setSurfaceOperation(SurfaceOperation.CHAIN_PICK);
        this.state.setEditOperation(EditOperation.NONE);
        this.setStatus('Pick any residue/atom in the target chain. Back exits chain surface mode.', 'info');
        this.spatialUI.setContextCard({
            title: 'Chain surface',
            subtitle: 'Pick a chain',
            rows: [['Back', 'exit chain mode']],
        });
    }

    startRangeSurfacePick() {
        this.state.setSurfaceOperation(SurfaceOperation.RANGE_PICK_START);
        this.state.clearSurfaceRange();
        this.state.setEditOperation(EditOperation.NONE);
        this.setStatus('Pick first residue for range surface. Back exits range mode.', 'info');
        this.spatialUI.setContextCard({
            title: 'Range surface',
            subtitle: 'Pick start residue',
            rows: [['Back', 'exit range mode']],
        });
    }

    clearSurface() {
        this.context.getFeature('surface').removeSurface();
        this.state.setRepresentationId('surface', null);
        this.state.setVisible('surface', false);
        this.state.setSurfaceOperation(SurfaceOperation.NONE);
        this.setStatus('Surface cleared.', 'ok');
        this.refreshSummary();
    }

    toggleRepresentation(type) {
        this.state.setVisible(type, !this.state.visible[type]);
        const repId = this.state.repIds[type];
        if (repId) this.context.getFeature('representation').setVisible(repId, this.state.visible[type]);
        this.updateUIState();
        this.refreshSummary();
    }

    bringProteinHere() {
        const model = this.context.activeModel;
        if (!model) return this.setStatus('No protein loaded.', 'info');
        this.workbench.bringProteinHere(model);
        this.setStatus('Protein brought to your front workspace.', 'ok');
        this.refreshSummary();
    }

    undo() {
        this.context.getFeature('history').undo();
        this.setStatus('Undo requested.', 'ok');
        this.refreshSummary();
    }

    updateUIState() {
        this.spatialUI?.setActive?.('view:ballstick', this.state.visible.ballstick);
        this.spatialUI?.setActive?.('view:cartoon', this.state.visible.cartoon);
        this.spatialUI?.setActive?.('view:line', this.state.visible.line);
        this.spatialUI?.setActive?.('surface:full', this.state.visible.surface);
    }

    setStatus(message, kind = 'info') {
        this.state.status = {message, kind};
        if (this.statusEl) {
            this.statusEl.textContent = message;
            this.statusEl.dataset.kind = kind;
        }
        this.spatialUI?.showToast?.(message, {kind});
    }

    refreshSummary() {
        if (!this.summaryEl || !this.context) return;
        const model = this.context.activeModel;
        const data = {
            activeProteinId: this.context.activeProteinId,
            model: modelSummary(model),
            workspace: this.state.toJSON(),
            workbench: this.workbench?.summary?.() || null,
            surface: this.context.getFeature('surface')?.summary?.() || null,
            designFragments: this.context.getFeature('proteinDesign')?.fragmentLibrarySummary?.() || null,
            history: this.context.getFeature('history')?.summary?.() || null,
            representations: this.context.representationManager.summary(),
            designIntents: this.context.designIntentStore.summary(),
        };
        this.summaryEl.textContent = JSON.stringify(data, null, 2);
    }

    _bindDOM() {
        $('enterVRButton')?.addEventListener('click', () => this.enterVR());
    }

    _bindKeyboardDebug() {
        window.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();
            if (key === 'v') this.enterVR();
            if (key === 'd') this.loadDemoProteinInsideVR().catch((err) => this.setStatus(err.message || String(err), 'error'));
            if (key === 'm') this.spatialUI.toggle();
            if (key === 'b') this.back();
            if (key === 'escape') this.cancelCurrentOperation();
            if (key === 'u') this.undo();
            if (key === 'n') this.setUINear();
            if (key === 'f') this.setUIFar();
        });
    }

    _bindEvents() {
        this.context.eventBus.on(EventTypes.STRUCTURE_LOADED, (evt) => {
            this.createDefaultRepresentations(evt.proteinId);
            this.enterWorkbench(evt.model);
        });

        this.context.eventBus.on(EventTypes.HISTORY_CHANGED, () => this.refreshSummary());
        this.context.eventBus.on(EventTypes.EDIT_SESSION_COMMITTED, () => this.refreshSummary());
    }
}
