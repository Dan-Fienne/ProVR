import {VRDesignTokens} from '../vr/ui/VRDesignTokens.js';
import {VRProteinCollection} from '../vr/workspace/VRProteinCollection.js';

export function validateVRUIFitActiveFixContract() {
    const issues = [];

    const layout = VRDesignTokens.layout;
    const contentRight = -0.96 + 3 * 0.90 + layout.buttonWidth / 2;
    const panelRight = layout.panelWidth / 2;
    if (contentRight > panelRight) issues.push(`content grid overflows panel: ${contentRight} > ${panelRight}`);

    const contentLeft = -0.96 - layout.buttonWidth / 2;
    const separatorRight = -1.74;
    if (contentLeft < separatorRight) issues.push(`content grid overlaps left nav: ${contentLeft} < ${separatorRight}`);

    const context = {};
    Object.defineProperty(context, 'activeProteinId', {get: () => null});
    Object.defineProperty(context, 'activeModel', {get: () => null});

    const collection = new VRProteinCollection({
        context,
        representationFeature: {setVisible(){}},
    });
    collection.addProtein({model: {id: '1cwa'}, pdbId: '1CWA'});
    collection.addProtein({model: {id: '4eu2'}, pdbId: '4EU2'});
    collection.addProtein({model: {id: '4eu4'}, pdbId: '4EU4'});
    if (collection.activeProteinId !== '1cwa') issues.push('collection did not set its own activeProteinId');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            panel: {width: layout.panelWidth, height: layout.panelHeight},
            button: {width: layout.buttonWidth, height: layout.buttonHeight},
            rows: layout.contentRows,
            cols: layout.contentCols,
            activeProteinFix: 'does not write getter-only context.activeProteinId/context.activeModel',
        },
    };
}

if (typeof window !== 'undefined') window.validateVRUIFitActiveFixContract = validateVRUIFitActiveFixContract;
