import { Component, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { BookOpen, BrainCircuit, Cloud, Database, Home, Menu, NotebookPen, Plus, Search, X } from 'lucide-react';
import './App.css';
import type { Book, GardenData, KnowledgeCard, ParsedMarkdown } from './archiveTypes';
import { applyImport, normalizeGarden, restoreTrash, trashItems, uid, upsertBook, upsertCard } from './gardenModel';
import { GardenStore, downloadJson } from './gardenStore';
import type { Mutation } from './gardenStore';
import { mergeGardens } from './gardenMerge';
import { parseMarkdownDocument } from './markdownArchive';
import { pdcaSampleMarkdown } from './pdcaSample';
import { navigate, useRoute } from './navigation';
import { useGardenSync } from './useGardenSync';
import { BookEditor, CardEditor, ImportEditor } from './components/Editors';
import { Dialog, Empty } from './components/Common';
import { Cards, Library, Review, SearchPage, Workbench } from './features/Browse';
import { CardDetail, Reader } from './features/Reader';
import { DataCenter } from './features/DataCenter';
class Boundary extends Component<{
    children: ReactNode;
    store: GardenStore;
}, {
    error: boolean;
}> {
    state = { error: false };
    static getDerivedStateFromError() { return { error: true }; }
    render() {
        return this.state.error ? <div className="fatal-error">
        <h1>界面遇到了一点问题</h1>
        <p>不要清除浏览器数据。先导出当前内容，再重新打开。</p>
        <button className="primary-button" onClick={() => downloadJson(this.props.store.state.garden)}>导出当前知识库</button>
        <button className="soft-button" onClick={() => { navigate({ view: 'home' }); this.setState({ error: false }); }}>回到工作台</button>
        </div> : this.props.children;
    }
}
export default function App() {
    const store = useMemo(() => new GardenStore(), []), state = useSyncExternalStore(store.subscribe, store.getSnapshot), garden = state.garden, route = useRoute(), sync = useGardenSync(store, state.revision);
    const [bookEditor, setBookEditor] = useState<Book | 'new' | null>(null), [cardEditor, setCardEditor] = useState<{
        card?: KnowledgeCard;
        bookId?: string;
        sectionId?: string;
        excerpt?: string;
    } | null>(null), [importDraft, setImportDraft] = useState<{
        parsed: ParsedMarkdown;
        target?: string;
    } | null>(null), [restore, setRestore] = useState<{
        garden: GardenData;
        label: string;
    } | null>(null), [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge'), [restoring, setRestoring] = useState(false), [paste, setPaste] = useState(false), [pasteText, setPasteText] = useState(''), [search, setSearch] = useState(route.q ?? ''), [toast, setToast] = useState<{
        message: string;
        undo?: () => Promise<void>;
    } | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), markdownInput = useRef<HTMLInputElement>(null), jsonInput = useRef<HTMLInputElement>(null), searchInput = useRef<HTMLInputElement>(null), importTarget = useRef<string | undefined>(undefined);
    useEffect(() => { void store.start(); }, [store]);
    useEffect(() => {
        if (route.view === 'search')
            // eslint-disable-next-line react/set-state-in-effect -- synchronize the input with the browser hash on back/forward navigation.
            setSearch(route.q ?? '');
    }, [route.q, route.view]);
    useEffect(() => {
        if (route.view !== 'book' && !route.cardId)
            window.scrollTo(0, 0);
    }, [route.view, route.cardId]);
    useEffect(() => {
        const keys = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                searchInput.current?.focus();
            }
        };
        window.addEventListener('keydown', keys);
        return () => window.removeEventListener('keydown', keys);
    }, []);
    const notify = (message: string, undo?: () => Promise<void>) => { clearTimeout(timer.current); setToast({ message, undo }); timer.current = setTimeout(() => setToast(null), undo ? 9000 : 4500); };
    const action = async (change: Mutation, reason: string, capture = true) => {
        try {
            const saved = await store.mutate(change, reason, capture);
            if (!saved)
                notify('修改尚未保存。内容仍在，请重试或导出。');
            return saved;
        }
        catch (e) {
            notify(e instanceof Error ? e.message : '操作未完成，原始数据已保留');
            return false;
        }
    };
    const openBook = (id: string, sectionId?: string) => navigate({ view: 'book', bookId: id, sectionId: sectionId ?? store.state.garden.reading[id]?.sectionId, tab: 'read' });
    const openCard = (id: string) => navigate({ ...route, cardId: id });
    const importFile = (target?: string) => { importTarget.current = target; markdownInput.current?.click(); };
    const readFile = async (file: File, kind: 'markdown' | 'json') => {
        if (file.size > 20 * 1024 * 1024) {
            notify('文件超过 20 MB，请先拆分或减小备份。');
            return;
        }
        try {
            const text = await file.text();
            if (kind === 'markdown')
                setImportDraft({ parsed: parseMarkdownDocument(text), target: importTarget.current });
            else {
                const incoming = normalizeGarden(JSON.parse(text.replace(/^\uFEFF/, '')));
                setRestoreMode('merge');
                setRestore({ garden: incoming, label: file.name });
            }
        }
        catch (e) {
            notify(`无法导入：${e instanceof Error ? e.message : '文件格式错误'}。当前知识库未改变。`);
        }
    };
    const saveBook = async (book: Book) => {
        const submitted = { ...book, title: book.title.trim(), author: book.author.trim(), category: book.category.trim() || '未分类' };
        if (!submitted.title)
            return false;
        let conflict = false;
        const saved = await action(current => {
            const latest = current.books.find(b => b.id === submitted.id);
            if (latest && latest.updatedAt !== submitted.updatedAt) {
                conflict = true;
                const id = uid('book');
                return upsertBook(current, { ...submitted, id, title: `${submitted.title}（编辑副本）`, sections: submitted.sections.map(s => ({ ...s, id: `${id}:${s.id}` })) });
            }
            return upsertBook(current, latest ? { ...latest, title: submitted.title, author: submitted.author, category: submitted.category, status: submitted.status, rating: submitted.rating, tags: submitted.tags, color: submitted.color, cover: submitted.cover } : submitted);
        }, '保存书籍信息');
        if (saved) {
            notify(conflict ? '检测到另一页修改，已保留原版本并保存编辑副本。' : '书籍已保存');
            if (bookEditor === 'new')
                openBook(submitted.id);
        }
        return saved;
    };
    const saveCard = async (card: KnowledgeCard) => {
        if (!card.title.trim())
            return false;
        let savedId = card.id, conflict = false;
        const saved = await action(current => {
            const existing = current.cards.find(c => c.id === card.id);
            if (existing && existing.updatedAt !== card.updatedAt) {
                conflict = true;
                savedId = uid('card');
                return upsertCard(current, { ...card, id: savedId, title: `${card.title}（编辑副本）`, origin: 'manual', sourceKey: undefined, importedBaseline: undefined });
            }
            return upsertCard(current, card);
        }, '保存知识卡片');
        if (saved) {
            notify(conflict ? '另一页已更新此卡片；两份修改均已保留。' : '知识卡片已保存');
            openCard(savedId);
        }
        return saved;
    };
    const deleteItems = async (kind: 'book' | 'card', ids: string[]) => {
        if (!confirm(kind === 'book' ? '将这本书及其卡片移到回收站？可以恢复。' : '将这张卡片移到回收站？可以恢复。'))
            return;
        const before = new Set(store.state.garden.trash.map(t => t.id)), saved = await action(g => trashItems(g, kind, ids), '移入回收站');
        if (!saved)
            return;
        const removed = store.state.garden.trash.filter(t => !before.has(t.id)).map(t => t.id);
        navigate(kind === 'book' ? { view: 'library' } : { ...route, cardId: undefined });
        notify('已移入回收站', async () => { await action(g => removed.reduce((current, id) => restoreTrash(current, id), g), '撤销删除'); setToast(null); });
    };
    const book = garden.books.find(b => b.id === route.bookId), card = garden.cards.find(c => c.id === route.cardId);
    const browseProps = { garden, openBook, openCard, newBook: () => setBookEditor('new'), newCard: () => setCardEditor({}), importText: () => importFile(), action };
    const nav = [{ id: 'home' as const, label: '工作台', icon: Home }, { id: 'library' as const, label: '资料库', icon: BookOpen }, { id: 'cards' as const, label: '知识卡片', icon: NotebookPen }, { id: 'review' as const, label: '轻量复习', icon: BrainCircuit }];
    const activeView = route.view === 'book' ? 'library' : route.view;
    const previewRestore = restore ? mergeGardens(undefined, garden, restore.garden).garden : undefined;
    return <Boundary store={store}>
    <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>跳到主要内容</a>
    <aside className="sidebar">
    <a className="brand" href="#/home">
    <span>
    <BrainCircuit size={22}/>
    </span>
    <div>
    <strong>我的第二大脑</strong>
    <small>PERSONAL KNOWLEDGE GARDEN</small>
    </div>
    </a>
    <p className="sidebar-label">留下值得生长的想法</p>
    <nav aria-label="主导航">{nav.map(({ id, label, icon: Icon }) => <a key={id} href={`#/${id}`} className={activeView === id ? 'active' : ''} aria-current={activeView === id ? 'page' : undefined}>
        <Icon size={18}/>{label}</a>)}</nav>
    <div className="sidebar-note">
    <SproutMark />
    <p>读过，不只是收藏。<br />让每一次理解，都有归处。</p>
    </div>
    <div className="sidebar-bottom">
    <a href="#/data" className={activeView === 'data' ? 'active' : ''}>
    <Database size={18}/>更多与数据管理</a>
    <a className="sidebar-sync" href="#/data">
    <Cloud size={16}/>
    <span>{sync.config ? sync.paused ? '同步已暂停' : 'GitHub 已连接' : '本地优先'}<small>{state.pending ? `${state.pending} 项未保存` : '你的知识，由你保管'}</small>
    </span>
    </a>
    </div>
    </aside>
    <div className="main-content">
    <header className="topbar">
    <form className="global-search" onSubmit={e => { e.preventDefault(); navigate({ view: 'search', q: search }); }}>
    <Search size={18}/>
    <input ref={searchInput} aria-label="全局搜索" value={search} placeholder="搜索资料、章节全文、卡片…" onChange={e => { const value = e.target.value; setSearch(value); navigate({ view: 'search', q: value }, route.view === 'search'); }}/>
    <kbd>⌘ / Ctrl K</kbd>{search && <button className="icon-button" type="button" aria-label="清空全局搜索" onClick={() => { setSearch(''); navigate({ view: 'search' }, true); searchInput.current?.focus(); }}>
        <X size={15}/>
        </button>}</form>
    <div className="topbar-actions">
    <a href="#/data" className="sync-indicator" aria-label="打开数据管理与同步">
    <Cloud size={17}/>
    <span>{state.pending ? '未保存' : sync.config ? sync.paused ? '暂停' : '同步' : '本地'}</span>
    </a>
    <button className="primary-button" aria-label="快速记录" onClick={() => setCardEditor({})}>
    <Plus size={18}/>
    <span>快速记录</span>
    </button>
    </div>
    </header>
    <main id="main-content" tabIndex={-1}>{state.loading ? <div className="loading-state" role="status">正在打开你的知识库…</div> : <>{state.error && <div className="storage-warning" role="alert">
            <div>
            <strong>{state.pending ? '有修改尚未保存' : '本地数据需要处理'}</strong>
            <p>{state.error}</p>
            </div>
            <div className="button-row">
            <button className="soft-button" onClick={() => void store.retry()}>重试保存</button>
            <button className="soft-button" onClick={() => downloadJson(garden)}>导出当前内容</button>{state.recoveryRaw && <button className="soft-button" onClick={() => { const url = URL.createObjectURL(new Blob([state.recoveryRaw!], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'knowledge-garden-original-recovery.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>下载原始旧数据</button>}</div>
            </div>}{sync.config && sync.paused && <div className="sync-banner">
            <Cloud size={16}/>
            <span>{sync.status}</span>
            <a href="#/data">查看处理</a>
            </div>}{route.view === 'home' && <Workbench {...browseProps} review={() => navigate({ view: 'review' })} loadSample={() => { importTarget.current = undefined; setImportDraft({ parsed: parseMarkdownDocument(pdcaSampleMarkdown) }); }}/>}{route.view === 'library' && <Library {...browseProps}/>}{route.view === 'cards' && <Cards key={route.tab ?? 'active'} {...browseProps} initialTab={route.tab}/>}{route.view === 'review' && <Review {...browseProps}/>}{route.view === 'search' && <SearchPage key={route.q ?? ''} garden={garden} query={route.q ?? ''} openBook={openBook} openCard={openCard}/>}{route.view === 'book' && (book ? <Reader key={book.id} book={book} garden={garden} sectionId={route.sectionId} tab={route.tab} setLocation={(sectionId, tab) => navigate({ ...route, sectionId, tab, cardId: undefined })} openCard={openCard} onEdit={() => setBookEditor(book)} onDelete={() => void deleteItems('book', [book.id])} onImport={() => importFile(book.id)} onCapture={(text, sectionId) => setCardEditor({ bookId: book.id, sectionId, excerpt: text })} action={action}/> : <div className="page">
            <Empty title="这份资料不在当前知识库中" detail="它可能在回收站，或来自另一台设备。" action="回到资料库" onAction={() => navigate({ view: 'library' })}/>
            </div>)}{route.view === 'data' && <DataCenter garden={garden} revision={state.revision} store={store} sync={sync} action={action} onImport={() => importFile()} onRestore={() => jsonInput.current?.click()} onPaste={() => setPaste(true)} onVersion={snapshot => { setRestoreMode('replace'); setRestore({ garden: normalizeGarden(snapshot.garden, true), label: `版本快照：${snapshot.reason}` }); }}/>}</>}</main>
    </div>
    <nav className="mobile-nav" aria-label="手机主导航">{[{ id: 'home', label: '工作台', icon: Home }, { id: 'library', label: '资料库', icon: BookOpen }, { id: 'cards', label: '卡片', icon: NotebookPen }, { id: 'data', label: '更多', icon: Menu }].map(({ id, label, icon: Icon }) => <a key={id} href={`#/${id}`} className={activeView === id ? 'active' : ''} aria-current={activeView === id ? 'page' : undefined}>
        <Icon size={20}/>
        <span>{label}</span>
        </a>)}</nav>
    <input ref={markdownInput} className="file-input" type="file" accept=".md,.txt,text/markdown,text/plain" onChange={e => {
            const f = e.target.files?.[0];
            if (f)
                void readFile(f, 'markdown');
            e.target.value = '';
        }}/>
    <input ref={jsonInput} className="file-input" type="file" accept=".json,application/json" onChange={e => {
            const f = e.target.files?.[0];
            if (f)
                void readFile(f, 'json');
            e.target.value = '';
        }}/>{card && <CardDetail key={card.id} card={card} garden={garden} onClose={() => navigate({ ...route, cardId: undefined }, true)} onEdit={() => setCardEditor({ card })} onDelete={() => void deleteItems('card', [card.id])} onOpen={openCard} onSource={openBook} action={action}/>} {bookEditor && <BookEditor book={bookEditor === 'new' ? undefined : bookEditor} onClose={() => setBookEditor(null)} onSave={saveBook}/>} {cardEditor && <CardEditor card={cardEditor.card} garden={garden} bookId={cardEditor.bookId} sectionId={cardEditor.sectionId} excerpt={cardEditor.excerpt} onClose={() => setCardEditor(null)} onSave={saveCard}/>} {importDraft && <ImportEditor parsed={importDraft.parsed} garden={garden} targetId={importDraft.target} onClose={() => setImportDraft(null)} onSave={async (metadata, target, keys) => {
                const saved = await action(current => applyImport(current, importDraft.parsed, metadata, target || undefined, keys), '导入资料前备份');
                if (saved) {
                    notify('资料已保存；人工补充与有效关联已保留');
                    const id = target || store.state.garden.books[0]?.id;
                    if (id)
                        openBook(id);
                }
                return saved;
            }}/>} {paste && <Dialog title="粘贴阅读资料" onClose={() => setPaste(false)} dirty={Boolean(pasteText)}>
        <form onSubmit={e => {
                e.preventDefault();
                try {
                    const parsed = parseMarkdownDocument(pasteText);
                    setPaste(false);
                    setPasteText('');
                    setImportDraft({ parsed });
                }
                catch (ex) {
                    notify(ex instanceof Error ? ex.message : '无法解析文本');
                }
            }}>
        <label>Markdown 或纯文本<textarea aria-label="Markdown 或纯文本" autoFocus rows={12} required value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="# 资料名称&#10;&#10;## 第一节&#10;把完整正文粘贴在这里…"/>
        </label>
        <footer className="form-footer">
        <button className="primary-button">预览导入</button>
        </footer>
        </form>
        </Dialog>} {restore && <Dialog title="确认备份恢复" onClose={() => setRestore(null)}>
        <p className="notice">{restore.label}</p>
        <div className="restore-counts">
        <div>
        <strong>当前本机</strong>
        <p>{garden.books.length} 本资料 · {garden.cards.length} 张卡片</p>
        </div>
        <div>
        <strong>待恢复内容</strong>
        <p>{restore.garden.books.length} 本资料 · {restore.garden.cards.length} 张卡片</p>
        </div>
        </div>
        <fieldset className="restore-options">
        <legend>选择恢复方式</legend>
        <label>
        <input aria-label="" type="radio" name="restore-mode" checked={restoreMode === 'merge'} onChange={() => setRestoreMode('merge')}/>
        <span>合并并保留双方<small>同一内容冲突时保留副本，合并后约 {previewRestore?.books.length} 本资料 / {previewRestore?.cards.length} 张卡片。</small>
        </span>
        </label>
        <label>
        <input aria-label="" type="radio" name="restore-mode" checked={restoreMode === 'replace'} onChange={() => setRestoreMode('replace')}/>
        <span>用备份替换当前库<small>仅在明确需要回到这个版本时使用；当前库先保留版本快照。</small>
        </span>
        </label>
        </fieldset>
        <p className="help-text">不会刷新页面。恢复后暂停自动同步；重新检查两端前，不会由云端旧版替换恢复内容。</p>
        <footer className="form-footer">
        <button className="soft-button" onClick={() => setRestore(null)}>取消</button>
        <button className="primary-button" disabled={restoring} onClick={async () => {
                if (restoreMode === 'replace' && !confirm('确认用预览中的备份替换当前库？本机现状会保留版本快照。'))
                    return;
                setRestoring(true);
                sync.pause('备份已恢复 · 自动同步暂停，需重新确认');
                const incoming = restore.garden;
                const saved = await action(current => restoreMode === 'replace' ? incoming : mergeGardens(undefined, current, incoming).garden, '备份恢复前的本机版本');
                setRestoring(false);
                if (saved) {
                    setRestore(null);
                    notify('备份已恢复；本机旧版本已保留');
                }
            }}>{restoring ? '恢复中…' : '确认恢复备份'}</button>
        </footer>
        </Dialog>} {sync.plan && <Dialog title="确认同步合并" onClose={sync.dismiss}>
        <p className="notice">先比较，再合并。首次连接不会自动覆盖本机。</p>
        <div className="restore-counts">
        <div>
        <strong>当前本机</strong>
        <p>{garden.books.length} 本资料 / {garden.cards.length} 张卡片</p>
        </div>
        <div>
        <strong>云端版本</strong>
        <p>{sync.plan.remote?.garden.books.length ?? 0} 本资料 / {sync.plan.remote?.garden.cards.length ?? 0} 张卡片</p>
        </div>
        </div>
        <p>合并预览：{sync.plan.garden.books.length} 本资料，{sync.plan.garden.cards.length} 张卡片。</p>{sync.plan.conflicts.length > 0 && <ul className="conflict-list">{sync.plan.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>}<p className="help-text">同一项的不同修改保留两份；已在共同版本确认的删除正常同步。操作前自动保留本机快照。确认时会再次包含预览期间的本机新增修改。</p>
        <footer className="form-footer">
        <button className="soft-button" disabled={sync.busy} onClick={sync.dismiss}>暂不同步</button>
        <button className="primary-button" disabled={sync.busy || state.pending > 0} onClick={() => void sync.accept()}>{sync.busy ? '正在合并…' : '合并并保存双方'}</button>
        </footer>
        </Dialog>} {toast && <div className="toast" role="status" aria-live="polite">
        <span>{toast.message}</span>{toast.undo && <button onClick={() => void toast.undo?.()}>撤销</button>}<button aria-label="关闭提示" onClick={() => setToast(null)}>
        <X size={15}/>
        </button>
        </div>}</div>
    </Boundary>;
}
function SproutMark() { return <span className="garden-mark" aria-hidden="true">❧</span>; }
