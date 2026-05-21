import * as THREE from '../../libs/three.module.js';

import {ProVRAppContext} from '../../app/ProVRAppContext.js';
import {EventTypes} from '../../core/event/EventTypes.js';
import {downloadText} from '../../domain/io/PDBExporter.js';

import {StructureFeature} from '../../features/structure/StructureFeature.js';
import {RepresentationFeature} from '../../features/representation/RepresentationFeature.js';
import {SurfaceFeature} from '../../features/surface/SurfaceFeature.js';
import {ExportFeature} from '../../features/export/ExportFeature.js';
import {HistoryFeature} from '../../features/history/HistoryFeature.js';
import {ProteinDesignFeature} from '../../features/protein-design/ProteinDesignFeature.js';

import {VRRendererRuntime} from '../runtime/VRRendererRuntime.js';
import {VRControllerRig} from '../controllers/VRControllerRig.js';
import {VRInteractionState} from '../interaction/VRInteractionState.js';
import {VRInputRouter} from '../interaction/VRInputRouter.js';
import {VRInteractionModeManager} from '../interaction/VRInteractionModeManager.js';
import {VRMenuSystem} from '../menu/VRMenuSystem.js';
import {VRMenuActionManager} from '../menu/VRMenuActionManager.js';
import {VRTargetingSystem} from '../targeting/VRTargetingSystem.js';
import {VRPreviewLayer} from '../preview/VRPreviewLayer.js';
import {VRDragCommitter} from '../drag/VRDragCommitter.js';
import {VRRigidTransformEngine} from '../drag/VRRigidTransformEngine.js';
import {VRConformationEditEngine} from '../drag/VRConformationEditEngine.js';
import {VRSurfaceOpacityController} from '../surface-ui/VRSurfaceOpacityController.js';
import {VRProteinViewScaleController} from '../view-controls/VRProteinViewScaleController.js';
import {VRProteinWorkbench} from './VRProteinWorkbench.js';
import {VRProteinCollection} from './VRProteinCollection.js';

function $(id){return document.getElementById(id);}
function unique(values){return [...new Set(values.filter(Boolean))];}

export class ProVRVRWorkspace {
    constructor({viewportSelector = '#viewport', statusSelector = '#status', summarySelector = '#summary'} = {}) {
        this.viewport = document.querySelector(viewportSelector);
        this.statusEl = document.querySelector(statusSelector);
        this.summaryEl = document.querySelector(summarySelector);
        this.runtime = null;
        this.context = null;
        this.rig = null;
        this.state = new VRInteractionState();
        this.proteinStageGroup = new THREE.Group();
        this.proteinStageGroup.name = 'provr-protein-stage';
        this.demoPdbIds = ['1CWA', '4EU4', '4EU2'];
        this.currentPdbIds = [...this.demoPdbIds];
        this._loadedOnce = new Set();
    }

    async init() {
        this.runtime = await new VRRendererRuntime({container: this.viewport}).init();
        this.runtime.scene.add(this.proteinStageGroup);

        this.context = new ProVRAppContext({scene: this.proteinStageGroup, renderer: this.runtime.renderer, projectName: 'ProVR VR'});
        this.context.registerFeature('structure', new StructureFeature());
        this.context.registerFeature('representation', new RepresentationFeature());
        this.context.registerFeature('surface', new SurfaceFeature());
        this.context.registerFeature('export', new ExportFeature());
        this.context.registerFeature('history', new HistoryFeature());
        this.context.registerFeature('proteinDesign', new ProteinDesignFeature());

        this.representationFeature = this.context.getFeature('representation');
        this.proteinCollection = new VRProteinCollection({context: this.context, representationFeature: this.representationFeature, onChange: () => this.syncMenuContext()});

        this.workbench = new VRProteinWorkbench({runtime: this.runtime, stageGroup: this.proteinStageGroup});
        this.rig = await new VRControllerRig({runtime: this.runtime, preferOfficialModels: true}).init();

        this.previewLayer = new VRPreviewLayer({scene: this.runtime.scene, proteinStageGroup: this.proteinStageGroup});
        this.committer = new VRDragCommitter({context: this.context});
        this.surfaceController = new VRSurfaceOpacityController({context: this.context, onStatus: (m) => this.setStatus(m, 'ok')});
        this.viewScaleController = new VRProteinViewScaleController({runtime: this.runtime, rig: this.rig, proteinStageGroup: this.proteinStageGroup, workbench: this.workbench, state: this.state, onStatus: (m) => this.setStatus(m, 'ok')});

        this.menuActionManager = new VRMenuActionManager({workspace: this, state: this.state, surfaceController: this.surfaceController, viewScaleController: this.viewScaleController, onStatus: (m) => this.setStatus(m, 'info')});
        this.menuSystem = new VRMenuSystem({runtime: this.runtime, actionManager: this.menuActionManager, distance: 0.7});
        this.menuActionManager.menuSystem = this.menuSystem;

        this.targeting = new VRTargetingSystem({runtime: this.runtime, rig: this.rig, context: this.context, proteinStageGroup: this.proteinStageGroup});
        this.rigidEngine = new VRRigidTransformEngine({runtime: this.runtime, rig: this.rig, context: this.context, proteinStageGroup: this.proteinStageGroup, previewLayer: this.previewLayer, committer: this.committer, surfaceController: this.surfaceController, state: this.state, onStatus: (m) => this.setStatus(m, 'info')});
        this.conformationEngine = new VRConformationEditEngine({runtime: this.runtime, rig: this.rig, context: this.context, proteinStageGroup: this.proteinStageGroup, previewLayer: this.previewLayer, committer: this.committer, state: this.state, onStatus: (m) => this.setStatus(m, 'info')});
        this.modeManager = new VRInteractionModeManager({state: this.state, targeting: this.targeting, rigidEngine: this.rigidEngine, conformationEngine: this.conformationEngine, surfaceController: this.surfaceController, viewScaleController: this.viewScaleController, actionManager: this.menuActionManager, onStatus: (m) => this.setStatus(m, 'info')});
        this.inputRouter = new VRInputRouter({state: this.state, rig: this.rig, menuSystem: this.menuSystem, targetingSystem: this.targeting, modeManager: this.modeManager, twoHandScaleController: this.viewScaleController, onStatus: (m) => this.setStatus(m)});
        this.inputRouter.enable(this.runtime);

        this._bindEvents();
        this._bindDOM();
        await this.refreshPdbList().catch(() => {});
        this.syncMenuContext();
        this.runtime.start();
        this.setStatus('Ready. Enter VR, Load 1CWA / 4EU4 / 4EU2.', 'info');
        window.proVRWorkspace = this;
        return this;
    }

    syncMenuContext() {
        this.menuSystem?.setMenuContext?.({pdbIds: this.currentPdbIds, recentIds: this.currentPdbIds.slice(0, 6), loadedProteins: this.proteinCollection?.list?.() || [], activeProteinId: this.proteinCollection?.activeProteinId || null});
        this.refreshSummary();
    }

    async enterVR() {
        try {
            await this.runtime.enterVR();
            this.inputRouter.openMenuAtViewer();
            if (this.proteinCollection?.getActiveModel?.()) this.workbench.placeWhenReady(this.proteinCollection.getActiveModel(), {frames: 36});
            this.setStatus('Entered VR. Menu summoned; protein placement uses live headset pose.', 'ok');
        } catch (err) { this.setStatus(err.message || String(err), 'error'); }
    }

    async refreshPdbList() {
        const ids = [...this.demoPdbIds];
        try {
            const res = await fetch('/api/my-files', {cache: 'no-store'});
            if (res.ok) {
                const data = await res.json();
                const rows = Array.isArray(data) ? data : (data.files || data.items || []);
                ids.push(...rows.map((r) => r.pdbId || r.id || r.name || r.filename).filter(Boolean).map((s) => String(s).replace(/\.pdb$/i, '').toUpperCase()));
            }
        } catch {}
        try {
            const res = await fetch('/static/assets/demo/pdb-index.json', {cache: 'no-store'});
            if (res.ok) {
                const data = await res.json();
                const demo = Array.isArray(data) ? data : (data.ids || data.pdbIds || []);
                ids.push(...demo.map((x) => String(x).replace(/\.pdb$/i, '').toUpperCase()));
            }
        } catch {}
        this.currentPdbIds = unique(ids);
        this.syncMenuContext();
        return this.currentPdbIds;
    }

    async loadPdbId(pdbId) {
        const normalized = String(pdbId || '').replace(/\.pdb$/i, '').toUpperCase();
        if (!normalized) return;
        this.setStatus(`Loading ${normalized}...`, 'info');

        let text = null;
        const lower = normalized.toLowerCase();
        const candidates = [
            `/static/assets/demo/${lower}.pdb`,
            `/static/assets/demo/${normalized}.pdb`,
            `/user-files/${encodeURIComponent(normalized)}.pdb`,
            `/user-files/${encodeURIComponent(lower)}.pdb`,
            `/api/pdb/${encodeURIComponent(normalized)}`,
            `/api/pdb/${encodeURIComponent(lower)}`,
        ];
        for (const url of candidates) {
            try {
                const res = await fetch(url, {cache: 'no-store'});
                if (res.ok) { text = await res.text(); break; }
            } catch {}
        }
        if (!text) {
            this.setStatus(`Could not load ${normalized}. Put file at /static/assets/demo/${lower}.pdb or expose it through backend.`, 'error');
            return;
        }

        const proteinId = this._uniqueProteinId(lower);
        const result = this.context.getFeature('structure').loadText({text, proteinId, filename: `${normalized}.pdb`, format: 'pdb', replace: false, active: true});
        const model = result?.model || this.context.proteinSystem?.getProtein?.(proteinId) || this.context.activeModel;
        if (model) this.afterStructureLoaded(model, normalized, {forceBringToFront: true});
    }

    afterStructureLoaded(model, pdbId, {forceBringToFront = false} = {}) {
        if (!model?.id) return;
        if (this.proteinCollection.get(model.id)) {
            this.proteinCollection.setActive(model.id);
            this.workbench.placeWhenReady(model, {distance: 1.45, y: -0.08, resetRotation: false, frames: forceBringToFront ? 36 : 12});
            this.setStatus(`${pdbId || model.id} already loaded. Brought to front.`, 'ok');
            return;
        }
        const repIds = this.createDefaultRepresentations(model.id);
        this.proteinCollection.addProtein({model, pdbId, repIds});
        this.state.activeProteinId = model.id;
        this.workbench.placeWhenReady(model, {distance: 1.45, y: -0.08, resetRotation: false, frames: 36});
        this.setStatus(`${pdbId || model.id} loaded and placed in front.`, 'ok');
        this.syncMenuContext();
    }

    createDefaultRepresentations(proteinId) {
        return this.representationFeature.createDefaultRepresentations(proteinId, {visible: {ballstick: true, cartoon: false, line: false, surface: false}, colorScheme: 'chain'});
    }

    setActiveProtein(proteinId) { if (this.proteinCollection.setActive(proteinId)) this.setStatus(`Protein selected: ${proteinId}`, 'ok'); }

    showRepresentationOnly(type) {
        const record = this.proteinCollection.getActive?.();
        const repIds = record?.repIds || this.repIds || {};
        for (const key of ['ballstick','cartoon','line']) {
            const repId = repIds[key];
            if (repId) this.representationFeature.setVisible(repId, key === type);
        }
        this.refreshSummary();
    }

    toggleSurfaceOverlay() { this.surfaceController.buildFullSurface(); }
    bringProteinHere() { this.workbench.bringProteinHere(); }
    fitProtein() { this.workbench.fitProtein(); }

    applyColorScheme(scheme) { this.setStatus(`Color scheme ${scheme} reserved for current representation rebuild.`, 'info'); }
    applySelectionColor(color) { this.setStatus(`Selection color ${color} reserved.`, 'info'); }
    applyChainColor(color) { this.setStatus(`Chain color ${color} reserved.`, 'info'); }
    setSurfaceColor(color) { this.setStatus(`Surface color ${color} reserved.`, 'info'); }

    showActiveProtein() { const id = this.proteinCollection.activeProteinId; if (id) this.proteinCollection.setVisible(id, true); }
    hideActiveProtein() { const id = this.proteinCollection.activeProteinId; if (id) this.proteinCollection.setVisible(id, false); }
    showAllProteins() { this.proteinCollection.showAll(); }
    soloActiveProtein() { this.proteinCollection.hideNonActive(); }

    undo() { this.context.commandManager.undo(); this.refreshSummary(); }
    redo() { this.context.commandManager.redo(); this.refreshSummary(); }
    cancelCurrent() { this.modeManager.cancel(); }

    exportPDB() {
        const model = this.proteinCollection.getActive?.()?.model || this.context.activeModel;
        if (!model) return this.setStatus('No active protein.', 'error');
        const text = this.context.getFeature('export')?.exportPDB?.(model.id) || this.context.getFeature('export')?.exportPDB?.() || '';
        if (text) downloadText(text, `${model.id || 'provr'}_edited.pdb`, 'chemical/x-pdb');
    }
    exportIntent() { downloadText(JSON.stringify(this.context.designIntentStore?.summary?.() || {}, null, 2), 'provr_design_intent.json', 'application/json'); }
    cutRange(target) { this.context.getFeature('proteinDesign')?.cutFragment?.(target); }
    replaceRange(target) { this.context.getFeature('proteinDesign')?.replaceFragment?.(target, {fragmentId:'builtin_loop_6'}); }
    markDesignRegion(target) { this.context.getFeature('proteinDesign')?.markDesignRegion?.(target); }
    logDiagnostics() { console.log('[ProVR VR diagnostics]', JSON.parse(this.summaryEl?.textContent || '{}')); this.setStatus('Diagnostics logged to console.', 'ok'); }

    setStatus(message, kind = 'info') {
        this.state.status = message;
        if (this.statusEl) { this.statusEl.textContent = message; this.statusEl.dataset.kind = kind; }
        this.refreshSummary();
    }

    refreshSummary() {
        if (!this.summaryEl) return;
        this.summaryEl.textContent = JSON.stringify({state: this.state.toJSON(), proteins: this.proteinCollection?.summary?.() || null, workbench: this.workbench?.summary?.(), pdbIds: this.currentPdbIds, reps: this.context?.representationManager?.summary?.() || null, controllerRig: this.rig?.diagnostics?.() || null}, null, 2);
    }

    _uniqueProteinId(base) {
        let id = base;
        let n = 2;
        while (this.context.proteinSystem?.getProtein?.(id) || this.proteinCollection?.get?.(id)) id = `${base}_${n++}`;
        return id;
    }

    _bindDOM() {
        $('enterVRButton')?.addEventListener('click', () => this.enterVR());
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'm') this.inputRouter.toggleMenu();
            if (e.key.toLowerCase() === 'p') this.bringProteinHere();
            if (e.key === '+') this.viewScaleController.bigger();
            if (e.key === '-') this.viewScaleController.smaller();
        });
    }

    _bindEvents() {
        this.context.eventBus.on(EventTypes.STRUCTURE_LOADED, (evt) => {
            if (evt.model && !this.proteinCollection.get(evt.model.id)) this.afterStructureLoaded(evt.model, evt.proteinId || evt.model.id, {forceBringToFront: true});
        });
    }
}

const workspace = new ProVRVRWorkspace();
workspace.init();
