import {ProVRVRWorkspace} from './ProVRVRWorkspace.js';

async function boot() {
    const workspace = new ProVRVRWorkspace({
        viewportSelector: '#viewport',
        statusSelector: '#status',
        summarySelector: '#summary',
    });

    window.provrWorkspace = workspace;

    try {
        await workspace.init();
    } catch (err) {
        console.error('[ProVR] workspace boot failed', err);
        const status = document.getElementById('status');
        if (status) {
            status.textContent = err.message || String(err);
            status.dataset.kind = 'error';
        }
    }
}

boot();
