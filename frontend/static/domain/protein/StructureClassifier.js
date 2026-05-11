import {
    AminoAcids,
    ChainType,
    NucleicAcids,
    RecordType,
    ResidueKind,
    WaterResidues,
    normalizeRecordType,
    normalizeResidueName,
} from "./ProteinConstants.js";

export function isWaterResidue(resName) {
    return WaterResidues.has(normalizeResidueName(resName));
}

export function isAminoAcid(resName) {
    return AminoAcids.has(normalizeResidueName(resName));
}

export function isNucleicAcid(resName) {
    return NucleicAcids.has(normalizeResidueName(resName));
}

export function classifyResidue({recordType = RecordType.ATOM, resName = 'UNK'} = {}) {
    const normalizedRecordType = normalizeRecordType(recordType);
    const name = normalizeResidueName(resName);

    if (isWaterResidue(name)) {
        return {
            recordType: normalizedRecordType,
            chainType: ChainType.HET,
            kind: ResidueKind.WATER,
            isProtein: false,
            isNucleic: false,
            isHeterogen: false,
            isWater: true,
            isUnknown: false,
        };
    }

    if (isAminoAcid(name)) {
        return {
            recordType: normalizedRecordType,
            chainType: ChainType.AA,
            kind: ResidueKind.PROTEIN,
            isProtein: true,
            isNucleic: false,
            isHeterogen: false,
            isWater: false,
            isUnknown: false,
        };
    }

    if (isNucleicAcid(name)) {
        return {
            recordType: normalizedRecordType,
            chainType: ChainType.NA,
            kind: ResidueKind.NUCLEIC,
            isProtein: false,
            isNucleic: true,
            isHeterogen: false,
            isWater: false,
            isUnknown: false,
        };
    }

    if (normalizedRecordType === RecordType.HETATM) {
        return {
            recordType: normalizedRecordType,
            chainType: ChainType.HET,
            kind: ResidueKind.HETEROGEN,
            isProtein: false,
            isNucleic: false,
            isHeterogen: true,
            isWater: false,
            isUnknown: false,
        };
    }

    return {
        recordType: normalizedRecordType,
        chainType: ChainType.UNK,
        kind: ResidueKind.UNKNOWN,
        isProtein: false,
        isNucleic: false,
        isHeterogen: false,
        isWater: false,
        isUnknown: true,
    };
}