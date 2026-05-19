import {EditTargetResolver} from '../../representation/interaction/EditTargetResolver.js';
import {EditSessionManager} from '../../representation/interaction/EditSessionManager.js';
import {makeManipulationIntent} from '../../domain/design/DesignIntent.js';

export class EditingFeature {
    constructor({
                    context = null,
                    getMode = () => 'residue',
                    getResidueWindow = () => 5,
                } = {}) {
        this.context = null;
        this.getMode = getMode;
        this.getResidueWindow = getResidueWindow;
        this.resolver = null;
        this.sessions = null;
        if (context) this.attach(context);
    }

    attach(context) {
        this.context = context;
        this.resolver = new EditTargetResolver({
            proteinSystem: context.proteinSystem,
            getMode: this.getMode,
            getResidueWindow: this.getResidueWindow,
        });
        this.sessions = new EditSessionManager({
            commandManager: context.commandManager,
            eventBus: context.eventBus,
            source: 'editing-feature',
        });
        return this;
    }

    resolveTarget(input, options = {}) {
        return this.resolver.resolve(input, options);
    }

    begin(input, {mode = null, residueWindow = null, model = null, metadata = {}} = {}) {
        const target = this.resolveTarget(input, {mode, residueWindow, model});
        if (!target?.atomIds?.length) return null;
        this.sessions.begin({model: target.model, target, metadata});
        return target;
    }

    previewTranslation(translation, options = {}) {
        return this.sessions.previewTranslation(translation, options);
    }

    cancel(options = {}) {
        return this.sessions.cancel(options);
    }

    commit({metadata = {}, description = ''} = {}) {
        const session = this.sessions.session;
        const result = this.sessions.commit({metadata, description});

        if (result?.committed && session?.target) {
            this.context.designIntentStore.record(makeManipulationIntent({
                target: {
                    proteinId: session.proteinId,
                    kind: session.target.kind,
                    atomIds: session.target.atomIds,
                    residueIds: session.target.residueIds,
                    chainIds: session.target.chainIds,
                    label: session.target.label,
                },
                operation: 'transform',
                before: {positions: 'captured-in-command'},
                after: {moved: result.moved},
                source: metadata.source || 'editing-feature',
                inputDevice: metadata.inputDevice || '',
                parameters: {
                    translation: session.currentTranslation,
                },
                metadata,
            }));
        }

        return result;
    }

    _ctx() {
        if (!this.context) throw new Error('[EditingFeature] context is not attached');
        return this.context;
    }
}
