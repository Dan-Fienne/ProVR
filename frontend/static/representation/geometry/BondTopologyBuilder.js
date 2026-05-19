import {ResidueKind} from '../../domain/protein/ProteinConstants.js';

const COVALENT_HINTS = Object.freeze({
    H: 0.37,
    C: 0.77,
    N: 0.75,
    O: 0.73,
    S: 1.02,
    P: 1.06,
});

function elementRadius(atom) {
    const e = String(atom?.element || atom?.name || 'C').trim().toUpperCase();
    return COVALENT_HINTS[e.slice(0, 2)] || COVALENT_HINTS[e[0]] || 0.77;
}

function dist2(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
}

function bondKey(a, b) {
    return String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`;
}

function normalizeRecord(input = {}) {
    const atomIds = input.atomIds
        ? [...input.atomIds]
        : [input.atomAId ?? input.a ?? input.atom1, input.atomBId ?? input.b ?? input.atom2];

    const a = atomIds[0];
    const b = atomIds[1];

    if (a === null || a === undefined || b === null || b === undefined) return null;

    return {
        ...input,
        atomIds: [a, b],
        atomAId: a,
        atomBId: b,
        key: input.key || bondKey(a, b),
        kind: input.kind || input.source || 'bond',
        source: input.source || input.kind || 'bond-topology',
        metadata: {...(input.metadata || {})},
    };
}

function addRecord(records, graph, a, b, kind, metadata = {}) {
    if (!a || !b || a.id === b.id) return false;

    const existing = graph.hasBond(a.id, b.id);
    if (!existing) graph.addBond(a.id, b.id, {kind, ...metadata});

    // Even if the bond already existed in BondGraph, the topology record is still useful
    // for representation builders.
    const record = normalizeRecord({
        atomIds: [a.id, b.id],
        atomAId: a.id,
        atomBId: b.id,
        kind,
        source: kind,
        metadata,
    });

    if (record) records.push(record);
    return true;
}

/**
 * Build/refresh model.info.bondTopology.records.
 *
 * The public record shape is intentionally backward-compatible:
 * {
 *   atomIds: [a, b],
 *   atomAId: a,
 *   atomBId: b,
 *   kind,
 *   source,
 *   metadata
 * }
 */
export class BondTopologyBuilder {
    constructor({
                    maxResidueInternalDistance = 2.05,
                    peptideDistance = 1.75,
                    heterogenDistanceScale = 1.22,
                    includeExistingBondGraph = true,
                } = {}) {
        this.maxResidueInternalDistance = maxResidueInternalDistance;
        this.peptideDistance = peptideDistance;
        this.heterogenDistanceScale = heterogenDistanceScale;
        this.includeExistingBondGraph = includeExistingBondGraph;
    }

    build(model, {clearExisting = false, includeExistingBondGraph = this.includeExistingBondGraph} = {}) {
        if (!model) throw new Error('[BondTopologyBuilder] model is required');

        const records = [];

        if (clearExisting) {
            model.bondGraph.clear();
        } else if (includeExistingBondGraph) {
            this._copyExistingBondGraphRecords(model, records);
        }

        this._inferResidueInternalBonds(model, records);
        this._inferPeptideBonds(model, records);
        this._inferHeterogenInternalBonds(model, records);

        const uniqueRecords = dedupeBondTopologyRecords(records);

        const summary = {
            inferredRecords: uniqueRecords.length,
            bondGraph: model.bondGraph.summary(),
            byKind: uniqueRecords.reduce((out, r) => {
                out[r.kind] = (out[r.kind] || 0) + 1;
                return out;
            }, {}),
        };

        model.info.bondTopology = {
            summary,
            records: uniqueRecords,
        };

        return {summary, records: uniqueRecords};
    }

    _copyExistingBondGraphRecords(model, records) {
        for (const [a, b, metadata = {}] of model.bondGraph.edges()) {
            const record = normalizeRecord({
                atomIds: [a, b],
                atomAId: a,
                atomBId: b,
                kind: metadata.kind || 'explicit',
                source: metadata.source || metadata.kind || 'bondGraph',
                metadata,
            });
            if (record) records.push(record);
        }
    }

    _inferResidueInternalBonds(model, records) {
        for (const residue of model.residues.values()) {
            if (residue.kind !== ResidueKind.PROTEIN && residue.kind !== ResidueKind.NUCLEIC) continue;

            const atoms = residue.atomIds.map((id) => model.getAtom(id)).filter(Boolean);

            for (let i = 0; i < atoms.length; i += 1) {
                for (let j = i + 1; j < atoms.length; j += 1) {
                    const a = atoms[i];
                    const b = atoms[j];
                    const pa = model.getAtomPosition(a.id);
                    const pb = model.getAtomPosition(b.id);
                    if (!pa || !pb) continue;

                    const cutoff = Math.min(
                        this.maxResidueInternalDistance,
                        elementRadius(a) + elementRadius(b) + 0.55
                    );

                    if (dist2(pa, pb) <= cutoff * cutoff) {
                        addRecord(records, model.bondGraph, a, b, 'residue-internal', {
                            residueId: residue.id,
                        });
                    }
                }
            }
        }
    }

    _inferPeptideBonds(model, records) {
        for (const chain of model.chains.values()) {
            const residues = (chain.residueIds || [])
                .map((id) => model.residues.get(id))
                .filter(Boolean);

            for (let i = 0; i < residues.length - 1; i += 1) {
                const r1 = residues[i];
                const r2 = residues[i + 1];

                if (!r1.isProtein || !r2.isProtein) continue;

                const c = this._atomByName(model, r1, 'C');
                const n = this._atomByName(model, r2, 'N');
                if (!c || !n) continue;

                const pc = model.getAtomPosition(c.id);
                const pn = model.getAtomPosition(n.id);
                if (pc && pn && dist2(pc, pn) <= this.peptideDistance * this.peptideDistance) {
                    addRecord(records, model.bondGraph, c, n, 'peptide', {
                        fromResidueId: r1.id,
                        toResidueId: r2.id,
                    });
                }
            }
        }
    }

    _inferHeterogenInternalBonds(model, records) {
        for (const residue of model.residues.values()) {
            if (residue.kind !== ResidueKind.HETEROGEN) continue;

            const atoms = residue.atomIds.map((id) => model.getAtom(id)).filter(Boolean);

            for (let i = 0; i < atoms.length; i += 1) {
                for (let j = i + 1; j < atoms.length; j += 1) {
                    const a = atoms[i];
                    const b = atoms[j];
                    const pa = model.getAtomPosition(a.id);
                    const pb = model.getAtomPosition(b.id);
                    if (!pa || !pb) continue;

                    const cutoff = (elementRadius(a) + elementRadius(b)) * this.heterogenDistanceScale;
                    if (dist2(pa, pb) <= cutoff * cutoff) {
                        addRecord(records, model.bondGraph, a, b, 'heterogen-internal', {
                            residueId: residue.id,
                        });
                    }
                }
            }
        }
    }

    _atomByName(model, residue, name) {
        return residue.atomIds
            .map((id) => model.getAtom(id))
            .find((atom) => atom?.name === name || atom?.atomName === name) || null;
    }
}

export function dedupeBondTopologyRecords(records = []) {
    const out = [];
    const seen = new Set();

    for (const input of records) {
        const record = normalizeRecord(input);
        if (!record) continue;
        if (seen.has(record.key)) continue;
        seen.add(record.key);
        out.push(record);
    }

    return out;
}

export function getBondTopologyRecords(model, {buildIfMissing = true} = {}) {
    if (!model) return [];

    const rawRecords = model.info?.bondTopology?.records;

    if (Array.isArray(rawRecords) && rawRecords.length) {
        return dedupeBondTopologyRecords(rawRecords);
    }

    if (buildIfMissing) {
        return buildBondTopology(model).records;
    }

    return [];
}

export function buildBondTopology(model, options = {}) {
    return new BondTopologyBuilder(options).build(model, options);
}
