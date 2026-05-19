import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {RepresentationRegistry} from '../representation/common/RepresentationRegistry.js';
import {RepresentationContext} from '../representation/common/RepresentationContext.js';
import {registerDebugRepresentations} from '../representation/debug/registerDebugRepresentations.js';

export class MockScene {
    constructor() {
        this.children = [];
    }
    add(object) {
        this.children.push(object);
    }
    remove(object) {
        this.children = this.children.filter((child) => child !== object);
    }
    clear() {
        this.children.length = 0;
    }
}

function countBy(rows, fn) {
    const out = {};
    for (const row of rows) {
        const key = fn(row) || 'unknown';
        out[key] = (out[key] || 0) + 1;
    }
    return out;
}

function summarizeTargets(records = []) {
    const rows = records.map((record) => {
        const t = record.target;
        return {
            pickId: record.id,
            representationId: record.representationId,
            kind: t.kind,
            atomCount: t.atomIds?.length || 0,
            residueCount: t.residueIds?.length || 0,
            chainCount: t.chainIds?.length || 0,
            chains: (t.chainIds || []).join(','),
            objectName: record.object?.name || '',
        };
    });
    return {
        total: rows.length,
        byKind: countBy(rows, (r) => r.kind),
        byRepresentation: countBy(rows, (r) => r.representationId),
        rows,
    };
}

function specRows(manager) {
    return manager.specs().map((spec) => ({
        id: spec.id,
        type: spec.type,
        proteinId: spec.proteinId,
        visible: spec.visible,
        filter: JSON.stringify(spec.filter),
        interaction: JSON.stringify(spec.interaction),
    }));
}

export function createRepresentationValidationEnvironment({proteinSystem, eventBus = null} = {}) {
    const scene = new MockScene();
    const registry = new RepresentationRegistry();
    registerDebugRepresentations(registry);
    const context = new RepresentationContext({proteinSystem, eventBus, scene});
    const manager = new RepresentationManager({context, registry, autoBindEvents: false});
    return {scene, registry, context, manager};
}

export function validateRepresentationSystem(model, {
    proteinSystem,
    eventBus = null,
    createDefaultSpecs = true,
} = {}) {
    if (!model) throw new Error('[RepresentationSystemValidator] model is required');
    if (!proteinSystem) throw new Error('[RepresentationSystemValidator] proteinSystem is required');

    const env = createRepresentationValidationEnvironment({proteinSystem, eventBus});
    const {manager, context, scene, registry} = env;
    const created = [];
    const issues = [];

    if (createDefaultSpecs) {
        const specs = [
            {
                id: `debug_atoms_all_${model.id}`,
                type: 'debug-atoms',
                proteinId: model.id,
                name: 'all non-water atoms',
                filter: {protein: true, nucleic: true, heterogen: true, water: false, unknown: false},
                interaction: {pickable: true, targetLevel: 'atom'},
            },
            {
                id: `debug_residues_polymer_${model.id}`,
                type: 'debug-residues',
                proteinId: model.id,
                name: 'protein+nucleic residues',
                filter: {protein: true, nucleic: true, heterogen: false, water: false, unknown: false},
                interaction: {pickable: true, targetLevel: 'residue'},
            },
            {
                id: `debug_atoms_het_${model.id}`,
                type: 'debug-atoms',
                proteinId: model.id,
                name: 'heterogen atoms',
                filter: {protein: false, nucleic: false, heterogen: true, water: false, unknown: false},
                interaction: {pickable: true, targetLevel: 'atom'},
            },
            {
                id: `debug_bonds_all_${model.id}`,
                type: 'debug-bonds',
                proteinId: model.id,
                name: 'explicit bonds currently in BondGraph',
                filter: {protein: true, nucleic: true, heterogen: true, water: false, unknown: false},
                interaction: {pickable: true, targetLevel: 'bond'},
            },
        ];

        for (const spec of specs) {
            try {
                created.push(manager.create(spec));
            } catch (err) {
                issues.push(`failed to create ${spec.id}: ${err.message}`);
            }
        }
    }

    const records = context.pickRegistry.list({proteinId: model.id});
    const targetSummary = summarizeTargets(records);

    if (created.length === 0) issues.push('no representation instances created');
    if (targetSummary.total === 0) issues.push('no pick targets registered');
    if ((targetSummary.byKind.atom || 0) === 0 && model.atoms.size > 0) issues.push('no atom pick targets registered');
    if ((targetSummary.byKind.residue || 0) === 0 && model.residues.size > 0) issues.push('no residue pick targets registered');

    return {
        ok: issues.length === 0,
        issues,
        env,
        summary: {
            proteinId: model.id,
            modelRevision: model.revision,
            atomCount: model.atoms.size,
            residueCount: model.residues.size,
            chainCount: model.chains.size,
            registryTypes: registry.list().map((r) => r.type),
            createdRepresentationIds: created,
            sceneObjectCount: scene.children.length,
            representationCount: manager.list().length,
            pickTargetCount: targetSummary.total,
            pickTargetsByKind: targetSummary.byKind,
            pickTargetsByRepresentation: targetSummary.byRepresentation,
        },
        representationSpecs: specRows(manager),
        pickTargetRows: targetSummary.rows,
    };
}

export function logRepresentationValidation(model, options = {}) {
    const report = validateRepresentationSystem(model, options);
    const status = report.ok ? 'OK' : 'ISSUES';
    console.group(`[ProVR Representation Validation] ${status}`);
    console.log('summary:', report.summary);
    if (report.issues.length) console.warn('issues:', report.issues);
    console.table(report.representationSpecs);
    console.table(report.pickTargetRows.slice(0, 50));
    console.groupEnd();
    return report;
}
