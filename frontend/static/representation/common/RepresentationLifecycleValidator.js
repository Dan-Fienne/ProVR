export function validateRepresentationLifecycle({manager = null, proteinId = null} = {}) {
    const issues = [];
    const rows = [];

    if (!manager) {
        return {ok: false, issues: ['manager is missing'], rows};
    }

    const ids = manager.list({proteinId});
    for (const id of ids) {
        const rep = manager.get(id);
        if (!rep) {
            issues.push(`missing representation instance: ${id}`);
            continue;
        }

        const pickables = rep.getPickables?.() || [];
        const summary = rep.summary?.() || {};

        if (!rep.built) issues.push(`representation is not built: ${id}`);
        if (rep.disposed) issues.push(`representation is disposed but still registered: ${id}`);
        if (!rep.root && rep.spec?.type !== 'debug-atoms' && rep.spec?.type !== 'debug-residues' && rep.spec?.type !== 'debug-bonds') {
            issues.push(`representation has no root: ${id}`);
        }

        for (const object of pickables) {
            const target = manager.context.pickRegistry.getTarget(object);
            if (!target) issues.push(`pickable missing PickRegistry target: ${id} / ${object.name || object.type || 'object'}`);
        }

        rows.push({
            id,
            type: rep.spec?.type || '',
            proteinId: rep.proteinId,
            built: rep.built,
            disposed: rep.disposed,
            visible: rep.visible,
            pickables: pickables.length,
            dirty: rep.dirty,
            root: rep.root?.name || '',
            summary,
        });
    }

    const pickSummary = manager.context?.pickRegistry?.summary?.() || null;

    return {
        ok: issues.length === 0,
        issues,
        rows,
        summary: {
            representationCount: ids.length,
            pickRegistry: pickSummary,
        },
    };
}
