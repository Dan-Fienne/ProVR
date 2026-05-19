import {PickTargetKind} from './PickTarget.js';

function unique(values = []) {
    return [...new Set(values.filter((v) => v !== null && v !== undefined))];
}

function first(value) {
    return Array.isArray(value) ? value[0] : value;
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

function collectAtomIdsFromResidues(model, residueIds) {
    const atomIds = [];
    for (const residueId of residueIds || []) {
        const residue = model.residues.get(residueId);
        if (residue?.atomIds?.length) atomIds.push(...residue.atomIds);
    }
    return atomIds;
}

function collectChainAtomIds(model, chainId) {
    const chain = model.chains.get(chainId);
    if (!chain) return [];
    return collectAtomIdsFromResidues(model, chain.residueIds || []);
}

function labelForTarget(target) {
    const m = target?.metadata || {};
    if (m.label) return m.label;
    if (m.atomName) return `${m.atomName}${m.residueName ? ` / ${m.residueName}${m.residueLabel || ''}` : ''}`;
    if (m.residueName) return `${m.residueName}${m.residueLabel || ''}`;
    if (target?.chainIds?.length) return `chain ${target.chainIds.join(',')}`;
    return target?.kind || 'target';
}

function targetFromLegacyHit(hit) {
    if (!hit?.model || !hit.atomId) return null;
    const model = hit.model;
    const atom = model.getAtom(hit.atomId);
    const residue = atom ? model.residues.get(atom.residueId) : null;
    return {
        proteinId: model.id,
        kind: PickTargetKind.ATOM,
        atomIds: atom ? [atom.id] : [],
        residueIds: residue ? [residue.id] : [],
        chainIds: residue ? [residue.chainId] : [],
        metadata: {
            atomName: atom?.name || hit.atomName || '',
            element: atom?.element || hit.element || '',
            residueName: residue?.name || hit.residueName || '',
            residueLabel: residue?.label || hit.residueLabel || '',
        },
        hit,
    };
}

/**
 * Unified EditTargetResolver for mouse, VR, hand tracking and sandbox.
 *
 * Input can be:
 * - legacy hit from AtomRayPicker: {model, atomId, residueId, chainId...}
 * - PickTarget from PickRegistry: {proteinId, kind, atomIds, residueIds, chainIds, metadata}
 *
 * Output is always:
 * - proteinId
 * - kind
 * - atomIds
 * - residueIds
 * - chainIds
 * - label
 * - rawTarget
 */
export class EditTargetResolver {
    constructor({
                    proteinSystem = null,
                    getMode = () => 'atom',
                    getResidueWindow = () => 5,
                } = {}) {
        this.proteinSystem = proteinSystem;
        this.getMode = getMode;
        this.getResidueWindow = getResidueWindow;
    }

    resolve(input, {mode = null, residueWindow = null, model = null} = {}) {
        const actualMode = mode || this.getMode();
        const actualWindow = residueWindow ?? this.getResidueWindow();

        const normalized = input?.proteinId && input?.kind
            ? input
            : targetFromLegacyHit(input);

        if (!normalized) return null;

        const resolvedModel = model
            || input?.model
            || this.proteinSystem?.getProtein?.(normalized.proteinId)
            || null;

        if (!resolvedModel) return null;

        return this._resolvePickTarget(resolvedModel, normalized, {
            mode: actualMode,
            residueWindow: actualWindow,
        });
    }

    _resolvePickTarget(model, target, {mode, residueWindow}) {
        const firstAtomId = first(target.atomIds);
        const firstResidueId = first(target.residueIds);
        const firstChainId = first(target.chainIds);
        const label = labelForTarget(target);

        if (mode === 'atom') {
            const atom = model.getAtom(firstAtomId);
            const residue = atom ? model.residues.get(atom.residueId) : null;
            return this._makeResult(model, {
                kind: 'atom',
                atomIds: atom ? [atom.id] : [],
                residueIds: atom ? [atom.residueId] : [],
                chainIds: residue ? [residue.chainId] : [],
                label,
                rawTarget: target,
            });
        }

        if (mode === 'residue') {
            const residueId = firstResidueId || (firstAtomId ? model.getAtom(firstAtomId)?.residueId : null);
            const residue = residueId ? model.residues.get(residueId) : null;
            return this._makeResult(model, {
                kind: 'residue',
                atomIds: residue ? [...residue.atomIds] : [],
                residueIds: residue ? [residue.id] : [],
                chainIds: residue ? [residue.chainId] : [],
                label: residue ? `${residue.name}${residue.label} chain ${residue.chainId}` : label,
                rawTarget: target,
            });
        }

        if (mode === 'range' || mode === 'residueRange') {
            let residueIds = [];
            if (firstResidueId) residueIds = residueWindowIds(model, firstResidueId, residueWindow);
            else if (target.residueIds?.length) residueIds = [...target.residueIds];

            return this._makeResult(model, {
                kind: 'residueRange',
                atomIds: collectAtomIdsFromResidues(model, residueIds),
                residueIds,
                chainIds: unique(residueIds.map((id) => model.residues.get(id)?.chainId)),
                label: `${label} ± ${residueWindow} residues`,
                rawTarget: target,
            });
        }

        if (mode === 'chain') {
            const chainId = firstChainId || (firstResidueId ? model.residues.get(firstResidueId)?.chainId : null);
            const chain = chainId ? model.chains.get(chainId) : null;
            return this._makeResult(model, {
                kind: 'chain',
                atomIds: chainId ? collectChainAtomIds(model, chainId) : [],
                residueIds: chain ? [...(chain.residueIds || [])] : [],
                chainIds: chainId ? [chainId] : [],
                label: `chain ${chainId || ''}`,
                rawTarget: target,
            });
        }

        if (mode === 'protein' || mode === 'model') {
            return this._makeResult(model, {
                kind: 'protein',
                atomIds: [...model.atoms.keys()],
                residueIds: [...model.residues.keys()],
                chainIds: [...model.chains.keys()],
                label: model.id,
                rawTarget: target,
            });
        }

        const fallbackAtomIds = target.atomIds?.length
            ? [...target.atomIds]
            : collectAtomIdsFromResidues(model, target.residueIds || []);
        return this._makeResult(model, {
            kind: target.kind || 'target',
            atomIds: fallbackAtomIds,
            residueIds: target.residueIds || [],
            chainIds: target.chainIds || [],
            label,
            rawTarget: target,
        });
    }

    _makeResult(model, {kind, atomIds, residueIds, chainIds, label, rawTarget}) {
        return {
            proteinId: model.id,
            kind,
            atomIds: unique(atomIds),
            residueIds: unique(residueIds),
            chainIds: unique(chainIds),
            label,
            model,
            rawTarget,
        };
    }
}
