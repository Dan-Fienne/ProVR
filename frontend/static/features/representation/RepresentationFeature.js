export class RepresentationFeature {
    constructor({context = null} = {}) {
        this.context = null;
        if (context) this.attach(context);
    }

    attach(context) {
        this.context = context;
        return this;
    }

    create(spec) {
        return this._ctx().representationManager.create(spec);
    }

    remove(repId) {
        return this._ctx().representationManager.remove(repId);
    }

    removeByProtein(proteinId) {
        return this._ctx().representationManager.removeByProtein(proteinId);
    }

    setVisible(repId, visible) {
        return this._ctx().representationManager.setVisible(repId, visible);
    }

    updateSpec(repId, patch, options = {}) {
        return this._ctx().representationManager.updateSpec(repId, patch, options);
    }

    list(query = {}) {
        return this._ctx().representationManager.list(query);
    }

    get(repId) {
        return this._ctx().representationManager.get(repId);
    }

    createDefaultRepresentations(proteinId, {
        visible = {ballstick: true, cartoon: false, line: false, surface: false},
        colorScheme = 'chain',
    } = {}) {
        const ctx = this._ctx();
        const model = ctx.proteinSystem.getProtein(proteinId);
        if (!model) throw new Error(`[RepresentationFeature] protein not found: ${proteinId}`);

        ctx.representationManager.removeByProtein(proteinId);

        const ids = {};

        ids.ballstick = ctx.representationManager.create({
            id: `rep_ballstick_${proteinId}`,
            type: 'ballstick',
            proteinId,
            visible: !!visible.ballstick,
            style: {
                colorScheme: colorScheme === 'sse' ? 'chain' : colorScheme,
                atomRadiusScale: 1.0,
                bondRadius: 0.075,
                opacity: 1.0,
            },
            interaction: {
                pickable: true,
                pickAtoms: true,
                pickBonds: true,
                targetLevel: 'atom',
            },
        });

        ids.cartoon = ctx.representationManager.create({
            id: `rep_cartoon_${proteinId}`,
            type: 'cartoon',
            proteinId,
            visible: !!visible.cartoon,
            style: {
                colorScheme: colorScheme === 'element' ? 'chain' : colorScheme,
                opacity: 0.98,
                scale: 1.0,
            },
            interaction: {
                pickable: true,
                pickProxies: true,
                visualMeshPickable: true,
                targetLevel: 'residue',
            },
        });

        ids.line = ctx.representationManager.create({
            id: `rep_line_${proteinId}`,
            type: 'line',
            proteinId,
            visible: !!visible.line,
            style: {
                colorScheme: colorScheme === 'sse' ? 'chain' : colorScheme,
                opacity: 0.78,
            },
            interaction: {
                pickable: true,
                targetLevel: 'bond',
            },
        });

        ids.surface = null;
        return ids;
    }

    _ctx() {
        if (!this.context) throw new Error('[RepresentationFeature] context is not attached');
        return this.context;
    }
}
