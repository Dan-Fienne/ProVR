export const ChainType = Object.freeze({
    AA: 'AA',
    NA: 'NA',
    HET: 'HET',
    UNK: 'UNK',
});

export const ResidueKind = Object.freeze({
    PROTEIN: 'PROTEIN',
    NUCLEIC: 'NUCLEIC',
    HETEROGEN: 'HETEROGEN',
    WATER: 'WATER',
    UNKNOWN: 'UNKNOWN',
});

export const RecordType = Object.freeze({
    HEADER: 'HEADER',
    ATOM: 'ATOM',
    HETATM: 'HETATM',
    CONNECT: 'CONECT',
    HELIX: 'HELIX',
    SHEET: 'SHEET'
});

export const SSEType = Object.freeze({
    HELIX: 'HELIX',
    SHEET: 'SHEET',
    LOOP: 'LOOP',
});

export const AminoAcids = new Set([
    'ALA', 'GLY', 'ILE', 'LEU', 'PRO', 'VAL', 'PHE', 'TRP', 'TYR',
    'ASP', 'GLU', 'ARG', 'HIS', 'LYS', 'SER', 'THR', 'CYS', 'MET', 'ASN', 'GLN',
    'HID', 'HIE', 'HIP', 'CYX', 'MSE', 'SEC', 'PYL'
]);

export const NucleicAcids = new Set([
    'A', 'C', 'G', 'U',
    'DA', 'DC', 'DG', 'DT', 'DI',
    'ADE', 'CYT', 'GUA', 'URA', 'THY'
]);

export const WaterResidues = new Set([
    'HOH', 'WAT', 'H2O', 'DOD', 'SOL'
]);

export function normalizeResidueName(resName = '') {
    return String(resName).trim().toUpperCase() || 'UNK';
}

export function normalizeRecordType(recordType = RecordType.ATOM) {
    const key = String(recordType).trim().toUpperCase();
    return key === RecordType.HETATM ? RecordType.HETATM : RecordType.ATOM;
}

export function detectChainType(resName) {
    const key = normalizeResidueName(resName);
    if (AminoAcids.has(key)) return ChainType.AA;
    if (NucleicAcids.has(key)) return ChainType.NA;
    if (WaterResidues.has(key)) return ChainType.HET;
    return ChainType.UNK;
}