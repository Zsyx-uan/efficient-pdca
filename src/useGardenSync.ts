import { useCallback, useEffect, useRef, useState } from 'react';
import type { GardenData } from './archiveTypes';
import { canonical, emptyGarden, normalizeGarden } from './gardenModel';
import { mergeGardens } from './gardenMerge';
import type { GardenStore } from './gardenStore';
import { pullGitHubGarden, pushGitHubGarden, verifyGitHubConnection } from './githubSync';
import type { GitHubRemoteGarden, GitHubSyncConfig } from './githubSync';
type Baseline = {
    garden: GardenData;
    sha: string;
};
export type SyncPlan = {
    remote: GitHubRemoteGarden | null;
    garden: GardenData;
    conflicts: string[];
    localRevision: number;
    base?: GardenData;
};
function rememberedConfig(): GitHubSyncConfig | null {
    try {
        const saved = JSON.parse(localStorage.getItem('knowledge-garden-github-sync-config-v1') ?? 'null');
        return saved && ['owner','repo','branch','path','token','passphrase'].every(k => typeof saved[k] === 'string') && saved.owner && saved.repo && saved.token && saved.passphrase.length >= 8 ? saved : null;
    } catch { return null; }
}
export function useGardenSync(store: GardenStore, revision: number) {
    const [config, setConfig] = useState<GitHubSyncConfig | null>(rememberedConfig), [status, setStatus] = useState(config ? '已恢复设备连接 · 请手动检查后确认同步' : '未连接 · 本地优先'), [busy, setBusy] = useState(false), [paused, setPaused] = useState(true), [plan, setPlan] = useState<SyncPlan | null>(null);
    const configRef = useRef<GitHubSyncConfig | null>(config), active = useRef(false), generation = useRef(0), lastUploaded = useRef('');
    const key = (c: GitHubSyncConfig) => `sync:${c.owner}/${c.repo}:${c.branch}:${c.path}`;
    const perform = useCallback(async (automatic = false) => {
        const c = configRef.current;
        if (!c || active.current || store.state.pending)
            return;
        active.current = true;
        setBusy(true);
        const currentGeneration = generation.current;
        try {
            setStatus('正在检查两端版本…');
            await store.reload();
            const remote = await pullGitHubGarden(c), savedBase = await store.readAux<Baseline>(key(c));
            if (currentGeneration !== generation.current)
                return;
            const local = store.state.garden, normalized = remote ? normalizeGarden(remote.garden, true) : emptyGarden();
            const merged = mergeGardens(savedBase?.garden, local, normalized);
            if (!savedBase || !remote || merged.conflicts.length) {
                setPlan({ remote: remote ? { ...remote, garden: normalized } : null, garden: merged.garden, conflicts: merged.conflicts, localRevision: store.state.revision, base: savedBase?.garden });
                setPaused(true);
                setStatus('等待确认 · 本机内容未被替换');
                return;
            }
            if (canonical(local) === canonical(normalized)) {
                await store.writeAux(key(c), { garden: local, sha: remote.sha });
                lastUploaded.current = canonical(local);
                setPaused(false);
                setStatus('两端一致 · 已检查');
                return;
            }
            if (!automatic && canonical(merged.garden) !== canonical(local)) {
                setPlan({ remote: { ...remote, garden: normalized }, garden: merged.garden, conflicts: merged.conflicts, localRevision: store.state.revision, base: savedBase.garden });
                setPaused(true);
                setStatus('发现云端修改 · 请确认合并');
                return;
            }
            const saved = await store.mutate(current => mergeGardens(savedBase.garden, current, normalized).garden, '同步前合并备份');
            if (!saved || currentGeneration !== generation.current)
                return;
            const snapshot = structuredClone(store.state.garden);
            const result = await pushGitHubGarden(c, snapshot, remote.sha);
            if (currentGeneration !== generation.current)
                return;
            await store.writeAux(key(c), { garden: snapshot, sha: result.sha });
            lastUploaded.current = canonical(snapshot);
            setStatus(`已同步 · ${new Date(result.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
            setPaused(false);
        }
        catch (e) {
            if (currentGeneration === generation.current) {
                setPaused(true);
                setStatus(`同步暂停：${e instanceof Error ? e.message : '网络错误'}。本机内容已保留。`);
            }
        }
        finally {
            active.current = false;
            setBusy(false);
        }
    }, [store]);
    const connect = async (input: GitHubSyncConfig, remember: boolean) => {
        const verified = await verifyGitHubConnection(input);
        generation.current++;
        configRef.current = verified;
        setConfig(verified);
        setPaused(true);
        try {
            const { token, passphrase, ...preferences } = verified;
            localStorage.setItem('knowledge-garden-sync-preferences-v2', JSON.stringify(preferences));
            if (remember)
                localStorage.setItem('knowledge-garden-github-sync-config-v1', JSON.stringify({ ...preferences, token, passphrase }));
            else
                localStorage.removeItem('knowledge-garden-github-sync-config-v1');
        }
        catch {
            setStatus('连接已验证；此设备不能保存连接偏好');
        }
        await perform(false);
    };
    const accept = async () => {
        const c = configRef.current, pending = plan;
        if (!c || !pending || active.current || store.state.pending)
            return;
        const currentGeneration = generation.current;
        active.current = true;
        setBusy(true);
        try {
            setStatus('正在建立本机快照并合并…');
            const saved = await store.mutate(current => mergeGardens(pending.base, current, pending.remote?.garden ?? emptyGarden()).garden, '用户确认同步合并');
            if (!saved || currentGeneration !== generation.current)
                return;
            const snapshot = structuredClone(store.state.garden);
            const result = await pushGitHubGarden(c, snapshot, pending.remote?.sha);
            if (currentGeneration !== generation.current)
                return;
            await store.writeAux(key(c), { garden: snapshot, sha: result.sha });
            lastUploaded.current = canonical(snapshot);
            setPlan(null);
            setPaused(false);
            setStatus('已合并并同步 · 两端内容均保留');
        }
        catch (e) {
            if (currentGeneration === generation.current) {
                setPlan(null);
                setPaused(true);
                setStatus(`同步未完成：${e instanceof Error ? e.message : '请求失败'}。合并后的本机内容仍在，请重新检查。`);
            }
        }
        finally {
            active.current = false;
            setBusy(false);
        }
    };
    useEffect(() => {
        if (!config || paused || store.state.loading || store.state.pending || canonical(store.state.garden) === lastUploaded.current)
            return;
        const timer = setTimeout(() => void perform(true), 2400);
        return () => clearTimeout(timer);
    }, [revision, config, paused, perform, store]);
    const pause = (reason: string) => { generation.current++; setPaused(true); setPlan(null); setStatus(reason); };
    const disconnect = () => { generation.current++; configRef.current = null; setConfig(null); setPaused(true); setPlan(null); lastUploaded.current = ''; try {
        localStorage.removeItem('knowledge-garden-github-sync-config-v1');
    }
    catch { /* state is already disconnected */ } setStatus('已断开 · 本机内容保留'); };
    return { config, status, busy, paused, plan, connect, perform, accept, pause, disconnect, dismiss: () => { setPlan(null); setPaused(true); setStatus('已取消合并 · 本机资料未改变'); } };
}
