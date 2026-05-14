import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {StructureLoader} from '../domain/io/StructureLoader.js';
import {CommandManager} from '../core/command/CommandManager.js';
import {exportPDB, downloadText} from '../domain/io/PDBExporter.js';

import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {registerBallStickRepresentation} from '../representation/ballstick/registerBallStickRepresentation.js';
import {registerCartoonRepresentation} from '../representation/cartoon/registerCartoonRepresentation.js';
import {registerLineRepresentation} from '../representation/line/registerLineRepresentation.js';
import {registerSurfaceRepresentation} from '../representation/surface/registerSurfaceRepresentation.js';

import {VRMolecularViewport} from './VRMolecularViewport.js';
import {VRRayEditController} from './VRRayEditController.js';

class LocalEventBus {
    constructor() { this._listeners = new Map(); }
    on(type, fn) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(fn);
        return () => this._listeners.get(type)?.delete(fn);
    }
    emit(type, payload = {}) {
        const evt = typeof type === 'object' ? type : {type, ...payload};
        const eventType = evt.type || type;
        for (const fn of this._listeners.get(eventType) || []) fn(evt);
    }
}

const DEMO_PDB = `HEADER    PROVR VR DEMO STRUCTURE                        VR01
ATOM      1  N   ALA A   1      -7.200   0.200   0.000  1.00 10.00           N
ATOM      2  CA  ALA A   1      -6.000   0.000   0.200  1.00 10.00           C
ATOM      3  C   ALA A   1      -5.000   1.050   0.000  1.00 10.00           C
ATOM      4  O   ALA A   1      -5.150   2.250  -0.050  1.00 10.00           O
ATOM      5  CB  ALA A   1      -5.700  -1.250   1.000  1.00 10.00           C
ATOM      6  N   GLY A   2      -4.000   0.620  -0.050  1.00 10.00           N
ATOM      7  CA  GLY A   2      -2.950   1.540  -0.200  1.00 10.00           C
ATOM      8  C   GLY A   2      -1.650   0.820   0.250  1.00 10.00           C
ATOM      9  O   GLY A   2      -1.450  -0.400   0.120  1.00 10.00           O
ATOM     10  N   SER A   3      -0.700   1.650   0.800  1.00 10.00           N
ATOM     11  CA  SER A   3       0.600   1.100   1.240  1.00 10.00           C
ATOM     12  C   SER A   3       1.650   2.200   1.020  1.00 10.00           C
ATOM     13  O   SER A   3       1.420   3.380   1.250  1.00 10.00           O
ATOM     14  CB  SER A   3       0.550   0.620   2.700  1.00 10.00           C
ATOM     15  OG  SER A   3       1.770   0.010   3.040  1.00 10.00           O
ATOM     16  N   LYS B   1       4.000  -1.200   0.000  1.00 10.00           N
ATOM     17  CA  LYS B   1       5.300  -1.000   0.500  1.00 10.00           C
ATOM     18  C   LYS B   1       6.100  -2.250   0.050  1.00 10.00           C
ATOM     19  O   LYS B   1       5.690  -3.380  -0.180  1.00 10.00           O
ATOM     20  CB  LYS B   1       6.000   0.250  -0.070  1.00 10.00           C
ATOM     21  N   TYR B   2       7.260  -2.050  -0.050  1.00 10.00           N
ATOM     22  CA  TYR B   2       8.120  -3.200  -0.520  1.00 10.00           C
ATOM     23  C   TYR B   2       9.500  -2.750  -0.020  1.00 10.00           C
ATOM     24  O   TYR B   2       9.800  -1.570   0.150  1.00 10.00           O
CONECT    1    2
CONECT    2    3    5
CONECT    3    4    6
CONECT    6    7
CONECT    7    8
CONECT    8    9   10
CONECT   10   11
CONECT   11   12   14
CONECT   12   13
CONECT   14   15
CONECT   16   17
CONECT   17   18   20
CONECT   18   19   21
CONECT   21   22
CONECT   22   23
CONECT   23   24
END
`;

function $(id) { return document.getElementById(id); }
function asNumber(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

export class ProVRVROperatingSystem {
    constructor({viewportSelector = '#viewport', statusSelector = '#status', summarySelector = '#summary'} = {}) {
        this.viewportSelector = viewportSelector;
        this.statusEl = document.querySelector(statusSelector);
        this.summaryEl = document.querySelector(summarySelector);
        this.proteinSystem = new ProteinSystem({initialAtomCapacity: 600000});
        this.loader = new StructureLoader({proteinSystem: this.proteinSystem});
        this.eventBus = new LocalEventBus();
        this.viewport = null;
        this.manager = null;
        this.commandManager = null;
        this.vrEditor = null;
        this.currentProteinId = null;
        this.currentModel = null;
        this.repIds = {ballstick: null, cartoon: null, line: null, surface: null};
        this.visible = {ballstick: true, cartoon: false, line: false, surface: false};
        this.editScope = 'residue';
    }

    async init() {
        this.viewport = new VRMolecularViewport({container: this.viewportSelector, background: 0x05070d, cameraPosition: [0, 0, 120]});
        await this.viewport.init();

        this.manager = new RepresentationManager({proteinSystem: this.proteinSystem, eventBus: this.eventBus, scene: this.viewport.scene});
        registerBallStickRepresentation(this.manager);
        registerCartoonRepresentation(this.manager);
        registerLineRepresentation(this.manager);
        registerSurfaceRepresentation(this.manager);

        this.commandManager = new CommandManager({eventBus: this.eventBus, context: {proteinSystem: this.proteinSystem, eventBus: this.eventBus}});
        this.vrEditor = new VRRayEditController({
            viewport: this.viewport,
            proteinSystem: this.proteinSystem,
            representationManager: this.manager,
            commandManager: this.commandManager,
            eventBus: this.eventBus,
            getModel: () => this.currentModel,
            getScope: () => this.editScope,
            getResidueWindow: () => asNumber($('residueWindow')?.value, 5),
            getSurfaceRepresentation: () => this.getRep('surface'),
            onStatus: (msg) => this.setStatus(msg),
            onPreview: () => this.refreshSummary(),
            onCommit: () => this.refreshSummary(),
            onUIButton: (action) => this.handleSpatialButton(action),
        });
        this.vrEditor.enable();
        this.bindUI();
        this.viewport.start();
        this.setStatus('Ready. Load a structure, then Enter VR.');
        this.refreshSummary();
        return this;
    }

    bindUI() {
        $('structureFileInput')?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (file) await this.loadFile(file);
        });
        $('loadDemoButton')?.addEventListener('click', () => this.loadDemo());
        $('centerButton')?.addEventListener('click', () => this.center());
        $('enterVRButton')?.addEventListener('click', () => this.enterVR());
        $('exportButton')?.addEventListener('click', () => this.exportCurrentPDB());
        $('undoButton')?.addEventListener('click', () => this.undo());
        $('redoButton')?.addEventListener('click', () => this.redo());
        $('rebuildRepsButton')?.addEventListener('click', () => this.rebuildRepresentations());

        $('editScope')?.addEventListener('change', (e) => this.setEditScope(e.target.value));
        $('colorScheme')?.addEventListener('change', () => this.applyColorScheme());

        $('toggleBallStick')?.addEventListener('click', () => this.toggleRepresentation('ballstick'));
        $('toggleCartoon')?.addEventListener('click', () => this.toggleRepresentation('cartoon'));
        $('toggleLine')?.addEventListener('click', () => this.toggleRepresentation('line'));
        $('toggleSurface')?.addEventListener('click', () => this.toggleRepresentation('surface'));

        $('surfaceFullButton')?.addEventListener('click', () => this.buildSurface({mode: 'full'}));
        $('surfaceLayerButton')?.addEventListener('click', () => this.buildSurface({mode: 'layer'}));
        $('surfaceResetButton')?.addEventListener('click', () => {
            this.getRep('surface')?.resetAllSurfaceLayerTransforms?.();
            this.refreshSummary();
        });
    }

    async enterVR() {
        try {
            await this.viewport.enterVR();
            this.setStatus('Entered VR. Use controller trigger to pick and drag.');
        } catch (err) {
            this.setStatus(err.message || String(err), 'error');
        }
    }

    async loadFile(file) {
        try {
            const result = await this.loader.loadFile(file, {replace: true});
            this.afterStructureLoaded(result.model, result.proteinId, `Loaded ${file.name} (${result.format}).`);
        } catch (err) {
            this.setStatus(`Load failed: ${err.message}`, 'error');
            throw err;
        }
    }

    loadDemo() {
        const result = this.loader.loadText({text: DEMO_PDB, proteinId: 'provr_vr_demo', filename: 'provr_vr_demo.pdb', format: 'pdb', replace: true});
        this.afterStructureLoaded(result.model, result.proteinId, 'Loaded built-in ProVR VR demo structure.');
    }

    afterStructureLoaded(model, proteinId, message) {
        if (this.currentProteinId && this.currentProteinId !== proteinId) this.manager.removeByProtein(this.currentProteinId);
        this.currentModel = model;
        this.currentProteinId = proteinId;
        this.createDefaultRepresentations();
        this.center();
        this.setStatus(message);
        this.refreshSummary();
    }

    createDefaultRepresentations() {
        if (!this.currentModel) return;
        this.manager.removeByProtein(this.currentModel.id);
        const proteinId = this.currentModel.id;
        const colorScheme = $('colorScheme')?.value || 'chain';
        this.repIds.ballstick = this.manager.create({
            id: `vr_ballstick_${proteinId}`,
            type: 'ballstick', proteinId, visible: this.visible.ballstick,
            style: {colorScheme: colorScheme === 'sse' ? 'chain' : colorScheme, atomRadiusScale: 1.0, bondRadius: 0.075, opacity: 1.0},
            interaction: {pickable: true, pickAtoms: true, pickBonds: true, targetLevel: 'atom'},
        });
        this.repIds.cartoon = this.manager.create({
            id: `vr_cartoon_${proteinId}`,
            type: 'cartoon', proteinId, visible: this.visible.cartoon,
            style: {colorScheme: colorScheme === 'element' ? 'chain' : colorScheme, opacity: 0.98, scale: 1.0},
            interaction: {pickable: true, pickProxies: true, visualMeshPickable: true, targetLevel: 'residue'},
        });
        this.repIds.line = this.manager.create({
            id: `vr_line_${proteinId}`,
            type: 'line', proteinId, visible: this.visible.line,
            style: {colorScheme: colorScheme === 'sse' ? 'chain' : colorScheme, opacity: 0.78},
            interaction: {pickable: true, targetLevel: 'bond'},
        });
        this.repIds.surface = null;
        this.updateToggleButtons();
    }

    rebuildRepresentations() {
        if (!this.currentModel) return;
        const oldSurfaceSpec = this.getRep('surface')?.spec?.toJSON?.() || null;
        this.createDefaultRepresentations();
        if (oldSurfaceSpec) {
            oldSurfaceSpec.id = `vr_surface_${this.currentModel.id}`;
            oldSurfaceSpec.visible = this.visible.surface;
            this.repIds.surface = this.manager.create(oldSurfaceSpec);
        }
        this.refreshSummary();
    }

    applyColorScheme() {
        if (!this.currentModel) return;
        const colorScheme = $('colorScheme')?.value || 'chain';
        if (this.repIds.ballstick) this.manager.updateSpec(this.repIds.ballstick, {style: {colorScheme: colorScheme === 'sse' ? 'chain' : colorScheme}}, {rebuild: true});
        if (this.repIds.cartoon) this.manager.updateSpec(this.repIds.cartoon, {style: {colorScheme: colorScheme === 'element' ? 'chain' : colorScheme}}, {rebuild: true});
        if (this.repIds.line) this.manager.updateSpec(this.repIds.line, {style: {colorScheme: colorScheme === 'sse' ? 'chain' : colorScheme}}, {rebuild: true});
        this.refreshSummary();
    }

    buildSurface({mode = 'full'} = {}) {
        if (!this.currentModel) return;
        if (this.repIds.surface) this.manager.remove(this.repIds.surface);
        const proteinId = this.currentModel.id;
        const colorMode = $('surfaceColorMode')?.value || 'range';
        const opacity = asNumber($('surfaceOpacity')?.value, 0.46);
        const chain = ($('surfaceChain')?.value || '').trim();
        const range = ($('surfaceRange')?.value || '').trim();
        const layers = [];
        if (mode === 'full') {
            layers.push({id: 'full_complex', name: 'Full complex', scope: 'model', role: 'context', color: '#22d3ee', colorMode, opacity, pickable: true});
        } else {
            const parsed = this.parseRange(range);
            if (chain && parsed) layers.push({id: `chain_${chain}_${parsed.start}_${parsed.end}`, name: `Chain ${chain} ${parsed.start}-${parsed.end}`, scope: 'range', chainId: chain, start: parsed.start, end: parsed.end, role: 'focus', color: '#a78bfa', colorMode, opacity, pickable: true});
            else if (chain) layers.push({id: `chain_${chain}`, name: `Chain ${chain}`, scope: 'chains', chainIds: [chain], role: 'focus', color: '#4ade80', colorMode, opacity, pickable: true});
            else layers.push(...[...this.currentModel.chains.keys()].map((chainId, i) => ({id: `chain_${chainId}`, name: `Chain ${chainId}`, scope: 'chains', chainIds: [chainId], role: i === 0 ? 'focus' : 'context', color: ['#22d3ee', '#4ade80', '#f97316', '#a78bfa'][i % 4], colorMode, opacity, pickable: true})));
        }
        this.repIds.surface = this.manager.create({
            id: `vr_surface_${proteinId}`,
            type: 'surface', proteinId, visible: true,
            layers,
            style: {colorMode, opacity, probeRadius: 1.4, gridSpacing: 0.8, maxGridPoints: 220000, maxAtomsPerRange: 2400, livePreview: false, rebuildOnRigidTransform: false},
            interaction: {pickable: true, visualMeshPickable: true, targetLevel: 'residueRange'},
        });
        this.visible.surface = true;
        this.updateToggleButtons();
        this.setStatus(`Surface built: ${layers.map((l) => l.name).join(', ')}`);
        this.refreshSummary();
    }

    parseRange(text) {
        const m = String(text || '').match(/(-?\d+)\s*[-:]\s*(-?\d+)/);
        if (!m) return null;
        return {start: Number(m[1]), end: Number(m[2])};
    }

    toggleRepresentation(type) {
        if (type === 'surface' && !this.repIds.surface) {
            this.buildSurface({mode: 'full'});
            return;
        }
        this.visible[type] = !this.visible[type];
        if (this.repIds[type]) this.manager.setVisible(this.repIds[type], this.visible[type]);
        this.updateToggleButtons();
        this.refreshSummary();
    }

    setEditScope(scope) {
        this.editScope = scope;
        if ($('editScope')) $('editScope').value = scope;
        this.viewport.setUIButtonActive('scope:atom', scope === 'atom');
        this.viewport.setUIButtonActive('scope:residue', scope === 'residue');
        this.viewport.setUIButtonActive('scope:chain', scope === 'chain');
        this.viewport.setUIButtonActive('scope:protein', scope === 'protein');
        this.viewport.setUIButtonActive('surfaceInspect', scope === 'surfaceInspect');
        this.setStatus(`VR edit scope: ${scope}`);
    }

    handleSpatialButton(action) {
        if (action === 'ballstick') return this.toggleRepresentation('ballstick');
        if (action === 'cartoon') return this.toggleRepresentation('cartoon');
        if (action === 'surface') return this.toggleRepresentation('surface');
        if (action === 'undo') return this.undo();
        if (action === 'redo') return this.redo();
        if (action === 'center') return this.center();
        if (action === 'export') return this.exportCurrentPDB();
        if (action === 'surfaceInspect') return this.setEditScope('surfaceInspect');
        if (action.startsWith('scope:')) return this.setEditScope(action.slice('scope:'.length));
    }

    updateToggleButtons() {
        for (const type of ['ballstick', 'cartoon', 'line', 'surface']) {
            const id = {ballstick: 'toggleBallStick', cartoon: 'toggleCartoon', line: 'toggleLine', surface: 'toggleSurface'}[type];
            const btn = $(id);
            if (btn) btn.className = this.visible[type] ? 'active' : 'secondary';
            this.viewport?.setUIButtonActive?.(type, this.visible[type]);
        }
    }

    getRep(type) {
        const id = this.repIds[type];
        return id ? this.manager.get(id) : null;
    }

    center() {
        if (!this.currentModel) return;
        this.viewport.centerOnModel(this.currentModel);
        this.refreshSummary();
    }

    undo() {
        this.commandManager.undo();
        this.refreshSummary();
    }

    redo() {
        this.commandManager.redo();
        this.refreshSummary();
    }

    exportCurrentPDB() {
        if (!this.currentModel) return;
        const text = exportPDB(this.currentModel, {includeConect: true, includeHeader: true, endRecord: true});
        downloadText(text, `${this.currentModel.id || 'provr'}_vr_edited.pdb`, 'chemical/x-pdb');
    }

    setStatus(message, kind = 'ok') {
        if (!this.statusEl) return;
        this.statusEl.textContent = message;
        this.statusEl.dataset.kind = kind;
    }

    refreshSummary() {
        if (!this.summaryEl) return;
        const model = this.currentModel;
        const summary = {
            proteinId: model?.id || null,
            revision: model?.revision ?? null,
            atoms: model?.atoms?.size || 0,
            residues: model?.residues?.size || 0,
            chains: model ? [...model.chains.keys()] : [],
            editScope: this.editScope,
            visible: {...this.visible},
            undo: this.commandManager?.undoStack?.length || 0,
            redo: this.commandManager?.redoStack?.length || 0,
            representations: {
                ballstick: this.getRep('ballstick')?.summary?.() || null,
                cartoon: this.getRep('cartoon')?.summary?.() || null,
                line: this.getRep('line')?.summary?.() || null,
                surface: this.getRep('surface')?.summary?.() || null,
            },
            pickRegistry: this.manager?.context?.pickRegistry?.summary?.() || null,
        };
        this.summaryEl.textContent = JSON.stringify(summary, null, 2);
    }
}
