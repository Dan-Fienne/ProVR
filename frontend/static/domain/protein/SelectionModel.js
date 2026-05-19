export class SelectionModel {
    constructor() {
        this.atomIds = new Set();
        this.residueIds = new Set();
        this.chainIds = new Set();
        this.metadata = {};
    }

    set({atomIds = [], residueIds = [], chainIds = [], metadata = {}} = {}) {
        this.atomIds = new Set(atomIds);
        this.residueIds = new Set(residueIds);
        this.chainIds = new Set(chainIds);
        this.metadata = {...metadata};
    }

    clear() {
        this.atomIds.clear();
        this.residueIds.clear();
        this.chainIds.clear();
        this.metadata = {};
    }

    hasAny() {
        return this.atomIds.size > 0 || this.residueIds.size > 0 || this.chainIds.size > 0;
    }

    toJSON() {
        return {
            atomIds: [...this.atomIds],
            residueIds: [...this.residueIds],
            chainIds: [...this.chainIds],
            metadata: {...this.metadata},
        };
    }
}
