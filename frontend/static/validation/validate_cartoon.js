import {MolecularViewport} from '../core/app/MolecularViewport.js';
import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {StructureLoader} from '../domain/io/StructureLoader.js';
import {exportPDB, downloadText} from '../domain/io/PDBExporter.js';

import {EventBus} from '../core/event/EventBus.js';
import {EventTypes} from '../core/event/EventTypes.js';
import {CommandManager} from '../core/command/CommandManager.js';

import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {registerCartoonRepresentation} from '../representation/cartoon/registerCartoonRepresentation.js';
import {registerBallStickRepresentation} from '../representation/ballstick/registerBallStickRepresentation.js';
import {MouseEditController} from '../representation/interaction/MouseEditController.js';

import {SSEType} from '../domain/protein/ProteinConstants.js';
import {validateLoadedStructure} from './StructureLoadValidator.js';
import {validateCartoonRepresentation, logCartoonValidation} from './CartoonRepresentationValidator.js';

const $ = (id) => document.getElementById(id);

function pdbLine(record, fields = '') {
    return `${record}${fields}`.padEnd(80);
}

function atomLine(serial, atomName, resName, chainId, seq, x, y, z, element) {
    const rec = 'ATOM'.padEnd(6);
    const s = String(serial).padStart(5);
    const name = String(atomName).padStart(4);
    const res = String(resName).padStart(3);
    const chain = String(chainId || 'A').slice(0, 1);
    const seqText = String(seq).padStart(4);
    const xx = Number(x).toFixed(3).padStart(8);
    const yy = Number(y).toFixed(3).padStart(8);
    const zz = Number(z).toFixed(3).padStart(8);
    const el = String(element || atomName[0] || 'C').toUpperCase().padStart(2);
    return `${rec}${s} ${name} ${res} ${chain}${seqText}    ${xx}${yy}${zz}  1.00 20.00          ${el}`.padEnd(80);
}

function helixLine(startRes, startChain, startSeq, endRes, endChain, endSeq) {
    const line = Array(80).fill(' ');
    function put(start1, text) {
        for (let i = 0; i < text.length; i += 1) line[start1 - 1 + i] = text[i];
    }
    put(1, 'HELIX ');
    put(8, '1'.padStart(3));
    put(12, 'H1'.padEnd(3));
    put(16, startRes.padStart(3));
    put(20, startChain);
    put(22, String(startSeq).padStart(4));
    put(28, endRes.padStart(3));
    put(32, endChain);
    put(34, String(endSeq).padStart(4));
    put(39, '1'.padStart(2));
    return line.join('');
}

function sheetLine(startRes, startChain, startSeq, endRes, endChain, endSeq) {
    const line = Array(80).fill(' ');
    function put(start1, text) {
        for (let i = 0; i < text.length; i += 1) line[start1 - 1 + i] = text[i];
    }
    put(1, 'SHEET ');
    put(8, '1'.padStart(3));
    put(12, 'S1'.padEnd(3));
    put(15, '1'.padStart(2));
    put(18, startRes.padStart(3));
    put(22, startChain);
    put(23, String(startSeq).padStart(4));
    put(29, endRes.padStart(3));
    put(33, endChain);
    put(34, String(endSeq).padStart(4));
    put(39, '0'.padStart(2));
    return line.join('');
}

function makeDemoPDB() {
    // This demo intentionally contains two validation cases:
    // Chain A: HELIX -> real LOOP residues -> SHEET, for all-point loop spline.
    // Chain B: HELIX -> SHEET with no LOOP residue between them, for SSE-SSE boundary tube.
    const chainA = [
        ['ALA', -8.0, 0.0, 0.0],
        ['GLY', -6.9, 1.0, 0.5],
        ['SER', -5.6, 0.1, 1.2],
        ['LEU', -4.1, 1.1, 1.8],
        ['ASP', -2.8, 0.3, 2.4],
        ['GLU', -1.3, 1.3, 2.8],
        ['LYS',  0.1, 0.4, 3.0],
        ['GLY',  1.5, 1.5, 2.5],
        ['ASN',  2.8, 0.2, 1.6],
        ['VAL',  4.1, 0.9, 0.6],
        ['ILE',  5.4, 0.0, -0.2],
        ['PHE',  6.7, 0.8, -1.0],
        ['THR',  8.0, -0.1, -1.8],
        ['TYR',  9.3, 0.6, -2.6],
        ['GLY', 10.7, -0.6, -3.1],
    ];

    const chainB = [
        ['ALA', -7.5, -5.0, -1.0],
        ['LEU', -6.1, -4.2, -0.4],
        ['GLU', -4.8, -5.1,  0.1],
        ['LYS', -3.4, -4.4,  0.5],
        ['VAL', -2.0, -5.0,  0.2],
        ['ILE', -0.6, -4.2, -0.4],
        ['PHE',  0.8, -5.1, -0.9],
        ['TYR',  2.2, -4.3, -1.4],
    ];

    const lines = [
        pdbLine('HEADER', '    PROVR CARTOON LOOP AND SSE-SSE BOUNDARY DEMO'),
        helixLine('ALA', 'A', 1, 'LYS', 'A', 7),
        sheetLine('VAL', 'A', 10, 'TYR', 'A', 14),
        helixLine('ALA', 'B', 1, 'LYS', 'B', 4),
        sheetLine('VAL', 'B', 5, 'TYR', 'B', 8),
    ];

    let serial = 1;
    function emitChain(residues, chainId) {
        for (let i = 0; i < residues.length; i += 1) {
            const [res, x, y, z] = residues[i];
            const seq = i + 1;
            lines.push(atomLine(serial++, 'N', res, chainId, seq, x - 0.45, y + 0.15, z, 'N'));
            lines.push(atomLine(serial++, 'CA', res, chainId, seq, x, y, z, 'C'));
            lines.push(atomLine(serial++, 'C', res, chainId, seq, x + 0.45, y - 0.15, z, 'C'));
            lines.push(atomLine(serial++, 'O', res, chainId, seq, x + 0.62, y - 0.75, z + 0.15, 'O'));
        }
    }

    emitChain(chainA, 'A');
    emitChain(chainB, 'B');

    lines.push('END'.padEnd(80));
    return `${lines.join('\n')}\n`;
}

const DEMO_PDB = makeDemoPDB();

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
    cartoonRepId: null,
    ballstickRepId: null,
    events: [],
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

function proteinIdFromFilename(filename = 'protein') {
    const base = String(filename).split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'protein';
    return `${base}_${Date.now().toString(36)}`;
}

function setResidueSSEBySeqRange(model, chainId, startSeq, endSeq, type) {
    const chain = model.chains.get(chainId);
    if (!chain) return 0;

    let count = 0;
    for (const residueId of chain.residueIds) {
        const residue = model.residues.get(residueId);
        if (!residue) continue;
        if (residue.seqNum >= startSeq && residue.seqNum <= endSeq) {
            residue.sse = type;
            model.secondary.setResidueSSE(residue.id, type);
            count += 1;
        }
    }
    model.secondary.addRange(chainId, String(startSeq), String(endSeq), type);
    return count;
}

function forceDemoSecondaryStructure(model) {
    if (!model) return;
    for (const residue of model.residues.values()) {
        residue.sse = SSEType.LOOP;
        model.secondary.setResidueSSE(residue.id, SSEType.LOOP);
    }
    const helixCountA = setResidueSSEBySeqRange(model, 'A', 1, 7, SSEType.HELIX);
    const sheetCountA = setResidueSSEBySeqRange(model, 'A', 10, 14, SSEType.SHEET);
    const helixCountB = setResidueSSEBySeqRange(model, 'B', 1, 4, SSEType.HELIX);
    const sheetCountB = setResidueSSEBySeqRange(model, 'B', 5, 8, SSEType.SHEET);
    console.log('[ProVR Cartoon] forced demo SSE:', {helixCountA, sheetCountA, helixCountB, sheetCountB});
}

function currentCartoon() {
    return state.cartoonRepId ? state.manager.get(state.cartoonRepId) : null;
}

function currentBallStick() {
    return state.ballstickRepId ? state.manager.get(state.ballstickRepId) : null;
}

function summary() {
    const cartoon = currentCartoon();
    const ballstick = currentBallStick();

    return {
        proteinId: state.proteinId,
        model: state.model ? {
            atoms: state.model.atoms.size,
            residues: state.model.residues.size,
            chains: state.model.chains.size,
            revision: state.model.revision,
            secondaryRanges: state.model.secondary?.ranges || [],
        } : null,
        cartoon: cartoon?.summary?.() || cartoon?.root?.userData?.summary || null,
        ballstick: ballstick?.summary?.() || ballstick?.root?.userData?.summary || null,
        pickRegistry: state.manager?.context?.pickRegistry?.summary?.() || null,
        command: {
            undoStackSize: state.commandManager?.undoStack?.length ?? null,
            redoStackSize: state.commandManager?.redoStack?.length ?? null,
        },
        mouseEdit: {
            enabled: !!state.mouseEdit?.enabled,
            mode: $('editMode')?.value || 'residue',
        },
        recentEvents: state.events.slice(-10),
    };
}

function validate(label = 'manual') {
    const loadReport = state.model ? validateLoadedStructure(state.model) : {ok: false, issues: ['model is missing']};
    const cartoonReport = validateCartoonRepresentation({
        model: state.model,
        viewport: state.viewport,
        manager: state.manager,
        repId: state.cartoonRepId,
    });

    const report = {
        label,
        ok: loadReport.ok && cartoonReport.ok,
        load: loadReport,
        cartoon: cartoonReport,
        summary: summary(),
    };

    setSummary(report.summary);

    console.group(`[ProVR Cartoon Fixed Sheet Arrow Validate] ${label} / ${report.ok ? 'OK' : 'ISSUES'}`);
    console.log('summary:', report.summary);
    console.log('load:', loadReport);
    console.log('cartoon:', cartoonReport);
    if (!report.ok) console.warn('issues:', {load: loadReport.issues, cartoon: cartoonReport.issues});
    console.groupEnd();

    const loops = report.summary?.cartoon?.loopMeshes || 0;
    const helices = report.summary?.cartoon?.helixMeshes || 0;
    const arrows = report.summary?.cartoon?.sheetArrowMeshes || 0;
    const visualPickTargets = report.summary?.cartoon?.visualPickTargets || 0;
    const transitions = report.summary?.cartoon?.transitionMeshes || 0;
    const loopMode = report.summary?.cartoon?.options?.endpointBridgeMode || 'unknown';
    const loopAnchorPolicy = report.summary?.cartoon?.options?.loopSplineAnchorPolicy || 'unknown';
    const allPointLoopSplineMeshes = report.summary?.cartoon?.allPointLoopSplineMeshes || 0;
    const endpointAwareLoopMeshes = report.summary?.cartoon?.endpointAwareLoopMeshes || 0;
    const collisions = report.summary?.cartoon?.visualResidueCollisionCount || 0;
    const secondaryBoundaryTubeMeshes = report.summary?.cartoon?.secondaryBoundaryTubeMeshes || 0;
    const secondaryBoundaryCandidatePairs = cartoonReport.summary?.secondaryBoundaryTubes?.candidatePairs || 0;
    const fixedSheetArrowMeshes = report.summary?.cartoon?.fixedSheetArrowMeshes || 0;

    if (loops <= 0) setStatus('warning: no loop tube meshes', 'warn');
    else if (helices <= 0) setStatus('warning: no helix ellipse mesh. Try provr.cartoon.forceDemoSecondaryStructure()', 'warn');
    else if (arrows <= 0) setStatus('warning: no sheet arrow mesh. Try provr.cartoon.forceDemoSecondaryStructure()', 'warn');
    else if (visualPickTargets <= 0) setStatus('warning: visual cartoon modules are not pickable', 'warn');
    else if (collisions > 0) setStatus(`warning: ${collisions} residues are owned by multiple secondary visual meshes. This is a true SSE range/parser overlap.`, 'warn');
    else if (loopMode === 'loop-owned-multi-anchor-spline-no-connector-mesh' && transitions > 0) setStatus(`warning: loop-owned all-point spline should not create separate connector meshes, connectors=${transitions}`, 'warn');
    else if (endpointAwareLoopMeshes > 0 && allPointLoopSplineMeshes !== endpointAwareLoopMeshes) setStatus(`warning: ${allPointLoopSplineMeshes}/${endpointAwareLoopMeshes} endpoint-aware loop meshes use every loop residue as spline anchor`, 'warn');
    else if (secondaryBoundaryCandidatePairs > 0 && secondaryBoundaryTubeMeshes !== secondaryBoundaryCandidatePairs) setStatus(`warning: ${secondaryBoundaryTubeMeshes}/${secondaryBoundaryCandidatePairs} direct SSE-SSE boundaries have Hermite tubes`, 'warn');
    else if (arrows > 0 && fixedSheetArrowMeshes !== arrows) setStatus(`warning: ${fixedSheetArrowMeshes}/${arrows} sheet meshes use the fixed legacy body-arrowhead geometry`, 'warn');
    else setStatus(`validation ok: ${label}, loopMode=${loopMode}, anchorPolicy=${loopAnchorPolicy}, loops=${loops}, allPointLoops=${allPointLoopSplineMeshes}/${endpointAwareLoopMeshes}, sseBoundaryTubes=${secondaryBoundaryTubeMeshes}/${secondaryBoundaryCandidatePairs}, helices=${helices}, arrows=${arrows}, fixedSheetArrows=${fixedSheetArrowMeshes}, connectors=${transitions}, collisions=${collisions}, visualPickTargets=${visualPickTargets}`, 'ok');

    return report;
}

async function init() {
    state.proteinSystem = new ProteinSystem();
    state.eventBus = new EventBus();
    state.commandManager = new CommandManager({
        eventBus: state.eventBus,
        context: {proteinSystem: state.proteinSystem, eventBus: state.eventBus},
    });
    state.loader = new StructureLoader({proteinSystem: state.proteinSystem});

    state.viewport = new MolecularViewport({
        container: '#viewport',
        background: 0x111827,
        enableControls: true,
        cameraPosition: [0, 0, 35],
    });
    await state.viewport.init();
    state.viewport.start();

    state.manager = new RepresentationManager({
        proteinSystem: state.proteinSystem,
        eventBus: state.eventBus,
        scene: state.viewport.scene,
    });

    registerCartoonRepresentation(state.manager);
    registerBallStickRepresentation(state.manager);

    for (const type of Object.values(EventTypes)) {
        state.eventBus.on(type, (evt) => {
            state.events.push({
                type,
                proteinId: evt?.proteinId,
                atomIds: evt?.atomIds,
                residueIds: evt?.residueIds,
                chainIds: evt?.chainIds,
                phase: evt?.phase,
                source: evt?.source,
                revision: evt?.revision,
            });
            if (state.events.length > 80) state.events.shift();
            console.debug('[ProVR:event]', type, evt);
        });
    }

    bindUI();
    exposeConsoleHelpers();

    setStatus('ready: Load legacy drawing demo or upload PDB/CIF/mmCIF', 'ok');
    setSummary({ready: true});
    console.log('[ProVR Legacy Drawing Cartoon] ready');
}

function bindUI() {
    $('loadDemoButton')?.addEventListener('click', () => loadText(DEMO_PDB, 'legacy_drawing_demo.pdb', {forceDemoSSE: true}));

    $('structureFileInput')?.addEventListener('change', async (evt) => {
        const file = evt.target.files?.[0];
        if (!file) return;
        await loadText(await file.text(), file.name);
    });

    $('validateButton')?.addEventListener('click', () => validate('manual-button'));
    $('centerButton')?.addEventListener('click', () => state.model && state.viewport.centerOnModel(state.model));
    $('toggleCartoonButton')?.addEventListener('click', () => toggleRepresentation(state.cartoonRepId));
    $('toggleBallStickButton')?.addEventListener('click', () => toggleRepresentation(state.ballstickRepId));
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
}

async function loadText(text, filename = 'structure.pdb', {forceDemoSSE = false} = {}) {
    disableMouseEdit();

    if (state.cartoonRepId) state.manager.remove(state.cartoonRepId);
    if (state.ballstickRepId) state.manager.remove(state.ballstickRepId);
    state.cartoonRepId = null;
    state.ballstickRepId = null;

    const proteinId = proteinIdFromFilename(filename);
    const {model} = state.loader.loadText({text, filename, proteinId, format: 'auto', replace: true});

    if (forceDemoSSE) forceDemoSecondaryStructure(model);

    state.proteinId = proteinId;
    state.model = model;

    state.cartoonRepId = state.manager.create({
        id: `cartoon_legacy_drawing_${proteinId}`,
        type: 'cartoon',
        proteinId,
        name: 'Loop-Owned Cartoon + Fixed Sheet Arrow',
        filter: {protein: true, nucleic: true, heterogen: false, water: false, unknown: false},
        style: {
            colorScheme: $('colorScheme')?.value || 'chain',
            opacity: Number($('cartoonOpacity')?.value || 1.0),
            scale: Number($('cartoonScale')?.value || 1.0),

            smoothSegment: Number($('smoothSegment')?.value || 19),
            smoothCurvature: Number($('smoothCurvature')?.value || 0.8),

            loopRadius: Number($('loopRadius')?.value || 0.18),
            loopRadialSegments: 10,

            helixEllipseRadius: Number($('helixEllipseRadius')?.value || 0.21),
            helixEllipseWidthMultiple: Number($('helixEllipseWidthMultiple')?.value || 5.0),
            helixEllipseSegments: 20,

            sheetBodyWidth: Number($('sheetBodyWidth')?.value || 2.0),
            sheetThickness: Number($('sheetThickness')?.value || 0.4),
            sheetArrowBaseWidth: Number($('sheetArrowBaseWidth')?.value || 3.6),
            sheetArrowTipWidth: Number($('sheetArrowTipWidth')?.value || 0.4),
            sheetArrowHeight: Number($('sheetArrowHeight')?.value || 0.4),

            segmentPaddingResidues: Number($('segmentPaddingResidues')?.value || 0),
            transitionTubeEnabled: $('transitionTubeEnabled')?.checked ?? false,
            transitionTubeRadiusScale: 0.85,
            boundaryConnectorEnabled: $('boundaryConnectorEnabled')?.checked ?? true,
            boundaryConnectorContextResidues: Number($('boundaryConnectorContextResidues')?.value || 2),
            boundaryConnectorRadiusScale: Number($('boundaryConnectorRadiusScale')?.value || 1.0),
            boundaryTubeHalfResidue: Number($('boundaryTubeHalfResidue')?.value || 0.55),
            endpointBridgeEnabled: $('endpointBridgeEnabled')?.checked ?? true,
            endpointBridgeSamples: Number($('endpointBridgeSamples')?.value || 12),
            endpointBridgeTangentScale: Number($('endpointBridgeTangentScale')?.value || 0.85),
            endpointBridgeRadiusScale: Number($('endpointBridgeRadiusScale')?.value || 1.0),
            endpointBridgeContextResidues: Number($('endpointBridgeContextResidues')?.value || 1),
            endpointBridgeUseContextTangents: $('endpointBridgeUseContextTangents')?.checked ?? true,
            loopSplineSamplesPerResidue: Number($('loopSplineSamplesPerResidue')?.value || $('endpointBridgeSamples')?.value || 19),
            loopSplineTangentScale: Number($('loopSplineTangentScale')?.value || $('endpointBridgeTangentScale')?.value || 0.80),
            loopSplineMaxTangentFactor: Number($('loopSplineMaxTangentFactor')?.value || 1.35),
            secondaryBoundaryTubeEnabled: $('secondaryBoundaryTubeEnabled')?.checked ?? true,
            secondaryBoundaryTubeSamples: Number($('secondaryBoundaryTubeSamples')?.value || 14),
            secondaryBoundaryTubeRadiusScale: Number($('secondaryBoundaryTubeRadiusScale')?.value || 1.0),
            secondaryBoundaryTubeContextResidues: Number($('secondaryBoundaryTubeContextResidues')?.value || 1),
            secondaryBoundaryTubeTangentScale: Number($('secondaryBoundaryTubeTangentScale')?.value || 0.75),
            secondaryBoundaryTubeMaxTangentFactor: Number($('secondaryBoundaryTubeMaxTangentFactor')?.value || 1.20),
            loopVisibleHalfResidue: Number($('loopVisibleHalfResidue')?.value || 0.58),
            loopIntervalMergeGap: Number($('loopIntervalMergeGap')?.value || 0.08),

            pickProxyRadius: Number($('pickProxyRadius')?.value || 0.90),
            pickProxyOpacity: Number($('pickProxyOpacity')?.value || 0.0),
        },
        geometry: {
            curveType: 'legacyHermite',
            livePreview: $('livePreview')?.checked || false,
        },
        interaction: {
            pickable: true,
            pickProxies: true,
            visualMeshPickable: $('visualMeshPickable')?.checked ?? true,
            targetLevel: 'residueRange',
        },
    });

    state.ballstickRepId = state.manager.create({
        id: `ballstick_overlay_${proteinId}`,
        type: 'ballstick',
        proteinId,
        name: 'BallStick overlay',
        filter: {protein: true, nucleic: true, heterogen: true, water: false, unknown: false},
        style: {atomRadiusScale: 0.42, bondRadius: 0.035, halfBondColor: true, opacity: 0.50},
        geometry: {
            atomSegments: 16,
            bondSegments: 10,
            bondTopology: {force: false, inferIfExistingBonds: true, inferProteinInternal: true, inferProteinPeptide: true, includeHydrogen: true},
        },
        interaction: {pickable: true, pickAtoms: true, pickBonds: true, targetLevel: 'atom'},
        visible: $('showBallStick')?.checked ?? true,
    });

    state.viewport.centerOnModel(model);

    logCartoonValidation({model, viewport: state.viewport, manager: state.manager, repId: state.cartoonRepId});
    validate('after-load');
    setStatus(`loaded ${filename}: cartoon=${state.cartoonRepId}`, 'ok');
}

function toggleRepresentation(repId) {
    const rep = repId ? state.manager.get(repId) : null;
    if (!rep) return;
    state.manager.setVisible(repId, !rep.visible);
    validate(`toggle-${rep.spec.type}`);
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
        getMode: () => $('editMode')?.value || 'residue',
        getResidueWindow: () => Number($('residueWindow')?.value || 5),
        pickRadiusWorld: Number($('pickRadius')?.value || 1.35),
        onStatus: (message) => {
            setStatus(message, 'ok');
            console.log('[ProVR mouseEdit]', message);
        },
        onPreview: (payload) => console.debug('[ProVR preview]', payload),
        onCommit: (payload) => {
            console.log('[ProVR commit]', payload);
            validate('after-commit');
        },
    });

    state.mouseEdit.enable();
    setStatus('mouse editing enabled. Cartoon modules and CA proxies are pickable.', 'ok');
}

function disableMouseEdit() {
    if (!state.mouseEdit) return;
    state.mouseEdit.disable();
    state.mouseEdit = null;
}

function currentPDB() {
    return state.model ? exportPDB(state.model, {includeHeader: true, includeConect: true, endRecord: true}) : '';
}

function downloadCurrentPDB() {
    if (!state.model) {
        setStatus('no model loaded', 'warn');
        return;
    }
    downloadText(currentPDB(), `${state.proteinId}_legacy_drawing_cartoon.pdb`, 'chemical/x-pdb');
}

function exposeConsoleHelpers() {
    window.provr = window.provr || {};
    window.provr.cartoon = {
        state,
        loadDemo: () => loadText(DEMO_PDB, 'legacy_drawing_demo.pdb', {forceDemoSSE: true}),
        loadText,
        validate,
        summary,
        printSummary: () => {
            const s = summary();
            console.group('[ProVR Legacy Drawing Cartoon Summary]');
            console.log(s);
            console.groupEnd();
            setSummary(s);
            return s;
        },
        forceDemoSecondaryStructure: () => {
            forceDemoSecondaryStructure(state.model);
            if (state.cartoonRepId) state.manager.rebuild(state.cartoonRepId);
            return validate('force-demo-sse');
        },
        exportPDB: currentPDB,
        downloadPDB: downloadCurrentPDB,
        enableMouseEdit,
        disableMouseEdit,
        undo: () => {
            state.commandManager.undo();
            return validate('console-undo');
        },
        redo: () => {
            state.commandManager.redo();
            return validate('console-redo');
        },
    };
}

init().catch((err) => {
    console.error('[ProVR Legacy Drawing Cartoon] init failed', err);
    setStatus(`init failed: ${err.message}`, 'error');
});
