import * as THREE from '../../libs/three.module.js';
import {VRInputEvents} from '../input/VRControllerInputAdapter.js';

export class VRManipulationController {
    constructor({
                    context,
                    inputAdapter,
                    selectionController,
                    getEditScope = () => 'residue',
                    getResidueWindow = () => 5,
                    shouldCoordinateDrag = () => true,
                    routeAction = () => {},
                    routeMoleculePick = () => false,
                    onStatus = () => {},
                    onPreview = () => {},
                    onCommit = () => {},
                    spatialUI = null,
                } = {}) {
        if (!context) throw new Error('[VRManipulationController] context is required');
        if (!inputAdapter) throw new Error('[VRManipulationController] inputAdapter is required');
        if (!selectionController) throw new Error('[VRManipulationController] selectionController is required');

        this.context = context;
        this.input = inputAdapter;
        this.selection = selectionController;
        this.getEditScope = getEditScope;
        this.getResidueWindow = getResidueWindow;
        this.shouldCoordinateDrag = shouldCoordinateDrag;
        this.routeAction = routeAction;
        this.routeMoleculePick = routeMoleculePick;
        this.onStatus = onStatus;
        this.onPreview = onPreview;
        this.onCommit = onCommit;
        this.spatialUI = spatialUI;

        this.session = null;
        this._offs = [];
        this._tmp = new THREE.Vector3();
    }

    enable() {
        this._offs.push(this.input.on(VRInputEvents.SELECT_START, (evt) => this._onSelectStart(evt)));
        this._offs.push(this.input.on(VRInputEvents.SELECT_END, () => this._onSelectEnd()));
        this._offs.push(this.input.on(VRInputEvents.SQUEEZE_START, () => this._onSqueezeStart()));
        this._offs.push(this.input.on(VRInputEvents.FRAME, () => this._onFrame()));
        this.onStatus('VR ready. Load protein inside VR first.');
    }

    disable() {
        this.cancel();
        for (const off of this._offs) off();
        this._offs.length = 0;
    }

    cancel() {
        if (this.session?.type === 'edit') {
            this.context.getFeature('editing')?.cancel?.({metadata: {source: 'vr-manipulation'}});
        }
        this.session = null;
        this.onStatus('Current operation cancelled.');
    }

    _onSqueezeStart() {
        if (this.session) {
            this.cancel();
            return;
        }
        this.spatialUI?.toggle?.();
        this.onStatus(this.spatialUI?.visible ? 'Panel opened.' : 'Panel hidden. Squeeze again to reopen.');
    }

    _onSelectStart({controller}) {
        if (this.session) return;

        const uiHit = this.selection.pickSpatialUI(controller);
        if (uiHit?.action) {
            this.routeAction(uiHit.action, {source: 'spatial-ui', point: uiHit.point});
            return;
        }

        const pick = this.selection.pickSemanticTarget(controller);
        if (!pick) {
            this.onStatus('No target under controller ray.');
            return;
        }

        const handled = this.routeMoleculePick(pick, {source: 'vr-pick'});
        if (handled) return;

        if (!this.shouldCoordinateDrag()) {
            this.onStatus('Select a coordinate edit operation first, such as Move.');
            return;
        }

        this._beginCoordinateDrag(controller, pick);
    }

    _beginCoordinateDrag(controller, pick) {
        const scope = this.getEditScope();
        const editing = this.context.getFeature('editing');

        const target = editing.begin(pick.target, {
            mode: scope,
            residueWindow: this.getResidueWindow(),
            model: pick.model,
            metadata: {source: 'vr-manipulation', inputDevice: 'vr-controller'},
        });

        if (!target?.atomIds?.length) {
            this.onStatus('Picked target resolved to no editable atoms.');
            return;
        }

        this.session = {
            type: 'edit',
            controller,
            startControllerPoint: this.input.controllerPoint(controller, new THREE.Vector3()).clone(),
            target,
        };

        this.spatialUI?.setContextCard?.({
            title: target.label || target.kind,
            subtitle: 'Coordinate edit preview',
            rows: [
                ['Scope', target.kind],
                ['Atoms', String(target.atomIds.length)],
                ['Release', 'commit command'],
            ],
        });

        this.onStatus(`Editing ${target.kind}. Release trigger to commit.`);
    }

    _onSelectEnd() {
        if (!this.session) return;

        if (this.session.type === 'edit') {
            const editing = this.context.getFeature('editing');
            const result = editing.commit({
                metadata: {source: 'vr-manipulation', inputDevice: 'vr-controller'},
            });
            this.session = null;
            this.onCommit(result);
            if (result?.committed) this.onStatus(`Committed edit. Max displacement ${result.moved.toFixed(3)} Å.`);
            else this.onStatus('Edit cancelled: movement too small.');
        }
    }

    _onFrame() {
        if (!this.session) return;
        if (this.session.type === 'edit') this._previewEdit();
    }

    _previewEdit() {
        const s = this.session;
        const current = this.input.controllerPoint(s.controller, this._tmp).clone();
        const delta = current.sub(s.startControllerPoint);
        const translation = [delta.x, delta.y, delta.z];

        this.context.getFeature('editing').previewTranslation(translation, {
            metadata: {source: 'vr-manipulation', inputDevice: 'vr-controller'},
        });

        this.onPreview({type: 'edit', target: s.target, translation});
    }
}
