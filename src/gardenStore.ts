import type { GardenData } from './archiveTypes';
import { mergeGardens } from './gardenMerge';
import { canonical, emptyGarden, normalizeGarden, now, uid } from './gardenModel';
export type Mutation = (garden: GardenData) => GardenData;
export type Snapshot = {
    id: string;
    reason: string;
    createdAt: string;
    garden: GardenData;
};
type Document = {
    revision: number;
    garden: GardenData;
};
export type StoreState = {
    garden: GardenData;
    revision: number;
    loading: boolean;
    error: string;
    pending: number;
    recoveryRaw?: string;
};
const DB_NAME = 'knowledge-garden-v4';
const documentKey = 'garden';
function request<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function completed(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('存储事务中断')); }); }
function openDatabase(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => { r.result.createObjectStore('state'); r.result.createObjectStore('snapshots', { keyPath: 'id' }); }; r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); resolve(r.result); }; r.onerror = () => reject(r.error); r.onblocked = () => reject(new Error('请关闭旧版本页面后重试')); }); }
export class GardenStore {
    state: StoreState = { garden: emptyGarden(), revision: 0, loading: true, error: '', pending: 0 };
    private listeners = new Set<() => void>();
    private db?: IDBDatabase;
    private queue: Promise<unknown> = Promise.resolve();
    private pending: {
        change: Mutation;
        reason: string;
        capture: boolean;
    }[] = [];
    private channel?: BroadcastChannel;
    private started = false;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    getSnapshot = () => this.state;
    private publish(next: Partial<StoreState>) { this.state = { ...this.state, ...next }; for (const fn of this.listeners)
        fn(); }
    async start() {
        if (this.started)
            return;
        this.started = true;
        try {
            this.db = await openDatabase();
            const loaded = await request(this.db.transaction('state').objectStore('state').get(documentKey)) as Document | undefined;
            if (loaded)
                this.publish({ garden: normalizeGarden(loaded.garden, true), revision: loaded.revision, loading: false });
            else {
                let initial = emptyGarden(), error = '', recoveryRaw: string | undefined;
                // Each key is parsed independently. Never overwrite either original on migration failure.
                for (const key of ['knowledge-garden-v3', 'knowledge-garden-v2']) {
                    try {
                        const raw = localStorage.getItem(key);
                        if (!raw)
                            continue;
                        initial = normalizeGarden(JSON.parse(raw), true);
                        error = '';
                        recoveryRaw = undefined;
                        break;
                    }
                    catch (e) {
                        error = `旧数据未自动载入：${e instanceof Error ? e.message : '格式错误'}。原始内容已保留，可下载后恢复。`;
                        try {
                            recoveryRaw = localStorage.getItem(key) ?? undefined;
                        }
                        catch { /* storage unavailable */ }
                    }
                }
                if (!error) {
                    // Initial migration is atomic across simultaneously opening tabs.
                    const tx = this.db.transaction('state', 'readwrite'), done = completed(tx), s = tx.objectStore('state');
                    const current = await request(s.get(documentKey)) as Document | undefined;
                    if (!current)
                        s.put({ revision: 1, garden: initial }, documentKey);
                    await done;
                    this.publish({ garden: current?.garden ?? initial, revision: current?.revision ?? 1, loading: false });
                }
                else
                    this.publish({ loading: false, error, recoveryRaw });
            }
            if (typeof BroadcastChannel !== 'undefined') {
                this.channel = new BroadcastChannel(DB_NAME);
                this.channel.onmessage = () => { if (!this.pending.length)
                    void this.reload(); };
            }
            window.addEventListener('focus', this.onFocus);
        }
        catch (e) {
            let initial = emptyGarden();
            for (const key of ['knowledge-garden-v3', 'knowledge-garden-v2']) {
                try {
                    const raw = localStorage.getItem(key);
                    if (raw) {
                        initial = normalizeGarden(JSON.parse(raw), true);
                        break;
                    }
                }
                catch { /* preserve originals */ }
            }
            this.publish({ garden: initial, loading: false, error: `无法打开本地存储：${e instanceof Error ? e.message : '浏览器限制'}。仍可编辑并导出；请重试保存。` });
        }
    }
    private onFocus = () => { if (!this.pending.length)
        void this.reload(); };
    async reload() { try {
        if (!this.db)
            return;
        const current = await request(this.db.transaction('state').objectStore('state').get(documentKey)) as Document | undefined;
        if (current && current.revision > this.state.revision && !this.pending.length)
            this.publish({ garden: normalizeGarden(current.garden, true), revision: current.revision });
    }
    catch { /* keep the visible copy */ } }
    mutate(change: Mutation, reason: string, capture = true): Promise<boolean> {
        const job = async () => {
            let baseline: GardenData | undefined, projected: GardenData | undefined;
            const materialize = (current: GardenData) => {
                baseline = structuredClone(current);
                projected = normalizeGarden(change(structuredClone(current)), true);
                return projected;
            };
            const retain = (error?: unknown) => {
                if (!projected || !baseline) materialize(this.state.garden);
                // Freeze generated IDs and user input. Rebase this delta, not a non-pure producer.
                const before = baseline!, after = projected!;
                this.pending.push({ change: current => mergeGardens(before, current, after).garden, reason, capture });
                this.publish({ garden: after, pending: this.pending.length,
                    ...(error ? { error: '尚未保存：' + (error instanceof Error ? error.message : '写入失败') + '。输入仍在，可重试或导出。' } : {}) });
                return false;
            };
            if (this.pending.length) return retain();
            try { return await this.commit(materialize, reason, capture); }
            catch (error) { return retain(error); }
        };
        const result = this.queue.then(job, job);
        this.queue = result;
        return result;
    }
    private async commit(change: Mutation, reason: string, capture: boolean): Promise<boolean> {
        if (!this.db)
            throw new Error('本地存储尚不可用');
        const tx = this.db.transaction(['state', 'snapshots'], 'readwrite'), done = completed(tx), store = tx.objectStore('state');
        void done.catch(() => {});
        try {
        const previous = await request(store.get(documentKey)) as Document | undefined;
        const base = previous?.garden ?? this.state.garden, garden = normalizeGarden(change(normalizeGarden(base, true)), true);
        const revision = (previous?.revision ?? this.state.revision) + 1;
        if (canonical(garden) === canonical(base)) {
            await done;
            this.publish({ garden: base, revision: previous?.revision ?? this.state.revision });
            return true;
        }
        const snapshots = tx.objectStore('snapshots');
        if (capture) {
            snapshots.put({ id: uid('snapshot'), reason, createdAt: now(), garden: base } satisfies Snapshot);
            const all = await request(snapshots.getAll()) as Snapshot[];
            all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            for (const old of all.slice(20))
                snapshots.delete(old.id);
        }
        store.put({ revision, garden }, documentKey);
        await done;
        this.publish({ garden, revision, error: '', pending: 0, recoveryRaw: undefined });
        this.channel?.postMessage(revision);
        return true;
        } catch (error) {
            try { tx.abort(); } catch { /* already aborted or complete */ }
            await done.catch(() => {});
            throw error;
        }
    }
    async retry(): Promise<boolean> {
        const job = async () => {
            try {
                if (!this.db)
                    this.db = await openDatabase();
                const pending = [...this.pending];
                await this.commit(g => pending.reduce((value, item) => item.change(value), g), '恢复未保存的修改', true);
                this.pending = [];
                this.publish({ pending: 0, error: '' });
                return true;
            }
            catch (e) {
                this.publish({ error: `保存仍未成功：${e instanceof Error ? e.message : '存储不可用'}。请先导出备份。`, pending: this.pending.length });
                return false;
            }
        };
        const result = this.queue.then(job, job);
        this.queue = result;
        return result;
    }
    async snapshots(): Promise<Snapshot[]> { if (!this.db)
        return []; const all = await request(this.db.transaction('snapshots').objectStore('snapshots').getAll()) as Snapshot[]; return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
    async readAux<T>(key: string): Promise<T | undefined> { if (!this.db)
        return undefined; return await request(this.db.transaction('state').objectStore('state').get(key)) as T | undefined; }
    async writeAux(key: string, value: unknown) { if (!this.db)
        throw new Error('存储不可用'); const tx = this.db.transaction('state', 'readwrite'), done = completed(tx); tx.objectStore('state').put(value, key); await done; }
    close() { this.channel?.close(); window.removeEventListener('focus', this.onFocus); this.db?.close(); }
}
export function downloadJson(value: unknown, name = `knowledge-garden-v4-${new Date().toISOString().slice(0, 10)}.json`) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
