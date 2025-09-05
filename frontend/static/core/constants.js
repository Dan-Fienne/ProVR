// atom radio Å
export const elementRadius = Object.freeze({
    H: 1.20,
    C: 1.70,
    N: 1.55,
    O: 1.52,
    S: 1.80,
    P: 1.80,
    FE: 1.73,
    Cu: 1.40,
    Zn: 1.39,
    I: 1.98,
    Na: 2.27,
    K: 2.75,
    Mg: 1.73,
    Cl: 1.75,
    DEF: 1.60
});

export const elementColors = Object.freeze({
    H: [1., 1., 1.],
    C: [0.2, 0.2, 0.2],
    N: [0.2, 0.2, 1],
    O: [1, 0.13, 0.13],
    S: [1, 0.8, 0.25],
    P: [1, 0.5, 0],
    FE: [0.8, 0.47, 0.15],
    DEF: [0.7, 0.7, 0.7]
});

export const residueColors = Object.freeze({
    /* 1. 非极性脂肪族 */
    ALA: [0.40, 0.40, 0.40],
    GLY: [0.55, 0.55, 0.55],
    ILE: [0.35, 0.35, 0.35],
    LEU: [0.30, 0.30, 0.30],
    PRO: [0.45, 0.34, 0.25],
    VAL: [0.38, 0.38, 0.38],
    /* 2. 芳香族 */
    PHE: [0.85, 0.45, 0.00],
    TRP: [0.30, 0.00, 0.50],
    TYR: [0.90, 0.70, 0.00],
    /* 3. 极性不带电 */
    SER: [0.00, 0.70, 0.60],
    THR: [0.00, 0.60, 0.50],
    CYS: [0.90, 0.80, 0.00],
    MET: [0.85, 0.60, 0.20],
    ASN: [0.00, 0.50, 0.80],
    GLN: [0.00, 0.40, 0.70],
    /* 4. 酸性 */
    ASP: [0.80, 0.00, 0.00],
    GLU: [0.70, 0.00, 0.20],
    /* 5. 碱性 */
    ARG: [0.00, 0.00, 0.80],
    LYS: [0.20, 0.30, 0.75],
    HIS: [0.45, 0.15, 0.80],
    /* 6. 核酸 */
    A: [0.00, 0.50, 0.00],
    C: [0.00, 0.40, 0.90],
    G: [0.80, 0.60, 0.00],
    U: [0.75, 0.00, 0.20],
    DA: [0.00, 0.50, 0.00],
    DC: [0.00, 0.40, 0.90],
    DG: [0.80, 0.60, 0.00],
    DT: [0.75, 0.00, 0.20],
    /* 7. 其他／未知 */
    DEF: [0.30, 0.30, 0.30]
});

export const ssColor = Object.freeze({
    helix: [0.80, 0.00, 0.30],
    sheet: [0.95, 0.78, 0.05],
    loop: [0.00, 0.65, 0.35]
});

export const repMode = Object.freeze({
    hide: 0,
    line: 1,
    dot: 2,
    backBone: 3,
    sphere: 4,
    stick: 5,
    ballRod: 6,
    tube: 7,
    cartoon: 8,
    ribbon: 9,
    surface: 10
});

export const colorMode = Object.freeze({
    element: 0,
    residue: 1,
    secondary: 2,
    chain: 3,
    pdb: 4,
    hydrophobicity: 5,
    spectrum: 6
});


export const structureInfo = Object.freeze({
    backbone: {
        residue: ['N', 'CA', 'C'],
        dna: ["P", "O5'", "C5'", "C4'", "C3'", "O3'"]
    },
    residue: {
        /* 1. 非极性脂肪族 */
        ALA: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB'],
        GLY: ['N', 'CA', 'CA', 'C', 'C', 'O'],
        ILE: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG1', 'CB', 'CG2', 'CG1', 'CD1'],
        LEU: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'CD1', 'CG', 'CD2'],
        PRO: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'CD', 'CD', 'N'],
        VAL: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG1', 'CB', 'CG2'],
        /* 2. 芳香族 */
        PHE: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'CD1', 'CG', 'CD2', 'CD1', 'CE1', 'CD2', 'CE2', 'CE1', 'CZ', 'CE2', 'CZ'],
        TRP: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'CD1', 'CG', 'CD2', 'CD1', 'NE1', 'NE1', 'CE2', 'CD2', 'CE2', 'CD2', 'CE3', 'CE2', 'CZ2', 'CE3', 'CZ3', 'CZ2', 'CH2', 'CZ3', 'CH2'],
        TYR: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'CD1', 'CG', 'CD2', 'CD1', 'CE1', 'CD2', 'CE2', 'CE1', 'CZ', 'CE2', 'CZ', 'CZ', 'OH'],
        /* 3. 极性不带电 */
        SER: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'OG'],
        THR: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'OG1', 'CB', 'CG2'],
        CYS: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'SG'],
        MET: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'SD', 'SD', 'CE'],
        ASN: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'OD1', 'CG', 'ND2'],
        GLN: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'CD', 'CD', 'OE1', 'CD', 'NE2'],
        /* 4. 酸性 */
        ASP: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'OD1', 'CG', 'OD2'],
        GLU: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'CD', 'CD', 'OE1', 'CD', 'OE2'],
        /* 5. 碱性 */
        ARG: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'CD', 'CD', 'NE', 'NE', 'CZ', 'CZ', 'NH1', 'CZ', 'NH2'],
        HIS: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'ND1', 'CG', 'CD2', 'ND1', 'CE1', 'CD2', 'NE2', 'CE1', 'NE2'],
        LYS: ['N', 'CA', 'CA', 'C', 'C', 'O', 'CA', 'CB', 'CB', 'CG', 'CG', 'CD', 'CD', 'CE', 'CE', 'NZ'],
    },
    dna: {
        A: ["P", "OP1", "P", "OP2", "P", "O5'", "O5'", "C5'", "C5'", "C4'", "C4'", "O4'", "C4'", "C3'", "C3'", "O3'", "C3'", "C2'", "C2'", "O2'", "C2'", "C1'", "C1'", "O4'", "C1'", 'N9', 'N9', 'C8', 'C8', 'N7', 'N7', 'C5', 'C5', 'C6', 'C6', 'N6', 'C6', 'N1', 'N1', 'C2', 'C2', 'N3', 'N3', 'C4', 'C4', 'C5', 'C4', 'N9'],
        DA: ["P", "OP1", "P", "OP2", "P", "O5'", "O5'", "C5'", "C5'", "C4'", "C4'", "O4'", "C4'", "C3'", "C3'", "O3'", "C3'", "C2'", "C2'", "C1'", "C1'", "O4'", "C1'", 'N9', 'N9', 'C8', 'C8', 'N7', 'N7', 'C5', 'C5', 'C6', 'C6', 'N6', 'C6', 'N1', 'N1', 'C2', 'C2', 'N3', 'N3', 'C4', 'C4', 'C5', 'C4', 'N9'],
        C: ["P", "OP1", "P", "OP2", "P", "O5'", "O5'", "C5'", "C5'", "C4'", "C4'", "O4'", "C4'", "C3'", "C3'", "O3'", "C3'", "C2'", "C2'", "O2'", "C2'", "C1'", "C1'", "O4'", "C1'", 'N1', 'N1', 'C2', 'C2', 'O2', 'C2', 'N3', 'N3', 'C4', 'C4', 'N4', 'C4', 'C5', 'C5', 'C6', 'C6', 'N1'],
        DC: ["P", "OP1", "P", "OP2", "P", "O5'", "O5'", "C5'", "C5'", "C4'", "C4'", "O4'", "C4'", "C3'", "C3'", "O3'", "C3'", "C2'", "C2'", "C1'", "C1'", "O4'", "C1'", 'N1', 'N1', 'C2', 'C2', 'O2', 'C2', 'N3', 'N3', 'C4', 'C4', 'N4', 'C4', 'C5', 'C5', 'C6', 'C6', 'N1'],
        G: ["P", "OP1", "P", "OP2", "P", "O5'", "O5'", "C5'", "C5'", "C4'", "C4'", "O4'", "C4'", "C3'", "C3'", "O3'", "C3'", "C2'", "C2'", "O2'", "C2'", "C1'", "C1'", "O4'", "C1'", 'N9', 'N9', 'C8', 'C8', 'N7', 'N7', 'C5', 'C5', 'C6', 'C6', 'O6', 'C6', 'N1', 'N1', 'C2', 'C2', 'N2', 'C2', 'N3', 'N3', 'C4', 'C4', 'C5', 'C4', 'N9'],
        DG: ["P", "OP1", "P", "OP2", "P", "O5'", "O5'", "C5'", "C5'", "C4'", "C4'", "O4'", "C4'", "C3'", "C3'", "O3'", "C3'", "C2'", "C2'", "C1'", "C1'", "O4'", "C1'", 'N9', 'N9', 'C8', 'C8', 'N7', 'N7', 'C5', 'C5', 'C6', 'C6', 'O6', 'C6', 'N1', 'N1', 'C2', 'C2', 'N2', 'C2', 'N3', 'N3', 'C4', 'C4', 'C5', 'C4', 'N9'],
        U: ["P", "OP1", "P", "OP2", "P", "O5'", "O5'", "C5'", "C5'", "C4'", "C4'", "O4'", "C4'", "C3'", "C3'", "O3'", "C3'", "C2'", "C2'", "O2'", "C2'", "C1'", "C1'", "O4'", "C1'", 'N1', 'N1', 'C2', 'C2', 'O2', 'C2', 'N3', 'N3', 'C4', 'C4', 'O4', 'C4', 'C5', 'C5', 'C6', 'C6', 'N1'],
        DT: ["P", "OP1", "P", "OP2", "P", "O5'", "O5'", "C5'", "C5'", "C4'", "C4'", "O4'", "C4'", "C3'", "C3'", "O3'", "C3'", "C2'", "C2'", "C1'", "C1'", "O4'", "C1'", 'N1', 'N1', 'C2', 'C2', 'O2', 'C2', 'N3', 'N3', 'C4', 'C4', 'O4', 'C4', 'C5', 'C5', 'C7', 'C5', 'C6', 'C6', 'N1']
    },
    bridge: {
        residue: ['C', 'N'],
        dna: ["O3'", "P"]
    },
    center: {
        residue: "CA",
        dna: "P",
        DNA_5_UTR: "O5'",
        DNA_3_UTR: "O3'"
    },
    normal: {
        // cartoon normal vector 法向量
        residue: ["C", "O"],
        A: ["C5'", 'N1'],
        DA: ["C5'", 'N1'],
        C: ["C5'", 'N3'],
        DC: ["C5'", 'N3'],
        G: ["C5'", 'N1'],
        DG: ["C5'", 'N1'],
        U: ["C5'", 'N3'],
        DT: ["C5'", 'N3']
    },
    ssBond: ['CA', 'SG'],
})


export const sse = {
    helix_head: 'helix_head',
    helix_body: 'helix_body',
    helix_foot: 'helix_foot',

    sheet_head: 'sheet_head',
    sheet_body: 'sheet_body',
    sheet_foot: 'sheet_foot',

    loop_body: 'loop_body',
};


export default {
    structureInfo,
    elementRadius,
    repMode,
    colorMode,
    elementColors,
    residueColors,
    ssColor,
    sse,
}