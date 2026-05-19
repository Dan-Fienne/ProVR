import {EventTypes} from '../../core/event/EventTypes.js';

export class StructureFeature {
    constructor({context = null} = {}) {
        this.context = null;
        if (context) this.attach(context);
    }

    attach(context) {
        this.context = context;
        return this;
    }

    async loadFile(file, {proteinId = null, format = 'auto', replace = true, active = true} = {}) {
        const ctx = this._ctx();
        if (!file) throw new Error('[StructureFeature] file is required');

        ctx.eventBus.emit(EventTypes.STRUCTURE_LOADING, {
            filename: file.name || '',
            source: 'structure-feature',
        });

        try {
            const result = await ctx.structureLoader.loadFile(file, {proteinId, format, replace});
            this._afterLoaded(result, {filename: file.name || '', active});
            return result;
        } catch (err) {
            ctx.eventBus.emit(EventTypes.STRUCTURE_LOAD_FAILED, {
                filename: file.name || '',
                error: err,
                source: 'structure-feature',
            });
            throw err;
        }
    }

    loadText({text, proteinId, filename = '', format = 'auto', replace = true, active = true} = {}) {
        const ctx = this._ctx();
        ctx.eventBus.emit(EventTypes.STRUCTURE_LOADING, {
            filename,
            proteinId,
            source: 'structure-feature',
        });

        try {
            const result = ctx.structureLoader.loadText({text, proteinId, filename, format, replace});
            this._afterLoaded(result, {filename, active});
            return result;
        } catch (err) {
            ctx.eventBus.emit(EventTypes.STRUCTURE_LOAD_FAILED, {
                filename,
                proteinId,
                error: err,
                source: 'structure-feature',
            });
            throw err;
        }
    }

    removeProtein(proteinId) {
        const ctx = this._ctx();
        ctx.representationManager.removeByProtein(proteinId);
        ctx.proteinSystem.removeProtein(proteinId);
        ctx.projectSession.removeProtein(proteinId);
        ctx.eventBus.emit(EventTypes.STRUCTURE_REMOVED, {
            proteinId,
            source: 'structure-feature',
        });
    }

    _afterLoaded(result, {filename = '', active = true} = {}) {
        const ctx = this._ctx();
        ctx.projectSession.addProtein(result.proteinId, {active});
        ctx.eventBus.emit(EventTypes.STRUCTURE_LOADED, {
            proteinId: result.proteinId,
            model: result.model,
            format: result.format,
            filename,
            source: 'structure-feature',
        });
    }

    _ctx() {
        if (!this.context) throw new Error('[StructureFeature] context is not attached');
        return this.context;
    }
}
