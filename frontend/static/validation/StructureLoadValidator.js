import {ResidueKind, RecordType} from '../domain/protein/ProteinConstants.js';

function emptyKindCounts() {
    return {
        [ResidueKind.PROTEIN]: 0,
        [ResidueKind.NUCLEIC]: 0,
        [ResidueKind.HETEROGEN]: 0,
        [ResidueKind.WATER]: 0,
        [ResidueKind.UNKNOWN]: 0,
    };
}

function emptyRecordCounts() {
    return {
        [RecordType.ATOM]: 0,
        [RecordType.HETATM]: 0,
    };
}

function countBonds(bondGraph) {
    let edgeEndpoints = 0;
    for (const neighbors of bondGraph._adj.values()) edgeEndpoints += neighbors.size;
    return edgeEndpoints / 2;
}

function firstN(iterable, n = 5) {
    const out = [];
    for (const item of iterable) {
        out.push(item);
        if (out.length >= n) break;
    }
    return out;
}

export function validateLoadedStructure(model, {sampleSize = 5} = {}) {
    const issues = [];
    const residueKinds = emptyKindCounts();
    const atomRecordTypes = emptyRecordCounts();
    const residuesByChain = {};
    const atomsByChain = {};

    if (!model) {
        return {
            ok: false,
            issues: ['model is null or undefined'],
            summary: null,
        };
    }

    if (model.atoms.size === 0) issues.push('no atoms parsed');
    if (model.residues.size === 0) issues.push('no residues parsed');
    if (model.chains.size === 0) issues.push('no chains parsed');

    for (const residue of model.residues.values()) {
        const kind = residue.kind || ResidueKind.UNKNOWN;
        residueKinds[kind] = (residueKinds[kind] ?? 0) + 1;
        residuesByChain[residue.chainId] = (residuesByChain[residue.chainId] ?? 0) + 1;
        if (!residue.atomIds || residue.atomIds.length === 0) {
            issues.push(`residue has no atoms: ${residue.id}`);
        }
    }

    for (const atom of model.atoms.values()) {
        const recordType = atom.recordType || RecordType.ATOM;
        atomRecordTypes[recordType] = (atomRecordTypes[recordType] ?? 0) + 1;
        const residue = model.residues.get(atom.residueId);
        if (!residue) {
            issues.push(`atom ${atom.id} points to missing residue ${atom.residueId}`);
            continue;
        }
        atomsByChain[residue.chainId] = (atomsByChain[residue.chainId] ?? 0) + 1;
        const p = model.getAtomPosition(atom.id);
        if (!p || p.some((v) => !Number.isFinite(v))) {
            issues.push(`atom ${atom.id} has invalid coordinates`);
        }
    }

    const sampleResidues = firstN(model.residues.values(), sampleSize).map((r) => ({
        id: r.id,
        name: r.name,
        chainId: r.chainId,
        label: r.label,
        kind: r.kind,
        recordType: r.recordType,
        atomCount: r.atomIds.length,
    }));

    const sampleAtoms = firstN(model.atoms.values(), sampleSize).map((a) => {
        const residue = model.residues.get(a.residueId);
        return {
            id: a.id,
            name: a.name,
            element: a.element,
            recordType: a.recordType,
            residue: residue ? `${residue.name} ${residue.chainId}${residue.label}` : a.residueId,
            position: model.getAtomPosition(a.id),
        };
    });

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            proteinId: model.id,
            format: model.info?.format || '',
            pdbId: model.info?.pdbId || '',
            atoms: model.atoms.size,
            residues: model.residues.size,
            chains: model.chains.size,
            bonds: countBonds(model.bondGraph),
            residueKinds,
            atomRecordTypes,
            residuesByChain,
            atomsByChain,
            secondaryRanges: model.secondary.ranges.length,
            sampleResidues,
            sampleAtoms,
        },
    };
}

export function logLoadValidation(model, {logger = console, sampleSize = 5} = {}) {
    const result = validateLoadedStructure(model, {sampleSize});
    const title = result.ok ? '[ProVR Load Validation] OK' : '[ProVR Load Validation] Issues found';
    logger.group?.(title);
    logger.log('summary:', result.summary);
    if (result.issues.length) logger.warn('issues:', result.issues);
    logger.groupEnd?.();
    return result;
}
