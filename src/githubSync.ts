import type { GardenData } from './archiveTypes';
export type GitHubSyncConfig = {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    token: string;
    passphrase: string;
};
export type GitHubRemoteGarden = {
    garden: GardenData;
    sha: string;
    updatedAt: string;
};
type GitHubErrorBody = {
    message?: string;
    documentation_url?: string;
};
type GitHubRepoResponse = {
    private?: boolean;
    default_branch?: string;
    permissions?: {
        push?: boolean;
    };
};
type GitHubContentResponse = {
    type?: string;
    sha?: string;
    content?: string;
    encoding?: string;
    git_url?: string;
};
type GitHubBlobResponse = {
    content?: string;
    encoding?: string;
};
type EncryptedGardenEnvelope = {
    format: 'knowledge-garden-encrypted-v1';
    algorithm: 'AES-GCM';
    kdf: 'PBKDF2-SHA256';
    iterations: number;
    salt: string;
    iv: string;
    ciphertext: string;
    updatedAt: string;
};
const API_ROOT = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const KDF_ITERATIONS = 250000;
export const DEFAULT_GITHUB_SYNC = {
    owner: '',
    repo: '',
    branch: 'main',
    path: 'knowledge-garden.enc.json',
};
export class GitHubSyncError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'GitHubSyncError';
        this.status = status;
    }
}
export class GitHubConflictError extends GitHubSyncError {
    constructor() {
        super('检测到另一台设备已经更新了知识库。为避免覆盖，请先点击“从 GitHub 获取”，确认内容后再继续编辑。', 409);
        this.name = 'GitHubConflictError';
    }
}
const cleanConfig = (config: GitHubSyncConfig): GitHubSyncConfig => ({
    owner: config.owner.trim(),
    repo: config.repo.trim(),
    branch: config.branch.trim() || 'main',
    path: config.path.trim().replace(/^\/+/, '') || DEFAULT_GITHUB_SYNC.path,
    token: config.token.trim(),
    passphrase: config.passphrase,
});
const headersFor = (config: GitHubSyncConfig, json = false): HeadersInit => ({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.token}`,
    'X-GitHub-Api-Version': API_VERSION,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
});
async function githubMessage(response: Response) {
    const body = await response.json().catch(() => ({})) as GitHubErrorBody;
    if (response.status === 401)
        return 'GitHub 访问令牌无效或已经过期。';
    if (response.status === 403)
        return 'GitHub 拒绝访问。请确认令牌已授权该私有仓库的 Contents 读写权限。';
    if (response.status === 404)
        return '找不到 GitHub 私有数据仓库，或当前令牌没有访问权限。';
    if (response.status === 409 || response.status === 422)
        return 'GitHub 文件版本发生冲突，请先从云端获取最新数据。';
    return body.message ? `GitHub：${body.message}` : `GitHub 请求失败（${response.status}）`;
}
async function githubFetch(configInput: GitHubSyncConfig, url: string, init: RequestInit = {}) {
    const config = cleanConfig(configInput);
    let response: Response;
    try {
        if (new URL(url).origin !== API_ROOT)
            throw new GitHubSyncError('拒绝将访问令牌发送到非 GitHub 地址。');
        response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(20000), headers: { ...headersFor(config, Boolean(init.body)), ...(init.headers ?? {}) } });
    }
    catch {
        throw new GitHubSyncError('无法连接 GitHub，请检查当前网络后重试。');
    }
    return response;
}
const pathForApi = (path: string) => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const contentsUrl = (config: GitHubSyncConfig) => `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${pathForApi(config.path)}`;
function bytesToBase64(bytes: Uint8Array) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    return btoa(binary);
}
function base64ToBytes(value: string) {
    const binary = atob(value.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
    return bytes;
}
const utf8ToBase64 = (value: string) => bytesToBase64(new TextEncoder().encode(value));
const base64ToUtf8 = (value: string) => new TextDecoder().decode(base64ToBytes(value));
async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number, usage: KeyUsage[]) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, material, { name: 'AES-GCM', length: 256 }, false, usage);
}
async function encryptGarden(garden: GardenData, passphrase: string): Promise<EncryptedGardenEnvelope> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt, KDF_ITERATIONS, ['encrypt']);
    const updatedAt = new Date().toISOString();
    const plaintext = new TextEncoder().encode(JSON.stringify({ version: 1, updatedAt, garden }));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
        format: 'knowledge-garden-encrypted-v1',
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2-SHA256',
        iterations: KDF_ITERATIONS,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(encrypted)),
        updatedAt,
    };
}
async function decryptGarden(envelope: EncryptedGardenEnvelope, passphrase: string): Promise<{
    garden: GardenData;
    updatedAt: string;
}> {
    if (envelope.format !== 'knowledge-garden-encrypted-v1' || envelope.algorithm !== 'AES-GCM') {
        throw new GitHubSyncError('GitHub 中的同步文件格式无法识别。');
    }
    try {
        if (!Number.isInteger(envelope.iterations) || envelope.iterations < 100000 || envelope.iterations > 1000000)
            throw new GitHubSyncError('加密参数不在支持范围内。');
        const salt = base64ToBytes(envelope.salt);
        const iv = base64ToBytes(envelope.iv);
        const key = await deriveKey(passphrase, salt, envelope.iterations || KDF_ITERATIONS, ['decrypt']);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(envelope.ciphertext));
        const payload = JSON.parse(new TextDecoder().decode(decrypted)) as {
            garden?: GardenData;
            updatedAt?: string;
        };
        if (!payload.garden)
            throw new Error('missing garden');
        return { garden: payload.garden, updatedAt: payload.updatedAt ?? envelope.updatedAt };
    }
    catch (error) {
        if (error instanceof GitHubSyncError)
            throw error;
        throw new GitHubSyncError('加密密码不正确，或 GitHub 中的知识库文件已经损坏。');
    }
}
async function readContent(config: GitHubSyncConfig): Promise<{
    sha: string;
    text: string;
} | null> {
    const response = await githubFetch(config, `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`);
    if (response.status === 404)
        return null;
    if (!response.ok)
        throw new GitHubSyncError(await githubMessage(response), response.status);
    const file = await response.json() as GitHubContentResponse;
    if (file.type !== 'file' || !file.sha)
        throw new GitHubSyncError('GitHub 同步路径不是一个文件。');
    if (file.content && file.encoding === 'base64')
        return { sha: file.sha, text: base64ToUtf8(file.content) };
    if (!file.git_url)
        throw new GitHubSyncError('无法读取 GitHub 中的同步文件。');
    const blobResponse = await githubFetch(config, file.git_url);
    if (!blobResponse.ok)
        throw new GitHubSyncError(await githubMessage(blobResponse), blobResponse.status);
    const blob = await blobResponse.json() as GitHubBlobResponse;
    if (!blob.content || blob.encoding !== 'base64')
        throw new GitHubSyncError('GitHub 返回了不支持的文件编码。');
    return { sha: file.sha, text: base64ToUtf8(blob.content) };
}
export async function verifyGitHubConnection(configInput: GitHubSyncConfig) {
    const config = cleanConfig(configInput);
    if (!config.owner || !config.repo || !config.token || config.passphrase.length < 8) {
        throw new GitHubSyncError('请填写仓库、访问令牌，并设置至少 8 位的加密密码。');
    }
    const response = await githubFetch(config, `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`);
    if (!response.ok)
        throw new GitHubSyncError(await githubMessage(response), response.status);
    const repo = await response.json() as GitHubRepoResponse;
    if (repo.private !== true)
        throw new GitHubSyncError('为保护读书笔记，请使用私有 GitHub 仓库，不能连接公开仓库。');
    if (repo.permissions && repo.permissions.push === false)
        throw new GitHubSyncError('当前令牌没有写入这个私有仓库的权限。');
    return { ...config, branch: config.branch || repo.default_branch || 'main' };
}
export async function pullGitHubGarden(configInput: GitHubSyncConfig): Promise<GitHubRemoteGarden | null> {
    const config = cleanConfig(configInput);
    const remote = await readContent(config);
    if (!remote)
        return null;
    let envelope: EncryptedGardenEnvelope;
    try {
        envelope = JSON.parse(remote.text) as EncryptedGardenEnvelope;
    }
    catch {
        throw new GitHubSyncError('GitHub 中的同步文件不是有效的加密知识库。');
    }
    const decrypted = await decryptGarden(envelope, config.passphrase);
    return { garden: decrypted.garden, updatedAt: decrypted.updatedAt, sha: remote.sha };
}
export async function pushGitHubGarden(configInput: GitHubSyncConfig, garden: GardenData, sha?: string) {
    const config = cleanConfig(configInput);
    const envelope = await encryptGarden(garden, config.passphrase);
    const response = await githubFetch(config, contentsUrl(config), {
        method: 'PUT',
        body: JSON.stringify({
            message: `sync: knowledge garden ${envelope.updatedAt}`,
            content: utf8ToBase64(JSON.stringify(envelope)),
            branch: config.branch,
            ...(sha ? { sha } : {}),
        }),
    });
    if (response.status === 409 || response.status === 422)
        throw new GitHubConflictError();
    if (!response.ok)
        throw new GitHubSyncError(await githubMessage(response), response.status);
    const result = await response.json() as {
        content?: {
            sha?: string;
        };
        commit?: {
            sha?: string;
        };
    };
    const nextSha = result.content?.sha;
    if (!nextSha)
        throw new GitHubSyncError('GitHub 已接收数据，但没有返回新的文件版本。');
    return { sha: nextSha, updatedAt: envelope.updatedAt, commitSha: result.commit?.sha };
}
