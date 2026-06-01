import {FileApiClient} from './FileApiClient.js';

export class ProteinFileResolver {
    constructor({
                    fileApiClient = new FileApiClient(),
                    fetchImpl = null,
                    demoBaseUrl = '/static/assets/demo',
                } = {}) {
        this.fileApiClient = fileApiClient;
        this.fetchImpl = fetchImpl || fetch.bind(window);
        this.demoBaseUrl = demoBaseUrl.replace(/\/$/, '');
    }

    async resolvePdbText(pdbId, {userFiles = []} = {}) {
        const normalized = this.normalizePdbId(pdbId);
        if (!normalized) return null;

        const demoText = await this._tryDemo(normalized);
        if (demoText) return demoText;

        const candidates = this._userFileCandidates(normalized, userFiles);
        for (const candidate of candidates) {
            try {
                const text = await this.fileApiClient.getFileText(
                    candidate.id != null
                        ? {fileId: candidate.id}
                        : {filename: candidate.filename}
                );
                if (text) return text;
            } catch {}
        }
        return null;
    }

    normalizePdbId(pdbId) {
        return String(pdbId || '').replace(/\.pdb$/i, '').trim().toUpperCase();
    }

    async _tryDemo(normalized) {
        const lower = normalized.toLowerCase();
        const urls = [
            `${this.demoBaseUrl}/${lower}.pdb`,
            `${this.demoBaseUrl}/${normalized}.pdb`,
        ];
        for (const url of urls) {
            try {
                const res = await this.fetchImpl(url, {cache: 'no-store'});
                if (res.ok) return res.text();
            } catch {}
        }
        return null;
    }

    _userFileCandidates(normalized, userFiles) {
        const names = new Set([
            `${normalized}.pdb`,
            `${normalized.toLowerCase()}.pdb`,
        ]);
        const rows = [];
        for (const file of userFiles || []) {
            const filename = file.filename || file.original_filename || '';
            if (names.has(filename) || names.has(filename.toLowerCase())) rows.push(file);
        }
        for (const filename of names) rows.push({filename});
        return rows;
    }
}

export function createProteinFileResolver(options = {}) {
    return new ProteinFileResolver(options);
}

