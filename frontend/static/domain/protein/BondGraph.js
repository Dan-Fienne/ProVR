export class BondGraph {
    constructor() {
        this._adj = new Map();
        this._metadata = new Map();
    }

    addAtom(atomId) {
        if (!this._adj.has(atomId)) this._adj.set(atomId, new Set());
    }

    addBond(a, b, metadata = {}) {
        if (a === null || a === undefined || b === null || b === undefined || a === b) return false;
        this.addAtom(a);
        this.addAtom(b);
        this._adj.get(a).add(b);
        this._adj.get(b).add(a);
        this._metadata.set(this._key(a, b), {...metadata});
        return true;
    }

    removeBond(a, b) {
        this._adj.get(a)?.delete(b);
        this._adj.get(b)?.delete(a);
        this._metadata.delete(this._key(a, b));
    }

    removeAtom(atomId) {
        const neighbors = [...(this._adj.get(atomId) || [])];
        for (const n of neighbors) this.removeBond(atomId, n);
        this._adj.delete(atomId);
    }

    hasBond(a, b) {
        return this._adj.get(a)?.has(b) || false;
    }

    neighbors(atomId) {
        return [...(this._adj.get(atomId) || [])];
    }

    metadata(a, b) {
        return this._metadata.get(this._key(a, b)) || null;
    }

    edges() {
        const out = [];
        const seen = new Set();
        for (const [a, neighbors] of this._adj.entries()) {
            for (const b of neighbors) {
                const key = this._key(a, b);
                if (seen.has(key)) continue;
                seen.add(key);
                out.push([a, b, this._metadata.get(key) || {}]);
            }
        }
        return out;
    }

    clear() {
        this._adj.clear();
        this._metadata.clear();
    }

    clone() {
        const next = new BondGraph();
        for (const [a, b, meta] of this.edges()) next.addBond(a, b, meta);
        return next;
    }

    summary() {
        let endpoints = 0;
        for (const neighbors of this._adj.values()) endpoints += neighbors.size;
        return {atoms: this._adj.size, bonds: endpoints / 2};
    }

    _key(a, b) {
        return String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`;
    }
}
