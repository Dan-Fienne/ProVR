import {MolecularViewport} from '../core/app/MolecularViewport.js';
import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {StructureLoader} from '../domain/io/StructureLoader.js';
import {PDBParser} from '../domain/io/PDBParser.js';
import {MMCIFParser} from '../domain/io/MMCIFParser.js';
import {exportPDB, downloadText} from '../domain/io/PDBExporter.js';

import {EventBus} from '../core/event/EventBus.js';
import {EventTypes} from '../core/event/EventTypes.js';
import {CommandManager} from '../core/command/CommandManager.js';

import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {registerBallStickRepresentation} from '../representation/ballstick/registerBallStickRepresentation.js';
import {buildBondTopology} from '../representation/geometry/BondTopologyBuilder.js';
import {MouseEditController} from '../representation/interaction/MouseEditController.js';

import {validateLoadedStructure, logLoadValidation} from './StructureLoadValidator.js';
import {validateEditSystem, snapshotAtoms} from './EditSystemValidator.js';
import {logBallStickValidation, validateBallStickRepresentation} from './BallStickRepresentationValidator.js';

const $ = (id) => document.getElementById(id);

const DEMO_PDB = `HEADER    PROVR BALLSTICK VALIDATION DEMO
ATOM      1  N   ALA A   1      -1.458   0.000   0.000  1.00 20.00           N
ATOM      2  CA  ALA A   1      -0.100   0.520   0.000  1.00 20.00           C
ATOM      3  C   ALA A   1       1.050  -0.430   0.000  1.00 20.00           C
ATOM      4  O   ALA A   1       1.000  -1.650   0.000  1.00 20.00           O
ATOM      5  CB  ALA A   1      -0.030   1.420   1.230  1.00 20.00           C
ATOM      6  N   GLY A   2       2.110   0.180   0.000  1.00 20.00           N
ATOM      7  CA  GLY A   2       3.290  -0.650   0.000  1.00 20.00           C
ATOM      8  C   GLY A   2       4.540   0.230   0.000  1.00 20.00           C
ATOM      9  O   GLY A   2       4.490   1.450   0.000  1.00 20.00           O
CONECT    1    2
CONECT    2    3    5
CONECT    3    4    6
CONECT    6    7
CONECT    7    8
CONECT    8    9
END
`;

const state = {
    viewport: null,
    proteinSystem: null,
    eventBus: null,
    commandManager: null,
    loader: null,
    manager: null,
    mouseEdit: null,

    proteinId: null,
    model: null,
    repId: null,

    beforeEditAtoms: null,
    beforeEditPDB: null,
    lastEvents: [],
    lastCommit: null,
};

function setStatus(text, kind = 'ok') {
    const el = $('status');
    if (!el) return;
    el.textContent = String(text);
    el.dataset.kind = kind;
}

function setSummary(value) {
    const el = $('summary');
    if (!el) return;
    el.textContent = JSON.stringify(value, null, 2);
}

function groupLog(title, value) {
    console.group(title);
    console.log(value);
    console.groupEnd();
}

function uniqueProteinId(filename = 'protein') {
    const base = String(filename || 'protein')
        .split(/[\\/]/).pop()
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .toLowerCase() || 'protein';
    return `${base}_${Date.now().toString(36)}`;
}

function currentRep() {
    return state.repId ? state.manager.get(state.repId) : null;
}

function currentPDB() {
    if (!state.model) return '';
    return exportPDB(state.model, {
        includeHeader: true,
        includeConect: true,
        endRecord: true,
    });
}

function currentSummary() {
    const rep = currentRep();
    const ballstick = rep?.summary?.() || rep?.root?.userData?.summary || null;

    return {
        proteinId: state.proteinId,
        repId: state.repId,
        model: state.model ? {
            atoms: state.model.atoms.size,
            residues: state.model.residues.size,
            chains: state.model.chains.size,
            revision: state.model.revision,
            bondTopology: state.model.info?.bondTopology?.summary || null,
        } : null,
        ballstick,
        pickRegistry: state.manager?.context?.pickRegistry?.summary?.() || null,
        command: {
            undoStackSize: state.commandManager?.undoStack?.length ?? null,
            redoStackSize: state.commandManager?.redoStack?.length ?? null,
        },
        mouseEdit: {
            enabled: !!state.mouseEdit?.enabled,
            mode: $('editMode')?.value || 'atom',
            residueWindow: Number($('residueWindow')?.value || 5),
            lastCommit: state.lastCommit ? {
                ok: state.lastCommit.ok,
                moved: state.lastCommit.moved,
                translation: state.lastCommit.translation,
                targetKind: state.lastCommit.target?.kind,
                atomCount: state.lastCommit.target?.atomIds?.length,
            } : null,
        },
        recentEvents: state.lastEvents.slice(-10),
    };
}

function validate(label = 'manual') {
    const afterPDB = currentPDB();

    const loadReport = state.model ? validateLoadedStructure(state.model) : {ok: false, issues: ['model is missing']};

    const ballstickReport = validateBallStickRepresentation({
        model: state.model,
        viewport: state.viewport,
        manager: state.manager,
        repId: state.repId,
        commandManager: state.commandManager,
        beforePDB: state.beforeEditPDB,
        afterPDB,
    });

    const editReport = validateEditSystem({
        model: state.model,
        beforeAtoms: state.beforeEditAtoms,
        afterAtoms: state.model && state.beforeEditAtoms
            ? snapshotAtoms(state.model, state.beforeEditAtoms.map((row) => row.atomId))
            : null,
        beforePDB: state.beforeEditPDB,
        afterPDB,
        commandManager: state.commandManager,
        lineRep: currentRep(),
    });

    const report = {
        label,
        ok: loadReport.ok && ballstickReport.ok,
        load: loadReport,
        ballstick: ballstickReport,
        edit: editReport,
        summary: currentSummary(),
    };

    setSummary(report.summary);

    console.group(`[ProVR BallStick Validate] ${label} / ${report.ok ? 'OK' : 'ISSUES'}`);
    console.log('summary:', report.summary);
    console.log('load:', loadReport);
    console.log('ballstick:', ballstickReport);
    console.log('edit:', editReport);
    if (!report.ok) console.warn('issues:', {
        load: loadReport.issues,
        ballstick: ballstickReport.issues,
        edit: editReport.issues,
    });
    console.groupEnd();

    if (report.ok) {
        setStatus(`validation ok: ${label}`, 'ok');
    } else {
        setStatus(`validation has issues: ${label}`, 'warn');
    }

    return report;
}

async function init() {
    state.proteinSystem = new ProteinSystem();
    state.eventBus = new EventBus();
    state.commandManager = new CommandManager({
        eventBus: state.eventBus,
        context: {
            proteinSystem: state.proteinSystem,
            eventBus: state.eventBus,
        },
    });
    state.loader = new StructureLoader({proteinSystem: state.proteinSystem});

    state.viewport = new MolecularViewport({
        container: '#viewport',
        background: 0x111827,
        enableControls: true,
        cameraPosition: [0, 0, 24],
    });

    await state.viewport.init();
    state.viewport.start();

    state.manager = new RepresentationManager({
        proteinSystem: state.proteinSystem,
        eventBus: state.eventBus,
        scene: state.viewport.scene,
    });
    registerBallStickRepresentation(state.manager);

    for (const type of Object.values(EventTypes)) {
        state.eventBus.on(type, (evt) => {
            state.lastEvents.push({
                type,
                proteinId: evt?.proteinId,
                atomIds: evt?.atomIds,
                residueIds: evt?.residueIds,
                chainIds: evt?.chainIds,
                phase: evt?.phase,
                source: evt?.source,
                revision: evt?.revision,
            });
            if (state.lastEvents.length > 80) state.lastEvents.shift();
            console.debug('[ProVR:event]', type, evt);
        });
    }

    bindUI();
    exposeConsoleHelpers();

    setStatus('ready: upload PDB/CIF or call provr.ballstick.loadDemo()', 'ok');
    setSummary({ready: true});
    console.log('[ProVR BallStick] ready');
}

function bindUI() {
    $('structureFileInput')?.addEventListener('change', async (evt) => {
        const file = evt.target.files?.[0];
        if (!file) return;
        await loadFile(file);
    });

    $('enableMouseButton')?.addEventListener('click', () => enableMouseEdit());
    $('disableMouseButton')?.addEventListener('click', () => disableMouseEdit());
    $('undoButton')?.addEventListener('click', () => {
        state.commandManager.undo();
        validate('after-undo');
    });
    $('redoButton')?.addEventListener('click', () => {
        state.commandManager.redo();
        validate('after-redo');
    });
    $('exportButton')?.addEventListener('click', () => downloadCurrentPDB());
    $('validateButton')?.addEventListener('click', () => validate('manual-button'));
    $('centerButton')?.addEventListener('click', () => {
        if (state.model) state.viewport.centerOnModel(state.model);
    });

    // Optional button. The provided HTML patch includes it; old HTML can omit it safely.
    $('loadDemoButton')?.addEventListener('click', () => loadText(DEMO_PDB, 'demo.pdb'));

    $('pickRadius')?.addEventListener('change', () => {
        const v = Number($('pickRadius').value) || 1.35;
        state.mouseEdit?.setPickRadiusWorld?.(v);
    });
}

async function loadFile(file) {
    const text = await file.text();
    await loadText(text, file.name);
}

async function loadText(text, filename = 'structure.pdb') {
    disableMouseEdit();

    if (state.repId) {
        state.manager.remove(state.repId);
        state.repId = null;
    }

    const proteinId = uniqueProteinId(filename);
    const {model} = state.loader.loadText({
        text,
        filename,
        proteinId,
        format: 'auto',
        replace: true,
    });

    state.proteinId = proteinId;
    state.model = model;

    const topology = buildBondTopology(model, {
        force: false,
        inferIfExistingBonds: true,
        inferProteinInternal: true,
        inferProteinPeptide: true,
        inferNucleicInternal: true,
        inferNucleicBackbone: true,
        inferHeterogenInternal: true,
        includeHydrogen: true,
    });

    console.log('[ProVR BallStick] bond topology:', topology);
    logLoadValidation(model);

    const repId = `ballstick_validation_${proteinId}`;
    state.repId = state.manager.create({
        id: repId,
        type: 'ballstick',
        proteinId,
        name: 'BallStick validation',
        filter: {
            protein: true,
            nucleic: true,
            heterogen: true,
            water: false,
            unknown: false,
        },
        style: {
            colorScheme: $('colorScheme')?.value || 'element',
            atomRadiusScale: Number($('atomRadiusScale')?.value || 1.0),
            bondRadius: Number($('bondRadius')?.value || 0.075),
            halfBondColor: true,
            opacity: 1.0,
        },
        geometry: {
            atomSegments: 20,
            bondSegments: 12,
            bondInsetRatio: 0.62,
            stretchedBondFactor: 2.25,
            bondTopology: {
                force: false,
                inferIfExistingBonds: true,
                inferProteinInternal: true,
                inferProteinPeptide: true,
                inferNucleicInternal: true,
                inferNucleicBackbone: true,
                inferHeterogenInternal: true,
                includeHydrogen: true,
            },
        },
        interaction: {
            pickable: true,
            pickAtoms: true,
            pickBonds: true,
            targetLevel: 'atom',
        },
        visible: true,
    });

    state.viewport.centerOnModel(model);

    const atomIds = [...model.atoms.keys()];
    state.beforeEditAtoms = snapshotAtoms(model, atomIds);
    state.beforeEditPDB = currentPDB();

    logBallStickValidation({
        model,
        viewport: state.viewport,
        manager: state.manager,
        repId: state.repId,
        commandManager: state.commandManager,
        beforePDB: state.beforeEditPDB,
        afterPDB: currentPDB(),
    });

    validate('after-load');
    setStatus(`loaded ${filename}: ${model.atoms.size} atoms, rep=${state.repId}`, 'ok');
}

function enableMouseEdit() {
    if (!state.model) {
        setStatus('load a structure first', 'warn');
        return;
    }

    disableMouseEdit();

    state.mouseEdit = new MouseEditController({
        viewport: state.viewport,
        proteinSystem: state.proteinSystem,
        eventBus: state.eventBus,
        commandManager: state.commandManager,
        getModel: () => state.model,
        getMode: () => $('editMode')?.value || 'atom',
        getResidueWindow: () => Number($('residueWindow')?.value || 5),
        pickRadiusWorld: Number($('pickRadius')?.value || 1.35),
        onStatus: (message) => {
            setStatus(message, 'ok');
            console.log('[ProVR mouseEdit]', message);
        },
        onPreview: (payload) => {
            console.debug('[ProVR preview]', payload);
        },
        onCommit: (payload) => {
            state.lastCommit = payload;
            console.log('[ProVR commit]', payload);
            validate('after-commit');
        },
    });

    state.mouseEdit.enable();
    setStatus('mouse editing enabled: drag atom/residue/range in viewport', 'ok');
}

function disableMouseEdit() {
    if (!state.mouseEdit) return;
    state.mouseEdit.disable();
    state.mouseEdit = null;
}

function downloadCurrentPDB() {
    if (!state.model) {
        setStatus('no model to export', 'warn');
        return;
    }
    downloadText(currentPDB(), `${state.proteinId}_edited.pdb`, 'chemical/x-pdb');
}

function printFirstAtoms(n = 10) {
    if (!state.model) return [];
    const rows = snapshotAtoms(state.model, [...state.model.atoms.keys()].slice(0, n));
    console.table(rows);
    return rows;
}

function exportPDBToConsole() {
    const pdb = currentPDB();
    console.log(pdb);
    return pdb;
}

function exposeConsoleHelpers() {
    window.provr = window.provr || {};
    window.provr.ballstick = {
        state,
        loadText,
        loadDemo: () => loadText(DEMO_PDB, 'demo.pdb'),
        validate,
        summary: currentSummary,
        printSummary: () => {
            const s = currentSummary();
            groupLog('[ProVR BallStick Summary]', s);
            setSummary(s);
            return s;
        },
        printFirstAtoms,
        exportPDB: exportPDBToConsole,
        downloadPDB: downloadCurrentPDB,
        undo: () => {
            state.commandManager.undo();
            return validate('console-undo');
        },
        redo: () => {
            state.commandManager.redo();
            return validate('console-redo');
        },
        enableMouseEdit,
        disableMouseEdit,
    };
}

init().catch((err) => {
    console.error('[ProVR BallStick] init failed', err);
    setStatus(`init failed: ${err.message}`, 'error');
});
