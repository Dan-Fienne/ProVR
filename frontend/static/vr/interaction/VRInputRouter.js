import {VRPhase} from './VRInteractionState.js';
import {VRRayVisualState} from '../ui/VRLiquidRay.js';

export class VRInputRouter {
    constructor({state, rig, menuSystem, targetingSystem, modeManager, twoHandScaleController, onStatus = () => {}} = {}) {
        this.state = state;
        this.rig = rig;
        this.menu = menuSystem;
        this.targeting = targetingSystem;
        this.mode = modeManager;
        this.twoHandScale = twoHandScaleController;
        this.onStatus = onStatus;
        this.offs = [];
    }

    enable(runtime) {
        this.offs.push(this.rig.on('selectstart', (event) => this._selectStart(event)));
        this.offs.push(this.rig.on('selectend', (event) => this._selectEnd(event)));
        this.offs.push(this.rig.on('squeezestart', (event) => this._squeezeStart(event)));
        this.offs.push(this.rig.on('squeezeend', (event) => this._squeezeEnd(event)));
        this.offs.push(runtime.onFrame(() => this._frame()));
    }

    disable() {
        this.offs.forEach((off) => off());
        this.offs.length = 0;
    }

    openMenuAtViewer() {
        this.state.menuOpen = true;
        this.state.currentPhase = VRPhase.MENU;
        this.rig.setAllRayStates?.(VRRayVisualState.UI);
        this.menu.openAtViewer();
        this.targeting.hide();
    }

    closeMenu() {
        this.state.menuOpen = false;
        this.menu.close();
        this.rig.setAllRayStates?.(VRRayVisualState.MOLECULE);
        if (this.state.currentTool === 'inspect') this.state.currentPhase = VRPhase.IDLE;
    }

    toggleMenu() {
        this._syncMenuState();
        this.menu.isOpen() ? this.closeMenu() : this.openMenuAtViewer();
    }

    _frame() {
        this._syncMenuState();

        if (this.state.menuOpen) {
            for (const c of this.rig.controllers) this.menu.updateHover(c, this.rig);
            this.menu.updateActiveDrag(this.rig);
            if (this.menu.sliderDrag) {
                const c = this.menu.sliderDrag.controller || this.rig.controllers[0];
                if (c) this.menu.updateSliderDrag(c, this.rig);
            }
            return;
        }

        const dragging = !!(this.mode.rigidEngine?.active || this.mode.conformationEngine?.active);
        const pick = this.targeting.update(this.rig.controllers, {dragging});
        this.state.hoverTarget = pick?.target || null;

        this.twoHandScale?.update?.();
        this.mode.frame();
    }

    _selectStart(event) {
        this._syncMenuState();
        const controller = event.target;

        if (this.state.menuOpen) {
            const result = this.menu.pointerDown(controller, this.rig);
            this._syncMenuState();
            if (result?.kind === 'menu-drag') this.state.currentPhase = VRPhase.MENU_DRAGGING;
            if (result?.kind === 'slider') {
                result.controller = controller;
                this.menu.sliderDrag.controller = controller;
                this.state.currentPhase = VRPhase.SURFACE_OPACITY;
            }
            return;
        }

        this.rig.setRayState?.(controller, VRRayVisualState.PRESSED);
        const pick = this.targeting.pick(controller);
        if (pick) this.mode.selectStart({controller, pick});
    }

    _selectEnd(event) {
        this._syncMenuState();
        const controller = event.target;

        if (this.state.menuOpen) {
            this.menu.endPointer();
            this.rig.setRayState?.(controller, VRRayVisualState.UI);
            this.state.currentPhase = VRPhase.MENU;
            this._syncMenuState();
            return;
        }

        this.mode.selectEnd();
        this.rig.setRayState?.(controller, VRRayVisualState.MOLECULE);
    }

    _squeezeStart(event) {
        this._syncMenuState();
        const controller = event.target;
        controller.userData.isSqueezing = true;

        if (this.state.currentTool === 'view_two_hand_scale') {
            this.twoHandScale?.markSqueezing?.(controller, true);
            return;
        }

        if (!this.state.menuOpen && this.state.currentPhase !== VRPhase.IDLE && this.state.currentTool !== 'inspect') {
            this.mode.cancel();
            return;
        }

        this.toggleMenu();
    }

    _squeezeEnd(event) {
        const controller = event.target;
        controller.userData.isSqueezing = false;
        this.twoHandScale?.markSqueezing?.(controller, false);
    }

    _syncMenuState() {
        const actuallyOpen = !!this.menu?.isOpen?.();
        if (this.state.menuOpen === actuallyOpen) return;

        this.state.menuOpen = actuallyOpen;
        if (actuallyOpen) {
            this.state.currentPhase = VRPhase.MENU;
            this.rig.setAllRayStates?.(VRRayVisualState.UI);
            this.targeting.hide();
            return;
        }

        this.rig.setAllRayStates?.(VRRayVisualState.MOLECULE);
        if (this.state.currentTool === 'inspect') this.state.currentPhase = VRPhase.IDLE;
    }
}
