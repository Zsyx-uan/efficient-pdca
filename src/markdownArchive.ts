import type { BookSection, CardKind, ParsedCard, ParsedMarkdown, SectionKind } from './archiveTypes'

const clean = (value: string) => value.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n').trim()
const headingText = (value: string) => value.replace(/^#+\s*/, '').trim()
const stripOrdinal = (value: string) => value.replace(/^[一二三四五六七八九十\d]+[、.．]\s*/, '').replace(/^\d+[.、]\s*/, '').trim()
const stripMarkdown = (value: string) => value
  .replace(/```[\s\S]*?```/g, '')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^>\s?/gm, '')
  .replace(/^[-*+]\s+/gm, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

export const hashText = (input: string) => {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `md-${(hash >>> 0).toString(36)}`
}

export function inferSectionKind(title: string): SectionKind {
  const text = stripOrdinal(title).toLowerCase()
  if (/先给结论|一句话概括|核心结论|结论/.test(text)) return 'conclusion'
  if (/阅读指南|怎么读|适合什么人/.test(text)) return 'guide'
  if (/模板|复用/.test(text)) return 'template'
  if (/精读笔记|读书笔记|核心笔记/.test(text)) return 'notes'
  if (/完整解读|深度解读|详细解读/.test(text)) return 'analysis'
  if (/总结|忙人看|总结版/.test(text)) return 'summary'
  if (/参考来源|资料来源|来源|书评/.test(text)) return 'sources'
  return 'other'
}

function readTitle(markdown: string) {
  const h1 = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ''
  const inBrackets = h1.match(/《([^》]+)》/)?.[1]
  return inBrackets ?? (h1.replace(/阅读指南|精读笔记|完整解读|读书笔记/g, '').replace(/[、，,与和]+$/g, '').trim() || '未命名书籍')
}

function maskCodeFences(markdown: string) {
  return markdown.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
}

function makeSections(markdown: string): BookSection[] {
  const masked = maskCodeFences(markdown)
  const top = [...masked.matchAll(/^##\s+(.+)$/gm)]
  if (!top.length) {
    const title = markdown.match(/^#\s+(.+)$/m)?.[1] ?? '正文'
    return [{ id: `section-${hashText(title)}-0`, title: '正文', kind: 'other', level: 2, body: markdown, order: 0 }]
  }
  return top.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = top[index + 1]?.index ?? markdown.length
    const title = headingText(match[1])
    return {
      id: `section-${hashText(`${title}-${index}`)}`,
      title,
      kind: inferSectionKind(title),
      level: 2,
      body: markdown.slice(start, end).trim(),
      order: index,
    }
  })
}

type HeadingCandidate = { title: string; body: string; level: number; section: BookSection }

function headingCandidates(sections: BookSection[]) {
  const candidates: HeadingCandidate[] = []
  sections.forEach((section) => {
    const masked = maskCodeFences(section.body)
    const headings = [...masked.matchAll(/^(#{3,4})\s+(.+)$/gm)]
    headings.forEach((match, index) => {
      const start = (match.index ?? 0) + match[0].length
      const end = headings[index + 1]?.index ?? section.body.length
      candidates.push({
        title: stripOrdinal(headingText(match[2])),
        body: section.body.slice(start, end).trim(),
        level: match[1].length,
        section,
      })
    })
  })
  return candidates
}

function firstUsefulText(body: string) {
  const text = stripMarkdown(body)
  const quoted = body.match(/^>\s*(.+)$/m)?.[1]
  if (quoted) return stripMarkdown(quoted).slice(0, 360)
  return text.slice(0, 430) || '导入内容保留在阅读档案中，可在此补充你的理解。'
}

function makeCard(candidate: HeadingCandidate, kind: CardKind, order: number): ParsedCard {
  const excerpt = firstUsefulText(candidate.body)
  return {
    title: candidate.title,
    category: CARD_CATEGORY[kind],
    kind,
    sectionId: candidate.section.id,
    origin: 'imported',
    sortOrder: order,
    excerpt,
    insight: excerpt,
    application: kind === 'practice' ? excerpt : '',
    tags: [CARD_CATEGORY[kind], stripOrdinal(candidate.section.title)],
    importance: kind === 'thesis' || kind === 'summary' ? 5 : 4,
    relatedCardIds: [],
  }
}

const CARD_CATEGORY: Record<CardKind, string> = {
  thesis: '核心命题', concept: '关键概念', chapter: '章节方法', viewpoint: '重点观点',
  practice: '实践应用', limitation: '局限反思', summary: '一句话总结', note: '自由笔记',
}

function pdcaCards(candidates: HeadingCandidate[]) {
  const pick = (test: (candidate: HeadingCandidate) => boolean) => candidates.filter(test)
  const has = (candidate: HeadingCandidate, text: string) => candidate.title.replace(/\s/g, '').toLowerCase().includes(text.toLowerCase())
  const selections: Array<[CardKind, HeadingCandidate[]]> = [
    ['thesis', pick((item) => has(item, '全书核心命题')).slice(0, 1)],
    ['concept', pick((item) => ['PDCA', 'KGI/KPI/KDI', '因式分解', '时间管理', '复盘与调整'].some((key) => has(item, key))).slice(0, 5)],
    ['chapter', pick((item) => /^第[一二三四五六七八九十\d]+章/.test(item.title)).slice(0, 8)],
    ['viewpoint', pick((item) => /^观点[一二三四五六七八九十\d]+/.test(item.title)).slice(0, 6)],
    ['practice', pick((item) => /(学习场景|工作\/?创业场景|个人成长场景)/.test(item.title)).slice(0, 3)],
    ['limitation', pick((item) => /^局限[一二三四五六七八九十\d]+/.test(item.title)).slice(0, 3)],
    ['summary', pick((item) => /只想记住一句话/.test(item.title)).slice(0, 1)],
  ]
  return selections.flatMap(([kind, items], groupIndex) => items.map((item, index) => makeCard(item, kind, groupIndex * 100 + index)))
}

function generalCards(candidates: HeadingCandidate[]) {
  const usable = candidates.filter((item) => !['template', 'sources'].includes(item.section.kind))
  return usable.slice(0, 30).map((item, index) => {
    let kind: CardKind = 'note'
    if (/命题|核心|原则/.test(item.title)) kind = 'thesis'
    else if (/概念|是什么|定义|KPI|方法/.test(item.title)) kind = 'concept'
    else if (/第[一二三四五六七八九十\d]+章/.test(item.title)) kind = 'chapter'
    else if (/观点|价值/.test(item.title)) kind = 'viewpoint'
    else if (/场景|应用|实践/.test(item.title)) kind = 'practice'
    else if (/局限|反思|不足/.test(item.title)) kind = 'limitation'
    else if (/一句话|总结/.test(item.title)) kind = 'summary'
    return makeCard(item, kind, index)
  })
}

export function parseMarkdownDocument(source: string): ParsedMarkdown {
  const sourceText = clean(source)
  const title = readTitle(sourceText)
  const sections = makeSections(sourceText)
  const sourceSection = sections.find((section) => section.kind === 'sources')
  const sources = sourceSection
    ? sourceSection.body.split('\n').filter((line) => /^[-*+]\s+/.test(line)).map((line) => line.replace(/^[-*+]\s*/, '').trim()).filter(Boolean)
    : []
  const conclusionSection = sections.find((section) => section.kind === 'conclusion')
  const coreConclusion = conclusionSection ? firstUsefulText(conclusionSection.body) : ''
  const candidates = headingCandidates(sections)
  const cards = /高效\s*PDCA/.test(title) ? pdcaCards(candidates) : generalCards(candidates)
  const usedTitles = new Set(cards.map((card) => card.title))
  const unmatchedHeadings = candidates.filter((item) => !usedTitles.has(item.title)).map((item) => item.title)
  return { title, sourceText, coreConclusion, sections, sources, fingerprint: hashText(sourceText), cards, unmatchedHeadings }
}
