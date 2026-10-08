import { useState } from 'react';
import { useDraft } from '../useDraft';
import type { Book, GardenData, KnowledgeCard, ParsedMarkdown } from '../archiveTypes';
import { BOOK_STATUS_LABEL, CARD_KIND_LABEL } from '../archiveTypes';
import { COLORS, newBook, newCard, tagsFrom } from '../gardenModel';
import { Dialog } from './Common';
function TagField({ tags, onChange }: {
    tags: string[];
    onChange: (tags: string[]) => void;
}) {
    const [text, setText] = useState(() => tags.join('，'));
    return <label>标签<input aria-label="标签" name="tags" value={text} onChange={e => { setText(e.target.value); onChange(tagsFrom(e.target.value)); }} placeholder="用逗号分隔，例如：管理，复盘"/>
    </label>;
}
export function BookEditor({ book, onClose, onSave }: {
    book?: Book;
    onClose: () => void;
    onSave: (b: Book) => Promise<boolean>;
}) {
    const [base] = useState(() => book ?? newBook()), draft = useDraft(`kg-draft-book-${book?.id ?? 'new'}`, base), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const b = draft.value, update = (changes: Partial<Book>) => draft.setValue({ ...b, ...changes });
    return <Dialog title={book ? '编辑书籍' : '新建书籍'} onClose={onClose} dirty={draft.dirty}>
    <form onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            const saved = await onSave({ ...b, title: b.title.trim(), cover: b.title.trim().slice(0, 1), category: b.category.trim() || '未分类' });
            setBusy(false);
            if (saved) {
                draft.clear();
                onClose();
            }
            else
                setError('尚未写入本地存储。草稿仍在，请重试保存或导出备份。');
        }}>
    <div className="form-grid">
    <label>书名<input aria-label="书名" required name="title" value={b.title} onChange={e => update({ title: e.target.value })} autoFocus/>
    </label>
    <label>作者<input aria-label="作者" name="author" value={b.author} onChange={e => update({ author: e.target.value })}/>
    </label>
    <label>分类<input aria-label="分类" name="category" value={b.category} onChange={e => update({ category: e.target.value })}/>
    </label>
    <label>阅读状态<select aria-label="阅读状态" value={b.status} onChange={e => update({ status: e.target.value as Book['status'] })}>{Object.entries(BOOK_STATUS_LABEL).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
    </label>
    <label>评分<select aria-label="评分" value={b.rating} onChange={e => update({ rating: Number(e.target.value) })}>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n ? `${n} / 5` : '未评分'}</option>)}</select>
    </label>
    <TagField tags={b.tags} onChange={tags => update({ tags })}/>
    </div>
    <fieldset className="color-picker">
    <legend>书脊颜色</legend>{COLORS.map(color => <button type="button" key={color} aria-label={`书脊颜色 ${color}`} aria-pressed={b.color === color} className={b.color === color ? 'selected' : ''} style={{ background: color }} onClick={() => update({ color })}/>)}</fieldset>{draft.storageError && <p role="status" className="error-text">{draft.storageError}</p>}{error && <p role="alert" className="error-text">{error}</p>}<footer className="form-footer">
    <button type="button" className="soft-button" onClick={() => {
            if (!draft.dirty || confirm('关闭编辑器？草稿会保留。'))
                onClose();
        }}>取消</button>
    <button className="primary-button" disabled={busy}>{busy ? '正在保存…' : '保存书籍'}</button>
    </footer>
    </form>
    </Dialog>;
}
export function CardEditor({ card, garden, bookId = '', sectionId, excerpt = '', onClose, onSave }: {
    card?: KnowledgeCard;
    garden: GardenData;
    bookId?: string;
    sectionId?: string;
    excerpt?: string;
    onClose: () => void;
    onSave: (c: KnowledgeCard) => Promise<boolean>;
}) {
    const [base] = useState(() => card ?? { ...newCard(bookId, sectionId), excerpt }), draft = useDraft(`kg-draft-card-${card?.id ?? 'new'}`, base), [busy, setBusy] = useState(false), [error, setError] = useState(''), [relationQuery, setRelationQuery] = useState(''), [relationPage, setRelationPage] = useState(1);
    const c = draft.value, update = (changes: Partial<KnowledgeCard>) => draft.setValue({ ...c, ...changes }), sections = garden.books.find(b => b.id === c.bookId)?.sections ?? [];
    const available = garden.cards.filter(k => k.id !== c.id && `${k.title} ${k.tags.join(' ')}`.toLowerCase().includes(relationQuery.toLowerCase())), relations = available.slice(0, relationPage * 30);
    return <Dialog title={card ? '编辑知识卡片' : '快速记录'} onClose={onClose} dirty={draft.dirty}>
    <form onSubmit={async (e) => {
            e.preventDefault();
            if (c.bookId && !garden.books.some(b => b.id === c.bookId)) {
                setError('原资料已不存在，请选择收集箱或其他资料。');
                return;
            }
            setBusy(true);
            const saved = await onSave({ ...c, title: c.title.trim(), category: CARD_KIND_LABEL[c.kind], sectionId: sections.some(s => s.id === c.sectionId) ? c.sectionId : undefined });
            setBusy(false);
            if (saved) {
                draft.clear();
                onClose();
            }
            else
                setError('尚未保存。草稿仍在，请重试或导出。');
        }}>
    <div className="form-grid">
    <label className="span-2">标题<input aria-label="标题" required name="title" value={c.title} onChange={e => update({ title: e.target.value })} autoFocus/>
    </label>
    <label>归属资料<select aria-label="归属资料" value={c.bookId} onChange={e => update({ bookId: e.target.value, sectionId: undefined })}>
    <option value="">收集箱 · 暂不归档</option>{garden.books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
    </label>
    <label>所属章节<select aria-label="所属章节" value={c.sectionId ?? ''} onChange={e => update({ sectionId: e.target.value || undefined })}>
    <option value="">未归档章节</option>{sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
    </label>
    <label className="span-2">我的理解<textarea aria-label="我的理解" name="insight" rows={4} value={c.insight} onChange={e => update({ insight: e.target.value })} placeholder="用自己的话写下你真正理解的内容…"/>
    </label>
    <label className="span-2">证据 / 原文<textarea aria-label="证据 / 原文" name="excerpt" rows={3} value={c.excerpt} onChange={e => update({ excerpt: e.target.value })}/>
    </label>
    <label className="span-2">行动应用<textarea aria-label="行动应用" name="application" rows={3} value={c.application} onChange={e => update({ application: e.target.value })} placeholder="准备在什么情境下使用？"/>
    </label>
    <TagField tags={c.tags} onChange={tags => update({ tags })}/>
    <label>卡片类型<select aria-label="卡片类型" value={c.kind} onChange={e => update({ kind: e.target.value as KnowledgeCard['kind'] })}>{Object.entries(CARD_KIND_LABEL).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
    </label>
    </div>
    <details>
    <summary>重要程度与关联 · 已关联 {c.relatedCardIds.length} 张</summary>
    <label>重要程度<select aria-label="重要程度" value={c.importance} onChange={e => update({ importance: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}</select>
    </label>
    <label>查找关联卡片<input aria-label="查找关联卡片" value={relationQuery} onChange={e => { setRelationQuery(e.target.value); setRelationPage(1); }} placeholder="搜索全部卡片，不限制前 16 张"/>
    </label>
    <div className="selected-relations">{c.relatedCardIds.map(id => <button type="button" className="chip" key={id} onClick={() => update({ relatedCardIds: c.relatedCardIds.filter(r => r !== id) })}>{garden.cards.find(k => k.id === id)?.title ?? '已删除卡片'} ×</button>)}</div>
    <div className="relation-options">{relations.map(item => <label key={item.id}>
        <input type="checkbox" checked={c.relatedCardIds.includes(item.id)} onChange={e => update({ relatedCardIds: e.target.checked ? [...c.relatedCardIds, item.id] : c.relatedCardIds.filter(id => id !== item.id) })}/>
        <span>{item.title}<small>{garden.books.find(b => b.id === item.bookId)?.title ?? '收集箱'}</small>
        </span>
        </label>)}</div>{relations.length < available.length && <button type="button" className="text-button" onClick={() => setRelationPage(n => n + 1)}>显示更多关联卡片</button>}</details>{draft.storageError && <p role="status" className="error-text">{draft.storageError}</p>}{error && <p role="alert" className="error-text">{error}</p>}<footer className="form-footer">
    <button type="button" className="soft-button" onClick={() => {
            if (!draft.dirty || confirm('关闭编辑器？草稿会保留。'))
                onClose();
        }}>取消</button>
    <button disabled={busy} className="primary-button">{busy ? '正在保存…' : '保存卡片'}</button>
    </footer>
    </form>
    </Dialog>;
}
export function ImportEditor({ parsed, garden, targetId, onClose, onSave }: {
    parsed: ParsedMarkdown;
    garden: GardenData;
    targetId?: string;
    onClose: () => void;
    onSave: (metadata: Partial<Book>, id: string, keys: string[]) => Promise<boolean>;
}) {
    const existing = garden.books.find(b => b.id === targetId) ?? garden.books.find(b => b.title === parsed.title), [target, setTarget] = useState(existing?.id ?? ''), [title, setTitle] = useState(existing?.title ?? parsed.title), [author, setAuthor] = useState(existing?.author ?? ''), [category, setCategory] = useState(existing?.category ?? '未分类'), [selected, setSelected] = useState(parsed.cards.map(c => c.sourceKey ?? c.title)), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const same = garden.books.find(b => b.id === target)?.importFingerprint === parsed.fingerprint;
    return <Dialog title="确认资料导入" onClose={onClose} wide>
    <form onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const saved = await onSave({ title, author, category }, target, selected);
            setBusy(false);
            if (saved)
                onClose();
            else
                setError('导入未保存。请重试或先导出当前内容。');
        }}>
    <div className="import-summary">
    <div>
    <strong>{parsed.sections.length}</strong>
    <span>内容章节</span>
    </div>
    <div>
    <strong>{selected.length}</strong>
    <span>候选卡片</span>
    </div>
    <div>
    <strong>{parsed.sources.length}</strong>
    <span>资料来源</span>
    </div>
    </div>
    <label>导入方式<select aria-label="导入方式" value={target} onChange={e => setTarget(e.target.value)}>
    <option value="">新增资料</option>{garden.books.map(b => <option key={b.id} value={b.id}>更新《{b.title}》</option>)}</select>
    </label>{target && <p className="notice">{same ? '文件与当前版本完全相同，不重复导入。已有笔记和关联不会改变。' : '更新识别出的源内容；保留人工理解、手动章节、未匹配的旧卡片及已有有效关联。更新前自动建立版本快照。'}</p>}<div className="form-grid">
    <label>资料名称<input aria-label="资料名称" required value={title} onChange={e => setTitle(e.target.value)}/>
    </label>
    <label>作者<input aria-label="作者" value={author} onChange={e => setAuthor(e.target.value)}/>
    </label>
    <label>分类<input aria-label="分类" value={category} onChange={e => setCategory(e.target.value)}/>
    </label>
    </div>
    <details>
    <summary>选择候选卡片 · {selected.length} / {parsed.cards.length}</summary>
    <div className="button-row">
    <button type="button" className="soft-button" onClick={() => setSelected(parsed.cards.map(c => c.sourceKey ?? c.title))}>全选</button>
    <button type="button" className="soft-button" onClick={() => setSelected([])}>只保留原文</button>
    </div>
    <div className="candidate-list">{parsed.cards.map(c => <label key={c.sourceKey}>
        <input type="checkbox" checked={selected.includes(c.sourceKey ?? c.title)} onChange={e => { const key = c.sourceKey ?? c.title; setSelected(e.target.checked ? [...selected, key] : selected.filter(k => k !== key)); }}/>
        <span>{c.title}<small>{CARD_KIND_LABEL[c.kind]} · 原文摘录，不自动填写“我的理解”</small>
        </span>
        </label>)}</div>
    </details>{error && <p role="alert" className="error-text">{error}</p>}<footer className="form-footer">
    <button type="button" className="soft-button" onClick={onClose}>取消</button>
    <button className="primary-button" disabled={busy}>{busy ? '导入中…' : same ? '保留现有档案' : target ? '安全更新资料' : '创建阅读档案'}</button>
    </footer>
    </form>
    </Dialog>;
}
