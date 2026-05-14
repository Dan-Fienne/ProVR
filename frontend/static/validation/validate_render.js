import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {StructureLoader} from '../domain/io/StructureLoader.js';
import {logLoadValidation} from './StructureLoadValidator.js';
import {MolecularViewport} from '../core/app/MolecularViewport.js';
import {RepresentationContext} from '../representation/common/RepresentationContext.js';
import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {RepresentationRegistry} from '../representation/common/RepresentationRegistry.js';
import {registerLineRepresentation} from '../representation/line/registerLineRepresentation.js';
import {buildBondTopology} from '../representation/geometry/BondTopologyBuilder.js';
import {logRenderValidation} from './RenderSystemValidator.js';

const proteinSystem = new ProteinSystem();
const loader = new StructureLoader({proteinSystem});

const state = {
    viewport: null,
    registry: null,
    context: null,
    manager: null,
    last: null,
    models: new Map(),
};

async function setupViewport() {
    if (state.viewport) return state.viewport;
    const container = document.querySelector('#viewport');
    state.viewport = await new MolecularViewport({
        container,
        // Keep false by default to avoid an import-path dependency on OrbitControls.
        // Later you can pass OrbitControls from your project if needed.
        enableControls: false,
    }).init();
    state.viewport.start();

    state.registry = new RepresentationRegistry();
    registerLineRepresentation(state.registry);

    state.context = new RepresentationContext({
        proteinSystem,
        scene: state.viewport.scene,
        renderer: state.viewport.renderer,
    });

    state.manager = new RepresentationManager({
        context: state.context,
        registry: state.registry,
        autoBindEvents: false,
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

function createLineRepresentation(model, {name = 'line all'} = {}) {
    const repId = `line_${model.id}_${Date.now().toString(36)}`;
    state.manager.create({
        id: repId,
        type: 'line',
        proteinId: model.id,
        name,
        filter: {
            protein: true,
            nucleic: true,
            heterogen: true,
            water: false,
            unknown: false,
        },
        style: {
            colorScheme: document.querySelector('#colorScheme')?.value || 'element',
            opacity: Number(document.querySelector('#opacity')?.value || 1),
        },
        geometry: {
            bondTopology: {
                force: true,
                inferIfExistingBonds: true,
                includeHydrogen: document.querySelector('#includeHydrogen')?.checked ?? true,
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
    state.models.set(proteinId, model);

    const loadReport = logLoadValidation(model, {sampleSize: 8});
    buildBondTopology(model, {
        force: true,
        inferIfExistingBonds: true,
        includeHydrogen: document.querySelector('#includeHydrogen')?.checked ?? true,
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
    };

    window.provr.render.last = state.last;
    window.provr.render.model = model;
    window.provr.render.lineRep = lineRep;
    window.provr.render.lineRepId = lineRepId;

    updateSummaryBox({
        proteinId,
        format,
        load: loadReport.summary,
        render: renderReport.summary,
    });

    const ok = loadReport.ok && renderReport.ok;
    updateStatus(ok ? `rendered ${proteinId}` : `rendered with issues: ${proteinId}`, ok ? 'ok' : 'warn');

    console.log('[ProVR Render] model:', model);
    console.log('[ProVR Render] line representation:', lineRep);
    console.log('[ProVR Render] pick registry:', state.context.pickRegistry.summary());

    return state.last;
}

function printModels() {
    const rows = proteinSystem.listProteinIds().map((id) => {
        const model = proteinSystem.getProtein(id);
        return {
            proteinId: id,
            atoms: model.atoms.size,
            residues: model.residues.size,
            chains: model.chains.size,
            bonds: model.info?.bondTopology?.summary?.totalBondsAfter ?? 0,
            format: model.info?.format || '',
            source: model.info?.source || '',
        };
    });
    console.table(rows);
    return rows;
}

function printScene() {
    const rows = state.viewport?.sceneSummary?.() || [];
    console.table(rows);
    return rows;
}

function printTargets(kind = null, limit = 20) {
    const records = state.context?.pickRegistry?.list({
        proteinId: state.last?.proteinId || null,
        kind: kind || null,
    }) || [];
    const rows = records.slice(0, limit).map((record) => ({
        id: record.id,
        representationId: record.representationId,
        kind: record.target.kind,
        atomIds: record.target.atomIds.join(','),
        residueIds: record.target.residueIds.join(','),
        chainIds: record.target.chainIds.join(','),
        source: record.target.metadata?.bondSource || '',
        bondKind: record.target.metadata?.bondKind || '',
    }));
    console.table(rows);
    return rows;
}

function printBonds(limit = 30) {
    const records = state.last?.model?.info?.bondTopology?.records || [];
    const rows = records.slice(0, limit).map((record) => ({
        atomIds: record.atomIds.join('-'),
        atomNames: record.atomNames.join('-'),
        residueNames: record.residueNames.join('-'),
        chainIds: record.chainIds.join(','),
        source: record.source,
        kind: record.kind,
        distance: record.distance == null ? '' : Number(record.distance).toFixed(3),
    }));
    console.table(rows);
    return rows;
}

function printLineSummary() {
    const summary = state.last?.lineRep?.summary?.() || null;
    console.log(summary);
    return summary;
}

function validate() {
    if (!state.last) {
        console.warn('No structure has been rendered yet. Upload a PDB/CIF first.');
        return null;
    }
    const report = logRenderValidation({
        model: state.last.model,
        viewport: state.viewport,
        manager: state.manager,
        lineRepId: state.last.lineRepId,
    });
    state.last.renderReport = report;
    updateSummaryBox({
        proteinId: state.last.proteinId,
        format: state.last.format,
        load: state.last.loadReport.summary,
        render: report.summary,
    });
    return report;
}

function rebuildCurrentLine() {
    if (!state.last?.lineRepId) return false;
    const rep = state.manager.get(state.last.lineRepId);
    if (!rep) return false;
    rep.setOptions({
        style: {
            colorScheme: document.querySelector('#colorScheme')?.value || 'element',
            opacity: Number(document.querySelector('#opacity')?.value || 1),
        },
        geometry: {
            bondTopology: {
                force: true,
                inferIfExistingBonds: true,
                includeHydrogen: document.querySelector('#includeHydrogen')?.checked ?? true,
            },
        },
    });
    rep.rebuild();
    validate();
    return true;
}

function installGlobals() {
    window.provr = window.provr || {};
    window.provr.render = {
        proteinSystem,
        loader,
        viewport: state.viewport,
        registry: state.registry,
        context: state.context,
        manager: state.manager,
        last: state.last,
        model: null,
        lineRep: null,
        lineRepId: null,
        loadAndRenderFile,
        validate,
        rebuildCurrentLine,
        printModels,
        printScene,
        printTargets,
        printBonds,
        printLineSummary,
        pickRegistrySummary() {
            const summary = state.context?.pickRegistry?.summary?.() || null;
            console.log(summary);
            return summary;
        },
    };
}

async function bindUI() {
    await setupViewport();
    installGlobals();

    const input = document.querySelector('#structureFileInput');
    input.addEventListener('change', async () => {
        const files = [...(input.files || [])];
        if (!files.length) return;
        for (const file of files) {
            try {
                await loadAndRenderFile(file);
            } catch (err) {
                console.error(err);
                updateStatus(`failed: ${err.message}`, 'error');
            }
        }
    });

    document.querySelector('#validateButton').addEventListener('click', validate);
    document.querySelector('#rebuildButton').addEventListener('click', rebuildCurrentLine);
    document.querySelector('#centerButton').addEventListener('click', () => {
        if (state.last?.model) state.viewport.centerOnModel(state.last.model);
    });
    document.querySelector('#clearButton').addEventListener('click', () => {
        state.manager.dispose();
        state.context.pickRegistry.clear();
        state.last = null;
        updateSummaryBox({message: 'cleared representations; loaded ProteinModels remain in ProteinSystem'});
        updateStatus('cleared representations');
    });

    updateStatus('ready');
}

bindUI().catch((err) => {
    console.error(err);
    updateStatus(`failed to initialize viewport: ${err.message}`, 'error');
});
