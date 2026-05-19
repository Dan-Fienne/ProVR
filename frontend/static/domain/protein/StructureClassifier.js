import {
    ChainType,
    RecordType,
    ResidueKind,
    isNucleicResidueName,
    isProteinResidueName,
    isWaterResidueName,
} from './ProteinConstants.js';

export function classifyResidue({recordType = RecordType.ATOM, resName = ''} = {}) {
    const name = String(resName || '').trim().toUpperCase();

    if (isWaterResidueName(name)) {
        return {
            kind: ResidueKind.WATER,
            chainType: ChainType.HETEROGEN,
            isProtein: false,
            isNucleic: false,
            isHeterogen: true,
            isWater: true,
            isUnknown: false,
        };
    }

    if (isProteinResidueName(name)) {
        return {
            kind: ResidueKind.PROTEIN,
            chainType: ChainType.PROTEIN,
            isProtein: true,
            isNucleic: false,
            isHeterogen: false,
            isWater: false,
            isUnknown: false,
        };
    }

    if (isNucleicResidueName(name)) {
        return {
            kind: ResidueKind.NUCLEIC,
            chainType: ChainType.NUCLEIC,
            isProtein: false,
            isNucleic: true,
            isHeterogen: false,
            isWater: false,
            isUnknown: false,
        };
    }

    if (String(recordType).toUpperCase() === RecordType.HETATM) {
        return {
            kind: ResidueKind.HETEROGEN,
            chainType: ChainType.HETEROGEN,
            isProtein: false,
            isNucleic: false,
            isHeterogen: true,
            isWater: false,
            isUnknown: false,
        };
    }

    return {
        kind: ResidueKind.UNKNOWN,
        chainType: ChainType.UNKNOWN,
        isProtein: false,
        isNucleic: false,
        isHeterogen: false,
        isWater: false,
        isUnknown: true,
    };
}

export function inferChainType(model, chainId) {
    const chain = model.chains.get(chainId);
    if (!chain) return ChainType.UNKNOWN;
    const counts = {};
    for (const residueId of chain.residueIds || []) {
        const residue = model.residues.get(residueId);
        if (!residue) continue;
        counts[residue.kind] = (counts[residue.kind] || 0) + 1;
    }
    const kinds = Object.keys(counts).filter((kind) => counts[kind] > 0);
    if (kinds.length === 1) {
        if (kinds[0] === ResidueKind.PROTEIN) return ChainType.PROTEIN;
        if (kinds[0] === ResidueKind.NUCLEIC) return ChainType.NUCLEIC;
        if (kinds[0] === ResidueKind.HETEROGEN || kinds[0] === ResidueKind.WATER) return ChainType.HETEROGEN;
    }
    return kinds.length ? ChainType.MIXED : ChainType.UNKNOWN;
}
