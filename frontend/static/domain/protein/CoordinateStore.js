export class CoordinateStore {
    constructor({initialAtomCapacity = 1024, growthFactor = 2} = {}) {
        this.growthFactor = Math.max(1.25, Number(growthFactor) || 2);
        this.capacity = Math.max(1, Number(initialAtomCapacity) || 1024);
        this.positions = new Float32Array(this.capacity * 3);
        this.count = 0;
        this._free = [];
    }

    allocate(x = 0, y = 0, z = 0) {
        const index = this._free.length ? this._free.pop() : this.count++;
        this._ensure(index + 1);
        this.setXYZ(index, x, y, z);
        return index;
    }

    allocateMany(count, positions = null) {
        const out = [];
        for (let i = 0; i < count; i += 1) {
            const p = positions?.[i] || [0, 0, 0];
            out.push(this.allocate(p[0], p[1], p[2]));
        }
        return out;
    }

    release(index) {
        this._assertIndex(index);
        this._free.push(index);
    }

    setXYZ(index, x, y, z) {
        this._assertIndex(index, {allowEnd: true});
        const offset = index * 3;
        this.positions[offset] = Number(x) || 0;
        this.positions[offset + 1] = Number(y) || 0;
        this.positions[offset + 2] = Number(z) || 0;
    }

    getXYZ(index, out = null) {
        this._assertIndex(index);
        const offset = index * 3;
        if (out) {
            out[0] = this.positions[offset];
            out[1] = this.positions[offset + 1];
            out[2] = this.positions[offset + 2];
            return out;
        }
        return [
            this.positions[offset],
            this.positions[offset + 1],
            this.positions[offset + 2],
        ];
    }

    setMany(positionMap) {
        for (const [index, p] of positionMap.entries()) this.setXYZ(index, p[0], p[1], p[2]);
    }

    snapshot(indices = null) {
        const out = new Map();
        const list = indices || [...Array(this.count).keys()];
        for (const index of list) {
            if (this.isValidIndex(index)) out.set(index, this.getXYZ(index));
        }
        return out;
    }

    applySnapshot(snapshot) {
        for (const [index, p] of snapshot.entries()) this.setXYZ(index, p[0], p[1], p[2]);
    }

    bounds(indices = null) {
        const list = indices || [...Array(this.count).keys()];
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        let n = 0;
        for (const index of list) {
            if (!this.isValidIndex(index)) continue;
            const p = this.getXYZ(index);
            for (let k = 0; k < 3; k += 1) {
                if (p[k] < min[k]) min[k] = p[k];
                if (p[k] > max[k]) max[k] = p[k];
            }
            n += 1;
        }
        return n ? {min, max, count: n} : null;
    }

    isValidIndex(index) {
        return Number.isInteger(index) && index >= 0 && index < this.count;
    }

    toTypedArray({trim = true} = {}) {
        return trim ? this.positions.slice(0, this.count * 3) : this.positions.slice();
    }

    clone() {
        const next = new CoordinateStore({initialAtomCapacity: this.capacity, growthFactor: this.growthFactor});
        next.capacity = this.capacity;
        next.positions = this.positions.slice();
        next.count = this.count;
        next._free = [...this._free];
        return next;
    }

    summary() {
        return {
            capacity: this.capacity,
            count: this.count,
            free: this._free.length,
            bytes: this.positions.byteLength,
        };
    }

    _ensure(atomCapacity) {
        if (atomCapacity <= this.capacity) return;
        let nextCapacity = this.capacity;
        while (nextCapacity < atomCapacity) nextCapacity = Math.ceil(nextCapacity * this.growthFactor);
        const next = new Float32Array(nextCapacity * 3);
        next.set(this.positions);
        this.positions = next;
        this.capacity = nextCapacity;
    }

    _assertIndex(index, {allowEnd = false} = {}) {
        const upper = allowEnd ? this.count : this.count - 1;
        if (!Number.isInteger(index) || index < 0 || index > upper) {
            throw new Error(`[CoordinateStore] invalid positionIndex: ${index}`);
        }
    }
}
