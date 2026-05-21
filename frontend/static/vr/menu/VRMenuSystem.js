import * as THREE from '../../libs/three.module.js';
import {MenuActionKind, createCanonicalMenuTree} from './VRMenuDefinitions.js';
import {
    makeConsoleHeaderTexture,
    makeStatusPillTexture,
} from '../ui/VRLiquidGlassCanvas.js';
import {VRFloatingTooltip} from '../ui/VRFloatingTooltip.js';
import {VRRayVisualState} from '../ui/VRLiquidRay.js';
import {VRMenuButton} from './VRMenuButton.js';
import {VRMenuPlacementController} from './VRMenuPlacementController.js';
import {VRMenuHoverLayer} from './VRMenuHoverLayer.js';
import {VRDesignTokens} from '../ui/VRDesignTokens.js';

const PAGE_SIZE = 12;

function horizontalGrid(count) {
    const cols = 4;
    const xGap = 0.84;
    const yGap = 0.335;
    const startX = -1.26;
    const startY = 0.14;
    const out = [];
    for (let i = 0; i < count; i += 1) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        out.push([startX + col * xGap, startY - row * yGap]);
    }
    return out;
}

function makePlane(width, height, texture, name, renderOrder = 1200) {
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
        })
    );
    mesh.name = name;
    mesh.renderOrder = renderOrder;
    return mesh;
}

export class VRMenuSystem {
    constructor({runtime, actionManager, distance = 0.7} = {}) {
        if (!runtime) throw new Error('[VRMenuSystem] runtime required');
        this.runtime = runtime;
        this.actionManager = actionManager;

        this.root = new THREE.Group();
        this.root.name = 'vr-floating-spatial-console-root';
        this.root.scale.setScalar(VRDesignTokens.layout.panelScale);
        this.root.visible = false;
        this.runtime.scene.add(this.root);

        this.placement = new VRMenuPlacementController({runtime, menuRoot: this.root, distance});
        this.tree = createCanonicalMenuTree();
        this.pageStack = ['root'];
        this.currentPageId = 'root';
        this.pageIndexByPageId = new Map();

        this.header = null;
        this.statusPill = null;
        this.buttons = [];
        this.quickButtons = [];
        this.pressed = null;
        this.handleMesh = null;
        this.closeMesh = null;
        this.sliderDrag = null;

        this.tooltip = new VRFloatingTooltip({scene: this.runtime.scene});
        this.hoverLayer = new VRMenuHoverLayer({scene: this.runtime.scene, maxControllers: 2});
        this._raycaster = new THREE.Raycaster();
        this._lastMenuContext = {};
        this.hoverByController = new Map();
    }

    setMenuContext({pdbIds = ['1CWA'], recentIds = [], loadedProteins = [], activeProteinId = null} = {}) {
        this._lastMenuContext = {pdbIds, recentIds, loadedProteins, activeProteinId};
        this.tree = createCanonicalMenuTree({pdbIds, recentIds, loadedProteins, activeProteinId});
        this.render();
    }

    setPdbIds(ids = []) {
        this.setMenuContext({...this._lastMenuContext, pdbIds: ids.length ? ids : ['1CWA']});
    }

    openAtViewer() {
        this.pageStack = [this.currentPageId || 'root'];
        this.placement.summonInFrontOfViewer();
        this.root.visible = true;
        this.render();
    }

    close() {
        this.root.visible = false;
        this.tooltip.hide();
        this.hoverLayer.hideAll();
        this.hoverByController.clear();
    }

    toggleAtViewer() {
        this.root.visible ? this.close() : this.openAtViewer();
    }

    isOpen() {
        return !!this.root.visible;
    }

    render() {
        this._clear();

        const page = this.tree[this.currentPageId] || this.tree.root;
        const actions = page.buttons || [];
        const totalPages = Math.max(1, Math.ceil(actions.length / PAGE_SIZE));
        const pageIndex = Math.min(this.pageIndexByPageId.get(this.currentPageId) || 0, totalPages - 1);
        this.pageIndexByPageId.set(this.currentPageId, pageIndex);

        const breadcrumb = this.pageStack.join(' / ');
        const subtitle = page.subtitle + (totalPages > 1 ? ` · Page ${pageIndex + 1}/${totalPages}` : '');

        this.header = makePlane(
            VRDesignTokens.layout.headerWidth,
            VRDesignTokens.layout.headerHeight,
            makeConsoleHeaderTexture({
                title: page.title,
                subtitle,
                breadcrumb,
            }),
            'vr-floating-console-header',
            1200
        );
        this.header.position.set(0, 0.78, 0.04);
        this.root.add(this.header);

        this._makeQuickBar(totalPages, pageIndex);
        this._makeContentButtons(actions.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE));

        const status = totalPages > 1
            ? `Page ${pageIndex + 1}/${totalPages} · Back/Home/Undo/Redo on the quick bar`
            : 'Point at a button · Trigger to select · Move drags the menu';

        this.statusPill = makePlane(
            VRDesignTokens.layout.statusWidth,
            VRDesignTokens.layout.statusHeight,
            makeStatusPillTexture({text: status}),
            'vr-floating-console-status-pill',
            1200
        );
        this.statusPill.position.set(0, -0.91, 0.035);
        this.root.add(this.statusPill);
    }

    _makeQuickBar(totalPages, pageIndex) {
        const quick = [
            {id: 'menu:back', title: 'Back', subtitle: '上级', icon: '‹'},
            {id: 'menu:root', title: 'Home', subtitle: '主页', icon: '⌂'},
            {id: 'system:undo', title: 'Undo', subtitle: '撤销', icon: '↶'},
            {id: 'system:redo', title: 'Redo', subtitle: '重做', icon: '↷'},
            {id: 'menu:drag-handle', title: 'Move', subtitle: '拖动', icon: '✥'},
            {id: 'menu:close', title: 'Close', subtitle: '关闭', icon: '×'},
        ];

        if (totalPages > 1) {
            quick.push(
                {id: 'menu:prev-page', title: 'Prev', subtitle: '上一页', icon: '↑', disabled: pageIndex <= 0},
                {id: 'menu:next-page', title: 'Next', subtitle: '下一页', icon: '↓', disabled: pageIndex >= totalPages - 1},
            );
        }

        const count = quick.length;
        const gap = 0.50;
        const startX = -((count - 1) * gap) / 2;
        const y = 0.50;

        quick.forEach((action, i) => {
            const kind = action.id === 'menu:drag-handle' ? MenuActionKind.HANDLE
                : action.id === 'menu:close' ? MenuActionKind.CLOSE
                : MenuActionKind.IMMEDIATE;

            const button = new VRMenuButton({action: {...action, kind}, quick: true, icon: action.icon});
            button.mesh.position.set(startX + i * gap, y, 0.07);
            this.root.add(button.mesh);
            this.quickButtons.push(button);

            if (action.id === 'menu:drag-handle') this.handleMesh = button.mesh;
            if (action.id === 'menu:close') this.closeMesh = button.mesh;
        });
    }

    _makeContentButtons(actions) {
        const pos = horizontalGrid(actions.length);
        actions.forEach((action, i) => {
            const btn = new VRMenuButton({action});
            const [x, y] = pos[i] || [0, 0];
            btn.mesh.position.set(x, y, 0.055);
            this.root.add(btn.mesh);
            this.buttons.push(btn);
        });
    }

    getPickableObjects() {
        if (!this.root.visible) return [];
        return [...this.quickButtons, ...this.buttons].map((b) => b.mesh).filter(Boolean);
    }

    updateHover(controller, rig) {
        const index = controller?.userData?.index ?? 0;
        const hit = this._raycast(controller, rig);
        const mesh = hit?.object || null;
        const previous = this.hoverByController.get(index) || null;

        if (previous !== mesh) {
            if (previous && !this._isHoveredByOtherController(previous, index)) this._setHover(previous, false);
            if (mesh) {
                this._setHover(mesh, true);
                rig?.pulse?.(controller, {intensity: 0.11, duration: 22});
            }
            if (mesh) this.hoverByController.set(index, mesh);
            else this.hoverByController.delete(index);
        }

        if (hit?.point && mesh?.userData?.menuAction) {
            rig?.setRayState?.(controller, VRRayVisualState.UI_HOVER);
            this.hoverLayer.show(index, {point: hit.point, camera: this.runtime.camera, pressed: this.pressed === mesh});
            this.tooltip.show({
                text: mesh.userData.menuAction.title || mesh.userData.menuAction.id,
                point: hit.point,
                camera: this.runtime.camera,
            });
        } else {
            rig?.setRayState?.(controller, VRRayVisualState.UI);
            this.hoverLayer.hide(index);
            if (this.hoverByController.size === 0) this.tooltip.hide();
        }

        return hit;
    }

    pointerDown(controller, rig) {
        const index = controller?.userData?.index ?? 0;
        const hit = this._raycast(controller, rig);
        if (!hit) return null;
        const action = hit.object.userData.menuAction;
        if (!action || action.disabled) return null;

        rig?.setRayState?.(controller, VRRayVisualState.PRESSED);
        rig?.pulse?.(controller, {intensity: 0.24, duration: 34});
        this._setPressed(hit.object, true);
        this.pressed = hit.object;
        this.hoverLayer.show(index, {point: hit.point, camera: this.runtime.camera, pressed: true});

        if (action.kind === MenuActionKind.HANDLE || action.id === 'menu:drag-handle') {
            this.placement.beginDrag(controller, rig);
            return {kind: 'menu-drag'};
        }

        if (action.kind === MenuActionKind.CLOSE || action.id === 'menu:close') {
            this.close();
            return {kind: 'action', action};
        }

        if (action.id === 'menu:back') {
            this.back();
            return {kind: 'action', action};
        }

        if (action.id === 'menu:root') {
            this.toRoot();
            return {kind: 'action', action};
        }

        if (action.id === 'system:undo' || action.id === 'system:redo') {
            this.actionManager?.handle(action.id, {action});
            return {kind: 'action', action};
        }

        if (action.id === 'menu:prev-page') {
            this.turnPage(-1);
            return {kind: 'action', action};
        }

        if (action.id === 'menu:next-page') {
            this.turnPage(1);
            return {kind: 'action', action};
        }

        if (action.kind === MenuActionKind.SLIDER) {
            const value = this._sliderValueFromHit(hit, action);
            this._applySliderValue(action, value);
            this.actionManager?.handle(action.id, {value, action});
            this.sliderDrag = {action, mesh: hit.object, controller};
            return {kind: 'slider', action, value};
        }

        this.executeAction(action);
        return {kind: 'action', action};
    }

    updateActiveDrag(rig) {
        this.placement.updateDrag(rig);
    }

    endPointer() {
        if (this.pressed) this._setPressed(this.pressed, false);
        this.pressed = null;
        this.placement.endDrag();
        this.sliderDrag = null;
    }

    updateSliderDrag(controller, rig) {
        if (!this.sliderDrag) return;
        const hit = this._raycast(controller, rig, [this.sliderDrag.mesh]);
        if (!hit) return;
        const {action} = this.sliderDrag;
        const value = this._sliderValueFromHit(hit, action);
        this._applySliderValue(action, value);
        this.actionManager?.handle(action.id, {value, action, dragging: true});
    }

    executeAction(action) {
        if (action.disabled) return;

        if (action.kind === MenuActionKind.PAGE) {
            this.pageStack.push(action.page);
            this.currentPageId = action.page;
            this.pageIndexByPageId.set(action.page, 0);
            this.render();
            return;
        }

        if (action.kind === MenuActionKind.TOOL) {
            this.actionManager?.handle(action.id, {action});
            this.close();
            return;
        }

        this.actionManager?.handle(action.id, {action});

        const keepOpen = action.id.startsWith('view:protein')
            || action.id.startsWith('view:bring')
            || action.id.startsWith('view:fit')
            || action.id.startsWith('surface:opacity')
            || action.id.startsWith('surface:color')
            || action.id.startsWith('color:')
            || action.id.startsWith('view:cartoon')
            || action.id.startsWith('view:ballstick')
            || action.id.startsWith('view:line')
            || action.id.startsWith('protein:')
            || action.id === 'system:undo'
            || action.id === 'system:redo';

        if (!keepOpen && !action.id.startsWith('load:pdb:')) this.close();
    }

    back() {
        if (this.pageStack.length > 1) {
            this.pageStack.pop();
            this.currentPageId = this.pageStack[this.pageStack.length - 1] || 'root';
        } else {
            this.currentPageId = 'root';
            this.pageStack = ['root'];
        }
        this.render();
    }

    toRoot() {
        this.currentPageId = 'root';
        this.pageStack = ['root'];
        this.render();
    }

    turnPage(direction) {
        const page = this.tree[this.currentPageId] || this.tree.root;
        const totalPages = Math.max(1, Math.ceil((page.buttons || []).length / PAGE_SIZE));
        const current = this.pageIndexByPageId.get(this.currentPageId) || 0;
        const next = THREE.MathUtils.clamp(current + direction, 0, totalPages - 1);
        this.pageIndexByPageId.set(this.currentPageId, next);
        this.render();
    }

    bringToFront() {
        this.placement.bringToFront();
        this.render();
    }

    _raycast(controller, rig, objects = this.getPickableObjects()) {
        if (!objects.length) return null;
        this._raycaster.ray.copy(rig.controllerRay(controller));
        return this._raycaster.intersectObjects(objects, false)[0] || null;
    }

    _sliderValueFromHit(hit, action) {
        const local = hit.object.worldToLocal(hit.point.clone());
        const half = 0.76;
        const t = THREE.MathUtils.clamp((local.x + half) / (half * 2), 0, 1);
        return action.min + (action.max - action.min) * t;
    }

    _applySliderValue(action, value) {
        action.value = value;
        const btn = this.buttons.find((b) => b.action === action);
        btn?.refreshSlider(value);
    }

    _setHover(mesh, hovered) {
        const btn = mesh?.userData?.menuButton;
        if (btn) btn.setHover(hovered);
    }

    _setPressed(mesh, pressed) {
        const btn = mesh?.userData?.menuButton;
        if (btn) btn.setPressed(pressed);
    }

    _isHoveredByOtherController(mesh, controllerIndex) {
        for (const [index, hoveredMesh] of this.hoverByController.entries()) {
            if (index !== controllerIndex && hoveredMesh === mesh) return true;
        }
        return false;
    }

    _clear() {
        this.tooltip.hide();
        this.hoverLayer.hideAll();
        this.hoverByController.clear();

        for (const btn of this.buttons) btn.dispose();
        for (const btn of this.quickButtons) btn.dispose();
        this.buttons.length = 0;
        this.quickButtons.length = 0;

        while (this.root.children.length) {
            const c = this.root.children.pop();
            c.geometry?.dispose?.();
            c.material?.map?.dispose?.();
            c.material?.dispose?.();
        }

        this.header = null;
        this.statusPill = null;
        this.handleMesh = null;
        this.closeMesh = null;
        this.pressed = null;
    }
}
