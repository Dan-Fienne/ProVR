export class StructureFilter {
    constructor({
                    protein = true,
                    nucleic = true,
                    heterogen = true,
                    water = false,
                    unknown = false,
                    chainIds = null,
                    residueIds = null,
                    atomIds = null,
                } = {}) {
        this.protein = protein;
        this.nucleic = nucleic;
        this.heterogen = heterogen;
        this.water = water;
        this.unknown = unknown;
        this.chainIds = chainIds ? new Set(chainIds) : null;
        this.residueIds = residueIds ? new Set(residueIds) : null;
        this.atomIds = atomIds ? new Set(atomIds) : null;
    }

    acceptResidue(residue) {
        if (!residue) return false;
        if (this.chainIds && !this.chainIds.has(residue.chainId)) return false;
        if (this.residueIds && !this.residueIds.has(residue.id)) return false;
        if (residue.isProtein) return this.protein;
        if (residue.isNucleic) return this.nucleic;
        if (residue.isHeterogen) return this.heterogen;
        if (residue.isWater) return this.water;
        return this.unknown;
    }

    acceptAtom(atom, model) {
        if (!atom) return false;
        if (this.atomIds && !this.atomIds.has(atom.id)) return false;
        const residue = model.residues.get(atom.residueId);
        return this.acceptResidue(residue);
    }

    acceptBond(atomA, atomB, model) {
        return this.acceptAtom(atomA, model) && this.acceptAtom(atomB, model);
    }
}

export function createStructureFilter(options = {}) {
    return new StructureFilter(options);
}
