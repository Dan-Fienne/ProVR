export class FileApiClient {
    constructor({baseUrl = '', tokenProvider = null, fetchImpl = null} = {}) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.tokenProvider = tokenProvider || (() => {
            try {
                return localStorage.getItem('token') || localStorage.token || '';
            } catch {
                return '';
            }
        });
        this.fetchImpl = fetchImpl || fetch.bind(window);
    }

    async listFiles() {
        const data = await this._json('/api/files', {headers: this._headers()});
        const rows = Array.isArray(data) ? data : (data.files || data.items || []);
        return rows.map((row) => this.normalizeFile(row));
    }

    async uploadFile(file, {fileKind = null} = {}) {
        const body = new FormData();
        body.append('file', file);
        if (fileKind) body.append('file_kind', fileKind);
        const data = await this._json('/api/files', {
            method: 'POST',
            headers: this._headers(),
            body,
        });
        return this.normalizeFile(data);
    }

    async getFileText({fileId = null, filename = null} = {}) {
        const url = this.fileContentUrl({fileId, filename});
        const res = await this.fetchImpl(url, {headers: this._headers(), cache: 'no-store'});
        if (!res.ok) throw new Error(await this._errorMessage(res));
        return res.text();
    }

    async deleteFile({fileId = null, filename = null} = {}) {
        const params = this._fileParams({fileId, filename});
        return this._json(`/api/files?${params}`, {
            method: 'DELETE',
            headers: this._headers(),
        });
    }

    fileContentUrl({fileId = null, filename = null} = {}) {
        return `${this.baseUrl}/api/files/content?${this._fileParams({fileId, filename})}`;
    }

    normalizeFile(row = {}) {
        const original = row.original_filename || row.filename || row.name || '';
        const id = row.id ?? row.file_id ?? null;
        return {
            id,
            original_filename: original,
            filename: row.filename || original,
            file_kind: row.file_kind || row.kind || null,
            size: Number(row.size || 0),
            uploaded_at: row.uploaded_at || row.created_at || null,
            content_type: row.content_type || null,
            checksum_sha256: row.checksum_sha256 || null,
            storage_backend: row.storage_backend || 'local',
            download_url: row.download_url || (id != null ? `/api/files/content?file_id=${encodeURIComponent(id)}` : ''),
        };
    }

    _headers(extra = {}) {
        const token = this.tokenProvider?.() || '';
        return token ? {...extra, Authorization: `Bearer ${token}`} : {...extra};
    }

    _fileParams({fileId = null, filename = null} = {}) {
        const params = new URLSearchParams();
        if (fileId !== null && fileId !== undefined) params.set('file_id', String(fileId));
        else if (filename) params.set('filename', filename);
        else throw new Error('[FileApiClient] fileId or filename is required');
        return params.toString();
    }

    async _json(path, options = {}) {
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, options);
        if (!res.ok) throw new Error(await this._errorMessage(res));
        return res.json();
    }

    async _errorMessage(res) {
        try {
            const data = await res.json();
            return data.detail || data.error?.message || res.statusText;
        } catch {
            return res.statusText || `HTTP ${res.status}`;
        }
    }
}

export function createFileApiClient(options = {}) {
    return new FileApiClient(options);
}

