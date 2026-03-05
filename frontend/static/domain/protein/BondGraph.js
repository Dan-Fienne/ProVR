export class BondGraph {
    constructor() {
        this._adj = new Map();
    }

    addBond(a, b) {
        if (a === b) return;
        if (!this._adj.has(a)) this._adj.set(a, new Set());
        if (!this._adj.has(b)) this._adj.set(b, new Set());
        this._adj.get(a).add(b);
        this._adj.get(b).add(a);
    }

    removeBond(a, b) {
        const sa = this._adj.get(a);
        const sb = this._adj.get(b);
        if (sa) sa.delete(b);
        if (sb) sb.delete(a);
    }

    neighbors(atomId) {
        return this._adj.get(atomId) || new Set();
    }

    hasBond(a, b) {
        const s = this._adj.get(a);
        return !!s && s.has(b);
    }

    clear() {
        this._adj.clear();
    }
}