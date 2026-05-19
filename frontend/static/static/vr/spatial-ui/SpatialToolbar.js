import * as THREE from '../../libs/three.module.js';
import {SpatialPanel} from './SpatialPanel.js';
import {SpatialButton} from './SpatialButton.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {makeGlassPanelTexture} from './SpatialCanvasTexture.js';

export class SpatialToolbar {
    constructor({name = 'vr:spatialMainPanel'} = {}) {
        this.panel = new SpatialPanel({
            name,
            width: T.sizes.panelWidth,
            height: T.sizes.panelHeight,
        });
        this.group = this.panel.group;
        this.buttons = new Map();

        this.header = new THREE.Mesh(
            new THREE.PlaneGeometry(7.18, 4.82),
            new THREE.MeshBasicMaterial({
                map: makeGlassPanelTexture({
                    title: 'ProVR',
                    subtitle: 'Spatial protein design workspace',
                    sections: [
                        {label: 'How to start', lines: [
                            '1. Load a structure before entering VR',
                            '2. Choose an edit scope: atom, residue, chain',
                            '3. Hold trigger and move controller to manipulate',
                        ]},
                        {label: 'Safety', lines: [
                            'Coordinate edit changes ProteinModel',
                            'Surface Inspect changes only layer transform',
                        ]},
                    ],
                    footer: 'Trigger = select / drag     Squeeze = cancel     Recenter = bring panel back',
                }),
                transparent: true,
                depthWrite: false,
            })
        );
        this.header.name = 'vr:mainPanelTexture';
        this.header.position.set(0, 0, 0.035);
        this.header.renderOrder = 90;
        this.group.add(this.header);
    }

    addButton({action, title, subtitle, x, y, width = T.sizes.buttonWidth, height = T.sizes.buttonHeight, active = false, tone = 'default'} = {}) {
        const button = new SpatialButton({action, title, subtitle, width, height, active, tone});
        button.mesh.position.set(x, y, 0.08);
        this.group.add(button.mesh);
        this.buttons.set(action, button);
        return button;
    }

    buildDefaultButtons() {
        // View row
        this.addButton({action: 'view:ballstick', title: 'Ball', subtitle: 'atomic', x: -2.72, y: 0.58});
        this.addButton({action: 'view:cartoon', title: 'Ribbon', subtitle: 'cartoon', x: -0.91, y: 0.58});
        this.addButton({action: 'view:line', title: 'Line', subtitle: 'bonds', x: 0.91, y: 0.58});
        this.addButton({action: 'view:surface', title: 'Surface', subtitle: 'layers', x: 2.72, y: 0.58});

        // Edit row
        this.addButton({action: 'edit:atom', title: 'Atom', subtitle: 'scope', x: -2.72, y: -0.18});
        this.addButton({action: 'edit:residue', title: 'Residue', subtitle: 'scope', x: -0.91, y: -0.18});
        this.addButton({action: 'edit:chain', title: 'Chain', subtitle: 'scope', x: 0.91, y: -0.18});
        this.addButton({action: 'surface:inspect', title: 'Inspect', subtitle: 'surface', x: 2.72, y: -0.18});

        // Actions row
        this.addButton({action: 'view:center', title: 'Center', subtitle: 'model', x: -2.72, y: -0.94});
        this.addButton({action: 'ui:recenter', title: 'Recenter', subtitle: 'panel', x: -0.91, y: -0.94});
        this.addButton({action: 'history:undo', title: 'Undo', subtitle: 'edit', x: 0.91, y: -0.94});
        this.addButton({action: 'history:redo', title: 'Redo', subtitle: 'edit', x: 2.72, y: -0.94});

        // Future row
        this.addButton({action: 'edit:protein', title: 'Protein', subtitle: 'all', x: -2.72, y: -1.70});
        this.addButton({action: 'export:pdb', title: 'Export', subtitle: 'PDB', x: -0.91, y: -1.70});
        this.addButton({action: 'sandbox:enter', title: 'Sandbox', subtitle: 'next', x: 0.91, y: -1.70});
        this.addButton({action: 'tools:open', title: 'Tools', subtitle: 'next', x: 2.72, y: -1.70});
    }

    getPickableObjects() {
        return [...this.buttons.values()].map((button) => button.mesh);
    }

    setActive(action, active) {
        this.buttons.get(action)?.setActive(active);
    }
}
