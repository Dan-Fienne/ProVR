export class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    on(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
        return () => this.off(type, handler);
    }

    once(type, handler) {
        const off = this.on(type, (payload) => {
            off();
            handler(payload);
        });
        return off;
    }

    off(type, handler) {
        const set = this._listeners.get(type);
        if (!set) return;
        set.delete(handler);
        if (set.size === 0) this._listeners.delete(type);
    }

    emit(type, payload = {}) {
        const set = this._listeners.get(type);
        if (!set) return;
        for (const fn of set) fn(payload);
    }

    clear() {
        this._listeners.clear();
    }
}