import {CoordinateStore} from './CoordinateStore.js';
import {ProteinModel} from './ProteinModel.js';

export class ProteinSystem {
    constructor({initialAtomCapacity = 300000} = {}) {
        this.coordinateStore = new CoordinateStore(initialAtomCapacity);
        this.models = new Map(); // proteinId -> ProteinModel
    }

    createProtein(proteinId) {
        if (this.models.has(proteinId)) return this.models.get(proteinId);
        const model = new ProteinModel({
            proteinId,
            coordinateStore: this.coordinateStore,
        });
        this.models.set(proteinId, model);
        return model;
    }

    getProtein(proteinId) {
        return this.models.get(proteinId) || null;
    }

    removeProtein(proteinId) {
        this.models.delete(proteinId);
    }

    listProteinIds() {
        return [...this.models.keys()];
    }
}