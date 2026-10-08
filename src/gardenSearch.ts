import type { GardenData } from './archiveTypes';
export type SearchResult = {
    type: 'book' | 'section' | 'card';
    id: string;
    bookId?: string;
    sectionId?: string;
    title: string;
    source: string;
    snippet: string;
    score: number;
};
const stop = new Set(['我', '的', '哪些', '关于', '方法', '？', '?', '读过', '有没有', '如何', '什么', '一个', '可以', '了', '在', '和']);
export function queryTokens(query: string) {
    const segmented = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(query)].filter(s => s.isWordLike).map(s => s.segment) : query.split(/[\s，。！？,!?]+/);
    return [...new Set([query.trim(), ...segmented.filter(s => !stop.has(s) && s.trim())].map(s => s.toLowerCase()).filter(Boolean))];
}
export function searchGarden(g: GardenData, query: string): SearchResult[] {
    if (!query.trim())
        return [];
    const terms = queryTokens(query), result: SearchResult[] = [];
    const add = (item: Omit<SearchResult, 'snippet' | 'score'>, body: string, tags: string[]) => {
        const text = `${item.title} ${body} ${tags.join(' ')}`.toLowerCase(), matched = terms.filter(t => text.includes(t));
        if (!matched.length)
            return;
        const score = matched.reduce((n, t) => n + (item.title.toLowerCase().includes(t) ? 8 : tags.some(tag => tag.toLowerCase().includes(t)) ? 5 : 1), 0);
        const at = body.toLowerCase().indexOf(matched.find(t => body.toLowerCase().includes(t)) ?? '');
        result.push({ ...item, score, snippet: body.slice(Math.max(0, at - 35), Math.max(0, at - 35) + 150).replace(/\s+/g, ' ') });
    };
    for (const book of g.books) {
        add({ type: 'book', id: book.id, title: book.title, source: `${book.author} · ${book.category}` }, `${book.author} ${book.category} ${book.coreConclusion}`, book.tags);
        for (const section of book.sections)
            add({ type: 'section', id: section.id, bookId: book.id, sectionId: section.id, title: section.title, source: book.title }, section.body, book.tags);
    }
    for (const card of g.cards.filter(c => !c.archived))
        add({ type: 'card', id: card.id, bookId: card.bookId, sectionId: card.sectionId, title: card.title, source: g.books.find(b => b.id === card.bookId)?.title ?? '收集箱' }, `${card.excerpt}\n${card.insight}\n${card.application}\n${(card.applications ?? []).map(a => a.text).join('\n')}`, card.tags);
    return result.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh'));
}
