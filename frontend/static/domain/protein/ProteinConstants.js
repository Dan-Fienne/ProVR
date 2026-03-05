export const ChainType = Object.freeze({
    AA: 'AA',
    NA: 'NA',
    HET: 'HET',
    UNK: 'UNK',
});

export const SSEType = Object.freeze({
    HELIX: 'HELIX',
    SHEET: 'SHEET',
    LOOP: 'LOOP',
});

export const AminoAcids = new Set([
    'ALA', 'GLY', 'ILE', 'LEU', 'PRO', 'VAL', 'PHE', 'TRP', 'TYR',
    'ASP', 'GLU', 'ARG', 'HIS', 'LYS', 'SER', 'THR', 'CYS', 'MET', 'ASN', 'GLN'
]);

export const NucleicAcids = new Set(['A', 'DA', 'C', 'DC', 'G', 'DG', 'U', 'DT']);

export function detectChainType(resName) {
    const key = (resName || '').toUpperCase();
    if (AminoAcids.has(key)) return ChainType.AA;
    if (NucleicAcids.has(key)) return ChainType.NA;
    return ChainType.UNK;
}