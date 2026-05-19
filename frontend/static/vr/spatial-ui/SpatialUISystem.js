import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {makeContextTexture, makePanelTexture} from './SpatialCanvasTexture.js';
import {SpatialButton} from './SpatialButton.js';

function makePlane(width, height, texture) {
    return new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false})
    );
}

/**
 * Camera-attached UI with two product states:
 * 1. Start Space: load protein inside VR.
 * 2. Workbench: surface/select/edit/design operations after protein is loaded.
 */
export class SpatialUISystem {
    constructor({runtime} = {}) {
        if (!runtime) throw new Error('[SpatialUISystem] runtime is required');
        this.runtime = runtime;

        this.root = new THREE.Group();
        this.root.name = 'vr:provrSpatialUIRoot';
        this.root.scale.setScalar(T.scale.root);

        this.panel = null;
        this.contextCard = null;
        this.buttons = new Map();
        this.visible = true;
        this._attached = false;
    }

    init() {
        this.attachToCamera();
        this.showStartSpace();
        this.recenter({silent: true});
        return this;
    }

    attachToCamera() {
        if (this._attached) return;
        this.runtime.camera.add(this.root);
        this.runtime.scene.add(this.runtime.camera);
        this._attached = true;
    }

    showStartSpace() {
        this._clear();
        this.panel = makePlane(
            T.sizes.panelWidth,
            T.sizes.panelHeight,
            makePanelTexture({
                title: 'Load Protein',
                subtitle: 'Start inside VR. Choose a protein to create a workbench.',
                sections: [
                    {label: 'Step 1', lines: ['Load 1CWA demo protein', 'or connect to project files later']},
                    {label: 'Step 2', lines: ['Protein appears in front of you', 'Surface and edit tools unlock after load']},
                    {label: 'Controller', lines: ['Trigger selects', 'Squeeze toggles panel']},
                ],
                footer: 'Protein-first workflow: load → view → surface/select → edit/design',
            })
        );
        this.panel.name = 'vr:startSpacePanel';
        this.panel.renderOrder = 100;
        this.root.add(this.panel);

        this._addButton({action: 'protein:load-demo-1cwa', title: 'Load 1CWA', subtitle: 'demo', x: -1.15, y: -1.32, width: 1.74, tone: 'primary'});
        this._addButton({action: 'protein:my-files', title: 'My Files', subtitle: 'later', x: 0.85, y: -1.32, width: 1.74});
        this._addButton({action: 'ui:hide', title: 'Hide', subtitle: 'panel', x: 2.65, y: -1.32, tone: 'danger'});

        this._makeContextCard({
            title: 'No protein loaded',
            subtitle: 'Load a PDB inside VR first.',
            rows: [
                ['Demo', '1CWA is bundled'],
                ['Next', 'Workbench appears after load'],
            ],
        });
    }

    showWorkbench({proteinName = 'Protein', summary = null} = {}) {
        this._clear();
        this.panel = makePlane(
            T.sizes.panelWidth,
            T.sizes.panelHeight,
            makePanelTexture({
                title: 'Protein Workbench',
                subtitle: proteinName,
                sections: [
                    {label: 'Surface', lines: ['Full protein surface', 'Pick chain surface', 'Pick residue range surface']},
                    {label: 'Edit', lines: ['Move selection', 'Mutate residue', 'Cut / replace fragment', 'Magnet snap intent']},
                ],
                footer: 'Use hover feedback, context card, and undoable commands',
            })
        );
        this.panel.name = 'vr:workbenchPanel';
        this.panel.renderOrder = 100;
        this.root.add(this.panel);

        // View row
        this._addButton({action: 'view:ballstick', title: 'Ball', subtitle: 'atomic', x: -2.38, y: 0.58});
        this._addButton({action: 'view:cartoon', title: 'Ribbon', subtitle: 'cartoon', x: -0.80, y: 0.58});
        this._addButton({action: 'view:line', title: 'Line', subtitle: 'bonds', x: 0.80, y: 0.58});
        this._addButton({action: 'protein:bring-here', title: 'Bring', subtitle: 'protein', x: 2.38, y: 0.58});

        // Surface row
        this._addButton({action: 'surface:full', title: 'Surface', subtitle: 'full', x: -2.38, y: -0.02});
        this._addButton({action: 'surface:chain-pick', title: 'Chain', subtitle: 'surface', x: -0.80, y: -0.02});
        this._addButton({action: 'surface:range-pick', title: 'Range', subtitle: 'surface', x: 0.80, y: -0.02});
        this._addButton({action: 'surface:clear', title: 'Clear', subtitle: 'surface', x: 2.38, y: -0.02});

        // Edit row
        this._addButton({action: 'edit:move', title: 'Move', subtitle: 'selection', x: -2.38, y: -0.62});
        this._addButton({action: 'edit:mutate-ala', title: 'Mutate', subtitle: 'to ALA', x: -0.80, y: -0.62});
        this._addButton({action: 'edit:cut-fragment', title: 'Cut', subtitle: 'fragment', x: 0.80, y: -0.62});
        this._addButton({action: 'edit:replace-fragment', title: 'Replace', subtitle: 'fragment', x: 2.38, y: -0.62});

        // Design row
        this._addButton({action: 'edit:snap-fragment', title: 'Snap', subtitle: 'magnet', x: -2.38, y: -1.22});
        this._addButton({action: 'design:mark-region', title: 'Design', subtitle: 'region', x: -0.80, y: -1.22});
        this._addButton({action: 'history:undo', title: 'Undo', subtitle: 'edit', x: 0.80, y: -1.22});
        this._addButton({action: 'ui:hide', title: 'Hide', subtitle: 'panel', x: 2.38, y: -1.22, tone: 'danger'});

        this._makeContextCard({
            title: proteinName,
            subtitle: summary ? `${summary.chains} chains · ${summary.residues} residues · ${summary.atoms} atoms` : 'Ready',
            rows: [
                ['Surface', 'Full / Chain / Range'],
                ['Edit', 'Move / Mutate / Cut / Replace / Snap'],
                ['Select', 'Point at residue or chain'],
            ],
        });
    }

    setContextCard({title = 'Context', subtitle = '', rows = [], kind = 'default'} = {}) {
        if (!this.contextCard) return;
        const old = this.contextCard.material.map;
        this.contextCard.material.map = makeContextTexture({title, subtitle, rows, kind});
        old?.dispose?.();
        this.contextCard.material.needsUpdate = true;
    }

    setActive(action, active = true) {
        this.buttons.get(action)?.setActive(active);
    }

    showToast(message, {kind = 'info'} = {}) {
        this.setContextCard({
            title: kind === 'error' ? 'Error' : kind === 'ok' ? 'Ready' : 'Status',
            subtitle: message,
            rows: [],
            kind,
        });
    }

    show() {
        this.visible = true;
        this.root.visible = true;
        this.recenter({silent: true});
    }

    hide() {
        this.visible = false;
        this.root.visible = false;
    }

    toggle() {
        if (this.visible) this.hide();
        else this.show();
    }

    recenter({silent = false} = {}) {
        this.root.position.set(0, T.scale.yOffset, -T.scale.distance);
        this.root.rotation.set(0, 0, 0);
        if (!silent) this.showToast('Panel centered.', {kind: 'ok'});
    }

    getPickableObjects() {
        return [...this.buttons.values()]
            .map((button) => button.mesh)
            .filter((mesh) => mesh.visible && this.root.visible);
    }

    _addButton({action, title, subtitle, x, y, width = T.sizes.buttonWidth, height = T.sizes.buttonHeight, tone = 'default'} = {}) {
        const button = new SpatialButton({action, title, subtitle, width, height, tone});
        button.mesh.position.set(x, y, 0.10);
        this.root.add(button.mesh);
        this.buttons.set(action, button);
        return button;
    }

    _makeContextCard({title, subtitle, rows, kind = 'default'} = {}) {
        this.contextCard = makePlane(
            T.sizes.contextWidth,
            T.sizes.contextHeight,
            makeContextTexture({title, subtitle, rows, kind})
        );
        this.contextCard.name = 'vr:contextCard';
        this.contextCard.position.set(0, -2.72, 0.12);
        this.contextCard.renderOrder = 150;
        this.root.add(this.contextCard);
    }

    _clear() {
        while (this.root.children.length) {
            const obj = this.root.children.pop();
            obj.traverse?.((o) => {
                o.geometry?.dispose?.();
                if (o.material?.map) o.material.map.dispose?.();
                o.material?.dispose?.();
            });
        }
        this.buttons.clear();
        this.panel = null;
        this.contextCard = null;
    }
}
