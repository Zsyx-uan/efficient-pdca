import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, FileInput, List, NotebookPen, Plus, Search, Sprout, Trash2 } from 'lucide-react';
import type { GardenData, KnowledgeCard } from '../archiveTypes';
import { BOOK_STATUS_LABEL, CARD_KIND_LABEL } from '../archiveTypes';
import { dueCards, now, reviewCard, tagsFrom, trashItems } from '../gardenModel';
import type { Mutation } from '../gardenStore';
import { searchGarden } from '../gardenSearch';
import { navigate } from '../navigation';
import { Dialog, Empty, PageHeading } from '../components/Common';
export type BrowseProps = {
    garden: GardenData;
    openBook: (id: string, sectionId?: string) => void;
    openCard: (id: string) => void;
    newBook: () => void;
    newCard: () => void;
    importText: () => void;
    action: (change: Mutation, reason: string) => Promise<boolean>;
};
function preference<T>(key: string, fallback: T): T {
    try {
        return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
    }
    catch {
        return fallback;
    }
}
function savePreference(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    }
    catch { /* preferences are optional */ }
}
export function CardTile({ card, garden, onOpen, selected, onSelect }: {
    card: KnowledgeCard;
    garden: GardenData;
    onOpen: () => void;
    selected?: boolean;
    onSelect?: (checked: boolean) => void;
}) {
    return <article className={`knowledge-card ${selected ? 'is-selected' : ''}`}>
    <div className="card-top">
    <span className={`kind-pill kind-${card.kind}`}>{CARD_KIND_LABEL[card.kind]}</span>{onSelect && <label className="card-check">
        <input type="checkbox" aria-label={`选择卡片 ${card.title}`} checked={Boolean(selected)} onChange={e => onSelect(e.target.checked)}/>
        </label>}</div>
    <button className="card-open" onClick={onOpen}>
    <h3>{card.title}</h3>
    <p>{card.insight || card.excerpt || '添加你的理解，让这张卡片生长。'}</p>{card.application && <span className="application-preview">
        <Sprout size={14}/>{card.application}</span>}</button>
    <footer>
    <span>{garden.books.find(b => b.id === card.bookId)?.title ?? '收集箱'}</span>
    <span>{card.tags.slice(0, 2).join(' · ')}</span>
    </footer>
    </article>;
}
export function Workbench(props: BrowseProps & {
    review: () => void;
    loadSample: () => void;
}) {
    const { garden: g } = props, pending = g.cards.filter(c => !c.archived && (!c.bookId || (c.origin === 'imported' && !c.insight))), due = dueCards(g);
    const continued = [...g.books].sort((a, b) => (g.reading[b.id]?.updatedAt ?? b.updatedAt).localeCompare(g.reading[a.id]?.updatedAt ?? a.updatedAt)).slice(0, 3);
    const recent = [...g.cards].filter(c => !c.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
    return <div className="page workbench">
    <section className="workbench-welcome">
    <div>
    <p className="eyebrow">YOUR QUIET PLACE TO THINK</p>
    <h1>让知识，回到生活里。</h1>
    <p>继续读，随手记。把读过的内容，变成真正用得上的理解。</p>
    <div className="button-row">
    <button className="primary-button" onClick={props.newCard}>
    <NotebookPen size={18}/>快速记录</button>
    <button className="hero-secondary" onClick={props.importText}>
    <FileInput size={17}/>导入资料</button>
    </div>
    </div>
    <div className="welcome-art" aria-hidden="true">
    <span>READ · CONNECT · APPLY</span>
    </div>
    </section>
    <div className="workbench-summary">
    <div>
    <strong>{g.books.length}</strong>
    <span>阅读档案</span>
    </div>
    <div>
    <strong>{g.cards.filter(c => !c.archived).length}</strong>
    <span>知识卡片</span>
    </div>
    <button onClick={() => navigate({ view: 'cards', tab: 'pending' })}>
    <strong>{pending.length}</strong>
    <span>待整理内容</span>
    </button>
    <button onClick={props.review}>
    <strong>{due.length}</strong>
    <span>待复习卡片 <ArrowRight size={13}/>
    </span>
    </button>
    </div>
    <section className="section-heading">
    <div>
    <p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p>
    <h2>继续阅读</h2>
    </div>
    <button className="text-button" onClick={props.newBook}>
    <Plus size={16}/>新建书籍</button>
    </section>{continued.length ? <div className="continue-grid">{continued.map(b => <button className="continue-book" key={b.id} onClick={() => props.openBook(b.id)}>
            <span className="mini-spine" style={{ background: b.color }}>{b.cover}</span>
            <div>
            <small>{BOOK_STATUS_LABEL[b.status]} · {b.author || '未知作者'}</small>
            <h3>{b.title}</h3>
            <p>{b.sections.find(s => s.id === g.reading[b.id]?.sectionId)?.title ?? (b.coreConclusion || '打开阅读档案')}</p>
            <span>{b.sections.length} 章节 · {g.cards.filter(c => c.bookId === b.id).length} 卡片 <ArrowRight size={14}/>
            </span>
            </div>
            </button>)}</div> : <Empty title="从一段想法，或一本书开始" detail="你的知识库现在是空的。可以先记一条想法，再慢慢归档。" action="记下第一条想法" onAction={props.newCard}/>}{!g.books.length && <button className="sample-link" onClick={props.loadSample}>想先了解怎么使用？载入可删除的 PDCA 示例档案 →</button>}<section className="section-heading">
    <div>
    <p className="eyebrow">RECENTLY TENDED</p>
    <h2>最近生长的知识</h2>
    </div>
    <span className="muted">按真实修改时间排列</span>
    </section>
    <div className="card-grid">{recent.map(c => <CardTile key={c.id} card={c} garden={g} onOpen={() => props.openCard(c.id)}/>)}</div>{!recent.length && <p className="quiet-empty">还没有卡片。读到值得记下的一段内容时，从阅读档案里创建它。</p>}</div>;
}
export function Library(props: BrowseProps) {
    const { garden: g } = props, [mode, setMode] = useState<'list' | 'shelf'>(() => preference('kg-library-view', 'list')), [query, setQuery] = useState(''), [category, setCategory] = useState(''), [status, setStatus] = useState(''), [sort, setSort] = useState('updated'), shelf = useRef<HTMLDivElement>(null);
    useEffect(() => savePreference('kg-library-view', mode), [mode]);
    const categories = [...new Set(g.books.map(b => b.category))], books = g.books.filter(b => (!category || b.category === category) && (!status || b.status === status) && `${b.title} ${b.author} ${b.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh') : sort === 'rating' ? b.rating - a.rating : b.updatedAt.localeCompare(a.updatedAt));
    return <div className="page">
    <PageHeading eyebrow="YOUR READING ARCHIVE" title="资料库" detail="有序收藏，慢慢消化。书架的温度，列表的效率。">
    <button className="primary-button" onClick={props.newBook}>
    <Plus size={17}/>新建书籍</button>
    </PageHeading>
    <div className="filter-panel">
    <label className="filter-search">
    <Search size={16}/>
    <input aria-label="筛选资料" value={query} onChange={e => setQuery(e.target.value)} placeholder="书名、作者或标签"/>
    </label>
    <label>分类<select aria-label="分类" value={category} onChange={e => setCategory(e.target.value)}>
    <option value="">全部分类</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
    </label>
    <label>状态<select aria-label="状态" value={status} onChange={e => setStatus(e.target.value)}>
    <option value="">全部状态</option>{Object.entries(BOOK_STATUS_LABEL).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
    </label>
    <label>排序<select aria-label="排序" value={sort} onChange={e => setSort(e.target.value)}>
    <option value="updated">最近修改</option>
    <option value="title">书名</option>
    <option value="rating">评分</option>
    </select>
    </label>
    <div className="view-toggle" aria-label="资料显示方式">
    <button className={mode === 'list' ? 'active' : ''} aria-label="列表视图" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
    <List size={18}/>
    </button>
    <button className={mode === 'shelf' ? 'active' : ''} aria-label="书架视图" aria-pressed={mode === 'shelf'} onClick={() => setMode('shelf')}>
    <BookOpen size={18}/>
    </button>
    </div>
    </div>
    <div className="results-heading">
    <span>{books.length} 本资料</span>{(query || category || status) && <button className="text-button" onClick={() => { setQuery(''); setCategory(''); setStatus(''); }}>清空筛选</button>}</div>{!books.length ? <Empty title={g.books.length ? '没有匹配的资料' : '书架正在等待第一本书'} detail={g.books.length ? '试试其他关键词，或者清空筛选条件。' : '导入 Markdown / TXT，或手动创建阅读档案。'} action={g.books.length ? '清空筛选' : '导入资料'} onAction={g.books.length ? () => { setQuery(''); setCategory(''); setStatus(''); } : props.importText}/> : mode === 'shelf' ? <section className="shelf-stage">
        <div className="shelf-top">
        <span>私人书架 · {books.length} 本藏书</span>
        <div>
        <button className="icon-button" aria-label="向左浏览书架" onClick={() => shelf.current?.scrollBy({ left: -360, behavior: 'smooth' })}>
        <ChevronLeft size={18}/>
        </button>
        <button className="icon-button" aria-label="向右浏览书架" onClick={() => shelf.current?.scrollBy({ left: 360, behavior: 'smooth' })}>
        <ChevronRight size={18}/>
        </button>
        </div>
        </div>
        <div className="shelf-viewport" ref={shelf}>
        <div className="shelf-row">{books.map((b, i) => <button key={b.id} className="book-spine" style={{ background: b.color, height: 180 + (i % 3) * 14 }} onClick={() => props.openBook(b.id)} aria-label={`打开《${b.title}》阅读档案`}>
            <span>{b.title}</span>
            <small>{b.author}</small>
            </button>)}</div>
        </div>
        <div className="shelf-plank"/>
        <p>左右滑动或使用箭头浏览 · 点击书脊进入阅读</p>
        </section> : <div className="book-list">{books.map(b => <button className="book-list-row" key={b.id} onClick={() => props.openBook(b.id)} aria-label={`打开《${b.title}》阅读档案`}>
            <span className="list-cover" style={{ background: b.color }}>{b.cover}</span>
            <div className="book-list-title">
            <h3>{b.title}</h3>
            <p>{b.author || '未知作者'} · {b.category}</p>
            <div className="tag-row">{b.tags.slice(0, 3).map(t => <span key={t}>{t}</span>)}</div>
            </div>
            <span className={`status-pill status-${b.status}`}>{BOOK_STATUS_LABEL[b.status]}</span>
            <span className="book-count">{g.cards.filter(c => c.bookId === b.id).length} 张卡片</span>
            <small className="book-date">{new Date(b.updatedAt).toLocaleDateString('zh-CN')}</small>
            <ChevronRight size={18}/>
            </button>)}</div>}</div>;
}
export function Cards(props: BrowseProps & {
    initialTab?: string;
}) {
    const { garden: g } = props, [query, setQuery] = useState(''), [book, setBook] = useState(''), [kind, setKind] = useState(''), [tag, setTag] = useState(''), [sort, setSort] = useState('updated'), [tab, setTab] = useState(props.initialTab ?? 'active'), [page, setPage] = useState(1), [selected, setSelected] = useState<Set<string>>(new Set()), [bulk, setBulk] = useState<'tags' | 'move' | null>(null), [bulkText, setBulkText] = useState(''), [target, setTarget] = useState(''), [busy, setBusy] = useState(false);
    const visible = g.cards.filter(c => (tab === 'archived' ? c.archived : !c.archived) && (tab !== 'inbox' || !c.bookId) && (tab !== 'pending' || !c.bookId || (c.origin === 'imported' && !c.insight)) && (!book || c.bookId === book) && (!kind || c.kind === kind) && (!tag || c.tags.includes(tag)) && `${c.title} ${c.excerpt} ${c.insight} ${c.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'importance' ? b.importance - a.importance : sort === 'title' ? a.title.localeCompare(b.title, 'zh') : b.updatedAt.localeCompare(a.updatedAt));
    const pages = Math.max(1, Math.ceil(visible.length / 30)), shown = visible.slice((Math.min(page, pages) - 1) * 30, Math.min(page, pages) * 30), tags = [...new Set(g.cards.flatMap(c => c.tags))];
    const reset = () => { setPage(1); setSelected(new Set()); };
    const batch = async (type: 'archive' | 'delete') => {
        if (type === 'delete' && !confirm(`将 ${selected.size} 张卡片移到回收站？可以恢复。`))
            return;
        const saved = await props.action(current => type === 'delete' ? trashItems(current, 'card', [...selected]) : { ...current, cards: current.cards.map(c => selected.has(c.id) ? { ...c, archived: tab !== 'archived', updatedAt: now() } : c) }, type === 'delete' ? '批量移入回收站' : '批量归档');
        if (saved)
            setSelected(new Set());
    };
    return <div className="page">
    <PageHeading eyebrow="THOUGHTS WORTH KEEPING" title="知识卡片" detail="把原文变成理解，把理解连接起来。">
    <button className="primary-button" onClick={props.newCard}>
    <Plus size={17}/>快速记录</button>
    </PageHeading>
    <div className="tabs" role="tablist" aria-label="卡片范围">{[['active', '全部卡片'], ['inbox', '收集箱'], ['pending', '待整理'], ['archived', '已归档']].map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); reset(); navigate({ view: 'cards', tab: id }); }}>{label}{id === 'inbox' && <small>{g.cards.filter(c => !c.bookId && !c.archived).length}</small>}</button>)}</div>
    <div className="filter-panel">
    <label className="filter-search">
    <Search size={16}/>
    <input aria-label="筛选卡片" value={query} onChange={e => { setQuery(e.target.value); reset(); }} placeholder="标题、理解、原文或标签"/>
    </label>
    <label>资料<select aria-label="资料" value={book} onChange={e => { setBook(e.target.value); reset(); }}>
    <option value="">全部资料</option>{g.books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
    </label>
    <label>类型<select aria-label="类型" value={kind} onChange={e => { setKind(e.target.value); reset(); }}>
    <option value="">全部类型</option>{Object.entries(CARD_KIND_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
    </label>
    <label>标签<select aria-label="标签" value={tag} onChange={e => { setTag(e.target.value); reset(); }}>
    <option value="">全部标签</option>{tags.map(t => <option key={t}>{t}</option>)}</select>
    </label>
    <label>排序<select aria-label="排序" value={sort} onChange={e => { setSort(e.target.value); reset(); }}>
    <option value="updated">最近修改</option>
    <option value="importance">重要程度</option>
    <option value="title">标题</option>
    </select>
    </label>
    </div>
    <div className="results-heading">
    <span>{visible.length} 张卡片</span>
    <div className="button-row">
    <button className="text-button" onClick={() => { setQuery(''); setBook(''); setKind(''); setTag(''); reset(); }}>清空筛选</button>
    <label className="inline-check">
    <input type="checkbox" aria-label="选择本页卡片" checked={shown.length > 0 && shown.every(c => selected.has(c.id))} onChange={e => setSelected(e.target.checked ? new Set(shown.map(c => c.id)) : new Set())}/>选择本页</label>
    </div>
    </div>{selected.size > 0 && <div className="bulk-bar">
        <strong>已选 {selected.size} 张</strong>
        <button onClick={() => setBulk('tags')}>添加标签</button>
        <button onClick={() => setBulk('move')}>移动归属</button>
        <button onClick={() => void batch('archive')}>{tab === 'archived' ? '取消归档' : '归档'}</button>
        <button className="danger" onClick={() => void batch('delete')}>
        <Trash2 size={15}/>移入回收站</button>
        <button onClick={() => setSelected(new Set())}>取消选择</button>
        </div>}<div className="card-grid">{shown.map(c => <CardTile key={c.id} card={c} garden={g} onOpen={() => props.openCard(c.id)} selected={selected.has(c.id)} onSelect={checked => setSelected(current => {
                const next = new Set(current);
                if (checked)
                    next.add(c.id);
                else
                    next.delete(c.id);
                return next;
            })}/>)}</div>{!visible.length && <Empty title="这里暂时没有匹配的卡片" detail="清空筛选，或者先把一条想法放进收集箱。" action="快速记录" onAction={props.newCard}/>} {pages > 1 && <div className="pagination">
        <button className="soft-button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
        <span>{Math.min(page, pages)} / {pages}</span>
        <button className="soft-button" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>}{bulk && <Dialog title={bulk === 'tags' ? '批量添加标签' : '移动卡片归属'} onClose={() => setBulk(null)}>
        <form onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const saved = await props.action(current => ({ ...current, cards: current.cards.map(c => selected.has(c.id) ? bulk === 'tags' ? { ...c, tags: [...new Set([...c.tags, ...tagsFrom(bulkText)])], updatedAt: now() } : { ...c, bookId: target, sectionId: undefined, updatedAt: now() } : c) }), bulk === 'tags' ? '批量标签' : '批量移动卡片');
                setBusy(false);
                if (saved) {
                    setBulk(null);
                    setSelected(new Set());
                }
            }}>{bulk === 'tags' ? <label>添加标签<input aria-label="添加标签" required value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder="用逗号分隔"/>
            </label> : <label>目标资料<select aria-label="目标资料" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">收集箱</option>{g.books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
            </label>}<p className="notice">将修改 {selected.size} 张卡片；修改前会保留版本快照。</p>
        <footer className="form-footer">
        <button type="button" className="soft-button" onClick={() => setBulk(null)}>取消</button>
        <button className="primary-button" disabled={busy}>确认批量修改</button>
        </footer>
        </form>
        </Dialog>}</div>;
}
export function Review({ garden: g, action, openCard }: BrowseProps) {
    const [queue, setQueue] = useState(() => dueCards(g).slice(0, 10).map(c => c.id)), [index, setIndex] = useState(0), [revealed, setRevealed] = useState(false), [busy, setBusy] = useState(false), card = g.cards.find(c => c.id === queue[index]), remaining = dueCards(g);
    const grade = async (value: 'again' | 'hard' | 'good') => {
        if (!card)
            return;
        setBusy(true);
        const saved = await action(current => reviewCard(current, card.id, value), '记录复习');
        setBusy(false);
        if (saved) {
            setIndex(n => n + 1);
            setRevealed(false);
        }
    };
    return <div className="page review-page">
    <PageHeading eyebrow="MAKE KNOWLEDGE YOUR OWN" title="轻量复习" detail="不追求打卡。花几分钟，用自己的话重新想一遍。"/>
    <div className="review-progress">
    <span>本组 {Math.min(index + 1, queue.length)} / {queue.length}</span>
    <span>{remaining.length} 张待复习</span>
    </div>{card ? <section className="review-sheet">
        <span className={`kind-pill kind-${card.kind}`}>{CARD_KIND_LABEL[card.kind]}</span>
        <h2>{card.title}</h2>
        <p className="review-prompt">你还记得它的核心意思吗？能用在哪个场景？</p>{revealed ? <>
            <div className="review-answer">
            <h3>原文线索</h3>
            <p>{card.excerpt || '没有原文摘录'}</p>
            <h3>我的理解</h3>
            <p>{card.insight || '还没有个人理解；可以打开卡片补充。'}</p>{card.application && <>
                <h3>行动应用</h3>
                <p>{card.application}</p>
                </>}</div>
            <div className="review-grades">
            <button disabled={busy} onClick={() => void grade('again')}>再想一遍<small>10 分钟后</small>
            </button>
            <button disabled={busy} onClick={() => void grade('hard')}>有点模糊<small>明天复习</small>
            </button>
            <button disabled={busy} className="primary-button" onClick={() => void grade('good')}>我理解了<small>逐步延长间隔</small>
            </button>
            </div>
            </> : <button className="primary-button" onClick={() => setRevealed(true)}>查看线索与理解</button>}<button className="text-button" onClick={() => openCard(card.id)}>打开卡片，补充理解 <ArrowRight size={16}/>
        </button>
        </section> : <div className="review-complete">
        <Check size={36}/>
        <h2>{queue.length ? '这一组复习完成了' : '暂时没有待复习卡片'}</h2>
        <p>{remaining.length ? '还有一些卡片，可以再来一组，也可以先去应用今天的理解。' : '去阅读、记录或应用吧。到期的卡片会再次出现在这里。'}</p>{remaining.length > 0 && <button className="primary-button" onClick={() => { setQueue(remaining.slice(0, 10).map(c => c.id)); setIndex(0); setRevealed(false); }}>再复习 10 张</button>}</div>}</div>;
}
export function SearchPage({ garden: g, query, openBook, openCard }: {
    garden: GardenData;
    query: string;
    openBook: BrowseProps['openBook'];
    openCard: BrowseProps['openCard'];
}) {
    const results = useMemo(() => searchGarden(g, query), [g, query]), [limit, setLimit] = useState(40);
    return <div className="page">
    <PageHeading eyebrow="FIND THE THREAD" title="全局搜索" detail={query ? `“${query}” · 找到 ${results.length} 条线索` : '从书名、概念、章节全文或自己的理解开始搜索。'}/>
    <p className="search-privacy">仅检索当前知识库，不发送给外部 AI 服务。</p>{results.slice(0, limit).map(r => <button key={`${r.type}-${r.id}`} className="search-result" onClick={() => r.type === 'card' ? openCard(r.id) : openBook(r.type === 'book' ? r.id : r.bookId!, r.sectionId)}>
        <span className="search-type">{r.type === 'book' ? <BookOpen size={18}/> : r.type === 'section' ? <List size={18}/> : <NotebookPen size={18}/>} {r.type === 'book' ? '资料' : r.type === 'section' ? '章节' : '卡片'}</span>
        <div>
        <h3>{r.title}</h3>
        <p>{r.snippet || r.source}</p>
        <small>{r.source}</small>
        </div>
        <ArrowRight size={18}/>
        </button>)}{results.length > limit && <button className="soft-button" onClick={() => setLimit(n => n + 40)}>显示更多结果</button>}{!results.length && <Empty title={query ? '没有找到直接匹配' : '把遗忘的线索找回来'} detail={query ? '试试更短的主题词，或搜索原文中的一句话。' : '支持书籍、章节、卡片和标签。搜索结果可以直接回到出处。'}/>}</div>;
}
