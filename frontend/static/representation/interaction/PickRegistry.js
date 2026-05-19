export class PickRegistry {
    constructor() {
        this._objectToRecord = new WeakMap();
        this._records = new Map();
        this._nextId = 1;
    }

    register(object, target, {representationId = null} = {}) {
        if (!object || !target) return null;

        const existingId = object.userData?.pickId;
        if (existingId) this.unregister(existingId);

        const id = `pick_${this._nextId++}`;
        const record = {id, object, target, representationId};
        this._objectToRecord.set(object, record);
        this._records.set(id, record);

        if (!object.userData) object.userData = {};
        object.userData.pickId = id;
        object.userData.target = target;
        object.userData.representationId = representationId || target.representationId || object.userData.representationId || null;
        object.userData.proteinId = target.proteinId;

        return id;
    }

    unregister(objectOrId) {
        if (!objectOrId) return false;

        const id = typeof objectOrId === 'string' ? objectOrId : objectOrId.userData?.pickId;
        if (!id) return false;

        const record = this._records.get(id);
        if (!record) return false;

        this._records.delete(id);

        if (record.object?.userData?.pickId === id) {
            delete record.object.userData.pickId;
            delete record.object.userData.target;
        }

        return true;
    }

    getTarget(objectOrId) {
        if (!objectOrId) return null;
        if (typeof objectOrId === 'string') return this._records.get(objectOrId)?.target || null;
        return this._objectToRecord.get(objectOrId)?.target || objectOrId.userData?.target || null;
    }

    getRecord(objectOrId) {
        if (!objectOrId) return null;
        if (typeof objectOrId === 'string') return this._records.get(objectOrId) || null;
        return this._objectToRecord.get(objectOrId) || null;
    }

    list({proteinId = null, representationId = null, kind = null} = {}) {
        return [...this._records.values()].filter((record) => {
            const t = record.target;
            if (proteinId && t.proteinId !== proteinId) return false;
            if (representationId && record.representationId !== representationId) return false;
            if (kind && t.kind !== kind) return false;
            return true;
        });
    }

    clear({representationId = null, proteinId = null} = {}) {
        const records = this.list({representationId, proteinId});
        let count = 0;
        for (const record of records) {
            if (this.unregister(record.id)) count += 1;
        }
        if (!representationId && !proteinId) {
            this._records.clear();
            this._objectToRecord = new WeakMap();
        }
        return count;
    }

    summary() {
        const out = {total: this._records.size, byKind: {}, byRepresentation: {}, byProtein: {}};
        for (const record of this._records.values()) {
            const kind = record.target?.kind || 'unknown';
            const rep = record.representationId || record.target?.representationId || 'none';
            const protein = record.target?.proteinId || 'none';
            out.byKind[kind] = (out.byKind[kind] || 0) + 1;
            out.byRepresentation[rep] = (out.byRepresentation[rep] || 0) + 1;
            out.byProtein[protein] = (out.byProtein[protein] || 0) + 1;
        }
        return out;
    }
}
