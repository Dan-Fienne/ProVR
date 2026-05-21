export class VRSurfaceOpacityController {
    constructor({context, onStatus = () => {}} = {}) {
        this.context = context;
        this.opacity = 0.46;
        this.onStatus = onStatus;
        this.preview = null;
    }

    setOpacity(value) {
        this.opacity = Math.max(0.02, Math.min(1.0, Number(value) || 0.46));
        const feature = this.context.getFeature?.('surface');
        if (feature?.setOpacity) feature.setOpacity(this.opacity);
        else this._patchSurfaceMaterials(this.opacity);
        this.onStatus(`Surface opacity ${Math.round(this.opacity * 100)}%`);
    }

    buildFullSurface() { this.context.getFeature?.('surface')?.buildFullSurface?.({style: {opacity: this.opacity}}); }

    buildChainSurfaceForTarget(target) {
        const chainId = target?.chainIds?.[0];
        if (chainId) this.context.getFeature?.('surface')?.buildChainSurface?.({chainId, style: {opacity: this.opacity}});
    }

    buildRangeSurface(target) {
        const ids = target?.residueIds || [];
        if (ids.length) this.context.getFeature?.('surface')?.buildResidueRangeSurface?.({residueAId: ids[0], residueBId: ids[ids.length - 1], style: {opacity: this.opacity}});
    }

    buildSurfaceForTarget(target) {
        if ((target?.residueIds || []).length > 1) return this.buildRangeSurface(target);
        if ((target?.chainIds || []).length) return this.buildChainSurfaceForTarget(target);
        return this.buildFullSurface();
    }

    clearSurface() { this.context.getFeature?.('surface')?.removeSurface?.(); }

    beginRigidPreview({target, atomIds, tool} = {}) {
        const feature = this.context.getFeature?.('surface');
        feature?.beginRigidPreview?.({target, atomIds, tool});

        // If there is no visible surface, try to create a light contextual surface.
        // Existing SurfaceRepresentation will then follow drag via event.translation.
        if (!this._hasVisibleSurface()) {
            try {
                const oldOpacity = this.opacity;
                this.opacity = Math.min(oldOpacity, 0.34);
                this.buildSurfaceForTarget(target);
                this.opacity = oldOpacity;
                this.preview = {autoBuilt: true, target, atomIds, tool};
            } catch {
                this.preview = null;
            }
        } else {
            this.preview = {autoBuilt: false, target, atomIds, tool};
        }
    }

    updateRigidPreview({delta, totalDelta, tool} = {}) {
        const feature = this.context.getFeature?.('surface');
        feature?.updateRigidPreview?.({delta, totalDelta, tool});
    }

    endRigidPreview({commit = false} = {}) {
        const feature = this.context.getFeature?.('surface');
        feature?.endRigidPreview?.({commit});
        this.preview = null;
    }

    _hasVisibleSurface() {
        const manager = this.context.representationManager;
        const ids = manager?.list?.() || [];
        for (const repId of ids) {
            const rep = manager.get?.(repId);
            if (rep?.type === 'surface' || String(repId).toLowerCase().includes('surface')) {
                if (rep.root?.visible !== false || rep.group?.visible !== false) return true;
            }
        }
        return false;
    }

    _patchSurfaceMaterials(opacity) {
        const manager = this.context.representationManager;
        for (const repId of manager?.list?.() || []) {
            const rep = manager.get(repId);
            if (rep?.type !== 'surface' && !String(repId).includes('surface')) continue;
            rep.group?.traverse?.((obj) => {
                if (obj.material) {
                    obj.material.transparent = opacity < 1;
                    obj.material.opacity = opacity;
                    obj.material.needsUpdate = true;
                }
            });
            rep.root?.traverse?.((obj) => {
                if (obj.material) {
                    obj.material.transparent = opacity < 1;
                    obj.material.opacity = opacity;
                    obj.material.needsUpdate = true;
                }
            });
        }
    }
}
