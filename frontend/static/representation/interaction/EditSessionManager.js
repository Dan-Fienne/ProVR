import {EventTypes} from '../../core/event/EventTypes.js';
import {TransformAtomSetCommand} from '../../core/command/TransformAtomSetCommand.js';
import {
    applyPositionMap,
    clonePositionMap,
    maxDisplacement,
    snapshotAtomPositions,
    translateSnapshot,
} from './CoordinateSnapshot.js';

function uid(prefix = 'edit') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}


export class EditSessionManager {
    constructor({
                    commandManager,
                    eventBus = null,
                    minCommitDistance = 1e-4,
                    source = 'edit-session',
                } = {}) {
        if (!commandManager) throw new Error('[EditSessionManager] commandManager is required');
        this.commandManager = commandManager;
        this.eventBus = eventBus;
        this.minCommitDistance = minCommitDistance;
        this.source = source;
        this.session = null;
    }

    get active() {
        return !!this.session;
    }

    begin({model, target, metadata = {}} = {}) {
        if (this.session) throw new Error('[EditSessionManager] edit session already active');
        if (!model) throw new Error('[EditSessionManager] model is required');
        if (!target?.atomIds?.length) throw new Error('[EditSessionManager] target.atomIds is required');

        const originalPositions = snapshotAtomPositions(model, target.atomIds);
        if (!originalPositions.size) throw new Error('[EditSessionManager] target has no coordinate snapshot');

        this.session = {
            id: uid('edit_session'),
            model,
            proteinId: model.id,
            target,
            originalPositions: clonePositionMap(originalPositions),
            latestPositions: clonePositionMap(originalPositions),
            currentTranslation: [0, 0, 0],
            metadata: {...metadata},
            startedAt: new Date().toISOString(),
        };

        this._emit(EventTypes.EDIT_SESSION_STARTED, {
            sessionId: this.session.id,
            proteinId: model.id,
            target,
            atomIds: target.atomIds,
            residueIds: target.residueIds || [],
            chainIds: target.chainIds || [],
            metadata,
        });

        return this.session;
    }

    previewTranslation(translation, {metadata = {}} = {}) {
        const s = this._requireSession();
        const nextPositions = translateSnapshot(s.originalPositions, translation);
        applyPositionMap(s.model, nextPositions);

        s.latestPositions = nextPositions;
        s.currentTranslation = [...translation];

        this._emitTransformPreview('preview', metadata);
        this._emit(EventTypes.EDIT_SESSION_PREVIEWED, {
            sessionId: s.id,
            proteinId: s.proteinId,
            target: s.target,
            atomIds: s.target.atomIds,
            residueIds: s.target.residueIds || [],
            chainIds: s.target.chainIds || [],
            translation: [...translation],
            metadata,
        });

        return s;
    }

    previewPositions(nextPositions, {metadata = {}} = {}) {
        const s = this._requireSession();
        applyPositionMap(s.model, nextPositions);

        s.latestPositions = clonePositionMap(nextPositions);
        s.currentTranslation = null;

        this._emitTransformPreview('preview', metadata);
        this._emit(EventTypes.EDIT_SESSION_PREVIEWED, {
            sessionId: s.id,
            proteinId: s.proteinId,
            target: s.target,
            atomIds: s.target.atomIds,
            residueIds: s.target.residueIds || [],
            chainIds: s.target.chainIds || [],
            metadata,
        });

        return s;
    }

    cancel({metadata = {}} = {}) {
        const s = this.session;
        if (!s) return false;

        applyPositionMap(s.model, s.originalPositions);
        this._emitTransformPreview('cancel', metadata);

        this._emit(EventTypes.EDIT_SESSION_CANCELLED, {
            sessionId: s.id,
            proteinId: s.proteinId,
            target: s.target,
            atomIds: s.target.atomIds,
            residueIds: s.target.residueIds || [],
            chainIds: s.target.chainIds || [],
            metadata,
        });

        this.session = null;
        return true;
    }

    commit({metadata = {}, description = ''} = {}) {
        const s = this._requireSession();
        const moved = maxDisplacement(s.originalPositions, s.latestPositions);

        if (moved <= this.minCommitDistance) {
            this.cancel({metadata: {...metadata, reason: 'movement-too-small'}});
            return {committed: false, moved};
        }

        const command = new TransformAtomSetCommand({
            proteinId: s.proteinId,
            atomIds: s.target.atomIds,
            previousPositions: s.originalPositions,
            nextPositions: s.latestPositions,
            phase: 'final',
            source: this.source,
            intent: {
                kind: s.target.kind,
                label: s.target.label,
                metadata: {
                    ...s.metadata,
                    ...metadata,
                },
            },
            description: description || `Transform ${s.target.kind}: ${s.target.label || s.target.atomIds.length + ' atoms'}`,
        });

        this.commandManager.execute(command, {source: this.source});
        this._emit(EventTypes.EDIT_SESSION_COMMITTED, {
            sessionId: s.id,
            proteinId: s.proteinId,
            target: s.target,
            atomIds: s.target.atomIds,
            residueIds: s.target.residueIds || [],
            chainIds: s.target.chainIds || [],
            moved,
            metadata,
        });

        this.session = null;
        return {committed: true, moved, command};
    }

    _requireSession() {
        if (!this.session) throw new Error('[EditSessionManager] no active edit session');
        return this.session;
    }

    _emitTransformPreview(phase, metadata = {}) {
        const s = this._requireSession();
        const revision = s.model.bumpRevision?.() ?? null;
        const payload = {
            proteinId: s.proteinId,
            atomIds: [...s.target.atomIds],
            residueIds: [...(s.target.residueIds || [])],
            chainIds: [...(s.target.chainIds || [])],
            phase,
            revision,
            metadata,
            source: this.source,
        };
        this.eventBus?.emit?.(EventTypes.ATOM_SET_TRANSFORMED, payload);
        this.eventBus?.emit?.(EventTypes.ATOM_POSITION_CHANGED, payload);
    }

    _emit(type, payload) {
        this.eventBus?.emit?.(type, {
            ...payload,
            source: this.source,
        });
    }
}
