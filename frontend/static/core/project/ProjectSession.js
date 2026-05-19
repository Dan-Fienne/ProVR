function uid(prefix = 'project') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function clonePlain(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clonePlain);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
    return out;
}

export class ProjectSession {
    constructor({id = null, name = 'Untitled ProVR Project', metadata = {}} = {}) {
        this.id = id || uid('project');
        this.name = name;
        this.createdAt = new Date().toISOString();
        this.updatedAt = this.createdAt;
        this.metadata = {...metadata};

        this.proteinIds = [];
        this.activeProteinId = null;

        this.representationSpecs = new Map();
        this.designIntents = [];
        this.designRegions = [];
        this.designConstraints = [];

        this.sandbox = {
            enabled: false,
            graph: null,
            fragments: [],
            metadata: {},
        };

        this.toolJobs = [];
        this.artifacts = [];
        this.workflowRuns = [];

        this.uiState = {};
        this.viewportState = {};

        this.dirty = false;
        this.revision = 0;
    }

    touch({dirty = true} = {}) {
        this.updatedAt = new Date().toISOString();
        this.revision += 1;
        if (dirty) this.dirty = true;
        return this.revision;
    }

    markSaved() {
        this.dirty = false;
        this.updatedAt = new Date().toISOString();
    }

    addProtein(proteinId, {active = true} = {}) {
        if (!proteinId) throw new Error('[ProjectSession] proteinId is required');
        if (!this.proteinIds.includes(proteinId)) this.proteinIds.push(proteinId);
        if (active) this.activeProteinId = proteinId;
        this.touch();
    }

    removeProtein(proteinId) {
        this.proteinIds = this.proteinIds.filter((id) => id !== proteinId);
        if (this.activeProteinId === proteinId) this.activeProteinId = this.proteinIds[0] || null;
        for (const [repId, spec] of [...this.representationSpecs.entries()]) {
            if (spec.proteinId === proteinId) this.representationSpecs.delete(repId);
        }
        this.touch();
    }

    setActiveProtein(proteinId) {
        if (!this.proteinIds.includes(proteinId)) throw new Error(`[ProjectSession] unknown proteinId: ${proteinId}`);
        this.activeProteinId = proteinId;
        this.touch({dirty: false});
    }

    upsertRepresentationSpec(spec) {
        const json = spec?.toJSON?.() || spec;
        if (!json?.id) throw new Error('[ProjectSession] representation spec requires id');
        this.representationSpecs.set(json.id, clonePlain(json));
        this.touch();
    }

    removeRepresentationSpec(repId) {
        this.representationSpecs.delete(repId);
        this.touch();
    }

    listRepresentationSpecs({proteinId = null} = {}) {
        const specs = [...this.representationSpecs.values()];
        return proteinId ? specs.filter((spec) => spec.proteinId === proteinId) : specs;
    }

    recordDesignIntent(intent) {
        const json = intent?.toJSON?.() || intent;
        if (!json?.id) throw new Error('[ProjectSession] design intent requires id');
        this.designIntents.push(clonePlain(json));
        this.touch();
    }

    addDesignRegion(region) {
        this.designRegions.push(clonePlain(region));
        this.touch();
    }

    addDesignConstraint(constraint) {
        this.designConstraints.push(clonePlain(constraint));
        this.touch();
    }

    setSandboxState(state = {}) {
        this.sandbox = {...this.sandbox, ...clonePlain(state)};
        this.touch();
    }

    addToolJob(job) {
        this.toolJobs.push(clonePlain(job));
        this.touch();
    }

    updateToolJob(jobId, patch = {}) {
        const job = this.toolJobs.find((row) => row.id === jobId || row.jobId === jobId);
        if (!job) return false;
        Object.assign(job, clonePlain(patch), {updatedAt: new Date().toISOString()});
        this.touch();
        return true;
    }

    addArtifact(artifact) {
        const row = {
            id: artifact.id || uid('artifact'),
            createdAt: new Date().toISOString(),
            ...clonePlain(artifact),
        };
        this.artifacts.push(row);
        this.touch();
        return row;
    }

    addWorkflowRun(run) {
        this.workflowRuns.push(clonePlain(run));
        this.touch();
    }

    setUIState(key, value, {dirty = false} = {}) {
        this.uiState[key] = clonePlain(value);
        this.touch({dirty});
    }

    setViewportState(key, value, {dirty = false} = {}) {
        this.viewportState[key] = clonePlain(value);
        this.touch({dirty});
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            revision: this.revision,
            dirty: this.dirty,
            metadata: clonePlain(this.metadata),
            proteinIds: [...this.proteinIds],
            activeProteinId: this.activeProteinId,
            representationSpecs: this.listRepresentationSpecs(),
            designIntents: clonePlain(this.designIntents),
            designRegions: clonePlain(this.designRegions),
            designConstraints: clonePlain(this.designConstraints),
            sandbox: clonePlain(this.sandbox),
            toolJobs: clonePlain(this.toolJobs),
            artifacts: clonePlain(this.artifacts),
            workflowRuns: clonePlain(this.workflowRuns),
            uiState: clonePlain(this.uiState),
            viewportState: clonePlain(this.viewportState),
        };
    }

    static fromJSON(json = {}) {
        const session = new ProjectSession({id: json.id, name: json.name, metadata: json.metadata || {}});
        session.createdAt = json.createdAt || session.createdAt;
        session.updatedAt = json.updatedAt || session.updatedAt;
        session.revision = Number(json.revision) || 0;
        session.dirty = !!json.dirty;
        session.proteinIds = [...(json.proteinIds || [])];
        session.activeProteinId = json.activeProteinId || session.proteinIds[0] || null;
        for (const spec of json.representationSpecs || []) {
            if (spec?.id) session.representationSpecs.set(spec.id, clonePlain(spec));
        }
        session.designIntents = clonePlain(json.designIntents || []);
        session.designRegions = clonePlain(json.designRegions || []);
        session.designConstraints = clonePlain(json.designConstraints || []);
        session.sandbox = clonePlain(json.sandbox || session.sandbox);
        session.toolJobs = clonePlain(json.toolJobs || []);
        session.artifacts = clonePlain(json.artifacts || []);
        session.workflowRuns = clonePlain(json.workflowRuns || []);
        session.uiState = clonePlain(json.uiState || {});
        session.viewportState = clonePlain(json.viewportState || {});
        return session;
    }
}
