export type View = 'home' | 'library' | 'cards' | 'map' | 'assistant'
export type BookStatus = 'to-read' | 'reading' | 'done'

export type CardKind =
  | 'thesis'
  | 'concept'
  | 'chapter'
  | 'viewpoint'
  | 'practice'
  | 'limitation'
  | 'summary'
  | 'note'

export type SectionKind =
  | 'conclusion'
  | 'guide'
  | 'notes'
  | 'analysis'
  | 'template'
  | 'summary'
  | 'sources'
  | 'other'

export type BookSection = {
  id: string
  title: string
  kind: SectionKind
  level: number
  body: string
  order: number
}

export type Book = {
  id: string
  title: string
  author: string
  category: string
  status: BookStatus
  rating: number
  color: string
  cover: string
  sourceText: string
  coreConclusion: string
  sections: BookSection[]
  sources: string[]
  importFingerprint?: string
  importedAt?: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type KnowledgeCard = {
  id: string
  bookId: string
  title: string
  category: string
  kind: CardKind
  sectionId?: string
  origin: 'imported' | 'manual'
  sortOrder: number
  excerpt: string
  insight: string
  application: string
  tags: string[]
  importance: number
  relatedCardIds: string[]
  createdAt: string
  updatedAt: string
}

export type GardenData = {
  version: 3
  books: Book[]
  cards: KnowledgeCard[]
  seededPdca?: boolean
}

export type ParsedCard = Omit<KnowledgeCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>

export type ParsedMarkdown = {
  title: string
  sourceText: string
  coreConclusion: string
  sections: BookSection[]
  sources: string[]
  fingerprint: string
  cards: ParsedCard[]
  unmatchedHeadings: string[]
}

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  thesis: '核心命题',
  concept: '关键概念',
  chapter: '章节方法',
  viewpoint: '重点观点',
  practice: '实践应用',
  limitation: '局限反思',
  summary: '一句话总结',
  note: '自由笔记',
}

export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  conclusion: '结论',
  guide: '阅读指南',
  notes: '精读笔记',
  analysis: '完整解读',
  template: '复用模板',
  summary: '总结',
  sources: '来源',
  other: '内容模块',
}

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  'to-read': '待读',
  reading: '在读',
  done: '已读',
}
