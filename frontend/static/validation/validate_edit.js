import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {StructureLoader} from '../domain/io/StructureLoader.js';
import {logLoadValidation} from './StructureLoadValidator.js';
import {EventBus} from '../core/event/EventBus.js';
import {CommandManager} from '../core/command/CommandManager.js';
import {TransformAtomSetCommand} from '../core/command/TransformAtomSetCommand.js';
import {TransformResidueCommand} from '../core/command/TransformResidueCommand.js';
import {TransformResidueRangeCommand} from '../core/command/TransformResidueRangeCommand.js';
import {exportPDB, downloadText} from '../domain/io/PDBExporter.js';
import {logEditValidation, snapshotAtoms} from './EditSystemValidator.js';

import {MolecularViewport} from '../core/app/MolecularViewport.js';
import {RepresentationContext} from '../representation/common/RepresentationContext.js';
import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {RepresentationRegistry} from '../representation/common/RepresentationRegistry.js';
import {registerLineRepresentation} from '../representation/line/registerLineRepresentation.js';
import {buildBondTopology} from '../representation/geometry/BondTopologyBuilder.js';
import {logRenderValidation} from './RenderSystemValidator.js';

const proteinSystem = new ProteinSystem();
const eventBus = new EventBus();
const loader = new StructureLoader({proteinSystem});
const commandManager = new CommandManager({
    eventBus,
    context: {proteinSystem, eventBus},
});

const state = {
    viewport: null,
    registry: null,
    context: null,
    manager: null,
    last: null,
    beforeSnapshot: null,
    beforePDB: null,
};

async function setupViewport() {
    if (state.viewport) return state.viewport;

    const container = document.querySelector('#viewport');
    state.viewport = await new MolecularViewport({container}).init();
    state.viewport.start();

    state.registry = new RepresentationRegistry();
    registerLineRepresentation(state.registry);

    state.context = new RepresentationContext({
        proteinSystem,
        eventBus,
        scene: state.viewport.scene,
        renderer: state.viewport.renderer,
    });

    state.manager = new RepresentationManager({
        context: state.context,
        registry: state.registry,
        eventBus,
        autoBindEvents: true,
    });

    return state.viewport;
}

function inferBaseId(filename = 'protein') {
    return String(filename || 'protein')
        .split(/[\\/]/)
        .pop()
        .replace(/\.[^.]+$/, '')
        .trim()
        .toLowerCase() || 'protein';
}

function makeUniqueProteinId(filename = 'protein') {
    const base = inferBaseId(filename);
    let id = base;
    let i = 1;
    while (proteinSystem.getProtein(id)) {
        id = `${base}_${i}`;
        i += 1;
    }
    return id;
}

function updateStatus(message, kind = 'info') {
    const el = document.querySelector('#status');
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
}

function updateSummaryBox(obj) {
    const el = document.querySelector('#summary');
    if (!el) return;
    el.textContent = JSON.stringify(obj, null, 2);
}

function readTranslation() {
    return [
        Number(document.querySelector('#tx')?.value || 0),
        Number(document.querySelector('#ty')?.value || 0),
        Number(document.querySelector('#tz')?.value || 0),
    ];
}

function firstAtomId(model) {
    return [...model.atoms.keys()][0] ?? null;
}

function firstResidue(model) {
    return [...model.residues.values()][0] ?? null;
}

function firstChain(model) {
    return [...model.chains.values()][0] ?? null;
}

function firstResidueRange(model, count = 5) {
    const chain = firstChain(model);
    if (!chain) return [];
    return (chain.residueIds || []).slice(0, count).filter((id) => model.residues.has(id));
}

function atomIdsFromResidues(model, residueIds) {
    const ids = [];
    for (const residueId of residueIds) {
        const residue = model.residues.get(residueId);
        if (residue?.atomIds) ids.push(...residue.atomIds);
    }
    return ids;
}

function createLineRepresentation(model) {
    const repId = `line_${model.id}_${Date.now().toString(36)}`;
    state.manager.create({
        id: repId,
        type: 'line',
        proteinId: model.id,
        name: 'editable line',
        filter: {
            protein: true,
            nucleic: true,
            heterogen: true,
            water: false,
            unknown: false,
        },
        style: {
            colorScheme: 'element',
            opacity: 1,
        },
        geometry: {
            bondTopology: {
                force: true,
                inferIfExistingBonds: true,
                includeHydrogen: true,
            },
        },
        interaction: {
            pickable: true,
            targetLevel: 'bond',
        },
        visible: true,
    });
    return repId;
}

async function loadAndRenderFile(file) {
    await setupViewport();
    updateStatus(`loading ${file.name} ...`);

    const proteinId = makeUniqueProteinId(file.name);
    const {model, format} = await loader.loadFile(file, {proteinId, replace: false});

    const loadReport = logLoadValidation(model, {sampleSize: 8});
    buildBondTopology(model, {
        force: true,
        inferIfExistingBonds: true,
        includeHydrogen: true,
    });

    const lineRepId = createLineRepresentation(model);
    const lineRep = state.manager.get(lineRepId);
    state.viewport.centerOnModel(model);

    const renderReport = logRenderValidation({
        model,
        viewport: state.viewport,
        manager: state.manager,
        lineRepId,
    });

    state.last = {
        file,
        proteinId,
        format,
        model,
        loadReport,
        lineRepId,
        lineRep,
        renderReport,
        lastEditReport: null,
    };

    state.beforeSnapshot = snapshotAtoms(model, [...model.atoms.keys()].slice(0, 20));
    state.beforePDB = exportPDB(model);

    installGlobals();

    updateSummaryBox({
        proteinId,
        format,
        load: loadReport.summary,
        render: renderReport.summary,
    });

    updateStatus(`loaded and rendered ${proteinId}`, 'ok');
    console.log('[ProVR Edit] model:', model);
    console.log('[ProVR Edit] line representation:', lineRep);

    return state.last;
}

function executeCommand(command, {label = 'command'} = {}) {
    if (!state.last?.model) {
        console.warn('No model loaded.');
        return null;
    }

    const model = state.last.model;
    const trackedAtomIds = [...model.atoms.keys()].slice(0, 20);
    const beforeAtoms = snapshotAtoms(model, trackedAtomIds);
    const beforePDB = exportPDB(model);

    const ok = commandManager.execute(command);
    state.manager.flushDirty();

    const afterAtoms = snapshotAtoms(model, trackedAtomIds);
    const afterPDB = exportPDB(model);

    const report = logEditValidation({
        model,
        beforeAtoms,
        afterAtoms,
        beforePDB,
        afterPDB,
        commandManager,
        lineRep: state.last.lineRep,
    });

    state.last.lastEditReport = report;
    updateSummaryBox({
        proteinId: state.last.proteinId,
        edit: report.summary,
    });
    updateStatus(ok === false ? `${label} failed` : `${label} executed`, ok === false ? 'warn' : 'ok');
    return report;
}

function moveAtom(atomId, translation = readTranslation()) {
    const model = state.last?.model;
    if (!model) return null;
    const id = atomId ?? firstAtomId(model);
    if (id == null) return null;

    return executeCommand(new TransformAtomSetCommand({
        proteinId: model.id,
        atomIds: [id],
        translation,
        source: 'console',
        description: `Move atom ${id}`,
    }), {label: `move atom ${id}`});
}

function moveResidue(residueId = null, translation = readTranslation()) {
    const model = state.last?.model;
    if (!model) return null;

    const residue = residueId ? model.residues.get(residueId) : firstResidue(model);
    if (!residue) return null;

    return executeCommand(new TransformResidueCommand({
        proteinId: model.id,
        residueId: residue.id,
        translation,
        source: 'console',
        description: `Move residue ${residue.id}`,
    }), {label: `move residue ${residue.id}`});
}

function moveResidueRange(count = 5, translation = readTranslation()) {
    const model = state.last?.model;
    if (!model) return null;

    const residueIds = firstResidueRange(model, count);
    if (!residueIds.length) return null;

    return executeCommand(new TransformResidueRangeCommand({
        proteinId: model.id,
        residueIds,
        translation,
        source: 'console',
        description: `Move first ${residueIds.length} residues`,
    }), {label: `move first ${residueIds.length} residues`});
}

function undo() {
    commandManager.undo();
    state.manager.flushDirty();
    validate();
}

function redo() {
    commandManager.redo();
    state.manager.flushDirty();
    validate();
}

function exportCurrentPDB({download = false} = {}) {
    const model = state.last?.model;
    if (!model) return '';
    const text = exportPDB(model);
    if (download) downloadText(text, `${model.id}_edited.pdb`);
    return text;
}

function printFirstAtoms(limit = 10) {
    const model = state.last?.model;
    if (!model) return [];
    const rows = snapshotAtoms(model, [...model.atoms.keys()].slice(0, limit)).map((row) => ({
        atomId: row.atomId,
        atomName: row.atomName,
        residueName: row.residueName,
        chainId: row.chainId,
        x: row.position?.[0],
        y: row.position?.[1],
        z: row.position?.[2],
    }));
    console.table(rows);
    return rows;
}

function printFirstResidues(limit = 10) {
    const model = state.last?.model;
    if (!model) return [];
    const rows = [...model.residues.values()].slice(0, limit).map((residue) => ({
        residueId: residue.id,
        name: residue.name,
        chainId: residue.chainId,
        label: residue.label,
        atomCount: residue.atomIds.length,
        kind: residue.kind,
    }));
    console.table(rows);
    return rows;
}

function validate() {
    const model = state.last?.model;
    if (!model) {
        console.warn('No model loaded.');
        return null;
    }

    const afterAtoms = snapshotAtoms(model, [...model.atoms.keys()].slice(0, 20));
    const afterPDB = exportPDB(model);

    const report = logEditValidation({
        model,
        beforeAtoms: state.beforeSnapshot,
        afterAtoms,
        beforePDB: state.beforePDB,
        afterPDB,
        commandManager,
        lineRep: state.last.lineRep,
    });

    updateSummaryBox({
        proteinId: state.last.proteinId,
        edit: report.summary,
    });
    return report;
}

function installGlobals() {
    window.provr = window.provr || {};
    window.provr.edit = {
        proteinSystem,
        loader,
        eventBus,
        commandManager,
        viewport: state.viewport,
        manager: state.manager,
        context: state.context,
        get last() {
            return state.last;
        },
        get model() {
            return state.last?.model || null;
        },
        moveAtom,
        moveFirstAtom: (translation = readTranslation()) => moveAtom(null, translation),
        moveResidue,
        moveFirstResidue: (translation = readTranslation()) => moveResidue(null, translation),
        moveFirstResidueRange: moveResidueRange,
        undo,
        redo,
        exportPDB: exportCurrentPDB,
        downloadPDB: () => exportCurrentPDB({download: true}),
        validate,
        printFirstAtoms,
        printFirstResidues,
        atomIdsFromResidues: (residueIds) => atomIdsFromResidues(state.last?.model, residueIds),
    };
}

function bindUI() {
    installGlobals();

    const input = document.querySelector('#structureFileInput');
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            await loadAndRenderFile(file);
        } catch (err) {
            console.error(err);
            updateStatus(`failed: ${err.message}`, 'error');
        }
    });

    document.querySelector('#moveFirstAtomButton').addEventListener('click', () => moveAtom());
    document.querySelector('#moveFirstResidueButton').addEventListener('click', () => moveResidue());
    document.querySelector('#moveFirstRangeButton').addEventListener('click', () => moveResidueRange(5));
    document.querySelector('#undoButton').addEventListener('click', undo);
    document.querySelector('#redoButton').addEventListener('click', redo);
    document.querySelector('#exportButton').addEventListener('click', () => exportCurrentPDB({download: true}));
    document.querySelector('#validateButton').addEventListener('click', validate);
    document.querySelector('#centerButton').addEventListener('click', () => {
        if (state.last?.model) state.viewport.centerOnModel(state.last.model);
    });

    updateStatus('ready');
}

bindUI();
