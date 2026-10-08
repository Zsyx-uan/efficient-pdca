import { useState } from 'react';
import { canonical } from './gardenModel';
// sessionStorage survives refresh but is separate for independently opened tabs.
const tabScope = (() => {
    try { let id = sessionStorage.getItem('kg-draft-tab-id'); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('kg-draft-tab-id', id); } return id; }
    catch { return crypto.randomUUID(); }
})();
/** Optional per-tab recovery copies; authoritative records use the transactional store. */
export function useDraft<T extends { title: string }>(key: string, fallback: T) {
    const storageKey = key + ':' + tabScope;
    const [value, setState] = useState<T>(() => {
        try {
            const scoped = localStorage.getItem(storageKey), legacy = scoped ? null : localStorage.getItem(key);
            const saved = JSON.parse(scoped ?? legacy ?? 'null');
            if (!saved || typeof saved.title !== 'string') return fallback;
            for (const [name, field] of Object.entries(fallback)) {
                if (typeof field === 'string' && typeof saved[name] !== 'string') return fallback;
                if (Array.isArray(field) && !Array.isArray(saved[name])) return fallback;
            }
            if (legacy) {
                // Old unscoped new-record drafts must not give two tabs the same entity ID.
                if ((key.endsWith('-new') || key.endsWith(':new')) && 'id' in fallback) saved.id = fallback.id;
                try { localStorage.setItem(storageKey, JSON.stringify(saved)); localStorage.removeItem(key); } catch { /* keep legacy raw input if copying fails */ }
            }
            return saved as T;
        } catch { return fallback; }
    });
    const [storageError, setStorageError] = useState('');
    const setValue = (next: T) => {
        setState(next);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageError(''); }
        catch { setStorageError('此浏览器暂时无法保留草稿。当前输入仍在，请保持编辑器打开并保存，或先复制文本。'); }
    };
    const clear = () => { try { localStorage.removeItem(storageKey); } catch { /* main-record saving is independent */ } };
    return { value, setValue, clear, storageError, dirty: canonical(value) !== canonical(fallback) };
}
