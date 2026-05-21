import {
    makeConsoleHeaderTexture,
    makeQuickButtonTexture,
    makeLiquidButtonTexture,
    makeStatusPillTexture,
} from '../vr/ui/VRLiquidGlassCanvas.js';
import {VRDesignTokens} from '../vr/ui/VRDesignTokens.js';

export function validateVRReadabilityFixContract() {
    const issues = [];

    const header = makeConsoleHeaderTexture({title: 'ProVR', subtitle: 'Root'});
    const quick = makeQuickButtonTexture({title: 'Undo', icon: '↶', state: 'hover'});
    const action = makeLiquidButtonTexture({title: 'Transform', subtitle: 'rigid edit', state: 'hover'});
    const status = makeStatusPillTexture({text: 'Point at a button · Trigger to select'});

    if (!header?.isTexture) issues.push('Header texture failed.');
    if (!quick?.isTexture) issues.push('Quick button texture failed.');
    if (!action?.isTexture) issues.push('Action button texture failed.');
    if (!status?.isTexture) issues.push('Status pill texture failed.');

    const buttonPx = Number(VRDesignTokens.font.button.match(/(\d+)px/)?.[1] || 0);
    if (buttonPx < 56) issues.push('Button title font is still too small.');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            concept: 'Readability repair: text occupies a much larger fraction of each VR card.',
            fonts: VRDesignTokens.font,
        },
    };
}

if (typeof window !== 'undefined') window.validateVRReadabilityFixContract = validateVRReadabilityFixContract;
