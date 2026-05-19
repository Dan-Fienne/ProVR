import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {makeContextTexture, makePanelTexture} from './SpatialCanvasTexture.js';
import {SpatialButton} from './SpatialButton.js';

function makePlane(width, height, texture) {
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            depthTest: false,
        })
    );
    mesh.renderOrder = 900;
    return mesh;
}

/**
 * Readability-first camera-attached UI.
 *
 * Adds explicit Near/Far and Back/Cancel/Undo controls.
 */
export class SpatialUISystem {
    constructor({runtime} = {}) {
        if (!runtime) throw new Error('[SpatialUISystem] runtime is required');
        this.runtime = runtime;

        this.root = new THREE.Group();
        this.root.name = 'vr:provrReadableSpatialUI';
        this.root.scale.setScalar(T.scale.root);

        this.panel = null;
        this.contextCard = null;
        this.buttons = new Map();
        this.visible = true;
        this._attached = false;
        this.distance = T.scale.distance;
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
                subtitle: 'Start inside VR',
                mode: 'Step 1',
                instruction: 'Load a PDB to create the workbench',
            })
        );
        this.panel.name = 'vr:startSpaceReadablePanel';
        this.root.add(this.panel);

        this._addButton({
            action: 'protein:load-demo-1cwa',
            title: 'Load 1CWA',
            subtitle: 'Demo protein',
            x: -1.12,
            y: -0.64,
            width: T.sizes.wideButtonWidth,
            height: T.sizes.wideButtonHeight,
            tone: 'primary',
        });

        this._addButton({
            action: 'protein:my-files',
            title: 'My Files',
            subtitle: 'Next version',
            x: 1.12,
            y: -0.64,
            width: T.sizes.wideButtonWidth,
            height: T.sizes.wideButtonHeight,
        });

        this._addButton({
            action: 'ui:near',
            title: 'Near',
            subtitle: '0.5m',
            x: -1.12,
            y: -1.38,
            width: T.sizes.wideButtonWidth,
            height: T.sizes.wideButtonHeight,
        });

        this._addButton({
            action: 'ui:far',
            title: 'Far',
            subtitle: '0.95m',
            x: 1.12,
            y: -1.38,
            width: T.sizes.wideButtonWidth,
            height: T.sizes.wideButtonHeight,
        });

        this._makeContextCard({
            title: 'No protein loaded',
            subtitle: 'Choose Load 1CWA first.',
            rows: [['Need bigger?', 'Press Near']],
        });
    }

    showWorkbench({proteinName = 'Protein', summary = null} = {}) {
        this._clear();

        this.panel = makePlane(
            T.sizes.panelWidth,
            T.sizes.panelHeight,
            makePanelTexture({
                title: 'Workbench',
                subtitle: proteinName,
                mode: 'Protein Loaded',
                instruction: 'Choose action. Back/Cancel/Undo are always available.',
            })
        );
        this.panel.name = 'vr:workbenchReadablePanel';
        this.root.add(this.panel);

        // Main actions: large and readable.
        this._addButton({action: 'surface:full', title: 'Surface', subtitle: 'Full', x: -1.18, y: 0.36, width: T.sizes.wideButtonWidth, height: T.sizes.wideButtonHeight, tone: 'primary'});
        this._addButton({action: 'surface:chain-pick', title: 'Chain', subtitle: 'Surface', x: 1.18, y: 0.36, width: T.sizes.wideButtonWidth, height: T.sizes.wideButtonHeight});

        this._addButton({action: 'surface:range-pick', title: 'Range', subtitle: 'Surface', x: -1.18, y: -0.36, width: T.sizes.wideButtonWidth, height: T.sizes.wideButtonHeight});
        this._addButton({action: 'edit:move', title: 'Move', subtitle: 'Drag', x: 1.18, y: -0.36, width: T.sizes.wideButtonWidth, height: T.sizes.wideButtonHeight});

        this._addButton({action: 'edit:mutate-ala', title: 'Mutate', subtitle: 'ALA', x: -1.18, y: -1.08, width: T.sizes.wideButtonWidth, height: T.sizes.wideButtonHeight});
        this._addButton({action: 'edit:replace-fragment', title: 'Fragment', subtitle: 'Replace', x: 1.18, y: -1.08, width: T.sizes.wideButtonWidth, height: T.sizes.wideButtonHeight});

        // Recovery row.
        this._addButton({action: 'ui:back', title: 'Back', subtitle: 'Previous', x: -1.78, y: -1.84, width: 1.34, height: 0.52});
        this._addButton({action: 'ui:cancel', title: 'Cancel', subtitle: 'Current', x: -0.36, y: -1.84, width: 1.34, height: 0.52, tone: 'danger'});
        this._addButton({action: 'history:undo', title: 'Undo', subtitle: 'Command', x: 1.06, y: -1.84, width: 1.34, height: 0.52});
        this._addButton({action: 'ui:near', title: 'Near', subtitle: '0.5m', x: 2.40, y: -1.84, width: 1.10, height: 0.52});

        this._makeContextCard({
            title: proteinName,
            subtitle: summary ? `${summary.chains} chains · ${summary.residues} residues · ${summary.atoms} atoms` : 'Ready',
            rows: [['Back', 'exit wrong mode']],
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

    setDistance(distance, {silent = false} = {}) {
        this.distance = Math.max(0.35, Math.min(1.4, Number(distance) || T.scale.distance));
        this.recenter({silent});
    }

    near() {
        this.setDistance(T.scale.nearDistance, {silent: true});
        this.showToast('Near mode: 0.5m. Use Far if it blocks the protein.', {kind: 'ok'});
    }

    far() {
        this.setDistance(T.scale.farDistance, {silent: true});
        this.showToast('Far mode: 0.95m.', {kind: 'ok'});
    }

    recenter({silent = false} = {}) {
        this.root.position.set(0, T.scale.yOffset, -this.distance);
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
        this.contextCard.name = 'vr:readableContextCard';
        this.contextCard.position.set(0, -2.02, 0.12);
        this.contextCard.renderOrder = 1100;
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
