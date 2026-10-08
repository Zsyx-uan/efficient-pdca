export type View = 'home' | 'library' | 'cards' | 'review' | 'data' | 'book' | 'search';
export type BookStatus = 'to-read' | 'reading' | 'done';
export type CardKind = 'thesis' | 'concept' | 'chapter' | 'viewpoint' | 'practice' | 'limitation' | 'summary' | 'note';
export type SectionKind = 'conclusion' | 'guide' | 'notes' | 'analysis' | 'template' | 'summary' | 'sources' | 'other';
export type BookSection = {
    id: string;
    title: string;
    kind: SectionKind;
    level: number;
    body: string;
    order: number;
    origin?: 'imported' | 'manual';
    sourceKey?: string;
};
export type Book = {
    id: string;
    title: string;
    author: string;
    category: string;
    status: BookStatus;
    rating: number;
    color: string;
    cover: string;
    sourceText: string;
    coreConclusion: string;
    sections: BookSection[];
    sources: string[];
    importFingerprint?: string;
    importedAt?: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
};
export type KnowledgeCard = {
    id: string;
    bookId: string;
    title: string;
    category: string;
    kind: CardKind;
    sectionId?: string;
    origin: 'imported' | 'manual';
    sortOrder: number;
    excerpt: string;
    insight: string;
    application: string;
    tags: string[];
    importance: number;
    relatedCardIds: string[];
    createdAt: string;
    updatedAt: string;
    sourceKey?: string;
    importedBaseline?: {
        title: string;
        excerpt: string;
        insight: string;
        application: string;
    };
    archived?: boolean;
    applications?: {
        id: string;
        text: string;
        createdAt: string;
    }[];
};
export type TrashEntry = {
    id: string;
    deletedAt: string;
    kind: 'book' | 'card';
    book?: Book;
    cards: KnowledgeCard[];
};
export type Tombstone = {
    kind: 'book' | 'card';
    id: string;
    deletedAt: string;
};
export type ReadingPosition = {
    sectionId?: string;
    scrollY: number;
    updatedAt: string;
};
export type ReviewProgress = {
    dueAt: string;
    lastAt: string;
    interval: number;
    repetitions: number;
    grade: 'again' | 'hard' | 'good';
};
export type GardenData = {
    version: 4;
    books: Book[];
    cards: KnowledgeCard[];
    seededPdca?: boolean;
    trash: TrashEntry[];
    tombstones: Tombstone[];
    reading: Record<string, ReadingPosition>;
    reviews: Record<string, ReviewProgress>;
};
export type ParsedCard = Omit<KnowledgeCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>;
export type ParsedMarkdown = {
    title: string;
    sourceText: string;
    coreConclusion: string;
    sections: BookSection[];
    sources: string[];
    fingerprint: string;
    cards: ParsedCard[];
    unmatchedHeadings: string[];
};
export const CARD_KIND_LABEL: Record<CardKind, string> = { thesis: '核心命题', concept: '关键概念', chapter: '章节方法', viewpoint: '重点观点', practice: '实践应用', limitation: '局限反思', summary: '一句话总结', note: '自由笔记' };
export const SECTION_KIND_LABEL: Record<SectionKind, string> = { conclusion: '结论', guide: '阅读指南', notes: '精读笔记', analysis: '完整解读', template: '复用模板', summary: '总结', sources: '来源', other: '正文' };
export const BOOK_STATUS_LABEL: Record<BookStatus, string> = { 'to-read': '待读', reading: '在读', done: '已读' };
