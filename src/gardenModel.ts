import { BOOK_STATUS_LABEL, CARD_KIND_LABEL, SECTION_KIND_LABEL } from './archiveTypes';
import type { Book, BookSection, GardenData, KnowledgeCard, ParsedMarkdown, ReviewProgress, TrashEntry } from './archiveTypes';
export const COLORS = ['#6f8390', '#9a6654', '#657d69', '#a8864e', '#667d83', '#7c6d88'];
export const now = () => new Date().toISOString();
export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const emptyGarden = (): GardenData => ({ version: 4, books: [], cards: [], seededPdca: true, trash: [], tombstones: [], reading: {}, reviews: {} });
export const newBook = (): Book => ({ id: uid('book'), title: '', author: '', category: '未分类', status: 'to-read', rating: 0, color: COLORS[0], cover: '书', sourceText: '', coreConclusion: '', sections: [], sources: [], tags: [], createdAt: now(), updatedAt: now() });
export const newCard = (bookId = '', sectionId?: string): KnowledgeCard => ({ id: uid('card'), bookId, sectionId, title: '', category: '自由笔记', kind: 'note', origin: 'manual', sortOrder: 0, excerpt: '', insight: '', application: '', tags: [], importance: 3, relatedCardIds: [], createdAt: now(), updatedAt: now() });
export const tagsFrom = (text: string) => [...new Set(text.split(/[,，\n]/).map(t => t.trim()).filter(Boolean))];
export function canonical(value: unknown): string {
    const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)])) : v;
    return JSON.stringify(sort(value));
}
export class DataError extends Error {
    constructor(message: string) { super(message); this.name = 'DataError'; }
}
const obj = (v: unknown, label: string): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new DataError(`${label} 必须是对象`); return v as Record<string, unknown>; };
const str = (v: unknown, label: string, fallback = ''): string => { if (v === undefined)
    return fallback; if (typeof v !== 'string')
    throw new DataError(`${label} 必须是文本`); return v; };
const num = (v: unknown, label: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => { if (v === undefined)
    return fallback; if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw new DataError(`${label} 数值无效`); return v; };
const arr = (v: unknown, label: string, fallback = false): unknown[] => { if (v === undefined && fallback)
    return []; if (!Array.isArray(v))
    throw new DataError(`${label} 必须是数组`); return v; };
const strings = (v: unknown, label: string) => [...new Set(arr(v, label, true).map(x => str(x, label)))];
const date = (v: unknown, label: string) => { const d = str(v, label, now()); if (!Number.isFinite(Date.parse(d)))
    throw new DataError(`${label} 日期无效`); return d; };
function oneOf<T extends string>(v: unknown, choices: readonly T[], label: string, fallback: T): T { if (v === undefined)
    return fallback; if (!choices.includes(v as T))
    throw new DataError(`${label} 选项无效`); return v as T; }
function sectionValue(v: unknown, label: string): BookSection {
    const x = obj(v, label);
    return { id: str(x.id, `${label}.id`, uid('section')), title: str(x.title, `${label}.title`, '正文'), kind: oneOf(x.kind, Object.keys(SECTION_KIND_LABEL) as BookSection['kind'][], label, 'other'), level: num(x.level, label, 2, 1, 6), body: str(x.body, `${label}.body`), order: num(x.order, label, 0), origin: oneOf(x.origin, ['manual', 'imported'] as const, label, 'imported'), sourceKey: x.sourceKey === undefined ? undefined : str(x.sourceKey, label) };
}
function bookValue(v: unknown, label: string): Book {
    const x = obj(v, label);
    const title = str(x.title, `${label}.title`, '未命名书籍');
    const sourceText = str(x.sourceText, `${label}.sourceText`);
    return { id: str(x.id, `${label}.id`, uid('book')), title, author: str(x.author, `${label}.author`, '未知作者'), category: str(x.category, `${label}.category`, '未分类'), status: oneOf(x.status, Object.keys(BOOK_STATUS_LABEL) as Book['status'][], label, x.progress === 100 ? 'done' : 'reading'), rating: num(x.rating, label, 0, 0, 5), color: str(x.color, label, COLORS[0]), cover: str(x.cover, label, title.slice(0, 1)), sourceText, coreConclusion: str(x.coreConclusion, label), sections: arr(x.sections, label, true).map((s, i) => { const result = sectionValue(s, `${label}.sections[${i}]`); if (!sourceText && obj(s, label).origin === undefined)
            result.origin = 'manual'; return result; }), sources: strings(x.sources, label), importFingerprint: x.importFingerprint === undefined ? undefined : str(x.importFingerprint, label), importedAt: x.importedAt === undefined ? undefined : date(x.importedAt, label), tags: strings(x.tags, label), createdAt: date(x.createdAt, label), updatedAt: date(x.updatedAt, label) };
}
function cardValue(v: unknown, label: string): KnowledgeCard {
    const x = obj(v, label);
    const kind = oneOf(x.kind, Object.keys(CARD_KIND_LABEL) as KnowledgeCard['kind'][], label, 'note');
    const result: KnowledgeCard = { id: str(x.id, `${label}.id`, uid('card')), bookId: str(x.bookId, label), title: str(x.title, `${label}.title`, '未命名卡片'), category: str(x.category, label, CARD_KIND_LABEL[kind]), kind, sectionId: x.sectionId === undefined ? undefined : str(x.sectionId, label), origin: oneOf(x.origin, ['manual', 'imported'] as const, label, 'manual'), sortOrder: num(x.sortOrder, label, 0), excerpt: str(x.excerpt, label), insight: str(x.insight, label), application: str(x.application, label), tags: strings(x.tags, label), importance: num(x.importance, label, 3, 1, 5), relatedCardIds: strings(x.relatedCardIds, label), createdAt: date(x.createdAt, label), updatedAt: date(x.updatedAt, label), sourceKey: x.sourceKey === undefined ? undefined : str(x.sourceKey, label) };
    if (x.archived !== undefined && typeof x.archived !== 'boolean')
        throw new DataError(`${label}.archived 必须是布尔值`);
    result.archived = Boolean(x.archived);
    if (x.importedBaseline !== undefined) {
        const b = obj(x.importedBaseline, label);
        result.importedBaseline = { title: str(b.title, label), excerpt: str(b.excerpt, label), insight: str(b.insight, label), application: str(b.application, label) };
    }
    result.applications = arr(x.applications, label, true).map(a => { const b = obj(a, label); return { id: str(b.id, label, uid('application')), text: str(b.text, label), createdAt: date(b.createdAt, label) }; });
    return result;
}
export function normalizeGarden(input: unknown, repair = false): GardenData {
    const x = obj(input, '知识库');
    if (x.version !== undefined && ![2, 3, 4].includes(x.version as number))
        throw new DataError('不支持此数据版本，请使用较新的应用打开');
    const books = arr(x.books, 'books').map((b, i) => bookValue(b, `books[${i}]`));
    const cards = arr(x.cards, 'cards').map((c, i) => cardValue(c, `cards[${i}]`));
    for (const [name, values] of [['书籍', books], ['卡片', cards]] as const) {
        const ids = values.map(a => a.id);
        if (ids.some(id => !id) || new Set(ids).size !== ids.length)
            throw new DataError(`${name} ID 为空或重复`);
    }
    const seen = new Set<string>(), sectionMaps = new Map<string, Map<string, string>>();
    for (const book of books) {
        const mapping = new Map<string, string>();
        for (const section of book.sections) {
            if (mapping.has(section.id))
                throw new DataError(`《${book.title}》章节 ID 重复`);
            const old = section.id;
            if (seen.has(old))
                section.id = `${book.id}:${old}`;
            if (!section.id || seen.has(section.id))
                throw new DataError('章节 ID 无效');
            seen.add(section.id);
            mapping.set(old, section.id);
        }
        sectionMaps.set(book.id, mapping);
    }
    for (const card of cards) {
        if (card.bookId && !books.some(b => b.id === card.bookId)) {
            if (!repair)
                throw new DataError(`卡片「${card.title}」的资料不存在`);
            card.bookId = '';
            card.sectionId = undefined;
        }
        if (card.sectionId) {
            const target = sectionMaps.get(card.bookId)?.get(card.sectionId);
            if (!target && !repair)
                throw new DataError(`卡片「${card.title}」的章节不存在`);
            card.sectionId = target;
        }
        if (card.relatedCardIds.some(id => id === card.id || !cards.some(c => c.id === id))) {
            if (!repair)
                throw new DataError(`卡片「${card.title}」关联引用无效`);
            card.relatedCardIds = card.relatedCardIds.filter(id => id !== card.id && cards.some(c => c.id === id));
        }
    }
    // Migrate the previous version's automatic excerpt copy without labeling it as a personal insight.
    if (x.version !== 4)
        for (const card of cards) {
            if (card.origin === 'imported') {
                card.importedBaseline = { title: card.title, excerpt: card.excerpt, insight: '', application: '' };
                if (card.insight === card.excerpt)
                    card.insight = '';
                if (card.application === card.excerpt)
                    card.application = '';
            }
        }
    for (const card of cards)
        for (const id of card.relatedCardIds) {
            const other = cards.find(c => c.id === id)!;
            if (!other.relatedCardIds.includes(card.id))
                other.relatedCardIds.push(card.id);
        }
    const trash = arr(x.trash, 'trash', true).map((entry, i): TrashEntry => { const t = obj(entry, `trash[${i}]`); const kind = oneOf(t.kind, ['book', 'card'], 'trash.kind', 'card'); return { id: str(t.id, 'trash.id', uid('trash')), kind, deletedAt: date(t.deletedAt, 'trash.deletedAt'), book: t.book === undefined ? undefined : bookValue(t.book, 'trash.book'), cards: arr(t.cards, 'trash.cards').map(c => cardValue(c, 'trash.card')) }; });
    const tombstones = arr(x.tombstones, 'tombstones', true).map(t => { const v = obj(t, 'tombstone'); return { kind: oneOf(v.kind, ['book', 'card'], 'tombstone.kind', 'card'), id: str(v.id, 'tombstone.id'), deletedAt: date(v.deletedAt, 'tombstone.deletedAt') }; });
    const reading: GardenData['reading'] = {}, reviews: GardenData['reviews'] = {};
    for (const [id, v] of Object.entries(obj(x.reading ?? {}, 'reading'))) {
        const p = obj(v, '阅读位置');
        reading[id] = { sectionId: p.sectionId === undefined ? undefined : str(p.sectionId, 'sectionId'), scrollY: num(p.scrollY, 'scrollY', 0), updatedAt: date(p.updatedAt, 'updatedAt') };
    }
    for (const [id, v] of Object.entries(obj(x.reviews ?? {}, 'reviews'))) {
        const p = obj(v, '复习记录');
        reviews[id] = { dueAt: date(p.dueAt, 'dueAt'), lastAt: date(p.lastAt, 'lastAt'), interval: num(p.interval, 'interval', 0), repetitions: num(p.repetitions, 'repetitions', 0), grade: oneOf(p.grade, ['again', 'hard', 'good'], 'grade', 'again') };
    }
    return { version: 4, books, cards, seededPdca: true, trash, tombstones, reading, reviews };
}
export function upsertBook(g: GardenData, book: Book): GardenData { return { ...g, books: g.books.some(b => b.id === book.id) ? g.books.map(b => b.id === book.id ? { ...book, updatedAt: now() } : b) : [{ ...book, updatedAt: now() }, ...g.books] }; }
export function upsertCard(g: GardenData, card: KnowledgeCard): GardenData {
    const next = { ...card, updatedAt: now() }, exists = g.cards.some(c => c.id === next.id);
    const cards = (exists ? g.cards : [next, ...g.cards]).map(c => c.id === next.id ? next : { ...c, relatedCardIds: next.relatedCardIds.includes(c.id) ? [...new Set([...c.relatedCardIds, next.id])] : c.relatedCardIds.filter(id => id !== next.id) });
    return { ...g, cards };
}
export function trashItems(g: GardenData, kind: 'book' | 'card', ids: string[]): GardenData {
    const deletedAt = now(), removeBooks = kind === 'book' ? g.books.filter(b => ids.includes(b.id)) : [], removeCards = g.cards.filter(c => kind === 'card' ? ids.includes(c.id) : ids.includes(c.bookId));
    const removed = new Set(removeCards.map(c => c.id));
    const entries: TrashEntry[] = kind === 'book' ? removeBooks.map(book => ({ id: uid('trash'), kind, book, cards: removeCards.filter(c => c.bookId === book.id), deletedAt })) : removeCards.map(card => ({ id: uid('trash'), kind, cards: [card], deletedAt }));
    return { ...g, books: g.books.filter(b => !removeBooks.some(r => r.id === b.id)), cards: g.cards.filter(c => !removed.has(c.id)).map(c => ({ ...c, relatedCardIds: c.relatedCardIds.filter(id => !removed.has(id)) })), trash: [...entries, ...g.trash], tombstones: [...g.tombstones, ...removeBooks.map(b => ({ kind: 'book' as const, id: b.id, deletedAt })), ...removeCards.map(c => ({ kind: 'card' as const, id: c.id, deletedAt }))] };
}
export function restoreTrash(g: GardenData, id: string): GardenData {
    const entry = g.trash.find(t => t.id === id);
    if (!entry)
        return g;
    const restoredAt = new Date(Math.max(Date.now(), Date.parse(entry.deletedAt) + 1)).toISOString();
    let next = { ...g, trash: g.trash.filter(t => t.id !== id), tombstones: g.tombstones.filter(t => t.id !== entry.book?.id && !entry.cards.some(c => c.id === t.id)) };
    if (entry.book && !next.books.some(b => b.id === entry.book!.id))
        next = upsertBook(next, entry.book);
    for (const c of entry.cards) {
        if (next.cards.some(existing => existing.id === c.id)) continue;
        const bookExists = !c.bookId || next.books.some(b => b.id === c.bookId);
        next = upsertCard(next, { ...c, bookId: bookExists ? c.bookId : '', sectionId: bookExists ? c.sectionId : undefined, relatedCardIds: c.relatedCardIds.filter(r => next.cards.some(k => k.id === r) || entry.cards.some(k => k.id === r)) });
    }
    next = { ...next, books: next.books.map(b => b.id === entry.book?.id ? { ...b, updatedAt: restoredAt } : b), cards: next.cards.map(c => entry.cards.some(saved => saved.id === c.id) && !g.cards.some(active => active.id === c.id) ? { ...c, updatedAt: restoredAt } : c) };
    return next;
}
export function applyImport(g: GardenData, parsed: ParsedMarkdown, metadata: Partial<Book>, targetId?: string, chosenKeys?: string[]): GardenData {
    const old = g.books.find(b => b.id === targetId);
    if (old?.importFingerprint === parsed.fingerprint)
        return g;
    const book = { ...(old ?? newBook()), ...metadata }, idMap = new Map<string, string>();
    const sections = parsed.sections.map(s => { const match = old?.sections.find(o => o.origin !== 'manual' && (o.sourceKey === s.sourceKey || o.title === s.title)); const id = match?.id ?? uid('section'); idMap.set(s.id, id); return { ...s, id, origin: 'imported' as const }; });
    const retained = old?.sections.filter(s => !sections.some(n => n.id === s.id)).map(s => ({ ...s, origin: 'manual' as const })) ?? [];
    const nextBook: Book = { ...book, title: metadata.title || old?.title || parsed.title, cover: (metadata.title || old?.title || parsed.title).slice(0, 1), sourceText: parsed.sourceText, coreConclusion: parsed.coreConclusion, sections: [...sections, ...retained], sources: [...new Set([...parsed.sources, ...(old?.sources ?? [])])], importFingerprint: parsed.fingerprint, importedAt: now(), updatedAt: now() };
    const previous = g.cards.filter(c => c.bookId === book.id), used = new Set<string>();
    const imported = parsed.cards.filter(c => !chosenKeys || chosenKeys.includes(c.sourceKey ?? c.title)).map(c => {
        const match = previous.find(o => !used.has(o.id) && o.origin === 'imported' && (o.sourceKey === c.sourceKey || (o.kind === c.kind && o.title === c.title)));
        if (match)
            used.add(match.id);
        const baseline = { title: c.title, excerpt: c.excerpt, insight: c.insight, application: c.application };
        if (!match)
            return { ...c, id: uid('card'), bookId: book.id, sectionId: idMap.get(c.sectionId ?? ''), createdAt: now(), updatedAt: now(), importedBaseline: baseline };
        const b = match.importedBaseline ?? { title: match.title, excerpt: match.excerpt, insight: '', application: '' };
        return { ...match, title: match.title !== b.title ? match.title : c.title, excerpt: match.excerpt !== b.excerpt ? match.excerpt : c.excerpt, insight: match.insight !== b.insight ? match.insight : c.insight, application: match.application !== b.application ? match.application : c.application, tags: [...new Set([...match.tags, ...c.tags])], sectionId: match.sectionId && old?.sections.find(s => s.id === match.sectionId)?.sourceKey !== parsed.sections.find(s => s.id === c.sectionId)?.sourceKey ? match.sectionId : idMap.get(c.sectionId ?? ''), sourceKey: c.sourceKey, importedBaseline: baseline, updatedAt: now() };
    });
    return { ...upsertBook(g, nextBook), cards: [...g.cards.filter(c => !used.has(c.id)), ...imported] };
}
export function reviewCard(g: GardenData, id: string, grade: ReviewProgress['grade'], time = new Date()): GardenData {
    const old = g.reviews[id], interval = grade === 'again' ? 0 : grade === 'hard' ? 1 : Math.max(2, Math.round((old?.interval || 1) * 2.4));
    const due = new Date(time.getTime() + (grade === 'again' ? 10 * 60000 : interval * 86400000));
    return { ...g, reviews: { ...g.reviews, [id]: { dueAt: due.toISOString(), lastAt: time.toISOString(), interval, repetitions: (old?.repetitions ?? 0) + 1, grade } } };
}
export const dueCards = (g: GardenData, time = Date.now()) => g.cards.filter(c => !c.archived && (!g.reviews[c.id] || Date.parse(g.reviews[c.id].dueAt) <= time));
