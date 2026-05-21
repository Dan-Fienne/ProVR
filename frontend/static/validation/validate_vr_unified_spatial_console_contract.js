import {VRDesignTokens} from '../vr/ui/VRDesignTokens.js';
import {makeLiquidPanelTexture, makeNavButtonTexture, makeLiquidButtonTexture} from '../vr/ui/VRLiquidGlassCanvas.js';

export function validateVRUnifiedSpatialConsoleContract() {
    const issues = [];

    const panel = makeLiquidPanelTexture({title: 'ProVR', subtitle: 'Spatial Console'});
    const nav = makeNavButtonTexture({title: 'Undo', subtitle: '撤销', icon: '↶', state: 'hover'});
    const button = makeLiquidButtonTexture({title: 'Transform', subtitle: 'rigid edits', state: 'hover'});

    if (!panel?.isTexture) issues.push('Panel texture failed.');
    if (!nav?.isTexture) issues.push('Nav texture failed.');
    if (!button?.isTexture) issues.push('Button texture failed.');

    if (VRDesignTokens.layout.panelWidth <= 0 || VRDesignTokens.layout.contentButtonWidth <= 0) {
        issues.push('Layout tokens invalid.');
    }

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            concept: 'Unified Spatial Console: integrated rail + content well + status area',
            layout: VRDesignTokens.layout,
            note: 'This redesign avoids the previous pasted-on menu bar / big frame mismatch.',
        },
    };
}

if (typeof window !== 'undefined') window.validateVRUnifiedSpatialConsoleContract = validateVRUnifiedSpatialConsoleContract;
