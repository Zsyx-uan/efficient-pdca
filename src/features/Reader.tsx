import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Download, FilePlus2, Link2, Network, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import type { Book, BookSection, GardenData, KnowledgeCard } from '../archiveTypes';
import { BOOK_STATUS_LABEL, CARD_KIND_LABEL } from '../archiveTypes';
import { useDraft } from '../useDraft';
import { canonical, now, uid } from '../gardenModel';
import type { Mutation } from '../gardenStore';
import { Dialog, Empty, Markdown } from '../components/Common';
import { CardTile } from './Browse';
function downloadMarkdown(book: Book) { const content = book.sourceText || `# ${book.title}\n\n${book.sections.map(s => `## ${s.title}\n\n${s.body}`).join('\n\n')}`; const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${book.title.replace(/[<>:"/\\|?*]/g, '_')}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function Reader({ book, garden, sectionId, tab = 'read', setLocation, openCard, onEdit, onDelete, onImport, onCapture, action }: {
    book: Book;
    garden: GardenData;
    sectionId?: string;
    tab?: string;
    setLocation: (section?: string, tab?: string) => void;
    openCard: (id: string) => void;
    onEdit: () => void;
    onDelete: () => void;
    onImport: () => void;
    onCapture: (text: string, sectionId?: string) => void;
    action: (change: Mutation, reason: string, capture?: boolean) => Promise<boolean>;
}) {
    const section = book.sections.find(s => s.id === sectionId) ?? book.sections[0], cards = garden.cards.filter(c => c.bookId === book.id && !c.archived), [editing, setEditing] = useState<BookSection | 'new' | null>(null), [selected, setSelected] = useState(''), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), restored = useRef(false);
    useEffect(() => {
        restored.current = false;
        const position = garden.reading[book.id], y = position && position.sectionId === section?.id ? position.scrollY : 0;
        const raf = requestAnimationFrame(() => { window.scrollTo({ top: y, behavior: 'instant' }); restored.current = true; save(); });
        const save = () => {
            if (!restored.current || tab !== 'read')
                return;
            const scrollY = window.scrollY;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => void action(current => ({ ...current, reading: { ...current.reading, [book.id]: { sectionId: section?.id, scrollY, updatedAt: now() } } }), '保存阅读位置', false), 750);
        };
        window.addEventListener('scroll', save, { passive: true });
        save();
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('scroll', save);
            clearTimeout(timer.current);
            if (restored.current && tab === 'read') {
                const scrollY = window.scrollY;
                void action(current => ({ ...current, reading: { ...current.reading, [book.id]: { sectionId: section?.id, scrollY, updatedAt: now() } } }), '保存阅读位置', false);
            }
        };
        // Reading restoration is tied to navigation, never repeated by a background save.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id, section?.id, tab]);
    const changeOrder = async (sid: string, offset: number) => {
        await action(current => ({ ...current, books: current.books.map(b => {
                if (b.id !== book.id)
                    return b;
                const sections = [...b.sections], i = sections.findIndex(s => s.id === sid), j = i + offset;
                if (i < 0 || j < 0 || j >= sections.length)
                    return b;
                [sections[i], sections[j]] = [sections[j], sections[i]];
                return { ...b, sections: sections.map((s, k) => ({ ...s, order: k })), updatedAt: now() };
            }) }), '调整章节顺序');
    };
    const removeSection = async () => {
        if (!section || !confirm(`删除章节「${section.title}」？卡片保留并转为未归档，正文可从版本快照恢复。`))
            return;
        const id = section.id;
        const saved = await action(current => ({ ...current, books: current.books.map(b => b.id === book.id ? { ...b, sections: b.sections.filter(s => s.id !== id), updatedAt: now() } : b), cards: current.cards.map(c => c.bookId === book.id && c.sectionId === id ? { ...c, sectionId: undefined, updatedAt: now() } : c) }), '删除章节（可从版本恢复）');
        if (saved)
            setLocation(book.sections.find(s => s.id !== id)?.id, 'read');
    };
    return <div className="page reader-page">
    <a className="back-link" href="#/library">
    <ArrowLeft size={16}/>回到资料库</a>
    <div className="reader-heading">
    <span className="reader-cover" style={{ background: book.color }}>{book.cover}</span>
    <div>
    <p className="eyebrow">READ · UNDERSTAND · CONNECT</p>
    <h1>{book.title}</h1>
    <p>{book.author || '未知作者'} · {book.category} · {BOOK_STATUS_LABEL[book.status]}</p>
    <div className="tag-row">{book.tags.map(t => <span key={t}>{t}</span>)}</div>
    </div>
    <div className="reader-book-actions">
<button className="icon-button" aria-label="更新原始资料" onClick={onImport}><Upload size={18}/></button>
    <button className="icon-button" aria-label="编辑书籍" onClick={onEdit}>
    <Pencil size={18}/>
    </button>
    <button className="icon-button" aria-label="导出 Markdown" onClick={() => downloadMarkdown(book)}>
    <Download size={18}/>
    </button>
    <button className="icon-button danger" aria-label="删除书籍" onClick={onDelete}>
    <Trash2 size={18}/>
    </button>
    </div>
    </div>
    <div className="tabs" role="tablist" aria-label="阅读档案视图">{[['read', '正文与章节'], ['cards', `本书卡片 ${cards.length}`], ['structure', '结构与关联']].map(([id, label]) => <button role="tab" aria-selected={tab === id} key={id} className={tab === id ? 'active' : ''} onClick={() => setLocation(section?.id, id)}>{label}</button>)}</div>{tab === 'cards' ? <>
        <div className="results-heading">
        <span>每张卡片都可以回到它的出处。</span>
        <button className="soft-button" onClick={() => onCapture('', section?.id)}>
        <Plus size={16}/>添加卡片</button>
        </div>
        <div className="card-grid">{cards.map(c => <CardTile key={c.id} garden={garden} card={c} onOpen={() => openCard(c.id)}/>)}</div>{!cards.length && <Empty title="还没有本书卡片" detail="在正文中选择一段内容，或者手动记录自己的理解。" action="添加卡片" onAction={() => onCapture('', section?.id)}/>}</> : tab === 'structure' ? <Structure book={book} cards={cards} allCards={garden.cards} openCard={openCard} openSection={id => setLocation(id, 'read')}/> : <div className="reader-layout">
        <aside className="reader-toc">
        <h2>阅读目录</h2>
        <nav aria-label="章节目录">{book.sections.map((s, i) => <div className="toc-row" key={s.id}>
            <button className={section?.id === s.id ? 'active' : ''} onClick={() => { setSelected(''); setLocation(s.id, 'read'); }}>
            <small>{String(i + 1).padStart(2, '0')}</small>
            <span>{s.title}</span>
            </button>
            <div className="toc-order">
            <button aria-label={`上移章节 ${s.title}`} disabled={i === 0} onClick={() => void changeOrder(s.id, -1)}>↑</button>
            <button aria-label={`下移章节 ${s.title}`} disabled={i === book.sections.length - 1} onClick={() => void changeOrder(s.id, 1)}>↓</button>
            </div>
            </div>)}</nav>
        <button className="text-button" onClick={() => setEditing('new')}>
        <FilePlus2 size={16}/>添加章节</button>
        <button className="text-button" onClick={onImport}>
        <Upload size={16}/>更新原始资料</button>
        </aside>
        <article className="reading-paper">
        <div className="mobile-toc">
        <label>阅读章节<select aria-label="阅读章节" value={section?.id ?? ''} onChange={e => setLocation(e.target.value, 'read')}>{book.sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
        </label>
        <button className="soft-button" onClick={() => setEditing('new')}>添加章节</button>
        </div>{section ? <>
            <div className="reading-section-heading">
            <div>
            <span className="eyebrow">{section.origin === 'manual' ? 'PERSONAL CHAPTER' : 'READING ARCHIVE'}</span>
            <h2>{section.title}</h2>
            </div>
            <div>
            <button className="icon-button" aria-label="编辑章节" onClick={() => setEditing(section)}>
            <Pencil size={17}/>
            </button>
            <button className="icon-button danger" aria-label="删除章节" onClick={() => void removeSection()}>
            <Trash2 size={17}/>
            </button>
            </div>
            </div>{selected && <div className="capture-bar">
                <span>已选择 {selected.length} 字</span>
                <button className="primary-button" onClick={() => { onCapture(selected, section.id); setSelected(''); }}>
                <NotebookIcon />摘录为卡片</button>
                </div>}<div onMouseUp={() => {
                    const selection = window.getSelection();
                    if (selection?.anchorNode && selection?.focusNode) {
                        const parent = selection.anchorNode.parentElement;
                        if (parent?.closest('.markdown-content'))
                            setSelected(selection.toString().trim().slice(0, 10000));
                    }
                }}>
            <Markdown content={section.body}/>
            </div>
            <section className="section-notes">
            <div className="section-heading">
            <h3>本章节的理解</h3>
            <button className="text-button" onClick={() => onCapture('', section.id)}>
            <Plus size={16}/>添加卡片</button>
            </div>{cards.filter(c => c.sectionId === section.id).map(c => <button className="compact-card" key={c.id} onClick={() => openCard(c.id)}>
                <span className={`kind-pill kind-${c.kind}`}>{CARD_KIND_LABEL[c.kind]}</span>
                <strong>{c.title}</strong>
                <ArrowRight size={16}/>
                </button>)}{!cards.some(c => c.sectionId === section.id) && <p className="muted">还没有自己的理解。读完这一节，记下一句最想保留的话。</p>}</section>
            <button className="soft-button touch-capture" onClick={() => onCapture('', section.id)}>
            <Plus size={16}/>记录本节理解</button>
            </> : <Empty title="阅读档案已建立" detail="可以添加章节，或导入 Markdown / TXT 正文。" action="导入正文" onAction={onImport}/>}</article>
        </div>}{editing && <SectionEditor bookId={book.id} section={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={async (saved) => {
                let savedId = saved.id;
                const ok = await action(current => ({ ...current, books: current.books.map(b => {
                    if (b.id !== book.id) return b;
                    const original = editing === 'new' ? undefined : editing;
                    const latest = b.sections.find(s => s.id === saved.id);
                    if (original && canonical(latest) !== canonical(original)) {
                        savedId = uid('section');
                        return { ...b, sections: [...b.sections, { ...saved, id: savedId, title: saved.title + '（编辑副本）', sourceKey: undefined, order: b.sections.length }], updatedAt: now() };
                    }
                    return { ...b, sections: latest ? b.sections.map(s => s.id === saved.id ? saved : s) : [...b.sections, { ...saved, order: b.sections.length }], updatedAt: now() };
                }) }), '保存章节');
                if (ok) {
                    setEditing(null);
                    setLocation(savedId, 'read');
                }
                return ok;
            }}/>}</div>;
}
function NotebookIcon() { return <FilePlus2 size={16}/>; }
function SectionEditor({ section, bookId, onClose, onSave }: {
    bookId: string;
    section?: BookSection;
    onClose: () => void;
    onSave: (s: BookSection) => Promise<boolean>;
}) {
    const [base] = useState(() => ({ title: section?.title ?? '', body: section?.body ?? '' }));
    const draft = useDraft('kg-draft-section-' + bookId + ':' + (section?.id ?? 'new'), base);
    const { title, body } = draft.value, [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <Dialog title={section ? '编辑章节' : '添加章节'} onClose={onClose} dirty={title !== (section?.title ?? '') || body !== (section?.body ?? '')}>
    <form onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await onSave({ id: section?.id ?? uid('section'), title: title.trim(), body, kind: section?.kind ?? 'other', level: 2, order: section?.order ?? 0, origin: 'manual', sourceKey: section?.sourceKey });
            setBusy(false);
            if (ok) draft.clear();
            else
                setError('尚未保存，正文仍在编辑器中。请重试。');
        }}>
    <label>章节标题<input aria-label="章节标题" name="title" required value={title} onChange={e => draft.setValue({ ...draft.value, title: e.target.value })} autoFocus/>
    </label>
    <label>Markdown 正文<textarea aria-label="Markdown 正文" name="body" rows={12} value={body} onChange={e => draft.setValue({ ...draft.value, body: e.target.value })} placeholder="支持标题、列表、表格、链接和代码块"/>
    </label>{draft.storageError && <p role="status" className="error-text">{draft.storageError}</p>}{error && <p role="alert" className="error-text">{error}</p>}<footer className="form-footer">
    <button type="button" className="soft-button" onClick={() => {
            if ((title === (section?.title ?? '') && body === (section?.body ?? '')) || confirm('尚未保存章节，确定关闭？草稿会保留。'))
                onClose();
        }}>取消</button>
    <button disabled={busy} className="primary-button">保存章节</button>
    </footer>
    </form>
    </Dialog>;
}
function Structure({ book, cards, allCards, openCard, openSection }: {
    book: Book;
    cards: KnowledgeCard[];
    allCards: KnowledgeCard[];
    openCard: (id: string) => void;
    openSection: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false), seen = new Set<string>(), relations = cards.flatMap(c => c.relatedCardIds.map(id => ({ from: c, to: allCards.find(k => k.id === id) }))).filter(pair => {
        if (!pair.to)
            return false;
        const key = [pair.from.id, pair.to.id].sort().join('|');
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    const groups = [...book.sections.map(s => ({ id: s.id, title: s.title, cards: cards.filter(c => c.sectionId === s.id) })), { id: 'unfiled', title: '未归档卡片', cards: cards.filter(c => !c.sectionId || !book.sections.some(s => s.id === c.sectionId)) }].filter(s => s.id !== 'unfiled' || s.cards.length);
    return <section className="structure-view">
    <div className="structure-root">
    <Network size={25}/>
    <h2>{book.title}</h2>
    <p>{book.sections.length} 个章节 · {cards.length} 张卡片</p>
    </div>
    <div className="results-heading">
    <p>从结构看全貌，再回到正文理解细节。</p>
    <button className="soft-button" onClick={() => setExpanded(v => !v)}>{expanded ? '收起全部' : '展开全部'}</button>
    </div>
    <div className="structure-grid">{groups.map(s => <article key={s.id}>
        <button className="structure-section" onClick={() => s.id === 'unfiled' ? setExpanded(true) : openSection(s.id)}>
        <h3>{s.title}</h3>
        <span>{s.cards.length} 张卡片</span>
        </button>{expanded && s.cards.map(c => <button className="structure-card" key={c.id} onClick={() => openCard(c.id)}>{c.title}<ArrowRight size={14}/>
            </button>)}</article>)}</div>{relations.length > 0 && <section className="relation-list">
        <h3>
        <Link2 size={18}/>手动双向关联 · 每组只显示一次</h3>{relations.map(({ from, to }) => <div key={[from.id, to!.id].sort().join('|')}>
            <button onClick={() => openCard(from.id)}>{from.title}</button>
            <span>↔</span>
            <button onClick={() => openCard(to!.id)}>{to!.title}</button>
            </div>)}</section>}</section>;
}
export function CardDetail({ card, garden, onClose, onEdit, onDelete, onOpen, onSource, action }: {
    card: KnowledgeCard;
    garden: GardenData;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onOpen: (id: string) => void;
    onSource: (bookId: string, sectionId?: string) => void;
    action: (change: Mutation, reason: string) => Promise<boolean>;
}) {
    const book = garden.books.find(b => b.id === card.bookId), section = book?.sections.find(s => s.id === card.sectionId), [application, setApplication] = useState(''), [busy, setBusy] = useState(false);
    return <Dialog title="卡片详情" onClose={onClose} wide>
    <div className="detail-title">
    <span className={`kind-pill kind-${card.kind}`}>{CARD_KIND_LABEL[card.kind]}</span>
    <h2>{card.title}</h2>
    <div className="button-row">
    <button className="soft-button" onClick={onEdit}>
    <Pencil size={16}/>编辑卡片</button>
    <button className="soft-button danger" onClick={onDelete}>
    <Trash2 size={16}/>移入回收站</button>
    </div>
    </div>{book ? <button className="source-link" onClick={() => onSource(book.id, section?.id)}>
        <BookOpen size={16}/>《{book.title}》{section ? ` · ${section.title}` : ''}<ArrowRight size={15}/>
        </button> : <p className="muted">收集箱 · 可以稍后归档</p>}{[['证据 / 原文', card.excerpt], ['我的理解', card.insight], ['行动应用', card.application]].map(([title, text]) => <section className="detail-block" key={title}>
        <h3>{title}</h3>
        <p>{text || '暂未补充'}</p>
        </section>)}<div className="tag-row">{card.tags.map(t => <span key={t}>#{t}</span>)}</div>{card.relatedCardIds.length > 0 && <section className="detail-block">
        <h3>
        <Link2 size={16}/>关联卡片</h3>{card.relatedCardIds.map(id => {
                const other = garden.cards.find(c => c.id === id);
                return other ? <button key={id} className="compact-card" onClick={() => onOpen(id)}>{other.title}<ArrowRight size={16}/>
                </button> : null;
            })}</section>}<section className="detail-block">
    <h3>用过这条知识吗？</h3>
    <p className="muted">留下一个真实的使用场景，比多收藏一张卡片更有价值。</p>
    <form onSubmit={async (e) => {
            e.preventDefault();
            if (!application.trim())
                return;
            setBusy(true);
            const text = application.trim();
            const saved = await action(current => ({ ...current, cards: current.cards.map(c => c.id === card.id ? { ...c, applications: [{ id: uid('application'), text, createdAt: now() }, ...(c.applications ?? [])], updatedAt: now() } : c) }), '记录知识应用');
            setBusy(false);
            if (saved)
                setApplication('');
        }}>
    <label>应用记录<textarea aria-label="应用记录" rows={2} value={application} onChange={e => setApplication(e.target.value)} placeholder="今天在什么事情上用了它？"/>
    </label>
    <button disabled={busy || !application.trim()} className="soft-button">记录一次应用</button>
    </form>{card.applications?.map(log => <div className="application-log" key={log.id}>
        <small>{new Date(log.createdAt).toLocaleDateString('zh-CN')}</small>
        <p>{log.text}</p>
        </div>)}</section>
    </Dialog>;
}
