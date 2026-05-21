export const MenuActionKind = Object.freeze({
    PAGE: 'page',
    IMMEDIATE: 'immediate',
    TOOL: 'tool',
    SLIDER: 'slider',
    HANDLE: 'handle',
    CLOSE: 'close',
});

export const ColorPalette = Object.freeze([
    ['red', 'Red', '#ef4444'],
    ['orange', 'Orange', '#f97316'],
    ['yellow', 'Yellow', '#facc15'],
    ['green', 'Green', '#22c55e'],
    ['cyan', 'Cyan', '#22d3ee'],
    ['blue', 'Blue', '#3b82f6'],
    ['purple', 'Purple', '#8b5cf6'],
    ['pink', 'Pink', '#ec4899'],
    ['white', 'White', '#ffffff'],
    ['gray', 'Gray', '#94a3b8'],
]);

export function createCanonicalMenuTree({pdbIds = ['1CWA'], recentIds = [], loadedProteins = [], activeProteinId = null} = {}) {
    const pdbButtons = pdbIds.map((id) => ({
        id: `load:pdb:${id}`,
        title: String(id).toUpperCase(),
        subtitle: 'database PDB',
        kind: MenuActionKind.IMMEDIATE,
    }));

    const loadedButtons = loadedProteins.length ? loadedProteins.map((p) => ({
        id: `protein:active:${p.proteinId}`,
        title: p.pdbId || p.proteinId,
        subtitle: p.proteinId === activeProteinId ? 'active protein' : 'set active',
        kind: MenuActionKind.IMMEDIATE,
    })) : [
        {id: 'protein:none', title: 'No Protein Loaded', subtitle: 'Load PDB first', kind: MenuActionKind.IMMEDIATE, disabled: true},
    ];

    return {
        root: {
            id: 'root',
            title: 'ProVR',
            subtitle: activeProteinId ? `Active: ${activeProteinId}` : 'Vertical liquid-glass menu',
            buttons: [
                page('load', 'Load', 'PDB IDs'),
                page('proteins', 'Proteins', 'active / visible'),
                page('view', 'View', 'representations'),
                page('surface', 'Surface', 'skin / opacity'),
                page('color', 'Color', 'scheme / palette'),
                page('transform', 'Transform', 'rigid edits'),
                page('conform', 'Conform', 'local edits'),
                page('fragment', 'Fragment', 'cut / replace'),
                page('design', 'Design', 'intent'),
                page('tools', 'Tools', 'backend'),
                page('export', 'Export', 'PDB/session'),
                page('system', 'System', 'recover'),
            ],
        },

        load: {
            id: 'load',
            title: 'Load',
            subtitle: 'Load multiple proteins in VR',
            buttons: [
                {id: 'load:download-pdb', title: 'Download from PDB', subtitle: 'backend later', kind: MenuActionKind.IMMEDIATE},
                page('load_recent', 'Recent', 'recent PDB IDs'),
                {id: 'load:refresh', title: 'Refresh PDB List', subtitle: 'database', kind: MenuActionKind.IMMEDIATE},
                ...pdbButtons,
            ],
        },

        load_recent: {
            id: 'load_recent',
            title: 'Recent',
            subtitle: 'Recent PDB IDs',
            buttons: recentIds.length ? recentIds.map((id) => imm(`load:pdb:${id}`, String(id).toUpperCase(), 'recent')) : [
                imm('load:pdb:1CWA', '1CWA', 'demo recent'),
            ],
        },

        proteins: {
            id: 'proteins',
            title: 'Proteins',
            subtitle: 'Loaded proteins / active target',
            buttons: [
                ...loadedButtons,
                imm('protein:show-active', 'Show Active', 'visible'),
                imm('protein:hide-active', 'Hide Active', 'hide active reps'),
                imm('protein:show-all', 'Show All', 'all proteins visible'),
                imm('protein:hide-nonactive', 'Solo Active', 'hide others'),
                imm('protein:remove-active', 'Remove Active', 'later'),
            ],
        },

        view: {
            id: 'view',
            title: 'View',
            subtitle: 'No coordinate change',
            buttons: [
                imm('view:cartoon', 'Cartoon', 'active protein'),
                imm('view:ballstick', 'Ball-stick', 'active protein'),
                imm('view:line', 'Line', 'active protein'),
                imm('view:surface-overlay', 'Surface Overlay', 'active protein'),
                page('protein_view', 'Protein View', 'placement / scale'),
                imm('view:labels', 'Labels', 'hover labels'),
            ],
        },

        protein_view: {
            id: 'protein_view',
            title: 'Protein View',
            subtitle: 'visual only, PDB unchanged',
            buttons: [
                imm('view:bring-protein', 'Bring Workspace', 'front'),
                imm('view:fit-protein', 'Fit Workspace', 'overview'),
                imm('view:protein-bigger', 'Bigger', '+'),
                imm('view:protein-smaller', 'Smaller', '-'),
                tool('view:grab-protein-view', 'Grab View', 'visual move', 'view_grab_protein'),
                tool('view:two-generic-hand-scale', 'Two-generic-hand Scale', 'visual scale', 'view_two_hand_scale'),
            ],
        },

        surface: {
            id: 'surface',
            title: 'Surface',
            subtitle: 'Flexible surface controls',
            buttons: [
                imm('surface:full', 'Full Active Protein', 'all active atoms'),
                tool('surface:pick-chain', 'Pick Chain', 'point at chain', 'surface_pick_chain'),
                tool('surface:pick-range', 'Pick Range', 'start / end', 'surface_pick_range_start'),
                imm('surface:selected', 'Selected Object', 'current selection'),
                page('surface_opacity', 'Opacity', 'liquid slider'),
                page('surface_color', 'Color', 'surface color'),
                imm('surface:clear', 'Clear Surface', 'active surface'),
                tool('surface:inspect-layer', 'Inspect Layer', 'visual only', 'surface_inspect_layer'),
            ],
        },

        surface_opacity: {
            id: 'surface_opacity',
            title: 'Surface Opacity',
            subtitle: 'Drag slider; menu stays open',
            buttons: [
                slider('surface:opacity', 'Opacity', 0.05, 1.0, 0.46),
                imm('surface:opacity:0.15', '15%', 'very light'),
                imm('surface:opacity:0.30', '30%', 'light'),
                imm('surface:opacity:0.45', '45%', 'default'),
                imm('surface:opacity:0.65', '65%', 'solid'),
                imm('surface:opacity:0.85', '85%', 'dense'),
            ],
        },

        surface_color: {
            id: 'surface_color',
            title: 'Surface Color',
            subtitle: 'Surface material color',
            buttons: ColorPalette.slice(0, 8).map(([id, title, color]) => ({id: `surface:color:${id}`, title, subtitle: color, color, kind: MenuActionKind.IMMEDIATE})),
        },

        color: {
            id: 'color',
            title: 'Color',
            subtitle: 'Visual style only',
            buttons: [
                page('color_scheme', 'Scheme', 'chain/element/SSE'),
                page('color_selection', 'Selection Color', 'pick or selected'),
                page('surface_color', 'Surface Color', 'surface material'),
                page('color_chain', 'Chain Color', 'per chain'),
            ],
        },

        color_scheme: {
            id: 'color_scheme',
            title: 'Color Scheme',
            subtitle: 'Active protein representation',
            buttons: [
                imm('color:scheme:chain', 'By Chain', ''),
                imm('color:scheme:element', 'By Element', ''),
                imm('color:scheme:sse', 'By SSE', ''),
                imm('color:scheme:residue', 'By Residue', ''),
            ],
        },

        color_selection: {
            id: 'color_selection',
            title: 'Selection Color',
            subtitle: 'Apply to current selection or pick target',
            buttons: ColorPalette.map(([id, title, color]) => ({id: `color:selection:${id}`, title, subtitle: color, color, kind: MenuActionKind.IMMEDIATE})),
        },

        color_chain: {
            id: 'color_chain',
            title: 'Chain Color',
            subtitle: 'Pick chain then color',
            buttons: [
                tool('color:pick-chain', 'Pick Chain', 'then choose color', 'color_pick_chain'),
                ...ColorPalette.slice(0, 8).map(([id, title, color]) => ({id: `color:chain:${id}`, title, subtitle: color, color, kind: MenuActionKind.IMMEDIATE})),
            ],
        },

        transform: {
            id: 'transform',
            title: 'Transform',
            subtitle: 'Rigid coordinate edits',
            buttons: [
                tool('transform:protein-coordinates', 'Move Active Protein Coord', 'PDB changes', 'transform_protein_coordinates'),
                tool('transform:chain', 'Move Chain', 'rigid chain', 'transform_chain'),
                tool('transform:selected', 'Move Selected Rigid', 'selected atoms', 'transform_selected_rigid'),
                tool('transform:fragment', 'Move Rigid Fragment', 'fragment', 'transform_fragment_rigid'),
            ],
        },

        conform: {
            id: 'conform',
            title: 'Conform',
            subtitle: 'Local conformation edits',
            buttons: [
                tool('conform:atom-constraint', 'Atom Constraint', 'falloff neighbors', 'conform_atom_constraint'),
                tool('conform:residue-local', 'Residue Local', 'backbone window', 'conform_residue_local'),
                tool('conform:sidechain', 'Residue Sidechain', 'rotamer later', 'conform_residue_sidechain'),
                tool('conform:loop-range', 'Loop / Range', 'anchors', 'conform_loop_range_start'),
                imm('conform:local-relax', 'Local Relax', 'backend later'),
            ],
        },

        fragment: {
            id: 'fragment',
            title: 'Fragment',
            subtitle: 'Cut / replace / snap',
            buttons: [
                tool('fragment:cut-range', 'Cut Range', 'start / end', 'fragment_cut_start'),
                tool('fragment:replace-range', 'Replace Range', 'library', 'fragment_replace_start'),
                tool('fragment:insert', 'Insert Fragment', 'later', 'fragment_insert'),
                tool('fragment:bridge', 'Bridge Ends', 'later', 'fragment_bridge'),
                tool('fragment:magnet-snap', 'Magnet Snap', 'align endpoints', 'fragment_magnet_snap'),
            ],
        },

        design: {
            id: 'design',
            title: 'Design',
            subtitle: 'Design intent',
            buttons: [
                tool('design:mark-region', 'Mark Region', 'start / end', 'design_region_start'),
                imm('design:add-objective', 'Objective', 'later'),
                imm('design:add-constraint', 'Constraint', 'later'),
                imm('design:add-note', 'Note', 'later'),
                imm('tools:sequence-design', 'Sequence Design', 'backend later'),
                imm('tools:predict', 'Predict Structure', 'backend later'),
            ],
        },

        tools: {
            id: 'tools',
            title: 'Tools',
            subtitle: 'Backend workflows',
            buttons: [
                imm('tools:docking', 'Docking', 'later'),
                imm('tools:align', 'Align', 'later'),
                imm('tools:score', 'Score', 'later'),
                imm('tools:relax', 'Relax', 'later'),
                imm('tools:sequence-design', 'Seq Design', 'later'),
                imm('tools:predict', 'Predict', 'later'),
            ],
        },

        export: {
            id: 'export',
            title: 'Export',
            subtitle: 'Current model / intent',
            buttons: [
                imm('export:pdb', 'Export Active PDB', 'current active coords'),
                imm('export:all-pdb', 'Export All PDBs', 'later'),
                imm('export:selection', 'Export Selection', 'later'),
                imm('export:intent', 'Export Intent', 'json'),
                imm('export:session', 'Export Session', 'later'),
            ],
        },

        system: {
            id: 'system',
            title: 'System',
            subtitle: 'Recover / diagnostics',
            buttons: [
                imm('system:undo', 'Undo', ''),
                imm('system:redo', 'Redo', ''),
                imm('system:cancel-current', 'Cancel Current', ''),
                imm('system:bring-ui', 'Bring UI', 'front'),
                imm('system:ui-large', 'UI Large', ''),
                imm('system:ui-normal', 'UI Normal', ''),
                imm('system:diagnostics', 'Diagnostics', ''),
                imm('system:reset-workspace', 'Reset', 'later'),
            ],
        },
    };
}

function page(id, title, subtitle = '') {
    return {id: `page:${id}`, page: id, title, subtitle, kind: MenuActionKind.PAGE};
}
function imm(id, title, subtitle = '') {
    return {id, title, subtitle, kind: MenuActionKind.IMMEDIATE};
}
function tool(id, title, subtitle, toolId) {
    return {id, title, subtitle, toolId, kind: MenuActionKind.TOOL};
}
function slider(id, title, min, max, value) {
    return {id, title, subtitle: `${Math.round(value * 100)}%`, min, max, value, kind: MenuActionKind.SLIDER};
}
