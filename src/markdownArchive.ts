import type { BookSection, CardKind, ParsedCard, ParsedMarkdown, SectionKind } from './archiveTypes';
import { CARD_KIND_LABEL } from './archiveTypes';
export const hashText = (input: string) => { let hash = 2166136261; for (let i = 0; i < input.length; i++)
    hash = Math.imul(hash ^ input.charCodeAt(i), 16777619); return `md-${(hash >>> 0).toString(36)}`; };
const textOnly = (value: string) => value.replace(/```[\s\S]*?```/g, '').replace(/^#{1,6}\s+|^>\s?|^[-*+]\s+/gm, '').replace(/\*\*|`/g, '').trim();
const sourceKey = (title: string, index: number) => `${title.trim().toLowerCase()}:${index}`;
export function inferSectionKind(title: string): SectionKind {
    if (/结论/.test(title))
        return 'conclusion';
    if (/指南|怎么读/.test(title))
        return 'guide';
    if (/模板|复用/.test(title))
        return 'template';
    if (/精读|读书笔记/.test(title))
        return 'notes';
    if (/完整解读|深度解读/.test(title))
        return 'analysis';
    if (/总结|忙人看/.test(title))
        return 'summary';
    if (/来源|参考|书评/.test(title))
        return 'sources';
    return 'other';
}
function kindFor(title: string): CardKind {
    if (/命题|核心|原则/.test(title))
        return 'thesis';
    if (/概念|是什么|定义|KPI|方法/.test(title))
        return 'concept';
    if (/第[一二三四五六七八九十\d]+章/.test(title))
        return 'chapter';
    if (/观点|价值/.test(title))
        return 'viewpoint';
    if (/场景|应用|实践/.test(title))
        return 'practice';
    if (/局限|反思|不足/.test(title))
        return 'limitation';
    if (/一句话|总结/.test(title))
        return 'summary';
    return 'note';
}
const mask = (s: string) => s.replace(/```[\s\S]*?```/g, block => block.replace(/[^\n]/g, ' '));
export function parseMarkdownDocument(source: string): ParsedMarkdown {
    const sourceText = source.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').trim();
    if (!sourceText)
        throw new Error('文件没有正文，请选择非空的 UTF-8 Markdown / TXT 文件');
    const heading = sourceText.match(/^#\s+(.+)$/m)?.[1] ?? '未命名资料';
    const title = heading.match(/《([^》]+)》/)?.[1] ?? (heading.replace(/阅读指南|精读笔记|完整解读|读书笔记/g, '').replace(/[、，,与和]+$/g, '').trim() || '未命名资料');
    const top = [...mask(sourceText).matchAll(/^##\s+(.+)$/gm)], sections: BookSection[] = [];
    const addSection = (name: string, body: string) => { const key = sourceKey(name, sections.filter(s => s.title === name).length); sections.push({ id: `parsed-${hashText(key)}`, title: name, kind: inferSectionKind(name), level: 2, body: body.trim(), order: sections.length, origin: 'imported', sourceKey: key }); };
    if (!top.length)
        addSection('正文', sourceText.replace(/^#\s+.+\n?/, ''));
    else {
        const intro = sourceText.slice(0, top[0].index).replace(/^#\s+.+\n?/, '').trim();
        if (intro)
            addSection('导言', intro);
        top.forEach((h, i) => addSection(h[1].trim(), sourceText.slice((h.index ?? 0) + h[0].length, top[i + 1]?.index ?? sourceText.length)));
    }
    const cards: ParsedCard[] = [];
    for (const section of sections.filter(s => !['sources', 'template'].includes(s.kind))) {
        const headings = [...mask(section.body).matchAll(/^(#{3,4})\s+(.+)$/gm)];
        const candidates = headings.length ? headings.map((h, i) => ({ title: h[2].trim(), body: section.body.slice((h.index ?? 0) + h[0].length, headings[i + 1]?.index ?? section.body.length) })) : [{ title: section.title, body: section.body }];
        const counts = new Map<string, number>();
        for (const item of candidates.filter(c => textOnly(c.body))) {
            const kind = kindFor(item.title), count = counts.get(item.title) ?? 0;
            counts.set(item.title, count + 1);
            const key = `${section.sourceKey}/${sourceKey(item.title, count)}`;
            cards.push({ title: item.title, category: CARD_KIND_LABEL[kind], kind, sectionId: section.id, origin: 'imported', sortOrder: cards.length, excerpt: textOnly(item.body).slice(0, 800), insight: '', application: '', tags: [CARD_KIND_LABEL[kind]], importance: 3, relatedCardIds: [], sourceKey: key });
        }
    }
    const sources = sections.filter(s => s.kind === 'sources').flatMap(s => s.body.split('\n').filter(l => /^[-*+]\s+/.test(l)).map(l => l.replace(/^[-*+]\s+/, '')));
    return { title, sourceText, coreConclusion: textOnly(sections.find(s => s.kind === 'conclusion')?.body ?? '').slice(0, 500), sections, sources, fingerprint: hashText(sourceText), cards, unmatchedHeadings: [] };
}
