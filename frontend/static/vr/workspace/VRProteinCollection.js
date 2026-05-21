export class VRProteinCollection {
    constructor({context, representationFeature, onChange = () => {}} = {}) {
        this.context = context;
        this.representationFeature = representationFeature;
        this.onChange = onChange;
        this.records = new Map();
        this.activeProteinId = null;
    }

    addProtein({model, pdbId, repIds = {}} = {}) {
        if (!model?.id) throw new Error('[VRProteinCollection] model.id required');
        const record = {
            proteinId: model.id,
            pdbId: pdbId || model.id,
            model,
            repIds,
            visible: true,
            createdAt: Date.now(),
        };
        this.records.set(model.id, record);
        this.setActive(model.id);
        return record;
    }

    setActive(proteinId) {
        const record = this.records.get(proteinId);
        if (!record) return false;

        this.activeProteinId = proteinId;
        this._tryActivateContext(record);
        this.onChange();
        return true;
    }

    getActive() { return this.records.get(this.activeProteinId) || null; }
    getActiveModel() { return this.getActive()?.model || null; }
    get(proteinId) { return this.records.get(proteinId) || null; }

    list() {
        return [...this.records.values()].map((r) => ({
            proteinId: r.proteinId,
            pdbId: r.pdbId,
            visible: r.visible,
            active: r.proteinId === this.activeProteinId,
        }));
    }

    setVisible(proteinId, visible = true) {
        const record = this.records.get(proteinId);
        if (!record) return false;
        record.visible = !!visible;
        for (const repId of Object.values(record.repIds || {})) {
            if (repId) this.representationFeature?.setVisible?.(repId, record.visible);
        }
        this.onChange();
        return true;
    }

    showAll() { for (const id of this.records.keys()) this.setVisible(id, true); }
    hideNonActive() { for (const id of this.records.keys()) this.setVisible(id, id === this.activeProteinId); }

    updateRepIds(proteinId, repIds) {
        const record = this.records.get(proteinId);
        if (!record) return;
        record.repIds = repIds || {};
        this.onChange();
    }

    activeRepIds() { return this.getActive()?.repIds || {}; }

    summary() {
        return {
            activeProteinId: this.activeProteinId,
            count: this.records.size,
            proteins: this.list(),
        };
    }

    _tryActivateContext(record) {
        const proteinId = record.proteinId;
        const model = record.model;

        const candidates = [
            () => this.context?.setActiveProtein?.(proteinId),
            () => this.context?.activateProtein?.(proteinId),
            () => this.context?.proteinSystem?.setActiveProtein?.(proteinId),
            () => this.context?.proteinSystem?.setActive?.(proteinId),
            () => this.context?.proteinSystem?.activate?.(proteinId),
        ];

        for (const fn of candidates) {
            try {
                const result = fn();
                if (result !== undefined && result !== false) return true;
            } catch {
                // Try next activation API.
            }
        }

        // Last resort only if writable. Never write getter-only properties.
        this._tryWritableAssign(this.context, 'activeProteinId', proteinId);
        this._tryWritableAssign(this.context, 'activeModel', model);
        return false;
    }

    _tryWritableAssign(object, key, value) {
        if (!object) return false;
        try {
            const own = Object.getOwnPropertyDescriptor(object, key);
            const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(object), key);
            const desc = own || proto;

            if (!desc) {
                object[key] = value;
                return true;
            }
            if (typeof desc.set === 'function') {
                object[key] = value;
                return true;
            }
            if (desc.writable === true) {
                object[key] = value;
                return true;
            }
        } catch {
            return false;
        }
        return false;
    }
}
