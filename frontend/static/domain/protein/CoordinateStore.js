export class CoordinateStore {
    constructor(initialAtomCapacity = 200000) {
        this._capacity = Math.max(1024, initialAtomCapacity);
        this._positions = new Float32Array(this._capacity * 3);
        this._count = 0;
    }

    get count() {
        return this._count;
    }

    get capacity() {
        return this._capacity;
    }

    allocAtom(x = 0, y = 0, z = 0) {
        if (this._count >= this._capacity) this._grow();
        const idx = this._count++;
        const base = idx * 3;
        this._positions[base] = x;
        this._positions[base + 1] = y;
        this._positions[base + 2] = z;
        return idx;
    }

    setXYZ(positionIndex, x, y, z) {
        const base = positionIndex * 3;
        this._positions[base] = x;
        this._positions[base + 1] = y;
        this._positions[base + 2] = z;
    }

    getXYZ(positionIndex, out = [0, 0, 0]) {
        const base = positionIndex * 3;
        out[0] = this._positions[base];
        out[1] = this._positions[base + 1];
        out[2] = this._positions[base + 2];
        return out;
    }

    getX(i) {
        return this._positions[i * 3];
    }

    getY(i) {
        return this._positions[i * 3 + 1];
    }

    getZ(i) {
        return this._positions[i * 3 + 2];
    }

    _grow() {
        const nextCap = Math.floor(this._capacity * 1.5);
        const next = new Float32Array(nextCap * 3);
        next.set(this._positions);
        this._positions = next;
        this._capacity = nextCap;
    }
}