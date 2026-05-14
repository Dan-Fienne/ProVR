import * as THREE from '../libs/three.module.js';
import {TransformAtomSetCommand} from '../core/command/TransformAtomSetCommand.js';
import {applyPositionMap, clonePositionMap, maxDisplacement, snapshotAtomPositions, translateSnapshot} from '../representation/interaction/CoordinateSnapshot.js';

const EVT_ATOM_SET_TRANSFORMED = 'atomSetTransformed';
const EVT_ATOM_POSITION_CHANGED = 'atomPositionChanged';

function unique(values = []) {
    return [...new Set(values.filter((v) => v !== null && v !== undefined))];
}

function first(value) {
    return Array.isArray(value) ? value[0] : value;
}

function collectChainAtomIds(model, chainId) {
    const chain = model?.chains?.get?.(chainId);
    if (!chain) return [];
    const atomIds = [];
    for (const residueId of chain.residueIds || []) {
        const residue = model.residues.get(residueId);
        if (residue?.atomIds?.length) atomIds.push(...residue.atomIds);
    }
    return atomIds;
}

function collectResidueAtomIds(model, residueIds = []) {
    const out = [];
    for (const residueId of residueIds) {
        const residue = model.residues.get(residueId);
        if (residue?.atomIds?.length) out.push(...residue.atomIds);
    }
    return out;
}

function residueWindowIds(model, residueId, windowSize = 5) {
    const residue = model.residues.get(residueId);
    if (!residue) return [];
    const chain = model.chains.get(residue.chainId);
    if (!chain) return [residueId];
    const ids = chain.residueIds || [];
    const index = ids.indexOf(residueId);
    if (index < 0) return [residueId];
    const count = Math.max(1, Math.floor(Number(windowSize) || 1));
    const half = Math.floor(count / 2);
    let start = Math.max(0, index - half);
    let end = Math.min(ids.length, start + count);
    start = Math.max(0, end - count);
    return ids.slice(start, end);
}

function targetLabel(target) {
    const m = target?.metadata || {};
    return m.label || m.residueName || m.atomName || target?.kind || 'target';
}

export class VRRayEditController {
    constructor({viewport, proteinSystem, representationManager, commandManager, eventBus = null, getModel = null, getScope = () => 'residue', getResidueWindow = () => 5, getSurfaceRepresentation = null, onStatus = null, onPreview = null, onCommit = null, onUIButton = null, minCommitDistance = 1e-4} = {}) {
        if (!viewport) throw new Error('[VRRayEditController] viewport is required');
        if (!proteinSystem) throw new Error('[VRRayEditController] proteinSystem is required');
        if (!representationManager) throw new Error('[VRRayEditController] representationManager is required');
        if (!commandManager) throw new Error('[VRRayEditController] commandManager is required');
        this.viewport = viewport;
        this.proteinSystem = proteinSystem;
        this.representationManager = representationManager;
        this.commandManager = commandManager;
        this.eventBus = eventBus;
        this.getModel = getModel;
        this.getScope = getScope;
        this.getResidueWindow = getResidueWindow;
        this.getSurfaceRepresentation = getSurfaceRepresentation;
        this.onStatus = onStatus || (() => {});
        this.onPreview = onPreview || (() => {});
        this.onCommit = onCommit || (() => {});
        this.onUIButton = onUIButton || (() => {});
        this.minCommitDistance = minCommitDistance;
        this.enabled = false;
        this.session = null;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Line = {threshold: 0.45};
        this._reticle = this._createReticle();
        this.viewport.scene.add(this._reticle);
        this._offs = [];
    }

    enable() {
        if (this.enabled) return;
        this._offs.push(this.viewport.onController('selectstart', (e) => this._onSelectStart(e)));
        this._offs.push(this.viewport.onController('selectend', (e) => this._onSelectEnd(e)));
        this._offs.push(this.viewport.onController('squeezestart', () => this.cancel()));
        this._offs.push(this.viewport.onFrame(() => this._onFrame()));
        this.enabled = true;
        this.onStatus('VR editing enabled. Trigger: select/drag. Squeeze: cancel.');
    }

    disable() {
        if (!this.enabled) return;
        this.cancel();
        for (const off of this._offs) off();
        this._offs.length = 0;
        this.enabled = false;
        this._reticle.visible = false;
    }

    _createReticle() {
        const g = new THREE.Group();
        g.name = 'vr:editReticle';
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.38, 0.018, 8, 32),
            new THREE.MeshBasicMaterial({color: 0x93c5fd, transparent: true, opacity: 0.95, depthWrite: false})
        );
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.055, 12, 12),
            new THREE.MeshBasicMaterial({color: 0xa7f3d0, transparent: true, opacity: 0.95, depthWrite: false})
        );
        g.add(ring, dot);
        g.visible = false;
        return g;
    }

    _onSelectStart({controller}) {
        if (!this.enabled || this.session) return;

        const uiHit = first(this.viewport.getUIButtonHits(controller));
        if (uiHit?.object?.userData?.vrButtonAction) {
            this.onUIButton(uiHit.object.userData.vrButtonAction);
            return;
        }

        const scope = this.getScope();
        if (scope === 'surfaceInspect') {
            const picked = this._pickSurface(controller);
            if (picked) this._beginSurfaceInspection(controller, picked);
            else this.onStatus('No pickable surface layer under controller ray.');
            return;
        }

        const picked = this._pickSemanticTarget(controller);
        if (!picked) {
            this.onStatus('No pick target under controller ray.');
            return;
        }

        const model = picked.model;
        const target = this._resolveTargetToAtomSet(model, picked.target, {scope});
        if (!target?.atomIds?.length) {
            this.onStatus(`Picked ${picked.target?.kind || 'object'}, but it resolved to no editable atoms.`);
            return;
        }

        const originalPositions = snapshotAtomPositions(model, target.atomIds);
        if (!originalPositions.size) {
            this.onStatus('Editable target has no coordinate snapshot.');
            return;
        }

        const startControllerPoint = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
        const hitPoint = picked.point || this._averagePosition(model, target.atomIds) || startControllerPoint.clone();
        this.session = {
            type: 'atomTransform',
            controller,
            model,
            proteinId: model.id,
            rawTarget: picked.target,
            target,
            originalPositions: clonePositionMap(originalPositions),
            latestPositions: clonePositionMap(originalPositions),
            startControllerPoint,
            currentTranslation: [0, 0, 0],
            hitPoint,
        };
        this._placeReticle(hitPoint, controller);
        this.onStatus(`Picked ${target.kind}: ${target.label}. Dragging ${target.atomIds.length} atoms.`);
    }

    _onSelectEnd() {
        if (!this.session) return;
        if (this.session.type === 'surfaceInspection') {
            const {layerId} = this.session;
            this.session = null;
            this.onCommit({type: 'surface-inspection-end', layerId});
            this.onStatus(`Surface layer ${layerId} moved for inspection. ProteinModel was not modified.`);
            return;
        }
        const s = this.session;
        const moved = maxDisplacement(s.originalPositions, s.latestPositions);
        if (moved <= this.minCommitDistance) {
            applyPositionMap(s.model, s.originalPositions);
            this._emitPreview(s.model, s.target, 'cancel');
            this.session = null;
            this.onStatus('VR drag ignored: movement too small.');
            return;
        }
        const command = new TransformAtomSetCommand({
            proteinId: s.proteinId,
            atomIds: s.target.atomIds,
            previousPositions: s.originalPositions,
            nextPositions: s.latestPositions,
            phase: 'final',
            source: 'vr-controller',
            intent: {scope: s.target.kind, label: s.target.label},
            description: `VR transform ${s.target.kind} ${s.target.label}`,
        });
        this.commandManager.execute(command);
        this.session = null;
        this.onCommit({type: 'atom-transform', target: s.target, moved});
        this.onStatus(`Committed VR ${s.target.kind} transform. Moved ${s.target.atomIds.length} atoms.`);
    }

    _onFrame() {
        if (!this.enabled) return;
        if (this.session?.type === 'atomTransform') this._previewAtomTransform();
        else if (this.session?.type === 'surfaceInspection') this._previewSurfaceInspection();
        else this._hover();
    }

    _hover() {
        const controller = this.viewport.controllers[0];
        if (!controller) return;
        const hit = first(this.viewport.getUIButtonHits(controller)) || this._pickSemanticTarget(controller);
        if (!hit?.point) {
            this._reticle.visible = false;
            return;
        }
        this._placeReticle(hit.point, controller);
    }

    _previewAtomTransform() {
        const s = this.session;
        const current = new THREE.Vector3().setFromMatrixPosition(s.controller.matrixWorld);
        const delta = current.clone().sub(s.startControllerPoint);
        const translation = [delta.x, delta.y, delta.z];
        const nextPositions = translateSnapshot(s.originalPositions, translation);
        applyPositionMap(s.model, nextPositions);
        s.latestPositions = nextPositions;
        s.currentTranslation = translation;
        this._emitPreview(s.model, s.target, 'preview');
        const center = this._averagePosition(s.model, s.target.atomIds);
        if (center) this._placeReticle(center, s.controller);
        this.onPreview({target: s.target, translation, atomCount: s.target.atomIds.length});
    }

    _previewSurfaceInspection() {
        const s = this.session;
        const rep = this.getSurfaceRepresentation?.();
        if (!rep?.translateSurfaceLayer) return;
        const current = new THREE.Vector3().setFromMatrixPosition(s.controller.matrixWorld);
        const delta = current.clone().sub(s.lastControllerPoint);
        if (delta.lengthSq() < 1e-12) return;
        rep.translateSurfaceLayer(s.layerId, delta, {source: 'VRRayEditController'});
        s.lastControllerPoint.copy(current);
        this.onPreview({type: 'surface-layer-drag', layerId: s.layerId, delta: delta.toArray()});
    }

    cancel() {
        if (!this.session) return;
        if (this.session.type === 'atomTransform') {
            applyPositionMap(this.session.model, this.session.originalPositions);
            this._emitPreview(this.session.model, this.session.target, 'cancel');
        }
        this.onStatus('VR operation cancelled.');
        this.session = null;
    }

    _pickSemanticTarget(controller) {
        const records = this.representationManager.context.pickRegistry?.list?.() || [];
        const objects = records.map((record) => record.object).filter((object) => object?.isObject3D && object.visible !== false);
        if (!objects.length) return null;
        const hits = this.viewport.raycastObjectsFromController(controller, objects, {recursive: false});
        for (const hit of hits) {
            const target = this.representationManager.context.pickRegistry.getTarget(hit.object) || hit.object.userData?.target;
            if (!target) continue;
            const model = this.proteinSystem.getProtein(target.proteinId) || this.getModel?.();
            if (!model) continue;
            return {hit, point: hit.point, object: hit.object, target, model};
        }
        return null;
    }

    _pickSurface(controller) {
        const rep = this.getSurfaceRepresentation?.();
        const meshes = rep?.getSurfaceLayerMeshes?.({pickableOnly: true, visibleOnly: true}) || [];
        if (!meshes.length) return null;
        const hits = this.viewport.raycastObjectsFromController(controller, meshes, {recursive: false});
        const hit = hits[0];
        if (!hit?.object) return null;
        return {hit, object: hit.object, point: hit.point, layerId: hit.object.userData?.layerId || hit.object.userData?.rangeId};
    }

    _beginSurfaceInspection(controller, picked) {
        const layerId = picked.layerId;
        if (!layerId) return;
        this.session = {
            type: 'surfaceInspection',
            controller,
            layerId,
            lastControllerPoint: new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld),
        };
        this._placeReticle(picked.point, controller);
        this.onStatus(`Inspecting surface layer ${layerId}. This moves only the surface matrix, not ProteinModel coordinates.`);
    }

    _resolveTargetToAtomSet(model, target, {scope}) {
        const firstResidueId = first(target.residueIds);
        const firstChainId = first(target.chainIds);
        if (scope === 'atom') {
            const atomId = first(target.atomIds);
            const atom = model.getAtom(atomId);
            const residue = atom ? model.residues.get(atom.residueId) : null;
            return {proteinId: model.id, kind: 'atom', atomIds: atom ? [atom.id] : [], residueIds: atom ? [atom.residueId] : [], chainIds: residue ? [residue.chainId] : [], label: targetLabel(target)};
        }
        if (scope === 'residue') {
            const residueIds = firstResidueId ? [firstResidueId] : [];
            const atomIds = collectResidueAtomIds(model, residueIds);
            return {proteinId: model.id, kind: 'residue', atomIds, residueIds, chainIds: unique(residueIds.map((id) => model.residues.get(id)?.chainId)), label: targetLabel(target)};
        }
        if (scope === 'residueRange') {
            const residueIds = firstResidueId ? residueWindowIds(model, firstResidueId, this.getResidueWindow()) : target.residueIds || [];
            const atomIds = collectResidueAtomIds(model, residueIds);
            return {proteinId: model.id, kind: 'residueRange', atomIds, residueIds, chainIds: unique(residueIds.map((id) => model.residues.get(id)?.chainId)), label: `${targetLabel(target)} ± ${this.getResidueWindow()} residues`};
        }
        if (scope === 'chain') {
            const chainId = firstChainId || (firstResidueId ? model.residues.get(firstResidueId)?.chainId : null);
            const atomIds = chainId ? collectChainAtomIds(model, chainId) : [];
            return {proteinId: model.id, kind: 'chain', atomIds, residueIds: chainId ? [...(model.chains.get(chainId)?.residueIds || [])] : [], chainIds: chainId ? [chainId] : [], label: `chain ${chainId}`};
        }
        if (scope === 'protein') {
            return {proteinId: model.id, kind: 'protein', atomIds: [...model.atoms.keys()], residueIds: [...model.residues.keys()], chainIds: [...model.chains.keys()], label: model.id};
        }
        const atomIds = target.atomIds?.length ? [...target.atomIds] : collectResidueAtomIds(model, target.residueIds || []);
        return {proteinId: model.id, kind: target.kind || 'target', atomIds, residueIds: target.residueIds || [], chainIds: target.chainIds || [], label: targetLabel(target)};
    }

    _emitPreview(model, target, phase) {
        const revision = model.bumpRevision?.() ?? null;
        const evt = {proteinId: model.id, atomIds: [...target.atomIds], residueIds: [...target.residueIds], chainIds: [...target.chainIds], phase, source: 'vr-controller', revision};
        this.eventBus?.emit?.(EVT_ATOM_SET_TRANSFORMED, {type: EVT_ATOM_SET_TRANSFORMED, ...evt});
        this.eventBus?.emit?.(EVT_ATOM_POSITION_CHANGED, {type: EVT_ATOM_POSITION_CHANGED, ...evt});
    }

    _averagePosition(model, atomIds = []) {
        const out = new THREE.Vector3();
        let n = 0;
        for (const atomId of atomIds) {
            const p = model.getAtomPosition(atomId);
            if (!p) continue;
            out.x += p[0]; out.y += p[1]; out.z += p[2]; n += 1;
        }
        return n ? out.multiplyScalar(1 / n) : null;
    }

    _placeReticle(point, controller) {
        if (!point) return;
        this._reticle.position.copy(point);
        const q = controller?.getWorldQuaternion?.(new THREE.Quaternion()) || new THREE.Quaternion();
        this._reticle.quaternion.copy(q);
        const dist = controller ? point.distanceTo(new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld)) : 8;
        const scale = Math.max(0.45, Math.min(2.4, dist * 0.035));
        this._reticle.scale.setScalar(scale);
        this._reticle.visible = true;
    }
}
