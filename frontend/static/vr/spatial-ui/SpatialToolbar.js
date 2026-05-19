import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {makePanelTexture} from './SpatialCanvasTexture.js';
import {SpatialButton} from './SpatialButton.js';

export class SpatialToolbar {
    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'vr:pearlControlPanel';
        this.buttons = new Map();

        this.panel = new THREE.Mesh(
            new THREE.PlaneGeometry(T.sizes.panelWidth, T.sizes.panelHeight),
            new THREE.MeshBasicMaterial({
                map: makePanelTexture({
                    title: 'ProVR',
                    subtitle: 'Spatial protein design workspace',
                    mode: 'Residue edit',
                    safety: 'Protein coordinates can be undone',
                }),
                transparent: true,
                depthWrite: false,
            })
        );
        this.panel.name = 'vr:pearlPanel';
        this.panel.renderOrder = 100;
        this.group.add(this.panel);

        this.dragHandle = new SpatialButton({
            action: 'ui:drag-handle',
            title: 'Move',
            subtitle: 'grab panel',
            width: 1.72,
            height: 0.38,
            tone: 'primary',
        });
        this.dragHandle.mesh.position.set(0, 1.86, 0.08);
        this.group.add(this.dragHandle.mesh);
        this.buttons.set('ui:drag-handle', this.dragHandle);
    }

    buildDefaultButtons() {
        const row0 = 0.72;
        const row1 = 0.12;
        const row2 = -0.48;
        const row3 = -1.08;
        const xs = [-2.43, -0.82, 0.82, 2.43];

        this.addButton({action: 'view:ballstick', title: 'Ball', subtitle: 'atomic', x: xs[0], y: row0});
        this.addButton({action: 'view:cartoon', title: 'Ribbon', subtitle: 'cartoon', x: xs[1], y: row0});
        this.addButton({action: 'view:line', title: 'Line', subtitle: 'bonds', x: xs[2], y: row0});
        this.addButton({action: 'view:surface', title: 'Surface', subtitle: 'layer', x: xs[3], y: row0});

        this.addButton({action: 'edit:atom', title: 'Atom', subtitle: 'scope', x: xs[0], y: row1});
        this.addButton({action: 'edit:residue', title: 'Residue', subtitle: 'scope', x: xs[1], y: row1});
        this.addButton({action: 'edit:chain', title: 'Chain', subtitle: 'scope', x: xs[2], y: row1});
        this.addButton({action: 'surface:inspect', title: 'Inspect', subtitle: 'surface', x: xs[3], y: row1});

        this.addButton({action: 'view:center', title: 'Center', subtitle: 'model', x: xs[0], y: row2});
        this.addButton({action: 'ui:recenter', title: 'Recenter', subtitle: 'panel', x: xs[1], y: row2});
        this.addButton({action: 'history:undo', title: 'Undo', subtitle: 'edit', x: xs[2], y: row2});
        this.addButton({action: 'history:redo', title: 'Redo', subtitle: 'edit', x: xs[3], y: row2});

        this.addButton({action: 'export:pdb', title: 'Export', subtitle: 'PDB', x: xs[0], y: row3});
        this.addButton({action: 'edit:protein', title: 'Protein', subtitle: 'all', x: xs[1], y: row3});
        this.addButton({action: 'sandbox:enter', title: 'Sandbox', subtitle: 'next', x: xs[2], y: row3});
        this.addButton({action: 'ui:hide', title: 'Close', subtitle: 'hide', x: xs[3], y: row3, tone: 'danger'});
    }

    addButton({action, title, subtitle, x, y, width = T.sizes.buttonWidth, height = T.sizes.buttonHeight, active = false, tone = 'default'} = {}) {
        const button = new SpatialButton({action, title, subtitle, width, height, active, tone});
        button.mesh.position.set(x, y, 0.08);
        this.group.add(button.mesh);
        this.buttons.set(action, button);
        return button;
    }

    setModeLabel({mode = 'Residue edit', safety = 'Protein coordinates can be undone'} = {}) {
        const old = this.panel.material.map;
        this.panel.material.map = makePanelTexture({
            title: 'ProVR',
            subtitle: 'Spatial protein design workspace',
            mode,
            safety,
        });
        old?.dispose?.();
        this.panel.material.needsUpdate = true;
    }

    getPickableObjects() {
        return [...this.buttons.values()].map((button) => button.mesh).filter((mesh) => mesh.visible);
    }

    setActive(action, active) {
        this.buttons.get(action)?.setActive(active);
    }
}
