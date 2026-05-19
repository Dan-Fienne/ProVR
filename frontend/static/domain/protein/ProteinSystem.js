import {CoordinateStore} from './CoordinateStore.js';
import {ProteinModel} from './ProteinModel.js';
import {normalizeProteinId} from './ProteinIdentity.js';

export class ProteinSystem {
    constructor({initialAtomCapacity = 600000, coordinateStore = null} = {}) {
        this.coordinateStore = coordinateStore || new CoordinateStore({initialAtomCapacity});
        this.models = new Map();
        this.proteins = this.models;
        this.activeProteinId = null;
    }

    createProtein(proteinId, options = {}) {
        const id = normalizeProteinId(proteinId || `protein_${this.models.size + 1}`);
        if (options.replace !== false && this.models.has(id)) this.removeProtein(id);
        const model = new ProteinModel({
            id,
            coordinateStore: this.coordinateStore,
            ...options,
        });
        this.models.set(id, model);
        this.activeProteinId = id;
        return model;
    }

    addProtein(model, {active = true} = {}) {
        if (!model?.id) throw new Error('[ProteinSystem] model with id is required');
        this.models.set(model.id, model);
        if (active) this.activeProteinId = model.id;
        return model;
    }

    getProtein(proteinId = null) {
        const id = proteinId || this.activeProteinId;
        return id ? this.models.get(id) || null : null;
    }

    requireProtein(proteinId = null) {
        const model = this.getProtein(proteinId);
        if (!model) throw new Error(`[ProteinSystem] protein not found: ${proteinId || this.activeProteinId}`);
        return model;
    }

    removeProtein(proteinId) {
        const ok = this.models.delete(proteinId);
        if (this.activeProteinId === proteinId) this.activeProteinId = this.listProteinIds()[0] || null;
        return ok;
    }

    removeByProtein(proteinId) {
        return this.removeProtein(proteinId);
    }

    clear() {
        this.models.clear();
        this.activeProteinId = null;
    }

    listProteinIds() {
        return [...this.models.keys()];
    }

    listProteins() {
        return [...this.models.values()];
    }

    summary() {
        return {
            count: this.models.size,
            activeProteinId: this.activeProteinId,
            proteins: this.listProteins().map((m) => m.summary()),
            coordinateStore: this.coordinateStore.summary(),
        };
    }
}
