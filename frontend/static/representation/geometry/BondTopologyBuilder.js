import {ResidueKind} from '../../domain/protein/ProteinConstants.js';

const DEFAULT_OPTIONS = Object.freeze({
    force: false,
    inferIfExistingBonds: true,
    inferProteinInternal: true,
    inferProteinPeptide: true,
    inferNucleicInternal: true,
    inferNucleicBackbone: true,
    inferHeterogenInternal: true,
    inferUnknownInternal: false,
    includeHydrogen: true,
    internalTolerance: 0.45,
    heterogenTolerance: 0.50,
    maxInternalDistance: 2.05,
    maxHeterogenDistance: 2.35,
    minBondDistance: 0.35,
    peptideMinDistance: 1.05,
    peptideMaxDistance: 1.70,
    nucleicBackboneMinDistance: 1.20,
    nucleicBackboneMaxDistance: 1.90,
});

const COVALENT_RADII = Object.freeze({
    H: 0.31,
    C: 0.76,
    N: 0.71,
    O: 0.66,
    S: 1.05,
    P: 1.07,
    F: 0.57,
    CL: 1.02,
    BR: 1.20,
    I: 1.39,
    FE: 1.24,
    MG: 1.30,
    CA: 1.74,
    ZN: 1.22,
    CU: 1.32,
    MN: 1.39,
});

function normalizeElement(element = '') {
    const e = String(element || '').trim().toUpperCase();
    if (!e) return 'X';
    if (e.length === 1) return e;
    const two = e.slice(0, 2);
    if (COVALENT_RADII[two] != null) return two;
    return e[0];
}

function covalentRadius(atom) {
    const key = normalizeElement(atom?.element || atom?.name || '');
    return COVALENT_RADII[key] ?? 0.77;
}

function edgeKey(a, b) {
    const x = String(a);
    const y = String(b);
    return x < y ? `${x}|${y}` : `${y}|${x}`;
}

function distance(model, atomA, atomB) {
    const a = model.getAtomPosition(atomA.id);
    const b = model.getAtomPosition(atomB.id);
    if (!a || !b) return Infinity;
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function listBondEdges(model) {
    const edges = [];
    const seen = new Set();
    for (const [a, neighbors] of model.bondGraph._adj.entries()) {
        for (const b of neighbors) {
            const key = edgeKey(a, b);
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push([a, b]);
        }
    }
    return edges;
}

function getAtomByName(model, residue, names) {
    const wanted = new Set(names.map((n) => String(n).toUpperCase()));
    for (const atomId of residue.atomIds || []) {
        const atom = model.getAtom(atomId);
        if (atom && wanted.has(atom.name.toUpperCase())) return atom;
    }
    return null;
}

function residueAtoms(model, residue) {
    return (residue.atomIds || []).map((id) => model.getAtom(id)).filter(Boolean);
}

function shouldInferInternalBond(model, atomA, atomB, options, maxDistance, tolerance) {
    if (atomA.id === atomB.id) return false;
    const elA = normalizeElement(atomA.element || atomA.name);
    const elB = normalizeElement(atomB.element || atomB.name);
    if (!options.includeHydrogen && (elA === 'H' || elB === 'H')) return false;

    const d = distance(model, atomA, atomB);
    if (d < options.minBondDistance || d > maxDistance) return false;

    const threshold = covalentRadius(atomA) + covalentRadius(atomB) + tolerance;
    return d <= threshold;
}

function chainResiduesInOrder(model, chain) {
    return (chain.residueIds || [])
        .map((rid) => model.residues.get(rid))
        .filter(Boolean)
        .sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            if (a.seqNum !== b.seqNum) return a.seqNum - b.seqNum;
            return String(a.insCode || '').localeCompare(String(b.insCode || ''));
        });
}

class BondTopologyAccumulator {
    constructor(model) {
        this.model = model;
        this.records = new Map();
        this.summary = {
            totalBondsBefore: 0,
            totalBondsAfter: 0,
            addedBonds: 0,
            explicitBonds: 0,
            bySource: {},
            byKind: {},
            warnings: [],
        };

        for (const [a, b] of listBondEdges(model)) {
            const key = edgeKey(a, b);
            const atomA = model.getAtom(a);
            const atomB = model.getAtom(b);
            this.records.set(key, this._record(atomA, atomB, {
                source: 'explicit',
                kind: 'explicit',
                distance: atomA && atomB ? distance(model, atomA, atomB) : null,
            }));
        }
        this.summary.totalBondsBefore = this.records.size;
        this.summary.explicitBonds = this.records.size;
    }

    add(atomA, atomB, {source, kind}) {
        if (!atomA || !atomB || atomA.id === atomB.id) return false;
        const key = edgeKey(atomA.id, atomB.id);
        if (this.records.has(key) || this.model.bondGraph.hasBond(atomA.id, atomB.id)) {
            if (!this.records.has(key)) {
                this.records.set(key, this._record(atomA, atomB, {source: 'existing', kind: 'existing'}));
            }
            return false;
        }
        this.model.bondGraph.addBond(atomA.id, atomB.id);
        this.records.set(key, this._record(atomA, atomB, {
            source,
            kind,
            distance: distance(this.model, atomA, atomB),
        }));
        this.summary.addedBonds += 1;
        this.summary.bySource[source] = (this.summary.bySource[source] || 0) + 1;
        this.summary.byKind[kind] = (this.summary.byKind[kind] || 0) + 1;
        return true;
    }

    _record(atomA, atomB, {source, kind, distance: d = null}) {
        const residueA = atomA ? this.model.residues.get(atomA.residueId) : null;
        const residueB = atomB ? this.model.residues.get(atomB.residueId) : null;
        return {
            atomIds: atomA && atomB ? [atomA.id, atomB.id] : [],
            residueIds: [residueA?.id, residueB?.id].filter(Boolean),
            chainIds: [...new Set([residueA?.chainId, residueB?.chainId].filter(Boolean))],
            source,
            kind,
            distance: d,
            atomNames: [atomA?.name, atomB?.name].filter(Boolean),
            residueNames: [residueA?.name, residueB?.name].filter(Boolean),
        };
    }

    finish() {
        this.summary.totalBondsAfter = this.records.size;
        this.model.info.bondTopology = {
            builtAt: new Date().toISOString(),
            builtForRevision: this.model.revision,
            summary: {...this.summary},
            records: [...this.records.values()],
        };
        return this.model.info.bondTopology;
    }
}

function inferInternalResidueBonds(model, residue, accumulator, options) {
    if (residue.isWater) return;
    if (residue.isProtein && !options.inferProteinInternal) return;
    if (residue.isNucleic && !options.inferNucleicInternal) return;
    if (residue.isHeterogen && !options.inferHeterogenInternal) return;
    if (residue.isUnknown && !options.inferUnknownInternal) return;

    const atoms = residueAtoms(model, residue);
    const tolerance = residue.isHeterogen ? options.heterogenTolerance : options.internalTolerance;
    const maxDistance = residue.isHeterogen ? options.maxHeterogenDistance : options.maxInternalDistance;
    const source = residue.isHeterogen ? 'inferred-het-distance' : 'inferred-residue-distance';
    const kind = residue.isProtein
        ? 'proteinInternal'
        : residue.isNucleic
            ? 'nucleicInternal'
            : residue.isHeterogen
                ? 'heterogenInternal'
                : 'unknownInternal';

    for (let i = 0; i < atoms.length; i += 1) {
        for (let j = i + 1; j < atoms.length; j += 1) {
            if (shouldInferInternalBond(model, atoms[i], atoms[j], options, maxDistance, tolerance)) {
                accumulator.add(atoms[i], atoms[j], {source, kind});
            }
        }
    }
}

function inferProteinPeptideBonds(model, chain, accumulator, options) {
    if (!options.inferProteinPeptide) return;
    const residues = chainResiduesInOrder(model, chain).filter((r) => r.isProtein);
    for (let i = 0; i < residues.length - 1; i += 1) {
        const current = residues[i];
        const next = residues[i + 1];
        if (next.seqNum - current.seqNum > 2) continue;
        const c = getAtomByName(model, current, ['C']);
        const n = getAtomByName(model, next, ['N']);
        if (!c || !n) continue;
        const d = distance(model, c, n);
        if (d >= options.peptideMinDistance && d <= options.peptideMaxDistance) {
            accumulator.add(c, n, {source: 'inferred-peptide', kind: 'peptide'});
        }
    }
}

function inferNucleicBackboneBonds(model, chain, accumulator, options) {
    if (!options.inferNucleicBackbone) return;
    const residues = chainResiduesInOrder(model, chain).filter((r) => r.isNucleic);
    for (let i = 0; i < residues.length - 1; i += 1) {
        const current = residues[i];
        const next = residues[i + 1];
        const o3 = getAtomByName(model, current, ["O3'", 'O3*']);
        const p = getAtomByName(model, next, ['P']);
        if (!o3 || !p) continue;
        const d = distance(model, o3, p);
        if (d >= options.nucleicBackboneMinDistance && d <= options.nucleicBackboneMaxDistance) {
            accumulator.add(o3, p, {source: 'inferred-nucleic-backbone', kind: 'nucleicBackbone'});
        }
    }
}

export function buildBondTopology(model, userOptions = {}) {
    if (!model) throw new Error('[BondTopologyBuilder] model is required');
    const options = {...DEFAULT_OPTIONS, ...userOptions};
    const existing = model.info?.bondTopology;
    if (!options.force && existing?.builtForRevision === model.revision && existing?.summary?.totalBondsAfter > 0) {
        return existing;
    }

    const accumulator = new BondTopologyAccumulator(model);
    const hasExisting = accumulator.summary.totalBondsBefore > 0;

    if (!hasExisting || options.inferIfExistingBonds) {
        for (const residue of model.residues.values()) {
            inferInternalResidueBonds(model, residue, accumulator, options);
        }
        for (const chain of model.chains.values()) {
            inferProteinPeptideBonds(model, chain, accumulator, options);
            inferNucleicBackboneBonds(model, chain, accumulator, options);
        }
    }

    return accumulator.finish();
}

export function getBondTopologyRecords(model) {
    if (model?.info?.bondTopology?.records) return model.info.bondTopology.records;
    return listBondEdges(model).map(([a, b]) => {
        const atomA = model.getAtom(a);
        const atomB = model.getAtom(b);
        const residueA = atomA ? model.residues.get(atomA.residueId) : null;
        const residueB = atomB ? model.residues.get(atomB.residueId) : null;
        return {
            atomIds: [a, b],
            residueIds: [residueA?.id, residueB?.id].filter(Boolean),
            chainIds: [...new Set([residueA?.chainId, residueB?.chainId].filter(Boolean))],
            source: 'bondGraph',
            kind: 'bondGraph',
            distance: atomA && atomB ? distance(model, atomA, atomB) : null,
            atomNames: [atomA?.name, atomB?.name].filter(Boolean),
            residueNames: [residueA?.name, residueB?.name].filter(Boolean),
        };
    });
}

export function countBondGraphEdges(model) {
    return listBondEdges(model).length;
}

export function listBondGraphEdges(model) {
    return listBondEdges(model);
}
