import {
    makeConsoleHeaderTexture,
    makeQuickButtonTexture,
    makeLiquidButtonTexture,
    makeStatusPillTexture,
} from '../vr/ui/VRLiquidGlassCanvas.js';
import {VRDesignTokens} from '../vr/ui/VRDesignTokens.js';

export function validateVRFloatingSpatialConsoleContract() {
    const issues = [];

    const header = makeConsoleHeaderTexture({title: 'ProVR', subtitle: 'Root'});
    const quick = makeQuickButtonTexture({title: 'Undo', icon: '↶', state: 'hover'});
    const action = makeLiquidButtonTexture({title: 'Transform', subtitle: 'rigid edit', state: 'hover'});
    const status = makeStatusPillTexture({text: 'Point at a button · Trigger to select'});

    if (!header?.isTexture) issues.push('Header texture failed.');
    if (!quick?.isTexture) issues.push('Quick button texture failed.');
    if (!action?.isTexture) issues.push('Action button texture failed.');
    if (!status?.isTexture) issues.push('Status pill texture failed.');

    if (VRDesignTokens.layout.headerWidth >= 4.0) issues.push('Header too wide; this should not be a giant panel.');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            concept: 'Floating Spatial Console: no giant white panel; header + quick bar + floating 4x3 cards + status pill.',
            layout: VRDesignTokens.layout,
        },
    };
}

if (typeof window !== 'undefined') window.validateVRFloatingSpatialConsoleContract = validateVRFloatingSpatialConsoleContract;
