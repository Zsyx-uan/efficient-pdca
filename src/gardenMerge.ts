import type { Book, GardenData, KnowledgeCard } from './archiveTypes';
import { hashText } from './markdownArchive';
import { canonical, emptyGarden, normalizeGarden } from './gardenModel';
export type MergeResult = { garden: GardenData; conflicts: string[] };
type Side = 'local' | 'remote' | 'both';
type Pick<T> = { value: T; side: Side };

/** Merge against a shared baseline; retain divergent edits, including delete/edit conflicts. */
export function mergeGardens(base: GardenData | undefined, localInput: GardenData, remoteInput: GardenData): MergeResult {
    const local = structuredClone(localInput), remote = structuredClone(remoteInput);
    const before = base ? structuredClone(base) : emptyGarden();
    const conflicts: string[] = [], bookRemap = new Map<string, string>(), cardRemap = new Map<string, string>();
    const tombstones = new Map<string, GardenData['tombstones'][number]>();
    for (const t of [...local.tombstones, ...remote.tombstones]) {
        const key = t.kind + ':' + t.id, previous = tombstones.get(key);
        if (!previous || t.deletedAt > previous.deletedAt) tombstones.set(key, t);
    }
    function merge<T extends Book | KnowledgeCard>(kind: 'book' | 'card', b: T[], l: T[], r: T[]): Pick<T>[] {
        const result = new Map<string, Pick<T>>();
        const olds = new Map(b.map(x => [x.id, x])), lefts = new Map(l.map(x => [x.id, x])), rights = new Map(r.map(x => [x.id, x]));
        const signature = (value: T | undefined) => canonical(value && kind === 'card' ? { ...value, relatedCardIds: undefined } : value);
        const add = (value: T | undefined, side: Side) => { if (value && !result.has(value.id)) result.set(value.id, { value, side }); };
        for (const id of new Set([...olds.keys(), ...lefts.keys(), ...rights.keys()])) {
            const old = olds.get(id), left = lefts.get(id), right = rights.get(id);
            // A tombstone matters even if the common snapshot is missing, e.g. a new device.
            if (!old && (!left || !right)) {
                const item = left ?? right, deletion = tombstones.get(kind + ':' + id);
                if (item && (!deletion || Date.parse(item.updatedAt) > Date.parse(deletion.deletedAt))) add(item, left ? 'local' : 'remote');
                continue;
            }
            if (signature(left) === signature(right)) { add(left, 'both'); continue; }
            if (signature(old) === signature(left)) { add(right, 'remote'); continue; }
            if (signature(old) === signature(right)) { add(left, 'local'); continue; }
            if (!left || !right) {
                const survivor = left ?? right;
                if (survivor) {
                    conflicts.push((kind === 'book' ? '资料' : '卡片') + '「' + survivor.title + '」一端删除、另一端修改，保留修改内容。');
                    add(survivor, left ? 'local' : 'remote');
                }
                continue;
            }
            let copyId = 'conflict-' + kind + '-' + id + '-' + hashText(canonical(right));
            const copyRecord = (nextId: string): T => ({ ...right, id: nextId, title: right.title + '（云端副本）',
                ...(kind === 'book' ? { sections: (right as Book).sections.map(s => ({ ...s, id: nextId + ':' + s.id })) } : {}),
            } as T);
            let copy = copyRecord(copyId);
            // Do not overwrite a previously merged copy which the user has since edited.
            while (lefts.has(copyId) && signature(lefts.get(copyId)) !== signature(copy)) {
                copyId += '-' + hashText(canonical(lefts.get(copyId)));
                copy = copyRecord(copyId);
            }
            (kind === 'book' ? bookRemap : cardRemap).set(id, copyId);
            conflicts.push((kind === 'book' ? '资料' : '卡片') + '「' + left.title + '」在两端有不同修改，保留两份。');
            add(left, 'local'); add(lefts.get(copyId) ?? copy, lefts.has(copyId) ? 'local' : 'remote');
        }
        return [...result.values()];
    }
    const selectedBooks = merge('book', before.books, local.books, remote.books);
    const books = selectedBooks.map(({ value: book }) => book);
    // Copy cards with a conflicting book. They are NOT logical deletions of the local originals.
    for (const card of remote.cards) {
        const bookId = bookRemap.get(card.bookId);
        if (bookId) cardRemap.set(card.id, bookId + ':' + card.id);
    }
    const remoteCards = remote.cards.map(card => {
        const bookId = bookRemap.get(card.bookId);
        return bookId ? { ...card, id: cardRemap.get(card.id)!, bookId, sectionId: card.sectionId ? bookId + ':' + card.sectionId : undefined } : card;
    });
    const selectedCards = merge('card', before.cards.filter(c => !bookRemap.has(c.bookId)), local.cards, remoteCards);
    const remoteCopies = new Set(cardRemap.values());
    const cards = selectedCards.map(({ value: card, side }) => {
        const left = local.cards.find(c => c.id === card.id), right = remote.cards.find(c => c.id === card.id);
        let links = card.relatedCardIds.map(id => side === 'remote' ? cardRemap.get(id) ?? id : id);
        if (left && right && !cardRemap.has(card.id) && !remoteCopies.has(card.id)) {
            const old = new Set(before.cards.find(c => c.id === card.id)?.relatedCardIds ?? []);
            const l = new Set(left.relatedCardIds), r = new Set(right.relatedCardIds.map(id => cardRemap.get(id) ?? id));
            links = [...new Set([...l, ...r])].filter(id => !old.has(id) || (l.has(id) && r.has(id)));
        }
        return { ...card, relatedCardIds: [...new Set(links)] };
    });
    const cardIds = new Set(cards.map(c => c.id));
    for (const card of cards) {
        card.relatedCardIds = card.relatedCardIds.filter(id => id !== card.id && cardIds.has(id));
        const book = books.find(b => b.id === card.bookId);
        if (card.bookId && !book) { card.bookId = ''; card.sectionId = undefined; }
        else if (card.sectionId && !book?.sections.some(s => s.id === card.sectionId)) card.sectionId = undefined;
    }
    const trash = [...new Map([...local.trash, ...remote.trash].map(t => [t.id, t])).values()]
        .filter(t => t.kind === 'book' ? !books.some(b => b.id === t.book?.id) : t.cards.some(c => !cardIds.has(c.id)))
        .map(t => ({ ...t, cards: t.cards.filter(c => !cardIds.has(c.id)) }));
    const latest = <T extends { updatedAt?: string; lastAt?: string }>(a: Record<string, T>, b: Record<string, T>) => {
        const merged = { ...a };
        for (const [id, value] of Object.entries(b)) if (!a[id] || (value.updatedAt ?? value.lastAt ?? '') > (a[id].updatedAt ?? a[id].lastAt ?? '')) merged[id] = value;
        return merged;
    };
    const garden = normalizeGarden({ version: 4, books, cards, seededPdca: true, trash,
        tombstones: [...tombstones.values()].filter(t => t.kind === 'book' ? !books.some(b => b.id === t.id) : !cardIds.has(t.id)),
        reading: latest(local.reading, remote.reading), reviews: latest(local.reviews, remote.reviews),
    }, true);
    return { garden, conflicts };
}
