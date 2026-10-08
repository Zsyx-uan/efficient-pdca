import { useEffect, useState } from 'react';
import type { GardenData } from '../archiveTypes';
import { Download, FileInput, GitBranch, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { downloadJson } from '../gardenStore';
import type { GardenStore, Mutation, Snapshot } from '../gardenStore';
import { restoreTrash } from '../gardenModel';
import { DEFAULT_GITHUB_SYNC } from '../githubSync';
import type { GitHubSyncConfig } from '../githubSync';
import type { useGardenSync } from '../useGardenSync';
import { PageHeading } from '../components/Common';
export type SyncManager = ReturnType<typeof useGardenSync>;
export function DataCenter({ garden: g, revision, store, sync, action, onImport, onRestore, onVersion, onPaste }: {
    garden: GardenData;
    revision: number;
    store: GardenStore;
    sync: SyncManager;
    action: (change: Mutation, reason: string) => Promise<boolean>;
    onImport: () => void;
    onRestore: () => void;
    onVersion: (snapshot: Snapshot) => void;
    onPaste: () => void;
}) {
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]), [preferences] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('knowledge-garden-sync-preferences-v2') ?? 'null') ?? DEFAULT_GITHUB_SYNC;
        }
        catch {
            return DEFAULT_GITHUB_SYNC;
        }
    }), [config, setConfig] = useState<GitHubSyncConfig>({ ...DEFAULT_GITHUB_SYNC, ...preferences, token: '', passphrase: '' }), [remember, setRemember] = useState(false), [connecting, setConnecting] = useState(false), [error, setError] = useState(''), [showPassword, setShowPassword] = useState(false);
    useEffect(() => {
        let live = true;
        store.snapshots().then(list => {
            if (live)
                setSnapshots(list);
        }).catch(() => setError('无法读取版本列表，现有内容未改变。'));
        return () => { live = false; };
    }, [revision, store]);
    const update = (key: keyof GitHubSyncConfig, value: string) => setConfig(c => ({ ...c, [key]: value }));
    return <div className="page data-page">
    <PageHeading eyebrow="YOUR KNOWLEDGE, YOUR CONTROL" title="更多与数据管理" detail="新增资料、恢复备份与设备同步，各有清楚的边界。"/>
    <section className="data-section">
    <div className="section-heading">
    <h2>新增阅读资料</h2>
    <FileInput size={20}/>
    </div>
    <p>支持 UTF-8 Markdown / TXT。保留完整正文，候选卡片由你选择。不会覆盖整个知识库。</p>
    <div className="button-row">
    <button className="primary-button" onClick={onImport}>
    <Upload size={17}/>导入资料文件</button>
    <button className="soft-button" onClick={onPaste}>粘贴文本</button>
    </div>
    </section>
    <section className="data-section">
    <div className="section-heading">
    <h2>备份与恢复</h2>
    <ShieldCheck size={20}/>
    </div>
    <p>备份包含阅读档案、卡片、复习记录、回收站和阅读位置，不包含访问令牌或加密密码。</p>
    <div className="button-row">
    <button className="primary-button" onClick={() => downloadJson({ ...g, exportedAt: new Date().toISOString() })}>
    <Download size={17}/>导出 JSON 备份</button>
    <button className="soft-button" onClick={onRestore}>
    <Upload size={17}/>恢复 JSON 备份</button>
    </div>
    <p className="help-text">恢复前有预览并自动保留本机版本；恢复后暂停自动同步，避免云端旧内容覆盖新恢复的数据。浏览器数据仍需定期导出到安全位置。</p>
    </section>
    <section className="data-section">
    <div className="section-heading">
    <h2>版本快照</h2>
    <span className="muted">保留最近 20 次内容修改前的版本</span>
    </div>{snapshots.length ? <div className="snapshot-list">{snapshots.slice(0, 8).map(s => <div key={s.id}>
            <div>
            <strong>{s.reason}</strong>
            <small>{new Date(s.createdAt).toLocaleString('zh-CN')} · {s.garden.books.length} 本资料 / {s.garden.cards.length} 张卡片</small>
            </div>
            <button className="soft-button" onClick={() => onVersion(s)}>预览恢复</button>
            </div>)}</div> : <p className="muted">开始编辑内容后，快照会出现在这里。阅读位置保存不会占用快照名额。</p>}{snapshots.length > 8 && <details>
        <summary>显示其他 {snapshots.length - 8} 个版本</summary>{snapshots.slice(8).map(s => <div className="snapshot-extra" key={s.id}>
            <span>{s.reason} · {new Date(s.createdAt).toLocaleString('zh-CN')}</span>
            <button className="soft-button" onClick={() => onVersion(s)}>预览恢复</button>
            </div>)}</details>}</section>
    <section className="data-section">
    <div className="section-heading">
    <h2>回收站</h2>
    <span>{g.trash.length} 项</span>
    </div>{g.trash.length ? <div className="snapshot-list">{g.trash.map(t => <div key={t.id}>
            <div>
            <strong>{t.book?.title ?? t.cards[0]?.title ?? '已删除内容'}</strong>
            <small>{t.kind === 'book' ? `资料及 ${t.cards.length} 张卡片` : '知识卡片'} · {new Date(t.deletedAt).toLocaleDateString('zh-CN')}</small>
            </div>
            <button className="soft-button" onClick={() => void action(current => restoreTrash(current, t.id), '恢复回收站内容')}>恢复内容</button>
            </div>)}</div> : <p className="muted">没有已删除的内容。删除书籍或卡片后，可以从这里恢复。</p>}{g.trash.length > 0 && <button className="text-button danger" onClick={() => {
                if (confirm('清空回收站？删除的正文将从回收站移除，但现有版本快照仍保留。建议先导出备份。'))
                    void action(current => ({ ...current, trash: [] }), '清空回收站');
            }}>
        <Trash2 size={15}/>清空回收站</button>}</section>
    <section className="data-section sync-section">
    <div className="section-heading">
    <div>
    <p className="eyebrow">ADVANCED · ENCRYPTED SNAPSHOT SYNC</p>
    <h2>GitHub 加密同步</h2>
    </div>
    <GitBranch size={23}/>
    </div>
    <p className="notice" aria-live="polite">{sync.status}</p>{sync.config ? <>
        <p>已连接私有仓库：<strong>{sync.config.owner}/{sync.config.repo}</strong>
        </p>
        <p className="help-text">已确认的连接会在内容修改后检查并同步。出现冲突则暂停；不在启动时自动替换本机数据。当前{sync.paused ? '处于暂停状态，需手动检查' : '允许自动同步'}。</p>
        <div className="button-row">
        <button disabled={sync.busy || store.state.pending > 0} className="primary-button" onClick={() => void sync.perform(false)}>{sync.busy ? '正在检查…' : '检查并同步'}</button>
        <button className="soft-button" onClick={() => { sync.disconnect(); setConfig(c => ({ ...c, token: '', passphrase: '' })); }}>断开并清除凭据</button>
        </div>
        </> : <form className="sync-form" onSubmit={async (e) => {
                e.preventDefault();
                setConnecting(true);
                setError('');
                try {
                    await sync.connect(config, remember);
                    setConfig(c => ({ ...c, token: '', passphrase: '' }));
                }
                catch (ex) {
                    setError(ex instanceof Error ? ex.message : '连接失败');
                }
                finally {
                    setConnecting(false);
                }
            }}>
        <p>知识库在当前浏览器中加密后上传。仅适用于独立的 GitHub 私有仓库；令牌只需该仓库的 Contents 读写权限。</p>
        <div className="form-grid">
        <label>GitHub 用户名<input aria-label="GitHub 用户名" name="owner" required value={config.owner} onChange={e => update('owner', e.target.value)} autoComplete="username"/>
        </label>
        <label>私有仓库<input aria-label="私有仓库" name="repo" required value={config.repo} onChange={e => update('repo', e.target.value)}/>
        </label>
        <label className="span-2">访问令牌<input aria-label="访问令牌" name="token" type="password" required value={config.token} onChange={e => update('token', e.target.value)} autoComplete="off"/>
        </label>
        <label className="span-2">加密密码<input aria-label="加密密码" name="passphrase" type={showPassword ? 'text' : 'password'} minLength={8} required value={config.passphrase} onChange={e => update('passphrase', e.target.value)} autoComplete="off"/>
        </label>
        </div>
        <label className="inline-check">
        <input aria-label="" type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)}/>显示加密密码</label>
        <details>
        <summary>高级配置与已有连接</summary>
        <div className="form-grid">
        <label>分支<input aria-label="分支" required value={config.branch} onChange={e => update('branch', e.target.value)}/>
        </label>
        <label>加密文件路径<input aria-label="加密文件路径" required value={config.path} onChange={e => update('path', e.target.value)}/>
        </label>
        </div>
        <button type="button" className="soft-button" onClick={() => {
                try {
                    const old = JSON.parse(localStorage.getItem('knowledge-garden-github-sync-config-v1') ?? 'null');
                    if (old?.owner && old?.repo && typeof old.token === 'string' && typeof old.passphrase === 'string') {
                        setConfig(old);
                        setError('旧连接已填入。需手动验证，不会自动覆盖本机。');
                    }
                    else
                        setError('此浏览器没有可迁移的旧连接。');
                }
                catch {
                    setError('旧连接配置无法读取。');
                }
            }}>手动载入旧连接</button>
        </details>
        <label className="inline-check">
        <input aria-label="" type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/>记住此设备（令牌与密码将保存在本地）</label>
        <p className="help-text">默认仅在当前页面内使用凭据；刷新后需重新连接。云端加密不保护已解锁设备；请使用独立强密码。忘记密码无法解密，请妥善保管。</p>{error && <p className="error-text" role="alert">{error}</p>}<button className="primary-button" disabled={connecting}>{connecting ? '验证中…' : '验证连接并预览同步'}</button>
        </form>}</section>
    <section className="data-section">
    <h2>关于这次升级</h2>
    <p>数据保存在浏览器 IndexedDB，旧 v2/v3 原始数据保留用于迁移恢复。没有自动加入示例、没有外部 AI 请求。资料与笔记始终可以导出。</p>
    <a className="text-button" href="#/review">打开轻量复习 →</a>
    </section>
    </div>;
}
