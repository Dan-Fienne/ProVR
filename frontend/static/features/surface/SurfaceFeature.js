function numberValue(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function firstChainId(model) {
    return model?.chains?.keys?.().next?.().value || null;
}

function residueSeqNum(model, residueId) {
    const residue = model?.residues?.get?.(residueId);
    const n = Number(residue?.seqNum);
    return Number.isFinite(n) ? n : null;
}

function chainRange(model, chainId) {
    const chain = model?.chains?.get?.(chainId);
    const nums = (chain?.residueIds || [])
        .map((id) => model.residues.get(id))
        .filter(Boolean)
        .map((r) => Number(r.seqNum))
        .filter(Number.isFinite);
    if (!nums.length) return null;
    return {start: Math.min(...nums), end: Math.max(...nums)};
}

export class SurfaceFeature {
    constructor({context = null} = {}) {
        this.context = null;
        this.surfaceRepIdsByProtein = new Map();
        this.lastSurfaceSpec = null;
        if (context) this.attach(context);
    }

    attach(context) {
        this.context = context;
        return this;
    }

    getSurfaceRepId(proteinId = null) {
        const id = proteinId || this._ctx().activeProteinId;
        return id ? this.surfaceRepIdsByProtein.get(id) || null : null;
    }

    getSurfaceRep(proteinId = null) {
        const id = this.getSurfaceRepId(proteinId);
        return id ? this._ctx().representationManager.get(id) : null;
    }

    buildFullSurface({proteinId = null, colorMode = 'range', opacity = 0.46, visible = true} = {}) {
        const ctx = this._ctx();
        const pid = proteinId || ctx.activeProteinId;
        if (!pid) throw new Error('[SurfaceFeature] no active protein');

        const spec = {
            id: `rep_surface_${pid}`,
            type: 'surface',
            proteinId: pid,
            visible,
            layers: [{
                id: 'surface_full_complex',
                name: 'Full protein surface',
                scope: 'model',
                role: 'context',
                color: '#66caff',
                colorMode,
                opacity,
                pickable: true,
            }],
            style: this._surfaceStyle({colorMode, opacity}),
            interaction: this._surfaceInteraction(),
        };

        return this._createSurface(pid, spec, {mode: 'full'});
    }

    buildChainSurface({proteinId = null, chainId = null, colorMode = 'range', opacity = 0.50} = {}) {
        const ctx = this._ctx();
        const pid = proteinId || ctx.activeProteinId;
        const model = pid ? ctx.proteinSystem.getProtein(pid) : null;
        if (!model) throw new Error('[SurfaceFeature] active model not found');

        const chain = chainId || firstChainId(model);
        if (!chain) throw new Error('[SurfaceFeature] no chain found');

        const spec = {
            id: `rep_surface_${pid}`,
            type: 'surface',
            proteinId: pid,
            visible: true,
            layers: [{
                id: `surface_chain_${chain}`,
                name: `Chain ${chain} surface`,
                scope: 'chains',
                chainIds: [chain],
                role: 'focus',
                color: '#8ef4c6',
                colorMode,
                opacity,
                pickable: true,
            }],
            style: this._surfaceStyle({colorMode, opacity}),
            interaction: this._surfaceInteraction(),
        };

        return this._createSurface(pid, spec, {mode: 'chain', chainId: chain});
    }

    buildResidueRangeSurface({
                                 proteinId = null,
                                 chainId = null,
                                 start = null,
                                 end = null,
                                 residueAId = null,
                                 residueBId = null,
                                 colorMode = 'range',
                                 opacity = 0.56,
                             } = {}) {
        const ctx = this._ctx();
        const pid = proteinId || ctx.activeProteinId;
        const model = pid ? ctx.proteinSystem.getProtein(pid) : null;
        if (!model) throw new Error('[SurfaceFeature] active model not found');

        let chain = chainId;
        let s = start;
        let e = end;

        if (residueAId && residueBId) {
            const ra = model.residues.get(residueAId);
            const rb = model.residues.get(residueBId);
            if (!ra || !rb) throw new Error('[SurfaceFeature] selected residues not found');
            if (ra.chainId !== rb.chainId) throw new Error('[SurfaceFeature] range residues must be on the same chain');
            chain = ra.chainId;
            s = residueSeqNum(model, residueAId);
            e = residueSeqNum(model, residueBId);
        }

        chain = chain || firstChainId(model);
        if (!chain) throw new Error('[SurfaceFeature] no chain found');

        if (s == null || e == null) {
            const range = chainRange(model, chain);
            s = range?.start ?? 1;
            e = range?.end ?? 1;
        }

        if (Number(s) > Number(e)) [s, e] = [e, s];

        const spec = {
            id: `rep_surface_${pid}`,
            type: 'surface',
            proteinId: pid,
            visible: true,
            layers: [{
                id: `surface_range_${chain}_${s}_${e}`,
                name: `Chain ${chain} ${s}-${e} surface`,
                scope: 'range',
                chainId: chain,
                start: Number(s),
                end: Number(e),
                role: 'focus',
                color: '#aab6ff',
                colorMode,
                opacity,
                pickable: true,
            }],
            style: this._surfaceStyle({colorMode, opacity}),
            interaction: this._surfaceInteraction(),
        };

        return this._createSurface(pid, spec, {mode: 'range', chainId: chain, start: Number(s), end: Number(e)});
    }

    removeSurface(proteinId = null) {
        const ctx = this._ctx();
        const pid = proteinId || ctx.activeProteinId;
        const repId = this.getSurfaceRepId(pid);
        if (!repId) return false;
        ctx.representationManager.remove(repId);
        this.surfaceRepIdsByProtein.delete(pid);
        this.lastSurfaceSpec = null;
        return true;
    }

    setVisible(visible, proteinId = null) {
        const repId = this.getSurfaceRepId(proteinId);
        if (!repId) return false;
        return this._ctx().representationManager.setVisible(repId, visible);
    }

    resetTransforms(proteinId = null) {
        return this.getSurfaceRep(proteinId)?.resetAllSurfaceLayerTransforms?.() || 0;
    }

    translateLayer(layerId, delta, metadata = {}) {
        return this.getSurfaceRep()?.translateSurfaceLayer?.(layerId, delta, metadata) || false;
    }

    summary(proteinId = null) {
        const rep = this.getSurfaceRep(proteinId);
        return {
            active: !!rep,
            lastSurfaceSpec: this.lastSurfaceSpec,
            representation: rep?.summary?.() || null,
        };
    }

    _createSurface(proteinId, spec, summary) {
        const ctx = this._ctx();
        this.removeSurface(proteinId);
        const repId = ctx.representationManager.create(spec);
        this.surfaceRepIdsByProtein.set(proteinId, repId);
        this.lastSurfaceSpec = {repId, ...summary};
        return repId;
    }

    _surfaceStyle({colorMode = 'range', opacity = 0.50} = {}) {
        return {
            colorMode,
            opacity: numberValue(opacity, 0.50),
            probeRadius: 1.4,
            gridSpacing: 0.8,
            maxGridPoints: 220000,
            maxAtomsPerRange: 2600,
            livePreview: false,
            rebuildOnRigidTransform: false,
        };
    }

    _surfaceInteraction() {
        return {
            pickable: true,
            visualMeshPickable: true,
            targetLevel: 'residueRange',
        };
    }

    _ctx() {
        if (!this.context) throw new Error('[SurfaceFeature] context is not attached');
        return this.context;
    }
}
