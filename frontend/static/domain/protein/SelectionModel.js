export class SelectionModel {
    constructor() {
        this.atoms = new Set();
        this.residues = new Set();
        this.chains = new Set();
    }

    clear() {
        this.atoms.clear();
        this.residues.clear();
        this.chains.clear();
    }

    toJSON() {
        return {
            atoms: [...this.atoms],
            residues: [...this.residues],
            chains: [...this.chains],
        };
    }
}