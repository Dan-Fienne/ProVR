import {RepresentationContext} from './RepresentationContext.js';
import {RepresentationRegistry} from './RepresentationRegistry.js';
import {normalizeRepresentationSpec} from './RepresentationSpec.js';
import {RepDirtyFlags} from './DirtyPolicy.js';

export class RepresentationManager {
    constructor({
                    proteinSystem,
                    eventBus = null,
                    scene = null,
                    registry = null,
                    context = null,
                    autoBindEvents = true,
                } = {}) {
        this.context = context || new RepresentationContext({proteinSystem, eventBus, scene});
        this.registry = registry || new RepresentationRegistry();
        this.eventBus = eventBus;
        this._instances = new Map();
        this._instancesByProtein = new Map();
        this._eventOffs = [];

        if (autoBindEvents && this.eventBus) this._bindDefaultEvents();
    }

    register(type, record) {
        this.registry.register(type, record);
    }

    create(specInput) {
        const spec = normalizeRepresentationSpec(specInput);
        const model = this.context.getProtein(spec.proteinId);
        if (!model) throw new Error(`[RepresentationManager] protein not found: ${spec.proteinId}`);
        if (this._instances.has(spec.id)) throw new Error(`[RepresentationManager] duplicate representation id: ${spec.id}`);

        const rep = this.registry.create(spec, this.context);
        rep.build();
        rep.setVisible(spec.visible);

        this._instances.set(rep.id, rep);
        if (!this._instancesByProtein.has(spec.proteinId)) this._instancesByProtein.set(spec.proteinId, new Set());
        this._instancesByProtein.get(spec.proteinId).add(rep.id);
        return rep.id;
    }

    get(repId) {
        return this._instances.get(repId) || null;
    }

    list({proteinId = null, type = null} = {}) {
        let ids = proteinId ? [...(this._instancesByProtein.get(proteinId) || [])] : [...this._instances.keys()];
        if (type) ids = ids.filter((id) => this._instances.get(id)?.spec.type === type);
        return ids;
    }

    specs() {
        return [...this._instances.values()].map((rep) => rep.spec.toJSON());
    }

    updateSpec(repId, patch = {}, {rebuild = true} = {}) {
        const rep = this.get(repId);
        if (!rep) return false;
        rep.setOptions(patch);
        if (patch.visible != null) rep.setVisible(patch.visible);
        if (rebuild) rep.rebuild();
        return true;
    }

    setVisible(repId, visible) {
        const rep = this.get(repId);
        if (!rep) return false;
        rep.setVisible(visible);
        return true;
    }

    markDirtyByProtein(proteinId, flags = RepDirtyFlags.FULL_REBUILD) {
        for (const repId of this.list({proteinId})) {
            const rep = this.get(repId);
            if (rep) rep.markDirty(flags);
        }
    }

    flushDirty() {
        let count = 0;
        for (const rep of this._instances.values()) {
            if (rep.flushDirty()) count += 1;
        }
        return count;
    }

    rebuild(repId) {
        const rep = this.get(repId);
        if (!rep) return false;
        rep.rebuild();
        return true;
    }

    remove(repId) {
        const rep = this.get(repId);
        if (!rep) return false;
        rep.dispose();
        this._instances.delete(repId);
        const set = this._instancesByProtein.get(rep.proteinId);
        if (set) {
            set.delete(repId);
            if (set.size === 0) this._instancesByProtein.delete(rep.proteinId);
        }
        return true;
    }

    removeByProtein(proteinId) {
        for (const repId of this.list({proteinId})) this.remove(repId);
    }

    dispatchEvent(evt) {
        if (!evt) return;
        const ids = evt.proteinId ? this.list({proteinId: evt.proteinId}) : this.list();
        for (const repId of ids) {
            const rep = this.get(repId);
            if (!rep) continue;
            try {
                rep.update(evt);
            } catch (err) {
                console.error(`[RepresentationManager] update failed: ${repId}`, err);
            }
        }
    }

    dispose() {
        for (const repId of [...this._instances.keys()]) this.remove(repId);
        for (const off of this._eventOffs) off();
        this._eventOffs.length = 0;
    }

    _bindDefaultEvents() {
        const types = [
            'atomPositionChanged',
            'residueModified',
            'chainTransformed',
            'structureRebuilt',
            'selectionChanged',
        ];
        for (const t of types) {
            const off = this.eventBus.on(t, (evt) => this.dispatchEvent(evt));
            this._eventOffs.push(off);
        }
    }
}