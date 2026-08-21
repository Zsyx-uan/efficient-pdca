import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import {
  BookOpen, Bot, BrainCircuit, Check, ChevronDown, ChevronLeft, ChevronRight,
  Download, FileInput, FilePlus2, Grid2X2, Library, Link2, Network, NotebookPen, Pencil,
  Plus, Search, Sparkles, Trash2, Upload, X,
} from 'lucide-react'
import './App.css'
import { pdcaSampleMarkdown } from './pdcaSample'
import {
  BOOK_STATUS_LABEL, CARD_KIND_LABEL, SECTION_KIND_LABEL,
  type Book, type BookSection, type BookStatus, type CardKind, type GardenData,
  type KnowledgeCard, type ParsedMarkdown, type View,
} from './archiveTypes'
import { parseMarkdownDocument } from './markdownArchive'

const STORAGE_KEY = 'knowledge-garden-v3'
const LEGACY_STORAGE_KEY = 'knowledge-garden-v2'
const COLORS = ['#6f8390', '#9a6654', '#657d69', '#a8864e', '#667d83', '#7c6d88']
const now = () => new Date().toISOString()
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const emptyBook = (index = 0): Book => ({
  id: uid('book'), title: '未命名书籍', author: '未知作者', category: '未分类', status: 'to-read', rating: 0,
  color: COLORS[index % COLORS.length], cover: '书', sourceText: '', coreConclusion: '', sections: [], sources: [], tags: [], createdAt: now(), updatedAt: now(),
})

function normalizeData(input: unknown): GardenData | null {
  if (!input || typeof input !== 'object') return null
  const value = input as { books?: Partial<Book>[]; cards?: Partial<KnowledgeCard>[]; seededPdca?: boolean }
  if (!Array.isArray(value.books) || !Array.isArray(value.cards)) return null
  const books = value.books.map((raw, index): Book => ({
    ...emptyBook(index), ...raw,
    id: raw.id ?? uid('book'), title: raw.title ?? '未命名书籍', author: raw.author ?? '未知作者', category: raw.category ?? '未分类',
    status: raw.status ?? ((raw as { progress?: number }).progress === 100 ? 'done' : 'reading'), rating: Number(raw.rating ?? 0),
    color: raw.color ?? COLORS[index % COLORS.length], cover: raw.cover ?? raw.title?.slice(0, 1) ?? '书', sourceText: raw.sourceText ?? '',
    coreConclusion: raw.coreConclusion ?? '', sections: Array.isArray(raw.sections) ? raw.sections : [], sources: Array.isArray(raw.sources) ? raw.sources : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [], createdAt: raw.createdAt ?? now(), updatedAt: raw.updatedAt ?? now(),
  }))
  const cards = value.cards.map((raw, index): KnowledgeCard => ({
    id: raw.id ?? uid('card'), bookId: raw.bookId ?? books[0]?.id ?? '', title: raw.title ?? '未命名卡片', category: raw.category ?? '自由笔记',
    kind: raw.kind ?? 'note', sectionId: raw.sectionId, origin: raw.origin ?? 'manual', sortOrder: Number(raw.sortOrder ?? index),
    excerpt: raw.excerpt ?? '', insight: raw.insight ?? '', application: raw.application ?? '', tags: Array.isArray(raw.tags) ? raw.tags : [],
    importance: Number(raw.importance ?? 3), relatedCardIds: Array.isArray(raw.relatedCardIds) ? raw.relatedCardIds : [], createdAt: raw.createdAt ?? now(), updatedAt: raw.updatedAt ?? now(),
  }))
  return { version: 3, books, cards, seededPdca: Boolean(value.seededPdca) }
}

function seedPdca(data: GardenData): GardenData {
  if (data.seededPdca) return data
  const parsed = parseMarkdownDocument(pdcaSampleMarkdown)
  if (data.books.some((book) => book.title === parsed.title)) return { ...data, seededPdca: true }
  const createdAt = now()
  const book: Book = {
    ...emptyBook(data.books.length), id: 'pdca-sample', title: parsed.title, author: '富田和成', category: '效率与管理', status: 'done', rating: 5,
    color: '#697e6d', cover: '高', sourceText: parsed.sourceText, coreConclusion: parsed.coreConclusion, sections: parsed.sections,
    sources: parsed.sources, importFingerprint: parsed.fingerprint, importedAt: createdAt, tags: ['PDCA', '目标管理', '复盘'], createdAt, updatedAt: createdAt,
  }
  const cards = parsed.cards.map((card) => ({ ...card, id: uid('card'), bookId: book.id, createdAt, updatedAt: createdAt }))
  return { version: 3, books: [book, ...data.books], cards: [...cards, ...data.cards], seededPdca: true }
}

function readData(): GardenData {
  try {
    const current = normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? ''))
    if (current) return seedPdca(current)
    const legacy = normalizeData(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? ''))
    if (legacy) return seedPdca(legacy)
  } catch { /* a clean local library will be created below */ }
  return seedPdca({ version: 3, books: [], cards: [], seededPdca: false })
}

function cardToText(card: KnowledgeCard) { return `${card.title} ${card.excerpt} ${card.insight} ${card.application} ${card.tags.join(' ')}`.toLowerCase() }
function bookToText(book: Book) { return `${book.title} ${book.author} ${book.category} ${book.tags.join(' ')}`.toLowerCase() }

function Inline({ children }: { children: string }) {
  const segments = children.split(/(\*\*[^*]+\*\*)/g)
  return <>{segments.map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const nodes: ReactNode[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (/^```/.test(line)) {
      const block: string[] = []; index += 1
      while (index < lines.length && !/^```/.test(lines[index])) { block.push(lines[index]); index += 1 }
      nodes.push(<pre key={`code-${index}`}><code>{block.join('\n')}</code></pre>); index += 1; continue
    }
    const heading = line.match(/^(#{3,6})\s+(.+)$/)
    if (heading) { const Level = `h${heading[1].length}` as 'h3' | 'h4' | 'h5' | 'h6'; nodes.push(<Level key={`h-${index}`}><Inline>{heading[2]}</Inline></Level>); index += 1; continue }
    if (/^>\s?/.test(line)) { nodes.push(<blockquote key={`q-${index}`}><Inline>{line.replace(/^>\s?/, '')}</Inline></blockquote>); index += 1; continue }
    if (/^[-*+]\s+/.test(line) || /^\d+[.、]\s+/.test(line)) {
      const items: string[] = []; const ordered = /^\d+[.、]\s+/.test(line)
      while (index < lines.length && (ordered ? /^\d+[.、]\s+/.test(lines[index]) : /^[-*+]\s+/.test(lines[index]))) { items.push(lines[index].replace(ordered ? /^\d+[.、]\s+/ : /^[-*+]\s+/, '')); index += 1 }
      const List = ordered ? 'ol' : 'ul'; nodes.push(<List key={`l-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><Inline>{item}</Inline></li>)}</List>); continue
    }
    if (line.trim() && !/^---+$/.test(line.trim())) nodes.push(<p key={`p-${index}`}><Inline>{line}</Inline></p>)
    index += 1
  }
  return <div className="markdown-content">{nodes}</div>
}

export default function App() {
  const initial = useMemo(() => readData(), [])
  const [books, setBooks] = useState<Book[]>(initial.books)
  const [cards, setCards] = useState<KnowledgeCard[]>(initial.cards)
  const [view, setView] = useState<View>('home')
  const [query, setQuery] = useState('')
  const [activeBookId, setActiveBookId] = useState('all')
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [archiveSectionId, setArchiveSectionId] = useState<string | undefined>()
  const [bookModal, setBookModal] = useState<Book | 'new' | null>(null)
  const [cardModal, setCardModal] = useState<KnowledgeCard | 'new' | null>(null)
  const [importDraft, setImportDraft] = useState<ParsedMarkdown | null>(null)
  const [toast, setToast] = useState('')
  const jsonInputRef = useRef<HTMLInputElement>(null)
  const markdownInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, books, cards, seededPdca: true })) }, [books, cards])
  const selectedBook = books.find((book) => book.id === selectedBookId) ?? null
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2800) }
  const visibleBooks = books.filter((book) => bookToText(book).includes(query.toLowerCase()) && (activeBookId === 'all' || book.id === activeBookId))
  const visibleCards = cards.filter((card) => cardToText(card).includes(query.toLowerCase()) && (activeBookId === 'all' || card.bookId === activeBookId))
  const openBook = (book: Book, sectionId?: string) => { setSelectedBookId(book.id); setArchiveSectionId(sectionId); setSelectedCardId(null) }
  const openCard = (card: KnowledgeCard) => { setSelectedCardId(card.id); setSelectedBookId(null) }

  function saveBook(draft: Omit<Book, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    if (!draft.title.trim()) return
    if (draft.id) {
      const { id, ...changes } = draft; const updatedAt = now()
      setBooks((current) => current.map((book) => book.id === id ? { ...book, ...changes, cover: changes.cover || changes.title.slice(0, 1), updatedAt } : book))
      notify('书籍信息已更新')
    } else {
      const created = { ...emptyBook(books.length), ...draft, id: uid('book'), cover: draft.cover || draft.title.slice(0, 1), createdAt: now(), updatedAt: now() }
      setBooks((current) => [created, ...current]); openBook(created); setView('library'); notify('书籍已加入书架')
    }
    setBookModal(null)
  }

  function saveCard(draft: Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    if (!draft.title.trim() || !draft.bookId) return
    const updatedAt = now()
    if (draft.id) {
      const next = { ...draft, updatedAt, createdAt: cards.find((card) => card.id === draft.id)?.createdAt ?? updatedAt } as KnowledgeCard
      setCards((current) => current.map((card) => {
        if (card.id === next.id) return next
        const related = new Set(card.relatedCardIds)
        if (next.relatedCardIds.includes(card.id)) related.add(next.id)
        else related.delete(next.id)
        return { ...card, relatedCardIds: [...related] }
      })); setSelectedCardId(next.id); notify('知识卡片已更新')
    } else {
      const next: KnowledgeCard = { ...draft, id: uid('card'), origin: 'manual', sortOrder: cards.filter((card) => card.bookId === draft.bookId).length, createdAt: updatedAt, updatedAt }
      setCards((current) => [next, ...current.map((card) => next.relatedCardIds.includes(card.id) ? { ...card, relatedCardIds: Array.from(new Set([...card.relatedCardIds, next.id])) } : card)]); setSelectedCardId(next.id); notify('知识卡片已保存')
    }
    setCardModal(null)
  }

  function deleteBook(book: Book) {
    if (!window.confirm(`删除《${book.title}》及其全部知识卡片？此操作无法撤销。`)) return
    const removed = new Set(cards.filter((card) => card.bookId === book.id).map((card) => card.id))
    setBooks((current) => current.filter((item) => item.id !== book.id))
    setCards((current) => current.filter((card) => card.bookId !== book.id).map((card) => ({ ...card, relatedCardIds: card.relatedCardIds.filter((id) => !removed.has(id)) })))
    setSelectedBookId(null); notify('书籍和关联卡片已删除')
  }

  function deleteCard(card: KnowledgeCard) {
    if (!window.confirm(`删除知识卡片「${card.title}」？`)) return
    setCards((current) => current.filter((item) => item.id !== card.id).map((item) => ({ ...item, relatedCardIds: item.relatedCardIds.filter((id) => id !== card.id) })))
    setSelectedCardId(null); notify('知识卡片已删除')
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 3, exportedAt: now(), books, cards, seededPdca: true }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `knowledge-garden-v3-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); notify('结构化知识库已导出')
  }

  function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => { try { const incoming = normalizeData(JSON.parse(String(reader.result))); if (!incoming) throw new Error(); if (window.confirm('导入 JSON 备份会覆盖当前本地知识库，是否继续？')) { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...incoming, version: 3 })); window.location.reload() } } catch { notify('导入失败：请选择知识花园导出的 JSON 备份') } finally { event.target.value = '' } }
    reader.readAsText(file)
  }

  function handleMarkdownFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => { try { setImportDraft(parseMarkdownDocument(String(reader.result))) } catch { notify('无法解析这份 Markdown，请确认文件编码为 UTF-8') } finally { event.target.value = '' } }
    reader.readAsText(file, 'utf-8')
  }

  function applyMarkdownImport(parsed: ParsedMarkdown, metadata: ImportMetadata, action: 'new' | 'update') {
    const createdAt = now(); const matched = books.find((book) => book.title.trim() === parsed.title.trim())
    if (action === 'update' && matched) {
      const staleIds = new Set(cards.filter((card) => card.bookId === matched.id && card.origin === 'imported').map((card) => card.id))
      const importedCards = parsed.cards.map((card) => ({ ...card, id: uid('card'), bookId: matched.id, createdAt, updatedAt: createdAt }))
      setBooks((current) => current.map((book) => book.id === matched.id ? { ...book, sourceText: parsed.sourceText, coreConclusion: parsed.coreConclusion, sections: parsed.sections, sources: parsed.sources, importFingerprint: parsed.fingerprint, importedAt: createdAt, updatedAt: createdAt } : book))
      setCards((current) => [...current.filter((card) => !(card.bookId === matched.id && card.origin === 'imported')).map((card) => ({ ...card, relatedCardIds: card.relatedCardIds.filter((id) => !staleIds.has(id)) })), ...importedCards])
      openBook(matched); notify(`已更新《${matched.title}》：保留了手动卡片和书籍元数据`)
    } else {
      const book: Book = { ...emptyBook(books.length), id: uid('book'), title: metadata.title.trim() || parsed.title, author: metadata.author.trim() || '未知作者', category: metadata.category.trim() || '未分类', status: metadata.status, rating: metadata.rating, color: metadata.color, cover: (metadata.title.trim() || parsed.title).slice(0, 1), sourceText: parsed.sourceText, coreConclusion: parsed.coreConclusion, sections: parsed.sections, sources: parsed.sources, importFingerprint: parsed.fingerprint, importedAt: createdAt, tags: metadata.tags, createdAt, updatedAt: createdAt }
      const importedCards = parsed.cards.map((card) => ({ ...card, id: uid('card'), bookId: book.id, createdAt, updatedAt: createdAt }))
      setBooks((current) => [book, ...current]); setCards((current) => [...importedCards, ...current]); openBook(book); setView('library'); notify(`已导入《${book.title}》和 ${importedCards.length} 张精选卡片`)
    }
    setImportDraft(null)
  }

  const nav: Array<[View, string, typeof Grid2X2]> = [['home', '知识大厅', Grid2X2], ['library', '我的书架', Library], ['cards', '知识卡片', NotebookPen], ['map', '知识地图', Network], ['assistant', '知识助手', Bot]]

  return <main className="app-shell kg-app">
    <aside className="sidebar kg-sidebar">
      <div className="brand"><span className="brand-mark"><BrainCircuit size={20} /></span><div><strong>我的第二大脑</strong><small>Personal Knowledge Garden</small></div></div>
      <nav>{nav.map(([id, label, Icon]) => <button className={view === id ? 'active' : ''} onClick={() => setView(id)} key={id}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button onClick={() => markdownInputRef.current?.click()}><FileInput size={17} /> 导入 Markdown</button><button onClick={exportData}><Download size={17} /> 导出备份</button><button onClick={() => jsonInputRef.current?.click()}><Upload size={17} /> 导入 JSON</button></div>
    </aside>
    <section className="main-content kg-main">
      <header className="topbar"><div className="searchbox"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索书籍、章节、知识卡片…" /></div><div className="top-actions"><button className="soft-button" onClick={() => markdownInputRef.current?.click()}><FilePlus2 size={17} /> 结构化导入</button><button className="primary-button" onClick={() => setBookModal('new')}><Plus size={18} /> 新建书籍</button></div></header>
      {view === 'home' && <HomePage books={books} cards={cards} onLibrary={() => setView('library')} onOpenBook={openBook} onOpenCard={openCard} />}
      {view === 'library' && <LibraryPage books={visibleBooks} cards={cards} activeBookId={activeBookId} setActiveBookId={setActiveBookId} onOpenBook={openBook} onNew={() => setBookModal('new')} />}
      {view === 'cards' && <CardsPage cards={visibleCards} books={books} onOpenCard={openCard} onNew={() => setCardModal('new')} />}
      {view === 'map' && <StructureMap books={books} cards={cards} activeBookId={activeBookId} setActiveBookId={setActiveBookId} onOpenBook={openBook} onOpenCard={openCard} />}
      {view === 'assistant' && <AssistantPage books={books} cards={cards} />}
    </section>
    <input ref={jsonInputRef} className="sr-only" type="file" accept="application/json,.json" onChange={importData} />
    <input ref={markdownInputRef} className="sr-only" type="file" accept=".md,text/markdown" onChange={handleMarkdownFile} />
    {selectedBook && <BookPanel key={`${selectedBook.id}-${archiveSectionId ?? 'overview'}`} book={selectedBook} cards={cards.filter((card) => card.bookId === selectedBook.id)} initialSectionId={archiveSectionId} onClose={() => setSelectedBookId(null)} onEdit={() => setBookModal(selectedBook)} onDelete={() => deleteBook(selectedBook)} onAddCard={(sectionId) => { setArchiveSectionId(sectionId); setCardModal('new') }} onAddSection={(section) => { const next = { ...selectedBook, sections: [...selectedBook.sections, section], updatedAt: now() }; setBooks((current) => current.map((book) => book.id === next.id ? next : book)); setArchiveSectionId(section.id); notify('章节已添加') }} onReimport={() => markdownInputRef.current?.click()} onOpenCard={openCard} />}
    {selectedCard && <CardPanel card={selectedCard} book={books.find((book) => book.id === selectedCard.bookId)} related={cards.filter((card) => selectedCard.relatedCardIds.includes(card.id))} onClose={() => setSelectedCardId(null)} onEdit={() => setCardModal(selectedCard)} onDelete={() => deleteCard(selectedCard)} onOpenCard={openCard} />}
    {bookModal && <BookModal book={bookModal === 'new' ? null : bookModal} onClose={() => setBookModal(null)} onSave={saveBook} onStructuredImport={() => { setBookModal(null); markdownInputRef.current?.click() }} />}
    {cardModal && <CardModal card={cardModal === 'new' ? null : cardModal} books={books} allCards={cards} defaultBookId={selectedBookId ?? undefined} defaultSectionId={archiveSectionId} onClose={() => setCardModal(null)} onSave={saveCard} />}
    {importDraft && <MarkdownImportModal parsed={importDraft} existingBook={books.find((book) => book.title.trim() === importDraft.title.trim())} onClose={() => setImportDraft(null)} onSave={applyMarkdownImport} />}
    {toast && <div className="toast"><Check size={17} /> {toast}</div>}
  </main>
}
type HomePageProps = { books: Book[]; cards: KnowledgeCard[]; onLibrary: () => void; onOpenBook: (book: Book) => void; onOpenCard: (card: KnowledgeCard) => void }
function HomePage({ books, cards, onLibrary, onOpenBook, onOpenCard }: HomePageProps) {
  const imported = books.filter((book) => book.sections.length).length
  const latest = cards.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4)
  return <div className="page kg-home">
    <section className="kg-foyer">
      <div className="kg-foyer-copy"><p className="eyebrow">PRIVATE LIBRARY · LOCAL FIRST</p><h1>让每一本读过的书，<em>成为可生长的知识。</em></h1><p>保留完整阅读档案，提炼可编辑的知识卡片，并在书籍结构图中持续建立你的第二大脑。</p><div className="hero-actions"><button className="primary-button" onClick={onLibrary}><Library size={18} /> 进入我的书架</button><span>{imported} 本结构化阅读档案</span></div></div>
      <div className="kg-foyer-shelves" aria-hidden="true"><span>阅读指南</span><span>精读笔记</span><span>完整解读</span><span>复用模板</span><span>知识地图</span></div>
    </section>
    <section className="kg-stat-grid"><Stat value={books.length} label="馆藏书籍" /><Stat value={cards.length} label="知识卡片" /><Stat value={books.reduce((total, book) => total + book.sections.length, 0)} label="阅读章节" /><Stat value={cards.filter((card) => card.origin === 'manual').length} label="个人补充" /></section>
    <section className="kg-section-heading"><div><p className="eyebrow">RECENTLY TENDED</p><h2>最近生长的知识</h2></div><button className="text-button" onClick={onLibrary}>查看书架 <ChevronRight size={16} /></button></section>
    <div className="kg-home-grid"><div className="kg-book-spotlight">{books.slice(0, 1).map((book) => <button className="kg-mini-spine" key={book.id} style={{ '--spine': book.color } as React.CSSProperties} onClick={() => onOpenBook(book)}><span>{book.title}</span><small>{book.author}</small></button>)}<div><p className="eyebrow">本周阅读档案</p><h3>{books[0]?.title ?? '从一本书开始'}</h3><p>{books[0]?.coreConclusion || '导入一份 Markdown 阅读笔记，开始创建你的结构化知识库。'}</p></div></div><div className="kg-recent-list">{latest.map((card) => <button key={card.id} onClick={() => onOpenCard(card)}><span className={`kind-pill kind-${card.kind}`}>{CARD_KIND_LABEL[card.kind]}</span><strong>{card.title}</strong><small>{books.find((book) => book.id === card.bookId)?.title}</small></button>)}</div></div>
  </div>
}
function Stat({ value, label }: { value: number; label: string }) { return <article className="kg-stat"><strong>{value}</strong><span>{label}</span></article> }

type LibraryProps = { books: Book[]; cards: KnowledgeCard[]; activeBookId: string; setActiveBookId: (id: string) => void; onOpenBook: (book: Book) => void; onNew: () => void }
function LibraryPage({ books, cards, activeBookId, setActiveBookId, onOpenBook, onNew }: LibraryProps) {
  const shelfRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null)
  const scroll = (amount: number) => shelfRef.current?.scrollBy({ left: amount, behavior: 'smooth' })
  const categories = ['all', ...Array.from(new Set(books.map((book) => book.category)))]
  return <div className="page kg-library">
    <section className="page-heading"><div><p className="eyebrow">PHYSICAL SHELF · {books.length} VOLUMES</p><h1>我的书架</h1><p>沿着木质书架慢慢找书。点击任意一本书，打开它的完整阅读档案。</p></div><button className="primary-button" onClick={onNew}><Plus size={18} /> 新建书籍</button></section>
    <div className="filterbar kg-filterbar"><button className={activeBookId === 'all' ? 'selected' : ''} onClick={() => setActiveBookId('all')}>全部藏书</button>{categories.slice(1).map((category) => <button className={activeBookId === category ? 'selected' : ''} key={category} onClick={() => setActiveBookId(activeBookId === category ? 'all' : category)}>{category}</button>)}</div>
    <section className="kg-shelf-stage"><div className="kg-shelf-lamp" /><div className="kg-shelf-caption"><span>当前陈列</span><strong>{books.length} 本书 · {cards.filter((card) => books.some((book) => book.id === card.bookId)).length} 张知识卡片</strong></div><button className="kg-shelf-arrow left" aria-label="向左翻阅书架" onClick={() => scroll(-520)}><ChevronLeft /></button><button className="kg-shelf-arrow right" aria-label="向右翻阅书架" onClick={() => scroll(520)}><ChevronRight /></button><div className="kg-shelf-viewport" ref={shelfRef} onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.currentTarget.scrollLeft += event.deltaY; event.preventDefault() } }} onPointerDown={(event) => { if ((event.target as HTMLElement).closest('.kg-book-spine')) return; drag.current = { startX: event.clientX, startScroll: event.currentTarget.scrollLeft, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { if (!drag.current) return; const moved = Math.abs(event.clientX - drag.current.startX) > 6; if (moved) drag.current.moved = true; if (moved) event.currentTarget.scrollLeft = drag.current.startScroll - (event.clientX - drag.current.startX) }} onPointerUp={(event) => { if (!drag.current) return; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); drag.current = null }}>
      <div className="kg-shelf-row">{books.map((book, index) => <button key={book.id} className="kg-book-spine" style={{ '--spine': book.color, '--height': `${168 + (index % 4) * 17}px`, '--delay': `${index * 20}ms` } as React.CSSProperties} onClick={(event) => { if (drag.current?.moved) { event.preventDefault(); return } onOpenBook(book) }} aria-label={`打开《${book.title}》阅读档案`}><span className="spine-rule" /><span className="spine-title">{book.title}</span><span className="spine-author">{book.author}</span><span className="spine-count">{cards.filter((card) => card.bookId === book.id).length} 卡</span></button>)}{!books.length && <div className="kg-empty-shelf"><BookOpen size={28} /><strong>书架正在等待第一本书</strong><button onClick={onNew}>添加书籍</button></div>}</div>
    </div><div className="kg-shelf-plank" /></section>
    <p className="kg-shelf-hint">拖动、滚动鼠标滚轮或使用箭头翻阅书架 · 悬停书脊即可查看提示</p>
  </div>
}

type CardsProps = { cards: KnowledgeCard[]; books: Book[]; onOpenCard: (card: KnowledgeCard) => void; onNew: () => void }
function CardsPage({ cards, books, onOpenCard, onNew }: CardsProps) {
  const [kind, setKind] = useState<CardKind | 'all'>('all')
  const [section, setSection] = useState('all')
  const visible = cards.filter((card) => (kind === 'all' || card.kind === kind) && (section === 'all' || card.sectionId === section))
  const sectionOptions = books.flatMap((book) => book.sections.map((item) => ({ ...item, bookTitle: book.title })))
  const groups = (Object.keys(CARD_KIND_LABEL) as CardKind[]).map((key) => [key, visible.filter((card) => card.kind === key)] as const).filter(([, group]) => group.length)
  return <div className="page kg-cards-page"><section className="page-heading"><div><p className="eyebrow">CURATED KNOWLEDGE CARDS</p><h1>知识卡片</h1><p>将读书笔记中的方法、观点、应用和反思，变成可以持续补充的知识资产。</p></div><button className="primary-button" onClick={onNew}><Plus size={18} /> 添加卡片</button></section><div className="card-filters"><div className="kind-filter"><button className={kind === 'all' ? 'selected' : ''} onClick={() => setKind('all')}>全部类型</button>{(Object.keys(CARD_KIND_LABEL) as CardKind[]).map((item) => <button key={item} className={kind === item ? 'selected' : ''} onClick={() => setKind(item)}>{CARD_KIND_LABEL[item]}</button>)}</div><label className="select-wrap"><span>所属章节</span><select value={section} onChange={(event) => setSection(event.target.value)}><option value="all">全部章节</option>{sectionOptions.map((item) => <option key={item.id} value={item.id}>{item.bookTitle} · {item.title}</option>)}</select></label></div><div className="card-groups">{groups.map(([groupKind, group]) => <section key={groupKind} className="card-group"><div className="card-group-heading"><span className={`kind-pill kind-${groupKind}`}>{CARD_KIND_LABEL[groupKind]}</span><strong>{group.length} 张</strong></div><div className="card-grid">{group.map((card) => <KnowledgeCardView key={card.id} card={card} book={books.find((book) => book.id === card.bookId)} onClick={() => onOpenCard(card)} />)}</div></section>)}{!visible.length && <div className="empty-state"><NotebookPen size={30} /><h3>这里还没有匹配的卡片</h3><p>尝试换一个筛选条件，或添加一张自由笔记。</p></div>}</div></div>
}
function KnowledgeCardView({ card, book, onClick }: { card: KnowledgeCard; book?: Book; onClick: () => void }) { return <button className="knowledge-card kg-knowledge-card" onClick={onClick}><span className={`kind-pill kind-${card.kind}`}>{CARD_KIND_LABEL[card.kind]}</span><h3>{card.title}</h3><p className="card-excerpt">{card.insight || card.excerpt}</p>{card.application && <p className="card-application"><Sparkles size={14} /> {card.application}</p>}<footer><span>{book?.title ?? '已删除书籍'}</span><span>{card.tags.slice(0, 2).join(' · ')}</span></footer></button> }

type MapProps = { books: Book[]; cards: KnowledgeCard[]; activeBookId: string; setActiveBookId: (id: string) => void; onOpenBook: (book: Book, sectionId?: string) => void; onOpenCard: (card: KnowledgeCard) => void }
function StructureMap({ books, cards, activeBookId, setActiveBookId, onOpenBook, onOpenCard }: MapProps) {
  const focus = books.find((book) => book.id === activeBookId) ?? books[0]
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [kind, setKind] = useState<CardKind | 'all'>('all')
  if (!focus) return <div className="page"><div className="empty-state"><Network size={30} /><h2>知识地图等待第一本书</h2></div></div>
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const relevant = cards.filter((card) => card.bookId === focus.id)
  const manualRelations = relevant.flatMap((card) => card.relatedCardIds.map((id) => ({ from: card, to: cards.find((item) => item.id === id) }))).filter((pair): pair is { from: KnowledgeCard; to: KnowledgeCard } => Boolean(pair.to))
  return <div className="page kg-map-page"><section className="page-heading"><div><p className="eyebrow">BOOK STRUCTURE MAP</p><h1>知识地图</h1><p>书籍是根，章节是枝，精选知识卡片是可以持续连接的叶子。</p></div><select className="map-book-select" value={focus.id} onChange={(event) => setActiveBookId(event.target.value)}>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></section><div className="map-toolbar"><div className="kind-filter"><button className={kind === 'all' ? 'selected' : ''} onClick={() => setKind('all')}>全部卡片</button>{(Object.keys(CARD_KIND_LABEL) as CardKind[]).map((item) => <button key={item} className={kind === item ? 'selected' : ''} onClick={() => setKind(item)}>{CARD_KIND_LABEL[item]}</button>)}</div><div><button className="soft-button" onClick={() => setExpanded(new Set(focus.sections.map((section) => section.id)))}>全部展开</button><button className="soft-button" onClick={() => setExpanded(new Set())}>收起</button></div></div><section className="structure-map-shell"><article className="map-root-node"><button onClick={() => onOpenBook(focus)}><BookOpen size={20} /><span>阅读档案</span><strong>《{focus.title}》</strong><small>{focus.sections.length} 个模块 · {relevant.length} 张卡片</small></button></article><div className="map-trunk" /><div className="map-section-grid">{focus.sections.map((section) => { const sectionCards = relevant.filter((card) => card.sectionId === section.id && (kind === 'all' || card.kind === kind)); const isOpen = expanded.has(section.id); return <article className={`map-section-node ${isOpen ? 'expanded' : ''}`} key={section.id}><div className="map-section-head"><button className="map-expand" aria-label={isOpen ? '收起章节' : '展开章节'} onClick={() => toggle(section.id)}><ChevronDown size={17} /></button><button onClick={() => onOpenBook(focus, section.id)}><span>{SECTION_KIND_LABEL[section.kind]}</span><strong>{section.title}</strong><small>{sectionCards.length} 张卡片</small></button></div>{isOpen && <div className="map-card-branch">{sectionCards.map((card) => <button className={`map-card-node kind-${card.kind}`} key={card.id} onClick={() => onOpenCard(card)}><span>{CARD_KIND_LABEL[card.kind]}</span>{card.title}</button>)}{!sectionCards.length && <small className="map-no-cards">本模块保留原始阅读内容</small>}</div>}</article> })}</div>{manualRelations.length > 0 && <section className="manual-relations"><h3><Link2 size={17} /> 手动双向关联</h3>{manualRelations.map(({ from, to }) => <button key={`${from.id}-${to.id}`} onClick={() => onOpenCard(from)}>{from.title}<span>······</span>{to.title}</button>)}</section>}</section></div>
}
function AssistantPage({ books, cards }: { books: Book[]; cards: KnowledgeCard[] }) {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const matches = asked ? cards.filter((card) => cardToText(card).includes(asked.toLowerCase().split(/\s+/).filter(Boolean).find((word) => word.length > 1) ?? '')).slice(0, 6) : cards.slice(0, 4)
  return <div className="page kg-assistant"><section className="page-heading"><div><p className="eyebrow">YOUR LOCAL KNOWLEDGE COMPANION</p><h1>知识助手</h1><p>无需服务器或外部 API。它先从你的本地阅读档案与卡片中为你找回线索。</p></div></section><section className="assistant-console"><div className="assistant-orb"><Bot size={28} /></div><h2>问问你的知识花园</h2><p>例如：我读过哪些关于目标管理的方法？</p><form onSubmit={(event) => { event.preventDefault(); setAsked(question) }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="输入一个主题、概念或问题…" /><button className="primary-button">检索</button></form>{asked && <div className="assistant-result"><p>我在 {books.length} 本书、{cards.length} 张卡片中找到了以下线索：</p>{matches.length ? matches.map((card) => <article key={card.id}><span className={`kind-pill kind-${card.kind}`}>{CARD_KIND_LABEL[card.kind]}</span><strong>{card.title}</strong><p>{card.insight || card.excerpt}</p></article>) : <p>暂未找到直接匹配。试试更具体的关键词，或为卡片补充标签和理解。</p>}</div>}</section></div>
}

type BookPanelProps = { book: Book; cards: KnowledgeCard[]; initialSectionId?: string; onClose: () => void; onEdit: () => void; onDelete: () => void; onAddCard: (sectionId?: string) => void; onAddSection: (section: BookSection) => void; onReimport: () => void; onOpenCard: (card: KnowledgeCard) => void }
function BookPanel({ book, cards, initialSectionId, onClose, onEdit, onDelete, onAddCard, onAddSection, onReimport, onOpenCard }: BookPanelProps) {
  const [tab, setTab] = useState(initialSectionId ?? 'overview')
  const [adding, setAdding] = useState(false)
  const section = book.sections.find((item) => item.id === tab)
  const saveSection = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get('title') ?? '').trim(); const body = String(form.get('body') ?? '').trim(); if (!title) return; onAddSection({ id: uid('section'), title, kind: 'other', level: 2, body, order: book.sections.length }); setAdding(false) }
  return <aside className="side-panel reading-panel" role="dialog" aria-modal="true" aria-label={`${book.title} 阅读档案`}><header className="panel-header"><button className="icon-button" onClick={onClose} aria-label="关闭阅读档案"><X size={20} /></button><div className="panel-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑书籍"><Pencil size={17} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除书籍"><Trash2 size={17} /></button></div></header><div className="archive-hero"><div className="archive-spine" style={{ '--spine': book.color } as React.CSSProperties}>{book.cover}</div><div><p className="eyebrow">STRUCTURED READING ARCHIVE</p><h2>《{book.title}》</h2><p>{book.author} · {book.category} · {BOOK_STATUS_LABEL[book.status]}</p><div className="archive-stats"><span>{book.rating || '—'} / 5 评分</span><span>{book.sections.length} 章节</span><span>{cards.length} 卡片</span></div></div></div>{book.coreConclusion && <blockquote className="core-conclusion"><span>核心结论</span>{book.coreConclusion}</blockquote>}<nav className="archive-tabs"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>概览</button>{book.sections.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{SECTION_KIND_LABEL[item.kind]}</button>)}</nav><div className="archive-actions"><button className="soft-button" onClick={() => onAddCard(section?.id)}><Plus size={16} /> 添加卡片</button><button className="soft-button" onClick={() => setAdding((value) => !value)}><FilePlus2 size={16} /> 添加章节</button><button className="soft-button" onClick={onReimport}><Upload size={16} /> 重新导入 Markdown</button></div><div className="archive-content">{adding && <form className="inline-section-form" onSubmit={saveSection}><input name="title" placeholder="章节标题" required /><textarea name="body" placeholder="可使用 Markdown 写入正文" rows={5} /><div><button className="soft-button" type="button" onClick={() => setAdding(false)}>取消</button><button className="primary-button">保存章节</button></div></form>}{tab === 'overview' ? <><section className="archive-overview"><h3>阅读档案概览</h3><p>{book.sourceText ? '这本书的原始 Markdown 已保留在本地。你可以浏览各模块、为任一章节补充卡片，或重新导入更新版本。' : '这本书还没有导入结构化 Markdown，可使用右上角“结构化导入”补全阅读档案。'}</p><dl><div><dt>标签</dt><dd>{book.tags.length ? book.tags.join(' · ') : '暂无标签'}</dd></div><div><dt>资料来源</dt><dd>{book.sources.length ? `${book.sources.length} 条已保存` : '暂无资料来源'}</dd></div><div><dt>导入时间</dt><dd>{book.importedAt ? new Date(book.importedAt).toLocaleDateString('zh-CN') : '手动创建'}</dd></div></dl></section><section className="archive-card-list"><h3>全部知识卡片</h3>{cards.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((card) => <button key={card.id} onClick={() => onOpenCard(card)}><span className={`kind-pill kind-${card.kind}`}>{CARD_KIND_LABEL[card.kind]}</span><strong>{card.title}</strong><ChevronRight size={16} /></button>)}</section></> : section ? <><div className="archive-section-title"><span>{SECTION_KIND_LABEL[section.kind]}</span><h3>{section.title}</h3></div><MarkdownContent content={section.body} />{section.kind === 'sources' && book.sources.length > 0 && <ul className="source-list">{book.sources.map((source, index) => <li key={index}>{source}</li>)}</ul>}<section className="archive-card-list"><h3>本章节的知识卡片</h3>{cards.filter((card) => card.sectionId === section.id).sort((a, b) => a.sortOrder - b.sortOrder).map((card) => <button key={card.id} onClick={() => onOpenCard(card)}><span className={`kind-pill kind-${card.kind}`}>{CARD_KIND_LABEL[card.kind]}</span><strong>{card.title}</strong><ChevronRight size={16} /></button>)}{!cards.some((card) => card.sectionId === section.id) && <p className="muted">此模块以完整阅读内容呈现；你可以按需添加自己的知识卡片。</p>}</section></> : null}</div></aside>
}

function CardPanel({ card, book, related, onClose, onEdit, onDelete, onOpenCard }: { card: KnowledgeCard; book?: Book; related: KnowledgeCard[]; onClose: () => void; onEdit: () => void; onDelete: () => void; onOpenCard: (card: KnowledgeCard) => void }) {
  const section = book?.sections.find((item) => item.id === card.sectionId)
  return <aside className="side-panel card-panel" role="dialog" aria-modal="true" aria-label={`${card.title} 卡片详情`}><header className="panel-header"><button className="icon-button" onClick={onClose} aria-label="关闭卡片"><X size={20} /></button><div className="panel-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑卡片"><Pencil size={17} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除卡片"><Trash2 size={17} /></button></div></header><div className="card-panel-content"><span className={`kind-pill kind-${card.kind}`}>{CARD_KIND_LABEL[card.kind]}</span><h2>{card.title}</h2><p className="card-source">《{book?.title ?? '已删除书籍'}》{section ? ` · ${section.title}` : ''}</p><CardBlock title="证据 / 原文" text={card.excerpt} /><CardBlock title="我的理解" text={card.insight} /><CardBlock title="行动应用" text={card.application} icon={<Sparkles size={15} />} /><div className="tag-row">{card.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>{related.length > 0 && <section className="related-cards"><h3><Link2 size={16} /> 关联卡片</h3>{related.map((item) => <button key={item.id} onClick={() => onOpenCard(item)}>{item.title}<ChevronRight size={16} /></button>)}</section>}</div></aside>
}
function CardBlock({ title, text, icon }: { title: string; text: string; icon?: ReactNode }) { if (!text) return null; return <section className="card-block"><h3>{icon}{title}</h3><p>{text}</p></section> }

type BookModalProps = { book: Book | null; onClose: () => void; onSave: (book: Omit<Book, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void; onStructuredImport: () => void }
function BookModal({ book, onClose, onSave, onStructuredImport }: BookModalProps) {
  const [color, setColor] = useState(book?.color ?? COLORS[0])
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ ...(book ? { id: book.id } : {}), title: String(form.get('title') ?? ''), author: String(form.get('author') ?? ''), category: String(form.get('category') ?? ''), status: String(form.get('status') ?? 'to-read') as BookStatus, rating: Number(form.get('rating') ?? 0), color, cover: book?.cover ?? String(form.get('title') ?? '').slice(0, 1), sourceText: book?.sourceText ?? '', coreConclusion: book?.coreConclusion ?? '', sections: book?.sections ?? [], sources: book?.sources ?? [], importFingerprint: book?.importFingerprint, importedAt: book?.importedAt, tags: String(form.get('tags') ?? '').split(/[，,]/).map((tag) => tag.trim()).filter(Boolean) }) }
  return <div className="overlay"><form className="modal kg-modal" onSubmit={submit}><header><div><p className="eyebrow">{book ? 'EDIT METADATA' : 'NEW VOLUME'}</p><h2>{book ? '编辑书籍' : '添加到书架'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></header>{!book && <button type="button" className="structured-import-callout" onClick={onStructuredImport}><FileInput size={20} /><span><strong>已有 Markdown 读书笔记？</strong>使用“结构化导入”可保留全文、自动创建章节和精选卡片。</span><ChevronRight size={18} /></button>}<div className="form-grid"><label>书名<input name="title" defaultValue={book?.title} required /></label><label>作者<input name="author" defaultValue={book?.author} /></label><label>分类<input name="category" defaultValue={book?.category} /></label><label>阅读状态<select name="status" defaultValue={book?.status ?? 'to-read'}>{(Object.keys(BOOK_STATUS_LABEL) as BookStatus[]).map((status) => <option key={status} value={status}>{BOOK_STATUS_LABEL[status]}</option>)}</select></label><label>评分<select name="rating" defaultValue={book?.rating ?? 0}>{[0, 1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating ? `${rating} / 5` : '未评分'}</option>)}</select></label><label>标签<input name="tags" defaultValue={book?.tags.join('，')} placeholder="管理，复盘，方法论" /></label></div><div className="color-picker"><span>书脊颜色</span>{COLORS.map((item) => <button type="button" aria-label={`选择书脊颜色 ${item}`} className={color === item ? 'selected' : ''} key={item} style={{ background: item }} onClick={() => setColor(item)} />)}</div><footer><button type="button" className="soft-button" onClick={onClose}>取消</button><button className="primary-button">保存书籍</button></footer></form></div>
}
type CardModalProps = { card: KnowledgeCard | null; books: Book[]; allCards: KnowledgeCard[]; defaultBookId?: string; defaultSectionId?: string; onClose: () => void; onSave: (card: Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void }
function CardModal({ card, books, allCards, defaultBookId, defaultSectionId, onClose, onSave }: CardModalProps) {
  const [bookId, setBookId] = useState(card?.bookId ?? defaultBookId ?? books[0]?.id ?? '')
  const [kind, setKind] = useState<CardKind>(card?.kind ?? 'note')
  const [sectionId, setSectionId] = useState(card?.sectionId ?? defaultSectionId ?? '')
  const [relations, setRelations] = useState<string[]>(card?.relatedCardIds ?? [])
  const sections = books.find((book) => book.id === bookId)?.sections ?? []
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ ...(card ? { id: card.id, origin: card.origin, sortOrder: card.sortOrder } : { origin: 'manual' as const, sortOrder: 0 }), bookId, title: String(form.get('title') ?? ''), category: CARD_KIND_LABEL[kind], kind, sectionId: sectionId || undefined, excerpt: String(form.get('excerpt') ?? ''), insight: String(form.get('insight') ?? ''), application: String(form.get('application') ?? ''), tags: String(form.get('tags') ?? '').split(/[，,]/).map((tag) => tag.trim()).filter(Boolean), importance: Number(form.get('importance') ?? 3), relatedCardIds: relations }) }
  return <div className="overlay"><form className="modal kg-modal card-modal-form" onSubmit={submit}><header><div><p className="eyebrow">{card?.origin === 'imported' ? 'IMPORTED · EDITABLE' : 'PERSONAL KNOWLEDGE'}</p><h2>{card ? '编辑知识卡片' : '添加知识卡片'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></header><div className="form-grid"><label>所属书籍<select value={bookId} onChange={(event) => { setBookId(event.target.value); setSectionId('') }}>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label><label>卡片类型<select value={kind} onChange={(event) => setKind(event.target.value as CardKind)}>{(Object.keys(CARD_KIND_LABEL) as CardKind[]).map((item) => <option value={item} key={item}>{CARD_KIND_LABEL[item]}</option>)}</select></label><label className="span-2">所属章节<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">独立 / 未归档</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label><label className="span-2">标题<input name="title" defaultValue={card?.title} required /></label><label className="span-2">证据 / 原文<textarea name="excerpt" rows={3} defaultValue={card?.excerpt} /></label><label className="span-2">我的理解<textarea name="insight" rows={4} defaultValue={card?.insight} /></label><label className="span-2">行动应用<textarea name="application" rows={3} defaultValue={card?.application} /></label><label>标签<input name="tags" defaultValue={card?.tags.join('，')} placeholder="复盘，目标管理" /></label><label>重要程度<select name="importance" defaultValue={card?.importance ?? 3}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label></div><div className="relation-picker"><span>手动关联（可跨书）</span><div className="relation-options">{allCards.filter((item) => item.id !== card?.id).slice(0, 16).map((item) => <label key={item.id}><input type="checkbox" checked={relations.includes(item.id)} onChange={() => setRelations((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /> <b>{item.title}</b><small>《{books.find((book) => book.id === item.bookId)?.title ?? '未知书籍'}》</small></label>)}</div><p>关联会以虚线显示在知识地图中；保存后仍可继续编辑。</p></div><footer><button type="button" className="soft-button" onClick={onClose}>取消</button><button className="primary-button">保存卡片</button></footer></form></div>
}

type ImportMetadata = { title: string; author: string; category: string; status: BookStatus; rating: number; tags: string[]; color: string }
type MarkdownImportProps = { parsed: ParsedMarkdown; existingBook?: Book; onClose: () => void; onSave: (parsed: ParsedMarkdown, metadata: ImportMetadata, action: 'new' | 'update') => void }
function MarkdownImportModal({ parsed, existingBook, onClose, onSave }: MarkdownImportProps) {
  const [color, setColor] = useState(existingBook?.color ?? COLORS[2])
  const [mode, setMode] = useState<'new' | 'update'>(existingBook ? 'update' : 'new')
  const distribution = (Object.keys(CARD_KIND_LABEL) as CardKind[]).map((kind) => [kind, parsed.cards.filter((card) => card.kind === kind).length] as const).filter(([, count]) => count)
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave(parsed, { title: String(form.get('title') ?? parsed.title), author: String(form.get('author') ?? ''), category: String(form.get('category') ?? ''), status: String(form.get('status') ?? 'to-read') as BookStatus, rating: Number(form.get('rating') ?? 0), tags: String(form.get('tags') ?? '').split(/[，,]/).map((tag) => tag.trim()).filter(Boolean), color }, mode) }
  return <div className="overlay"><form className="modal markdown-import-modal" onSubmit={submit}><header><div><p className="eyebrow">STRUCTURED MARKDOWN IMPORT</p><h2>确认阅读档案</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></header><section className="import-summary"><div><span>识别书名</span><strong>《{parsed.title}》</strong></div><div><span>内容模块</span><strong>{parsed.sections.length} 个</strong></div><div><span>精选卡片</span><strong>{parsed.cards.length} 张</strong></div><div><span>资料来源</span><strong>{parsed.sources.length} 条</strong></div></section><section className="import-distribution"><h3>卡片类型分布</h3><div>{distribution.map(([kind, count]) => <span key={kind} className={`kind-pill kind-${kind}`}>{CARD_KIND_LABEL[kind]} {count}</span>)}</div>{parsed.unmatchedHeadings.length > 0 && <p>其余 {parsed.unmatchedHeadings.length} 个标题将保留在阅读档案中，不会机械拆成卡片。</p>}</section>{existingBook && <section className="duplicate-import"><strong>检测到同名书籍《{existingBook.title}》</strong><p>更新会替换本次 Markdown 导入的章节和卡片，保留网站中手动添加的卡片、阅读状态、评分、标签和书脊颜色。</p><div><label><input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} /> 更新现有书籍</label><label><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> 另存为新书</label></div></section>}<div className="form-grid"><label>书名<input name="title" defaultValue={parsed.title} required disabled={mode === 'update'} /></label><label>作者<input name="author" defaultValue={existingBook?.author ?? (parsed.title === '高效PDCA工作术' ? '富田和成' : '')} disabled={mode === 'update'} /></label><label>分类<input name="category" defaultValue={existingBook?.category ?? ''} disabled={mode === 'update'} /></label><label>阅读状态<select name="status" defaultValue={existingBook?.status ?? 'to-read'} disabled={mode === 'update'}>{(Object.keys(BOOK_STATUS_LABEL) as BookStatus[]).map((status) => <option key={status} value={status}>{BOOK_STATUS_LABEL[status]}</option>)}</select></label><label>评分<select name="rating" defaultValue={existingBook?.rating ?? 0} disabled={mode === 'update'}>{[0,1,2,3,4,5].map((rating) => <option key={rating} value={rating}>{rating ? `${rating} / 5` : '未评分'}</option>)}</select></label><label>标签<input name="tags" defaultValue={existingBook?.tags.join('，') ?? ''} disabled={mode === 'update'} /></label></div>{mode === 'new' && <div className="color-picker"><span>书脊颜色</span>{COLORS.map((item) => <button type="button" aria-label={`选择书脊颜色 ${item}`} className={color === item ? 'selected' : ''} key={item} style={{ background: item }} onClick={() => setColor(item)} />)}</div>}<footer><button type="button" className="soft-button" onClick={onClose}>取消</button><button className="primary-button">{mode === 'update' ? '更新现有书籍' : '创建结构化书籍'}</button></footer></form></div>
}
