import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {StructureLoader} from '../domain/io/StructureLoader.js';
import {logLoadValidation} from './StructureLoadValidator.js';
import {EventBus} from '../core/event/EventBus.js';
import {CommandManager} from '../core/command/CommandManager.js';
import {exportPDB, downloadText} from '../domain/io/PDBExporter.js';
import {logEditValidation, snapshotAtoms} from './EditSystemValidator.js';
import {MolecularViewport} from '../core/app/MolecularViewport.js';
import {RepresentationContext} from '../representation/common/RepresentationContext.js';
import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {RepresentationRegistry} from '../representation/common/RepresentationRegistry.js';
import {registerLineRepresentation} from '../representation/line/registerLineRepresentation.js';
import {buildBondTopology} from '../representation/geometry/BondTopologyBuilder.js';
import {logRenderValidation} from './RenderSystemValidator.js';
import {MouseEditController} from '../representation/interaction/MouseEditController.js';

const proteinSystem = new ProteinSystem();
const eventBus = new EventBus();
const loader = new StructureLoader({proteinSystem});
const commandManager = new CommandManager({eventBus, context: {proteinSystem, eventBus}});
const state = {
    viewport: null,
    registry: null,
    context: null,
    manager: null,
    mouseController: null,
    last: null,
    baselineAtoms: null,
    baselinePDB: null
};

async function setupViewport() {
    if (state.viewport) return state.viewport;
    state.viewport = await new MolecularViewport({container: document.querySelector('#viewport')}).init();
    state.viewport.start();
    state.registry = new RepresentationRegistry();
    registerLineRepresentation(state.registry);
    state.context = new RepresentationContext({
        proteinSystem,
        eventBus,
        scene: state.viewport.scene,
        renderer: state.viewport.renderer
    });
    state.manager = new RepresentationManager({
        context: state.context,
        registry: state.registry,
        eventBus,
        autoBindEvents: true
    });
    state.mouseController = new MouseEditController({
        viewport: state.viewport, proteinSystem, eventBus, commandManager,
        getModel: () => state.last?.model || null,
        getMode: () => document.querySelector('#editMode')?.value || 'residue',
        getResidueWindow: () => Number(document.querySelector('#residueWindow')?.value || 5),
        pickRadiusWorld: Number(document.querySelector('#pickRadius')?.value || 1.35),
        onStatus: (message) => updateStatus(message),
        onCommit: (info) => {
            state.manager.flushDirty();
            const report = validate();
            updateStatus(`committed mouse ${info.target.kind}; moved ${info.moved.toFixed(3)}`, info.ok === false ? 'warn' : 'ok');
            console.log('[ProVR MouseEdit] commit:', info);
            console.log('[ProVR MouseEdit] validation:', report);
        }
    });
    return state.viewport;
}

function inferBaseId(filename = 'protein') {
    return String(filename || 'protein').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim().toLowerCase() || 'protein'
}

function makeUniqueProteinId(filename = 'protein') {
    const base = inferBaseId(filename);
    let id = base, i = 1;
    while (proteinSystem.getProtein(id)) {
        id = `${base}_${i}`;
        i++
    }
    return id
}

function updateStatus(message, kind = 'info') {
    const el = document.querySelector('#status');
    if (el) {
        el.textContent = message;
        el.dataset.kind = kind
    }
}

function updateSummaryBox(obj) {
    const el = document.querySelector('#summary');
    if (el) el.textContent = JSON.stringify(obj, null, 2)
}

function createLineRepresentation(model) {
    const repId = `line_${model.id}_${Date.now().toString(36)}`;
    state.manager.create({
        id: repId,
        type: 'line',
        proteinId: model.id,
        name: 'mouse editable line',
        filter: {protein: true, nucleic: true, heterogen: true, water: false, unknown: false},
        style: {colorScheme: 'element', opacity: 1},
        geometry: {bondTopology: {force: true, inferIfExistingBonds: true, includeHydrogen: true}},
        interaction: {pickable: true, targetLevel: 'bond'},
        visible: true
    });
    return repId
}

async function loadAndRenderFile(file) {
    await setupViewport();
    updateStatus(`loading ${file.name} ...`);
    const proteinId = makeUniqueProteinId(file.name);
    const {model, format} = await loader.loadFile(file, {proteinId, replace: false});
    const loadReport = logLoadValidation(model, {sampleSize: 8});
    buildBondTopology(model, {force: true, inferIfExistingBonds: true, includeHydrogen: true});
    const lineRepId = createLineRepresentation(model);
    const lineRep = state.manager.get(lineRepId);
    state.viewport.centerOnModel(model);
    const renderReport = logRenderValidation({model, viewport: state.viewport, manager: state.manager, lineRepId});
    state.last = {file, proteinId, format, model, lineRepId, lineRep, loadReport, renderReport};
    state.baselineAtoms = snapshotAtoms(model, [...model.atoms.keys()].slice(0, 20));
    state.baselinePDB = exportPDB(model);
    state.mouseController.enable();
    installGlobals();
    updateSummaryBox({
        proteinId,
        format,
        load: loadReport.summary,
        render: renderReport.summary,
        mouseEditing: 'enabled'
    });
    updateStatus(`loaded ${proteinId}; mouse editing enabled`, 'ok');
    console.log('[ProVR MouseEdit] model:', model);
    console.log('[ProVR MouseEdit] mouse controller:', state.mouseController);
    return state.last;
}

function exportCurrentPDB({download = false} = {}) {
    const model = state.last?.model;
    if (!model) return '';
    const text = exportPDB(model);
    if (download) downloadText(text, `${model.id}_mouse_edited.pdb`);
    return text
}

function printFirstAtoms(limit = 10) {
    const model = state.last?.model;
    if (!model) return [];
    const rows = snapshotAtoms(model, [...model.atoms.keys()].slice(0, limit)).map(row => ({
        atomId: row.atomId,
        atomName: row.atomName,
        residueName: row.residueName,
        chainId: row.chainId,
        x: row.position?.[0],
        y: row.position?.[1],
        z: row.position?.[2]
    }));
    console.table(rows);
    return rows
}

function validate() {
    const model = state.last?.model;
    if (!model) return null;
    const afterAtoms = snapshotAtoms(model, [...model.atoms.keys()].slice(0, 20));
    const afterPDB = exportPDB(model);
    const report = logEditValidation({
        model,
        beforeAtoms: state.baselineAtoms,
        afterAtoms,
        beforePDB: state.baselinePDB,
        afterPDB,
        commandManager,
        lineRep: state.last.lineRep
    });
    updateSummaryBox({
        proteinId: state.last.proteinId,
        edit: report.summary,
        mode: document.querySelector('#editMode')?.value,
        pickRadius: Number(document.querySelector('#pickRadius')?.value || 1.35)
    });
    return report
}

function undo() {
    commandManager.undo();
    state.manager.flushDirty();
    validate()
}

function redo() {
    commandManager.redo();
    state.manager.flushDirty();
    validate()
}

function installGlobals() {
    window.provr = window.provr || {};
    window.provr.mouseEdit = {
        proteinSystem,
        eventBus,
        commandManager,
        viewport: state.viewport,
        manager: state.manager,
        context: state.context,
        mouseController: state.mouseController,
        get last() {
            return state.last
        },
        get model() {
            return state.last?.model || null
        },
        enable: () => state.mouseController?.enable(),
        disable: () => state.mouseController?.disable(),
        setPickRadius: (v) => state.mouseController?.setPickRadiusWorld(v),
        undo,
        redo,
        exportPDB: exportCurrentPDB,
        downloadPDB: () => exportCurrentPDB({download: true}),
        printFirstAtoms,
        validate
    }
}

function bindUI() {
    installGlobals();
    document.querySelector('#structureFileInput').addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await loadAndRenderFile(file)
        } catch (err) {
            console.error(err);
            updateStatus(`failed: ${err.message}`, 'error')
        }
    });
    document.querySelector('#enableMouseButton').addEventListener('click', () => state.mouseController?.enable());
    document.querySelector('#disableMouseButton').addEventListener('click', () => state.mouseController?.disable());
    document.querySelector('#undoButton').addEventListener('click', undo);
    document.querySelector('#redoButton').addEventListener('click', redo);
    document.querySelector('#exportButton').addEventListener('click', () => exportCurrentPDB({download: true}));
    document.querySelector('#validateButton').addEventListener('click', validate);
    document.querySelector('#centerButton').addEventListener('click', () => {
        if (state.last?.model) state.viewport.centerOnModel(state.last.model)
    });
    document.querySelector('#pickRadius').addEventListener('change', e => state.mouseController?.setPickRadiusWorld(e.target.value));
    updateStatus('ready');
}

bindUI();
