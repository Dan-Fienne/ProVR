export const ResidueKind = Object.freeze({
    PROTEIN: 'protein',
    NUCLEIC: 'nucleic',
    HETEROGEN: 'heterogen',
    WATER: 'water',
    UNKNOWN: 'unknown',
});

export const ChainType = Object.freeze({
    PROTEIN: 'protein',
    NUCLEIC: 'nucleic',
    HETEROGEN: 'heterogen',
    MIXED: 'mixed',
    UNKNOWN: 'unknown',
});

export const RecordType = Object.freeze({
    HEADER: 'HEADER',
    ATOM: 'ATOM',
    HETATM: 'HETATM',
    CONNECT: 'CONECT',
    HELIX: 'HELIX',
    SHEET: 'SHEET',
});

export const SSEType = Object.freeze({
    HELIX: 'helix',
    SHEET: 'sheet',
    LOOP: 'loop',
    TURN: 'turn',
    UNKNOWN: 'unknown',
});

export const StandardProteinResidues = Object.freeze(new Set([
    'ALA','ARG','ASN','ASP','CYS','GLN','GLU','GLY','HIS','ILE',
    'LEU','LYS','MET','PHE','PRO','SER','THR','TRP','TYR','VAL',
    'SEC','PYL',
]));

export const StandardNucleicResidues = Object.freeze(new Set([
    'A','C','G','U','T','DA','DC','DG','DT','DU','ADE','CYT','GUA','URA','THY',
]));

export const WaterResidues = Object.freeze(new Set([
    'HOH','WAT','H2O','DOD',
]));

export function isProteinResidueName(name) {
    return StandardProteinResidues.has(String(name || '').trim().toUpperCase());
}

export function isNucleicResidueName(name) {
    return StandardNucleicResidues.has(String(name || '').trim().toUpperCase());
}

export function isWaterResidueName(name) {
    return WaterResidues.has(String(name || '').trim().toUpperCase());
}
