import {MolecularViewport} from '../core/app/MolecularViewport.js';
import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {StructureLoader} from '../domain/io/StructureLoader.js';
import {downloadText, exportPDB} from '../domain/io/PDBExporter.js';

import {EventBus} from '../core/event/EventBus.js';
import {EventTypes} from '../core/event/EventTypes.js';
import {CommandManager} from '../core/command/CommandManager.js';

import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {registerSurfaceRepresentation} from '../representation/surface/registerSurfaceRepresentation.js';
import {registerBallStickRepresentation} from '../representation/ballstick/registerBallStickRepresentation.js';
import {MouseEditController} from '../representation/interaction/MouseEditController.js';
import {SurfaceLayerTransformController} from '../representation/surface/SurfaceLayerTransformController.js';

import {validateLoadedStructure} from './StructureLoadValidator.js';
import {logSurfaceValidation} from './SurfaceRepresentationValidator.js';

const $ = (id) => document.getElementById(id);

const state = {
    proteinSystem: null,
    eventBus: null,
    commandManager: null,
    loader: null,
    viewport: null,
    manager: null,
    model: null,
    proteinId: null,
    surfaceRepId: null,
    ballstickRepId: null,
    mouseEdit: null,
    layerDrag: null,
    events: [],
};

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

function makeSurfaceDemoPDB() {
    const lines = [pdbLine('HEADER', '    PROVR SURFACE V5 LAYERED COMPLEX DEMO')];
    let serial = 1;
    const residues = ['ALA', 'VAL', 'LEU', 'SER', 'THR', 'GLY', 'ASP', 'LYS'];

    function emitRingResidue(chainId, seq, radius, z, phase, resName) {
        const theta = phase;
        const radial = [Math.cos(theta), Math.sin(theta), 0];
        const tangent = [-Math.sin(theta), Math.cos(theta), 0];
        const ca = [radius * radial[0], radius * radial[1], z];
        const n = [ca[0] - 0.55 * tangent[0], ca[1] - 0.55 * tangent[1], z - 0.38];
        const c = [ca[0] + 0.55 * tangent[0], ca[1] + 0.55 * tangent[1], z + 0.38];
        const o = [ca[0] + 0.78 * radial[0], ca[1] + 0.78 * radial[1], z + 0.60];
        const cb = [ca[0] + 0.92 * radial[0], ca[1] + 0.92 * radial[1], z - 0.10];
        lines.push(atomLine(serial++, 'N', resName, chainId, seq, ...n, 'N'));
        lines.push(atomLine(serial++, 'CA', resName, chainId, seq, ...ca, 'C'));
        lines.push(atomLine(serial++, 'C', resName, chainId, seq, ...c, 'C'));
        lines.push(atomLine(serial++, 'O', resName, chainId, seq, ...o, 'O'));
        lines.push(atomLine(serial++, 'CB', resName, chainId, seq, ...cb, 'C'));
    }

    function emitLinearResidue(chainId, seq, x, y, z, resName) {
        const n = [x - 0.62, y - 0.20, z - 0.20];
        const ca = [x, y, z];
        const c = [x + 0.64, y + 0.18, z + 0.18];
        const o = [x + 1.02, y + 0.55, z + 0.38];
        const cb = [x, y + 0.95, z - 0.26];
        lines.push(atomLine(serial++, 'N', resName, chainId, seq, ...n, 'N'));
        lines.push(atomLine(serial++, 'CA', resName, chainId, seq, ...ca, 'C'));
        lines.push(atomLine(serial++, 'C', resName, chainId, seq, ...c, 'C'));
        lines.push(atomLine(serial++, 'O', resName, chainId, seq, ...o, 'O'));
        lines.push(atomLine(serial++, 'CB', resName, chainId, seq, ...cb, 'C'));
    }

    // Chain A: GFP-like barrel wall. Residues 1-32 outer ring, 33-64 inner ring.
    for (let i = 0; i < 32; i += 1) {
        emitRingResidue('A', i + 1, 6.0, Math.floor(i / 16) * 2.2 - 1.1, (i % 16) / 16 * Math.PI * 2, residues[i % residues.length]);
    }
    for (let i = 0; i < 32; i += 1) {
        emitRingResidue('A', i + 33, 3.15, Math.floor(i / 16) * 2.2 - 1.1, (i % 16) / 16 * Math.PI * 2 + Math.PI / 16, residues[(i + 3) % residues.length]);
    }
    lines.push('TER'.padEnd(80));

    // Chains H/L: antibody-like two-chain partner near the A-chain outer surface.
    for (let i = 0; i < 18; i += 1) {
        emitLinearResidue('H', i + 1, 7.6 + (i % 6) * 0.85, -3.0 + Math.floor(i / 6) * 1.15, -1.4 + (i % 3) * 1.15, residues[(i + 2) % residues.length]);
    }
    lines.push('TER'.padEnd(80));
    for (let i = 0; i < 16; i += 1) {
        emitLinearResidue('L', i + 1, 7.3 + (i % 4) * 0.95, 2.6 + Math.floor(i / 4) * 0.95, -1.2 + (i % 4) * 0.75, residues[(i + 5) % residues.length]);
    }

    lines.push('TER'.padEnd(80), 'END'.padEnd(80));
    return lines.join('\n') + '\n';
}

const DEMO_PDB = makeSurfaceDemoPDB();

function proteinIdFromFilename(filename) {
    return String(filename || 'surface_demo').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_') || 'surface_demo';
}

function setStatus(message, kind = 'info') {
    const el = $('status');
    if (!el) return;
    el.textContent = message;
    el.className = `status ${kind}`;
}

function setSummary(obj) {
    const el = $('summary');
    if (el) el.textContent = JSON.stringify(obj, null, 2);
}

function numberValue(id, fallback) {
    const value = Number($(id)?.value ?? fallback);
    return Number.isFinite(value) ? value : fallback;
}

function splitCsvLine(line) {
    return String(line || '').split(',').map((part) => part.trim());
}

function parseBool(value, fallback = undefined) {
    if (value === undefined || value === null || value === '') return fallback;
    const text = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on', 'pickable'].includes(text)) return true;
    if (['0', 'false', 'no', 'n', 'off', 'readonly', 'context'].includes(text)) return false;
    return fallback;
}

function parseResidueColorRules() {
    const text = $('residueColorSpec')?.value || '';
    const rules = [];
    text.split(/\r?\n/).forEach((line, index) => {
        const cleaned = line.trim();
        if (!cleaned || cleaned.startsWith('#')) return;
        const [chainId, start, end, color, name] = splitCsvLine(cleaned);
        const s = Number(start);
        const e = Number(end || start);
        if (!chainId || !Number.isFinite(s) || !Number.isFinite(e) || !color) {
            console.warn('[ProVR surface validation] skipped bad residue color rule:', line);
            return;
        }
        rules.push({
            id: `residue_color_${index + 1}`,
            name: name || `Residues ${chainId}:${s}-${e}`,
            chainId,
            start: Math.min(s, e),
            end: Math.max(s, e),
            color,
        });
    });
    return rules;
}

function parseLayerSpec(textOverride = null) {
    const text = textOverride !== null ? textOverride : ($('surfaceLayerSpec')?.value || '');
    const layers = [];
    text.split(/\r?\n/).forEach((line, index) => {
        const cleaned = line.trim();
        if (!cleaned || cleaned.startsWith('#')) return;
        const [id, scope, chains, start, end, color, opacity, pickable, role, colorMode] = splitCsvLine(cleaned);
        const s = start === '' ? null : Number(start);
        const e = end === '' ? null : Number(end || start);
        const op = Number(opacity);
        if (!id || !scope) {
            console.warn('[ProVR surface validation] skipped bad surface layer:', line);
            return;
        }
        const layer = {
            id,
            name: id,
            scope,
            chainIds: chains ? chains.split('|').map((v) => v.trim()).filter(Boolean) : [],
            color: color || undefined,
            opacity: Number.isFinite(op) ? op : undefined,
            pickable: parseBool(pickable, undefined),
            role: role || undefined,
            colorMode: colorMode || undefined,
            metadata: {source: 'surfaceLayerSpec'},
        };
        if (Number.isFinite(s)) layer.start = s;
        if (Number.isFinite(e)) layer.end = e;
        layers.push(layer);
    });
    return layers;
}

function defaultLayerSpecText() {
    return [
        '# id,scope,chains,start,end,color,opacity,pickable,role,colorMode',
        'complex_context,model,,,,#64748b,0.18,false,context,range',
        'antigen_chain_A,chain,A,,,#94a3b8,0.20,false,context,range',
        'outer_wall_focus,range,A,1,32,#4ade80,0.34,true,focus,range',
        'inner_wall_focus,range,A,33,64,#22d3ee,0.58,true,focus,range',
        'antibody_HL_surface,chains,H|L,,,#f97316,0.38,true,focus,range',
    ].join('\n');
}

function currentLayers() {
    const customLayers = parseLayerSpec();
    return customLayers.length ? customLayers : parseLayerSpec(defaultLayerSpecText());
}

function validate(label = 'manual') {
    if (!state.model) {
        setStatus('load a structure first', 'warn');
        return null;
    }

    const loadReport = validateLoadedStructure(state.model);
    const surfaceReport = logSurfaceValidation({model: state.model, manager: state.manager, repId: state.surfaceRepId});
    const report = {
        label,
        ok: loadReport.ok && surfaceReport.ok,
        load: loadReport,
        surface: surfaceReport,
        summary: {
            model: loadReport.summary,
            surface: surfaceReport.summary,
            recentEvents: state.events.slice(-12),
        },
    };

    setSummary(report.summary);

    const s = surfaceReport.summary || {};
    const contacts = s.contacts || {};
    const warningText = surfaceReport.warnings?.length ? ` warnings: ${surfaceReport.warnings.join('; ')}` : '';
    const statusText = `validation ${report.ok ? 'ok' : 'issues'}: ${label}, layers=${s.layerSurfaceMeshes || 0}, pickTargets=${s.pickTargets || 0}, contacts=${contacts.contactPairCount || 0}/${contacts.pairCount || 0}, clashes=${contacts.clashPairCount || 0}, transformed=${s.transformedLayerCount || 0}, colorMode=${s.options?.colorMode}, ownedVertices=${s.ownedVertices || 0}/${s.vertices || 0}, ruleColored=${s.coloredVertices || 0}, residuePalette=${s.residuePaletteVertices || 0}, faces=${s.faces || 0}${warningText}`;

    if (!report.ok) setStatus(`${statusText}\nissues: ${[...loadReport.issues, ...surfaceReport.issues].join('; ')}`, 'warn');
    else setStatus(statusText, surfaceReport.warnings?.length ? 'warn' : 'ok');
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
        cameraPosition: [0, 0, 28],
    });
    await state.viewport.init();
    state.viewport.start();

    state.manager = new RepresentationManager({
        proteinSystem: state.proteinSystem,
        eventBus: state.eventBus,
        scene: state.viewport.scene,
    });

    registerSurfaceRepresentation(state.manager);
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
        });
    }

    if ($('surfaceLayerSpec')) $('surfaceLayerSpec').value = defaultLayerSpecText();
    bindUI();
    exposeConsoleHelpers();
    setStatus('ready: load layered surface demo or upload GFP/antigen-antibody PDB/mmCIF', 'ok');
    setSummary({ready: true, surfaceVersion: 'surface-layer-v5'});
}

function bindUI() {
    $('loadDemoButton')?.addEventListener('click', () => loadText(DEMO_PDB, 'surface_layered_complex_demo.pdb'));
    $('structureFileInput')?.addEventListener('change', async (evt) => {
        const file = evt.target.files?.[0];
        if (!file) return;
        await loadText(await file.text(), file.name);
    });

    $('rebuildSurfaceButton')?.addEventListener('click', () => rebuildSurface());
    $('colorMode')?.addEventListener('change', () => rebuildSurface());
    $('validateButton')?.addEventListener('click', () => validate('manual-button'));
    $('centerButton')?.addEventListener('click', () => state.model && state.viewport.centerOnModel(state.model));
    $('toggleSurfaceButton')?.addEventListener('click', () => toggleRepresentation(state.surfaceRepId));
    $('toggleBallStickButton')?.addEventListener('click', () => toggleRepresentation(state.ballstickRepId));
    $('enableMouseButton')?.addEventListener('click', () => enableMouseEdit());
    $('disableMouseButton')?.addEventListener('click', () => disableMouseEdit());
    $('enableLayerDragButton')?.addEventListener('click', () => enableSurfaceLayerDrag());
    $('disableLayerDragButton')?.addEventListener('click', () => disableSurfaceLayerDrag());
    $('resetLayerTransformsButton')?.addEventListener('click', () => resetLayerTransforms());
    $('undoButton')?.addEventListener('click', () => { state.commandManager.undo(); validate('after-undo'); });
    $('redoButton')?.addEventListener('click', () => { state.commandManager.redo(); validate('after-redo'); });
    $('exportButton')?.addEventListener('click', () => downloadCurrentPDB());
}

async function loadText(text, filename = 'structure.pdb') {
    disableMouseEdit();
    disableSurfaceLayerDrag();
    if (state.surfaceRepId) state.manager.remove(state.surfaceRepId);
    if (state.ballstickRepId) state.manager.remove(state.ballstickRepId);
    state.surfaceRepId = null;
    state.ballstickRepId = null;

    const proteinId = proteinIdFromFilename(filename);
    const {model} = state.loader.loadText({text, filename, proteinId, format: 'auto', replace: true});
    state.proteinId = proteinId;
    state.model = model;

    rebuildSurface();

    state.ballstickRepId = state.manager.create({
        id: `ballstick_surface_context_${proteinId}`,
        type: 'ballstick',
        proteinId,
        name: 'BallStick context for layered surface drag',
        filter: {protein: true, nucleic: true, heterogen: true, water: false, unknown: false},
        style: {atomRadiusScale: 0.30, bondRadius: 0.025, halfBondColor: true, opacity: 0.36},
        geometry: {
            atomSegments: 12,
            bondSegments: 8,
            bondTopology: {force: false, inferIfExistingBonds: true, inferProteinInternal: true, inferProteinPeptide: true, includeHydrogen: false},
        },
        interaction: {pickable: true, pickAtoms: true, pickBonds: true, targetLevel: 'atom'},
        visible: $('showBallStick')?.checked ?? true,
    });

    state.viewport.centerOnModel(model);
    validate('after-load');
    setStatus(`loaded ${filename}: surface=${state.surfaceRepId}`, 'ok');
}

function rebuildSurface() {
    if (!state.model) return;
    if (state.surfaceRepId) state.manager.remove(state.surfaceRepId);
    const proteinId = state.proteinId;
    state.surfaceRepId = state.manager.create({
        id: `layered_surface_${proteinId}`,
        type: 'surface',
        proteinId,
        name: 'Layered full/chain/range surface v5',
        filter: {protein: true, nucleic: true, heterogen: false, water: false, unknown: false},
        layers: currentLayers(),
        residueColorRules: parseResidueColorRules(),
        style: {
            colorMode: $('colorMode')?.value || 'range',
            opacity: numberValue('surfaceOpacity', 0.46),
            gridSpacing: numberValue('gridSpacing', 0.85),
            probeRadius: numberValue('probeRadius', 1.40),
            bboxPadding: numberValue('bboxPadding', 2.4),
            maxGridPoints: numberValue('maxGridPoints', 260000),
            maxAtomsPerRange: numberValue('maxAtomsPerRange', 12000),
            contactThreshold: numberValue('contactThreshold', 1.2),
            clashThreshold: numberValue('clashThreshold', 0.35),
            maxContactSamplesPerLayer: numberValue('maxContactSamplesPerLayer', 1000),
            wireframe: $('wireframe')?.checked || false,
            rebuildOnRigidTransform: $('rebuildOnRigidTransform')?.checked || false,
        },
        geometry: {livePreview: false},
        interaction: {
            pickable: true,
            visualMeshPickable: $('visualMeshPickable')?.checked ?? true,
            targetLevel: 'residueRange',
        },
    });
    validate('after-rebuild-surface');
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
    disableSurfaceLayerDrag();
    disableMouseEdit();
    state.mouseEdit = new MouseEditController({
        viewport: state.viewport,
        proteinSystem: state.proteinSystem,
        eventBus: state.eventBus,
        commandManager: state.commandManager,
        getModel: () => state.model,
        getMode: () => $('editMode')?.value || 'range',
        getResidueWindow: () => Number($('residueWindow')?.value || 5),
        pickRadiusWorld: Number($('pickRadius')?.value || 1.35),
        onStatus: (message) => setStatus(message, 'ok'),
        onPreview: (payload) => console.debug('[ProVR preview]', payload),
        onCommit: (payload) => {
            console.log('[ProVR commit]', payload);
            validate('after-commit');
        },
    });
    state.mouseEdit.enable();
    setStatus('mouse editing enabled. Context/full layers are read-only by default; focus/range/chain layers resolve to the residues that generated that layer.', 'ok');
}

function disableMouseEdit() {
    if (!state.mouseEdit) return;
    state.mouseEdit.disable();
    state.mouseEdit = null;
}

function surfaceRepresentation() {
    return state.surfaceRepId ? state.manager?.get?.(state.surfaceRepId) : null;
}

function enableSurfaceLayerDrag() {
    if (!state.model) {
        setStatus('load a structure first', 'warn');
        return;
    }
    disableMouseEdit();
    disableSurfaceLayerDrag();
    state.layerDrag = new SurfaceLayerTransformController({
        viewport: state.viewport,
        getRepresentation: () => surfaceRepresentation(),
        onStatus: (message) => setStatus(message, 'ok'),
        onChange: (payload) => {
            console.debug('[ProVR surface layer drag]', payload);
            validate(payload.type || 'surface-layer-drag');
        },
    });
    state.layerDrag.enable();
}

function disableSurfaceLayerDrag() {
    if (!state.layerDrag) return;
    state.layerDrag.disable();
    state.layerDrag = null;
}

function resetLayerTransforms() {
    const rep = surfaceRepresentation();
    if (!rep?.resetAllSurfaceLayerTransforms) {
        setStatus('surface representation is not available', 'warn');
        return;
    }
    const count = rep.resetAllSurfaceLayerTransforms();
    validate('after-reset-layer-transforms');
    setStatus(`reset ${count} surface layer transform(s); no geometry rebuild`, 'ok');
}

function currentPDB() {
    return state.model ? exportPDB(state.model, {includeHeader: true, includeConect: true, endRecord: true}) : '';
}

function downloadCurrentPDB() {
    if (!state.model) {
        setStatus('no model loaded', 'warn');
        return;
    }
    downloadText(currentPDB(), `${state.proteinId}_surface_layer_drag.pdb`, 'chemical/x-pdb');
}

function exposeConsoleHelpers() {
    window.provr = window.provr || {};
    window.provr.surface = {
        state,
        loadDemo: () => loadText(DEMO_PDB, 'surface_layered_complex_demo.pdb'),
        loadText,
        rebuildSurface,
        validate,
        currentLayers,
        currentPDB,
        enableMouseEdit,
        disableMouseEdit,
        enableSurfaceLayerDrag,
        disableSurfaceLayerDrag,
        resetLayerTransforms,
        surfaceRepresentation,
    };
}

init().catch((err) => {
    console.error(err);
    setStatus(`initialization failed: ${err.message}`, 'warn');
});
