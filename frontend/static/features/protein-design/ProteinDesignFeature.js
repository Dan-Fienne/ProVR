import {MutateResidueCommand} from '../../core/command/structure/MutateResidueCommand.js';
import {CutFragmentCommand} from '../../core/command/structure/CutFragmentCommand.js';
import {ReplaceFragmentCommand} from '../../core/command/structure/ReplaceFragmentCommand.js';
import {SnapFragmentCommand} from '../../core/command/structure/SnapFragmentCommand.js';
import {FragmentLibrary} from '../../domain/design/FragmentModel.js';
import {makeManipulationIntent} from '../../domain/design/DesignIntent.js';

function targetResidueIds(target) {
    if (!target) return [];
    if (target.residueIds?.length) return [...target.residueIds];
    return [];
}

function targetPrimaryResidueId(target) {
    return targetResidueIds(target)[0] || null;
}

function targetProteinId(target, context) {
    return target?.proteinId || context.activeProteinId;
}

export class ProteinDesignFeature {
    constructor({context = null} = {}) {
        this.context = null;
        this.fragmentLibrary = new FragmentLibrary();
        this.lastFragmentSelection = null;
        if (context) this.attach(context);
    }

    attach(context) {
        this.context = context;
        return this;
    }

    mutateTarget(target, {toResidueName = 'ALA', source = 'vr-edit'} = {}) {
        const ctx = this._ctx();
        const proteinId = targetProteinId(target, ctx);
        const residueId = targetPrimaryResidueId(target);
        if (!proteinId || !residueId) throw new Error('[ProteinDesignFeature] mutateTarget requires a residue target');

        const command = new MutateResidueCommand({
            proteinId,
            residueId,
            toResidueName,
            metadata: {source, targetKind: target.kind},
        });

        const result = ctx.commandManager.execute(command, {source});
        this._recordIntent({
            operation: 'mutation',
            target,
            parameters: {toResidueName},
            source,
        });

        return {result, command};
    }

    cutFragment(target, {source = 'vr-edit'} = {}) {
        const ctx = this._ctx();
        const proteinId = targetProteinId(target, ctx);
        const residueIds = targetResidueIds(target);
        if (!proteinId || !residueIds.length) throw new Error('[ProteinDesignFeature] cutFragment requires residue/range target');

        const command = new CutFragmentCommand({
            proteinId,
            residueIds,
            metadata: {source, targetKind: target.kind},
        });

        const result = ctx.commandManager.execute(command, {source});
        this.lastFragmentSelection = {proteinId, residueIds, target};

        this._recordIntent({
            operation: 'cut-fragment',
            target,
            parameters: {residueCount: residueIds.length},
            source,
        });

        return {result, command};
    }

    replaceFragment(target, {fragmentId = 'builtin_loop_6', source = 'vr-edit'} = {}) {
        const ctx = this._ctx();
        const proteinId = targetProteinId(target, ctx);
        const residueIds = targetResidueIds(target);
        if (!proteinId || !residueIds.length) throw new Error('[ProteinDesignFeature] replaceFragment requires residue/range target');

        const fragment = this.fragmentLibrary.get(fragmentId) || this.fragmentLibrary.first();
        if (!fragment) throw new Error('[ProteinDesignFeature] no fragment available');

        const command = new ReplaceFragmentCommand({
            proteinId,
            residueIds,
            fragment,
            metadata: {source, targetKind: target.kind},
        });

        const result = ctx.commandManager.execute(command, {source});
        this.lastFragmentSelection = {proteinId, residueIds, target, fragment: fragment.toJSON()};

        this._recordIntent({
            operation: 'replace-fragment',
            target,
            parameters: {fragment: fragment.toJSON()},
            source,
        });

        return {result, command, fragment};
    }

    snapFragment(target = null, {source = 'vr-edit'} = {}) {
        const ctx = this._ctx();
        const selection = target
            ? {proteinId: targetProteinId(target, ctx), residueIds: targetResidueIds(target), target}
            : this.lastFragmentSelection;

        if (!selection?.proteinId || !selection?.residueIds?.length) {
            throw new Error('[ProteinDesignFeature] snapFragment requires a current fragment selection');
        }

        const quality = {
            score: 0.72,
            label: 'magnet-preview',
            note: 'Front-end snap intent recorded; backend Kabsch/relax integration reserved.',
        };

        const command = new SnapFragmentCommand({
            proteinId: selection.proteinId,
            residueIds: selection.residueIds,
            snapTarget: {
                strategy: 'backbone-anchor',
                anchors: ['N', 'CA', 'C'],
            },
            quality,
            metadata: {source},
        });

        const result = ctx.commandManager.execute(command, {source});

        this._recordIntent({
            operation: 'snap-fragment',
            target: selection.target,
            parameters: {quality},
            source,
        });

        return {result, command, quality};
    }

    markDesignRegion(target, {label = 'Design region', source = 'vr-design'} = {}) {
        const ctx = this._ctx();
        const proteinId = targetProteinId(target, ctx);
        const residueIds = targetResidueIds(target);
        if (!proteinId || !residueIds.length) throw new Error('[ProteinDesignFeature] markDesignRegion requires residue/range target');

        const model = ctx.proteinSystem.getProtein(proteinId);
        for (const residueId of residueIds) {
            const residue = model?.residues?.get?.(residueId);
            if (!residue) continue;
            residue.metadata = {
                ...(residue.metadata || {}),
                provrDesignRegion: label,
                provrDesignRegionAt: new Date().toISOString(),
            };
        }

        model?.bumpRevision?.('markDesignRegion');

        this._recordIntent({
            operation: 'mark-design-region',
            target,
            parameters: {label, residueCount: residueIds.length},
            source,
        });

        return {proteinId, residueIds, label};
    }

    fragmentLibrarySummary() {
        return this.fragmentLibrary.list();
    }

    _recordIntent({operation, target, parameters = {}, source = 'protein-design-feature'} = {}) {
        const ctx = this._ctx();
        ctx.designIntentStore.record(makeManipulationIntent({
            target: {
                proteinId: target?.proteinId || ctx.activeProteinId,
                kind: target?.kind || 'unknown',
                atomIds: target?.atomIds || [],
                residueIds: target?.residueIds || [],
                chainIds: target?.chainIds || [],
                label: target?.label || '',
            },
            operation,
            source,
            inputDevice: 'vr-controller',
            parameters,
            metadata: {
                workflow: 'vr-protein-design',
            },
        }));
    }

    _ctx() {
        if (!this.context) throw new Error('[ProteinDesignFeature] context is not attached');
        return this.context;
    }
}
