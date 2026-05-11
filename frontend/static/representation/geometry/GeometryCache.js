function defaultKey({proteinId, namespace, name, revision = null, options = null}) {
    const opt = options ? JSON.stringify(options) : '';
    return [proteinId, namespace, name, revision ?? 'any', opt].join('::');
}

export class GeometryCache {
    constructor() {
        this._cache = new Map();
    }

    makeKey(parts) {
        return defaultKey(parts);
    }

    get(parts) {
        return this._cache.get(this.makeKey(parts)) || null;
    }

    set(parts, value) {
        const key = this.makeKey(parts);
        this._cache.set(key, value);
        return value;
    }

    getOrCreate(parts, factory) {
        const key = this.makeKey(parts);
        if (this._cache.has(key)) return this._cache.get(key);
        const value = factory();
        this._cache.set(key, value);
        return value;
    }

    invalidateProtein(proteinId) {
        let count = 0;
        for (const key of [...this._cache.keys()]) {
            if (key.startsWith(`${proteinId}::`)) {
                this._cache.delete(key);
                count += 1;
            }
        }
        return count;
    }

    clear() {
        this._cache.clear();
    }

    summary() {
        const rows = [];
        for (const [key, value] of this._cache.entries()) {
            rows.push({key, type: value?.constructor?.name || typeof value});
        }
        return {size: this._cache.size, rows};
    }
}
