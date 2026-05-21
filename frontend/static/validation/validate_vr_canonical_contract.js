import {createCanonicalMenuTree} from '../vr/menu/VRMenuDefinitions.js';
import {VRInteractionState, VRTool} from '../vr/interaction/VRInteractionState.js';

export function validateVRCanonicalContract() {
    const issues = [];
    const tree = createCanonicalMenuTree({pdbIds: ['1CWA', '7ABC']});
    for (const page of ['root','load','view','surface','color','transform','conform','fragment','design','tools','export','system']) {
        if (!tree[page]) issues.push(`missing menu page: ${page}`);
    }
    if (!tree.surface.buttons.some((b) => b.id === 'page:surface_opacity')) issues.push('surface opacity page missing');
    if (!tree.protein_view.buttons.some((b) => b.id === 'view:two-generic-hand-scale')) issues.push('two-generic-hand scale action missing');

    const state = new VRInteractionState();
    state.setTool(VRTool.TRANSFORM_CHAIN);
    if (state.currentTool !== VRTool.TRANSFORM_CHAIN) issues.push('state setTool failed');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            menuPages: Object.keys(tree),
            rootButtons: tree.root.buttons.map((b) => b.title),
            surfaceButtons: tree.surface.buttons.map((b) => b.title),
            state: state.toJSON(),
            note: 'Canonical VR uses old menu semantics: menu open = UI only; menu closed = protein only.',
        },
    };
}

if (typeof window !== 'undefined') window.validateVRCanonicalContract = validateVRCanonicalContract;
