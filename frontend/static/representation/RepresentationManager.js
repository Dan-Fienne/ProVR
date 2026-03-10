import {EventTypes} from "../core/event/EventTypes.js";
import {BallStickRepresentation} from './ballstick/BallStickRepresentation.js';

function uid(prefix = 'rep') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export class RepresentationManager {
    constructor({scene, proteinSystem, eventBus}) {
        this.scene = scene;
        this.proteinSystem = proteinSystem;
        this.eventBus = eventBus;

        this._factories = new Map();
        this._instances = new Map();
        this._instancesByProtein = new Map();
        this._eventOffs = [];

        this.registerFactory('ballstick', (params) => new BallStickRepresentation(params));
        this._bindEvents();
    }

    registerFactory(type, factory) {
        this._factories.set(type, factory);
    }

    create({
               type = 'ballstick',
               proteinId,
               options = {},
               id = null
           }) {
        const model = this.proteinSystem.getProtein(proteinId);
        if (!model) throw new Error(`[RepresentationManager] protein not found: ${proteinId}`);

        const factory = this._factories.get(type);
        if (!factory) throw new Error(`[RepresentationManager] unknown representation type: ${type}`);

        const repId = id || uid(type);
        const rep = factory({
            id: repId,
            proteinId,
            proteinSystem: this.proteinSystem,
            eventBus: this.eventBus,
            scene: this.scene,
            options,
        });
        rep.build();
        this._instances.set(repId, rep);
        if (!this._instancesByProtein.has(proteinId)) this._instancesByProtein.set(proteinId, new Set());
        this._instancesByProtein.get(proteinId).add(repId);
        return repId;
    }

    get(repId) {
        return this._instances.get(repId) || null;
    }

    list({proteinId = null} = {}) {
        if (!proteinId) return [...this._instances.keys()];
        const set = this._instancesByProtein.get(proteinId);
        return set ? [...set] : [];
    }

    remove(repId) {
        const rep = this._instances.get(repId);
        if (!rep) return false;
        const proteinId = rep.proteinId;
        rep.dispose();

        this._instances.delete(repId);
        const set = this._instancesByProtein.get(proteinId);
        if (set) {
            set.delete(repId);
            if (set.size === 0) this._instancesByProtein.delete(proteinId);
        }
        return true;
    }

    removeByProtein(proteinId) {
        const ids = this.list({proteinId});
        for (const id of ids) this.remove(id);
    }

    rebuild(repId) {
        const rep = this._instances.get(repId);
        if (!rep) return false;
        rep.dispose();
        rep._disposed = false;
        rep._built = false;
        rep.build();
        return true;
    }

    dispose() {
        for (const id of [...this._instances.keys()]) {
            this.remove(id);
        }
        for (const off of this._eventOffs) off();
        this._eventOffs.length = 0;
        this._factories.clear();
    }

    _bindEvents() {
        const types = [
            EventTypes.ATOM_POSITION_CHANGED,
            EventTypes.RESIDUE_MODIFIED,
            EventTypes.CHAIN_TRANSFORMED,
            EventTypes.STRUCTURE_REBUILT,
        ];
        for (const t of types) {
            const off = this.eventBus.on(t, (evt) => this._dispatchEvent(evt));
            this._eventOffs.push(off);
        }
    }

    _dispatchEvent(evt) {
        if (!evt) return;
        if (evt.proteinId) {
            const ids = this._instancesByProtein.get(evt.proteinId);
            if (!ids) return;
            for (const repId of ids) {
                const rep = this._instances.get(repId);
                if (!rep) continue;
                try {
                    rep.update(evt);
                } catch (err) {
                    console.error(`[RepresentationManager] rep update failed: ${repId}`, err);
                }
            }
            return;
        }

        for (const rep of this._instances.values()) {
            try {
                rep.update(evt);
            } catch (err) {
                console.error('[RepresentationManager] rep update failed', err);
            }
        }
    }
}