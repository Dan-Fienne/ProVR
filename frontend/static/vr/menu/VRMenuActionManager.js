export class VRMenuActionManager {
    constructor({workspace, state, menuSystem, surfaceController, viewScaleController, onStatus = () => {}} = {}) {
        this.workspace = workspace;
        this.state = state;
        this.menuSystem = menuSystem;
        this.surface = surfaceController;
        this.view = viewScaleController;
        this.onStatus = onStatus;
    }

    handle(id, payload = {}) {
        if (id.startsWith('load:pdb:')) return this.workspace.loadPdbId(id.split(':').pop());
        if (id === 'load:download-pdb') return this.status('Download from PDB is reserved for backend integration.');
        if (id === 'load:refresh') return this.workspace.refreshPdbList();

        if (id.startsWith('protein:active:')) return this.workspace.setActiveProtein?.(id.replace('protein:active:', ''));
        if (id === 'protein:show-active') return this.workspace.showActiveProtein?.();
        if (id === 'protein:hide-active') return this.workspace.hideActiveProtein?.();
        if (id === 'protein:show-all') return this.workspace.showAllProteins?.();
        if (id === 'protein:hide-nonactive') return this.workspace.soloActiveProtein?.();
        if (id === 'protein:remove-active') return this.status('Remove active protein is reserved for session manager.');

        if (id === 'view:cartoon') return this.workspace.showRepresentationOnly('cartoon');
        if (id === 'view:ballstick') return this.workspace.showRepresentationOnly('ballstick');
        if (id === 'view:line') return this.workspace.showRepresentationOnly('line');
        if (id === 'view:surface-overlay') return this.workspace.toggleSurfaceOverlay();
        if (id === 'view:bring-protein') return this.workspace.bringProteinHere();
        if (id === 'view:fit-protein') return this.workspace.fitProtein();
        if (id === 'view:protein-bigger') return this.view.bigger();
        if (id === 'view:protein-smaller') return this.view.smaller();

        if (id === 'surface:full') return this.surface.buildFullSurface();
        if (id === 'surface:selected') return this.surface.buildSurfaceForTarget(this.state.selectedTarget);
        if (id === 'surface:clear') return this.surface.clearSurface();
        if (id === 'surface:opacity') return this.surface.setOpacity(payload.value);
        if (id.startsWith('surface:opacity:')) return this.surface.setOpacity(Number(id.split(':').pop()));
        if (id.startsWith('surface:color:')) return this.workspace.setSurfaceColor(id.split(':').pop());

        if (id.startsWith('color:scheme:')) return this.workspace.applyColorScheme(id.split(':').pop());
        if (id.startsWith('color:selection:')) return this.workspace.applySelectionColor(id.split(':').pop());
        if (id.startsWith('color:chain:')) return this.workspace.applyChainColor(id.split(':').pop());

        if (id === 'system:undo') return this.workspace.undo();
        if (id === 'system:redo') return this.workspace.redo();
        if (id === 'system:cancel-current') return this.workspace.cancelCurrent();
        if (id === 'system:bring-ui') return this.menuSystem.bringToFront();
        if (id === 'system:ui-large') return this.menuSystem.root.scale.setScalar(0.38);
        if (id === 'system:ui-normal') return this.menuSystem.root.scale.setScalar(0.31);
        if (id === 'system:diagnostics') return this.workspace.logDiagnostics();
        if (id === 'export:pdb') return this.workspace.exportPDB();
        if (id === 'export:all-pdb') return this.workspace.exportAllPDBs?.() || this.status('Export all PDBs is reserved.');
        if (id === 'export:intent') return this.workspace.exportIntent();

        if (payload.action?.toolId) {
            this.state.setTool(payload.action.toolId);
            // Critical: the menu mesh closes inside VRMenuSystem, but the input router
            // routes by state.menuOpen. Keep state and visual menu in sync immediately.
            this.state.menuOpen = false;
            this.status(`Tool: ${payload.action.title}. Menu closed; point at protein and hold trigger to drag.`);
            return;
        }

        this.status(`Reserved: ${id}`);
    }

    cutRange(rangeTarget) { this.workspace.cutRange?.(rangeTarget); }
    replaceRange(rangeTarget) { this.workspace.replaceRange?.(rangeTarget); }
    markDesignRegion(rangeTarget) { this.workspace.markDesignRegion?.(rangeTarget); }

    status(message) {
        this.state.status = message;
        this.onStatus(message);
    }
}
