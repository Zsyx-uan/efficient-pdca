import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  ArrowLeft, ArrowUpRight, BookOpen, Bot, BrainCircuit, Check, ChevronLeft, ChevronRight, Download,
  FileInput, FilePlus2, Grid2X2, Library, Link2, Network, NotebookPen, Pencil, Plus,
  Search, Sparkles, Trash2, Upload, X,
} from 'lucide-react'
import './App.css'

type View = 'home' | 'library' | 'cards' | 'map' | 'assistant'
type BookStatus = 'to-read' | 'reading' | 'done'
type Book = {
  id: string; title: string; author: string; category: string; status: BookStatus; rating: number
  color: string; cover: string; sourceText: string; createdAt: string; updatedAt: string
}
type KnowledgeCard = {
  id: string; bookId: string; title: string; category: string; excerpt: string; insight: string
  application: string; tags: string[]; importance: number; relatedCardIds: string[]; createdAt: string; updatedAt: string
}
type GardenData = { version: 2; books: Book[]; cards: KnowledgeCard[] }

const STORAGE_KEY = 'knowledge-garden-v2'
const COLORS = ['#9eb0f0', '#e99b88', '#acd6bb', '#eccb85', '#92c9d8', '#c3a9d5']
const now = () => new Date().toISOString()
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

const sampleData = (): GardenData => {
  const createdAt = now()
  const books: Book[] = [
    { id: 'naval', title: '纳瓦尔宝典', author: '埃里克·乔根森', category: '自我成长', status: 'done', rating: 5, color: COLORS[0], cover: 'N', sourceText: '', createdAt, updatedAt: createdAt },
    { id: 'positioning', title: '定位', author: '艾·里斯 / 杰克·特劳特', category: '商业', status: 'done', rating: 5, color: COLORS[1], cover: '定', sourceText: '', createdAt, updatedAt: createdAt },
    { id: 'principles', title: '原则', author: '瑞·达利欧', category: '管理', status: 'done', rating: 4, color: COLORS[2], cover: '原', sourceText: '', createdAt, updatedAt: createdAt },
  ]
  const cards: KnowledgeCard[] = [
    { id: 'compound', bookId: 'naval', title: '复利效应', category: '财富创造', excerpt: '财富不是你劳动时赚到的钱，而是睡觉时仍在为你工作的资产。', insight: '真正值得投入的是那些能长期积累、可复制且不依赖单次努力的事情。', application: '建立内容、产品与关系等可持续增长的资产，而非只追求一次性结果。', tags: ['长期主义', '财富', '杠杆'], importance: 5, relatedCardIds: ['mindshare'], createdAt, updatedAt: createdAt },
    { id: 'specific', bookId: 'naval', title: '特定知识', category: '财富创造', excerpt: '找到你独特的知识组合：它往往不是课堂里最容易教授的部分。', insight: '优势来自兴趣、天赋、经历和判断力的交集，而非和所有人竞争同一种标准技能。', application: '盘点自己反复被请教、做起来有能量的领域，持续公开表达。', tags: ['能力', '职业', '差异化'], importance: 5, relatedCardIds: ['compound'], createdAt, updatedAt: createdAt },
    { id: 'mindshare', bookId: 'positioning', title: '用户心智', category: '品牌定位', excerpt: '营销的战场不在产品中，而在潜在顾客的心智中。', insight: '品牌不是自我定义，而是用户在某个需求出现时首先想起你的理由。', application: '为产品选择一个清晰、聚焦、可验证的品类词，并在每次沟通中重复它。', tags: ['品牌', '营销', '定位'], importance: 5, relatedCardIds: ['compound'], createdAt, updatedAt: createdAt },
    { id: 'believability', bookId: 'principles', title: '可信度加权决策', category: '决策系统', excerpt: '不要只听声音最大的观点，应让更可信的人拥有更大的决策权重。', application: '在项目复盘中记录预测、依据和结果，为领域专家逐步建立可信度档案。', insight: '高质量决策来自观点多样性与可追溯的判断记录，而不是权威压制。', tags: ['决策', '管理', '复盘'], importance: 4, relatedCardIds: [], createdAt, updatedAt: createdAt },
  ]
  return { version: 2, books, cards }
}

function readData(): GardenData {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')
    if (raw?.books && raw?.cards) {
      const books = raw.books.map((book: Partial<Book>, index: number): Book => ({
        id: book.id ?? uid('book'), title: book.title ?? '未命名书籍', author: book.author ?? '未知作者', category: book.category ?? '未分类',
        status: book.status ?? ((book as Partial<Book> & { progress?: number }).progress === 100 ? 'done' : 'reading'), rating: Number(book.rating ?? 0), color: book.color ?? COLORS[index % COLORS.length],
        cover: book.cover ?? (book.title?.slice(0, 1) || '书'), sourceText: book.sourceText ?? '', createdAt: book.createdAt ?? now(), updatedAt: book.updatedAt ?? now(),
      }))
      const cards = raw.cards.map((card: Partial<KnowledgeCard>): KnowledgeCard => ({
        id: card.id ?? uid('card'), bookId: card.bookId ?? books[0]?.id ?? '', title: card.title ?? '未命名卡片', category: card.category ?? '我的思考',
        excerpt: card.excerpt ?? '', insight: card.insight ?? '', application: card.application ?? '', tags: card.tags ?? [], importance: Number(card.importance ?? 3),
        relatedCardIds: card.relatedCardIds ?? [], createdAt: card.createdAt ?? now(), updatedAt: card.updatedAt ?? now(),
      }))
      return { version: 2, books, cards }
    }
  } catch { /* create a clean starter library */ }
  return sampleData()
}

function makeCardsFromText(bookId: string, text: string): KnowledgeCard[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n').trim()
  if (!normalized) return []

  const blocks = normalized
    .split(/\n{2,}|(?<=[。！？!?；;])\s*/)
    .map((item) => item.replace(/^[-*#\d.、\s]+/, '').trim())
    .filter(Boolean)
    .flatMap((item) => item.length <= 360 ? [item] : item.match(/.{1,360}(?:[。！？!?；;]|$)/g) ?? [item])
    .filter((item) => item.length >= 12)
    .slice(0, 12)

  const sourceBlocks = blocks.length ? blocks : [normalized.slice(0, 360)]
  const createdAt = now()
  return sourceBlocks.map((block, index) => {
    const title = block.replace(/[。！？!?；;].*/, '').slice(0, 22) || `导入观点 ${index + 1}`
    return { id: uid('card'), bookId, title, category: '导入内容', excerpt: block, insight: '待补充：这段内容对我意味着什么？', application: '待补充：我将在哪个真实场景里验证它？', tags: ['待整理'], importance: 3, relatedCardIds: [], createdAt, updatedAt: createdAt }
  })
}

export default function App() {
  const initial = useMemo(() => readData(), [])
  const [books, setBooks] = useState<Book[]>(initial.books)
  const [cards, setCards] = useState<KnowledgeCard[]>(initial.cards)
  const [view, setView] = useState<View>('home')
  const [query, setQuery] = useState('')
  const [activeBookId, setActiveBookId] = useState('all')
  const [bookModal, setBookModal] = useState<Book | 'new' | null>(null)
  const [cardModal, setCardModal] = useState<KnowledgeCard | 'new' | null>(null)
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [selectedCard, setSelectedCard] = useState<KnowledgeCard | null>(null)
  const [assistantQuestion, setAssistantQuestion] = useState('')
  const [toast, setToast] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, books, cards })) }, [books, cards])
  const bookById = (id: string) => books.find((book) => book.id === id)
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }
  const cardCount = (bookId: string) => cards.filter((card) => card.bookId === bookId).length

  const filteredBooks = books.filter((book) => `${book.title} ${book.author} ${book.category}`.toLowerCase().includes(query.toLowerCase()) && (activeBookId === 'all' || activeBookId === book.id))
  const filteredCards = cards.filter((card) => `${card.title} ${card.category} ${card.excerpt} ${card.insight} ${card.tags.join(' ')} ${bookById(card.bookId)?.title ?? ''}`.toLowerCase().includes(query.toLowerCase()) && (activeBookId === 'all' || activeBookId === card.bookId))

  function saveBook(draft: Omit<Book, 'id' | 'color' | 'cover' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    if (draft.id) {
      const { id, ...changes } = draft
      const updatedAt = now()
      setBooks((current) => current.map((book) => book.id === id ? { ...book, ...changes, updatedAt } : book))
      setSelectedBook((book) => book?.id === id ? { ...book, ...changes, updatedAt } : book)
      notify('书籍信息已更新')
    } else {
      const id = uid('book')
      const book: Book = { ...draft, id, color: COLORS[books.length % COLORS.length], cover: draft.title.slice(0, 1), createdAt: now(), updatedAt: now() }
      setBooks((current) => [book, ...current])
      if (draft.sourceText.trim()) {
        const generated = makeCardsFromText(id, draft.sourceText)
        setCards((current) => [...generated, ...current])
        notify(`书籍已导入，并生成 ${generated.length} 张待整理卡片`)
      } else notify('书籍已加入书架')
      setSelectedBook(book)
      setView('library')
    }
    setBookModal(null)
  }

  function openNewCard() {
    if (!books.length) { notify('请先创建一本书，再添加知识卡片'); setBookModal('new'); return }
    setCardModal('new')
  }

  function deleteBook(book: Book) {
    if (!window.confirm(`删除《${book.title}》以及其全部知识卡片？此操作无法撤销。`)) return
    const removedCardIds = cards.filter((card) => card.bookId === book.id).map((card) => card.id)
    setBooks((current) => current.filter((item) => item.id !== book.id))
    setCards((current) => current.filter((card) => card.bookId !== book.id).map((card) => ({ ...card, relatedCardIds: card.relatedCardIds.filter((id) => !removedCardIds.includes(id)) })))
    setSelectedBook(null); setActiveBookId('all'); notify('书籍及其卡片已删除')
  }

  function saveCard(draft: Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    if (!draft.title.trim() || !draft.bookId) return
    if (draft.id) {
      const next = { ...draft, updatedAt: now() } as KnowledgeCard
      setCards((current) => current.map((card) => card.id === draft.id ? next : card))
      setSelectedCard(next); notify('知识卡片已更新')
    } else {
      const next: KnowledgeCard = { ...draft, id: uid('card'), createdAt: now(), updatedAt: now() }
      setCards((current) => [next, ...current]); setSelectedCard(next); notify('知识卡片已保存')
    }
    setCardModal(null)
  }

  function deleteCard(card: KnowledgeCard) {
    if (!window.confirm(`删除知识卡片「${card.title}」？`)) return
    setCards((current) => current.filter((item) => item.id !== card.id).map((item) => ({ ...item, relatedCardIds: item.relatedCardIds.filter((id) => id !== card.id) })))
    setSelectedCard(null); notify('知识卡片已删除')
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: now(), books, cards }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a')
    link.href = url; link.download = `knowledge-garden-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); notify('知识库备份已下载')
  }

  function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => { try { const data = JSON.parse(String(reader.result)); if (!Array.isArray(data.books) || !Array.isArray(data.cards)) throw new Error(); if (window.confirm('导入会覆盖当前浏览器中的全部知识库，是否继续？')) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.reload() } } catch { notify('导入失败：请选择由知识花园导出的 JSON 备份') } finally { event.target.value = '' } }
    reader.readAsText(file)
  }

  const nav: Array<[View, string, typeof Grid2X2]> = [['home', '知识大厅', Grid2X2], ['library', '我的书架', Library], ['cards', '知识卡片', NotebookPen], ['map', '知识地图', Network], ['assistant', '知识助手', Bot]]

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><BrainCircuit size={20} /></span><span>知知<b>KNOWLEDGE GARDEN</b></span></div>
      <nav>{nav.map(([id, label, Icon]) => <button key={id} className={`nav-item ${view === id ? 'is-active' : ''}`} onClick={() => setView(id)}><Icon size={18} />{label}</button>)}</nav>
      <hr /><p className="side-label">当前知识库</p><div className="library-summary"><span><BookOpen size={15} />{books.length} 本书</span><span><NotebookPen size={15} />{cards.length} 张卡片</span><span><Link2 size={15} />{cards.reduce((sum, card) => sum + card.relatedCardIds.length, 0)} 个连接</span></div>
      <div className="side-bottom"><button className="backup" onClick={exportData}><Download size={16} /><span><b>下载知识库备份</b><small>JSON · 可随时导入恢复</small></span></button><button className="backup" onClick={() => importRef.current?.click()}><Upload size={16} /><span><b>导入知识库备份</b><small>会覆盖当前浏览器数据</small></span></button></div>
    </aside>
    <section className="main"><header><div className="mobile-brand"><BrainCircuit size={20} />知知</div><label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索书籍、卡片、标签或内容…" /><kbd>⌘ K</kbd></label><div className="header-actions"><button className="outline compact" onClick={() => importRef.current?.click()}><FileInput size={16} />导入</button><button className="add" onClick={() => setBookModal('new')}><Plus size={17} />新书</button></div></header>
      <div className="page">
        {view === 'home' && <Home books={books} cards={cards} openCard={setSelectedCard} openBook={setSelectedBook} createCard={openNewCard} changeView={setView} />}
        {view === 'library' && <LibraryPage books={filteredBooks} allBooks={books} activeBookId={activeBookId} cardCount={cardCount} selectFilter={setActiveBookId} openBook={setSelectedBook} addBook={() => setBookModal('new')} />}
        {view === 'cards' && <CardsPage cards={filteredCards} books={books} openCard={setSelectedCard} addCard={openNewCard} />}
        {view === 'map' && <MapPage cards={cards} books={books} openCard={setSelectedCard} />}
        {view === 'assistant' && <AssistantPage question={assistantQuestion} setQuestion={setAssistantQuestion} cards={cards} books={books} openCard={setSelectedCard} />}
      </div>
    </section>
    <input ref={importRef} className="hidden" type="file" accept="application/json,.json" onChange={importData} />
    {selectedBook && <BookPanel book={selectedBook} cards={cards.filter((card) => card.bookId === selectedBook.id)} onClose={() => setSelectedBook(null)} onEdit={() => setBookModal(selectedBook)} onDelete={() => deleteBook(selectedBook)} onOpenCard={setSelectedCard} onAddCard={openNewCard} />}
    {selectedCard && <CardPanel card={selectedCard} book={bookById(selectedCard.bookId)} related={cards.filter((item) => selectedCard.relatedCardIds.includes(item.id))} onClose={() => setSelectedCard(null)} onEdit={() => setCardModal(selectedCard)} onDelete={() => deleteCard(selectedCard)} onOpenCard={setSelectedCard} />}
    {bookModal && <BookModal book={bookModal === 'new' ? undefined : bookModal} onClose={() => setBookModal(null)} onSave={saveBook} />}
    {cardModal && <CardModal card={cardModal === 'new' ? undefined : cardModal} books={books} allCards={cards} onClose={() => setCardModal(null)} onSave={saveCard} />}
    {toast && <div className="toast"><Check size={15} />{toast}</div>}
  </main>
}
function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{description}</p></div>{action}</div>
}
function StatusLabel({ status }: { status: BookStatus }) { const label: Record<BookStatus, string> = { 'to-read': '想读', reading: '在读', done: '已读' }; return <span className={`status status-${status}`}>{label[status]}</span> }
function ShelfBook({ book, index, onOpen, compact = false }: { book: Book; index: number; onOpen: () => void; compact?: boolean }) {
  const widths = [52, 64, 58, 72, 55]
  const heights = [216, 238, 225, 246, 231]
  return <button className={`shelf-book ${compact ? 'shelf-book-compact' : ''}`} onClick={onOpen} title={`打开《${book.title}》`} style={{ '--book-color': book.color, '--spine-width': `${widths[index % widths.length]}px`, '--spine-height': `${heights[index % heights.length]}px` } as React.CSSProperties}>
    <span className="shelf-book-pages" aria-hidden="true" /><span className="shelf-book-spine"><i aria-hidden="true" /><em>{book.category}</em><strong>{book.title}</strong><small>{book.author}</small></span>
  </button>
}

function ShelfRow({ books, offset, cardCount, openBook }: { books: Book[]; offset: number; cardCount: (id: string) => number; openBook: (book: Book) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; startX: number; startScroll: number } | null>(null)
  const move = (direction: number) => trackRef.current?.scrollBy({ left: direction * 360, behavior: 'smooth' })
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); event.currentTarget.scrollLeft += event.deltaY } }
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest('.shelf-book')) return; drag.current = { pointerId: event.pointerId, startX: event.clientX, startScroll: event.currentTarget.scrollLeft }; event.currentTarget.setPointerCapture(event.pointerId) }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => { if (drag.current?.pointerId === event.pointerId) event.currentTarget.scrollLeft = drag.current.startScroll - (event.clientX - drag.current.startX) }
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => { if (drag.current?.pointerId === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) } }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) } if (event.key === 'ArrowRight') { event.preventDefault(); move(1) } }
  return <article className="library-shelf-row"><div className="shelf-row-top"><div><span>CURATED SHELF</span><b>{books.length} 本藏书 · {books.reduce((sum, book) => sum + cardCount(book.id), 0)} 张卡片</b></div><div className="shelf-controls"><button aria-label="向左翻阅本层书架" onClick={() => move(-1)}><ChevronLeft size={17} /></button><button aria-label="向右翻阅本层书架" onClick={() => move(1)}><ChevronRight size={17} /></button></div></div><div className="shelf-track" ref={trackRef} role="region" tabIndex={0} aria-label="本层书架：可拖动、滚轮横向浏览，或用左右方向键翻阅" onKeyDown={onKeyDown} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>{books.map((book, index) => <ShelfBook key={book.id} book={book} index={index + offset} onOpen={() => openBook(book)} />)}</div><div className="shelf-plank" aria-hidden="true" /></article>
}

function Home({ books, cards, openCard, openBook, createCard, changeView }: { books: Book[]; cards: KnowledgeCard[]; openCard: (card: KnowledgeCard) => void; openBook: (book: Book) => void; createCard: () => void; changeView: (view: View) => void }) {
  const featured = cards[0]
  const links = cards.reduce((sum, card) => sum + card.relatedCardIds.length, 0)
  return <><section className="library-foyer"><img src="./assets/private-library.webp" alt="一间无人物的现代私人图书馆" /><div className="foyer-veil" /><div className="foyer-content"><div className="foyer-intro"><p className="eyebrow">PRIVATE LIBRARY · KNOWLEDGE GARDEN</p><h1>欢迎来到你的<br />私人图书馆。</h1><p>把读过的书、亲手写下的理解和未完成的思考，安放在一个会持续生长的空间里。</p><div className="foyer-actions"><button className="add" onClick={() => changeView('library')}>进入我的书架 <ChevronRight size={17} /></button><button className="glass-button" onClick={createCard}><FilePlus2 size={16} />记录一个想法</button></div></div><div className="foyer-metrics"><span><b>{books.length}</b><small>本藏书</small></span><span><b>{cards.length}</b><small>张知识卡片</small></span><span><b>{links}</b><small>条关联</small></span></div>{featured && <button className="foyer-featured" onClick={() => openCard(featured)}><span>RECENT NOTE</span><strong>{featured.title}</strong><p>{featured.insight || featured.excerpt}</p><i>打开知识卡片 <ArrowUpRight size={14} /></i></button>}</div></section><section className="foyer-lower"><article><p className="eyebrow">HOW IT GROWS</p><h2>每一本书，都是一扇可以再进入的门。</h2><p>导入读书笔记，提炼成知识卡片，再把它们与已有观点连接起来。</p></article><article className="foyer-lower-action"><span><Sparkles size={21} /></span><div><b>开始整理下一本书</b><p>新建书籍后即可粘贴文字或导入 TXT / Markdown。</p></div><button className="text-button" onClick={() => changeView('library')}>去书架 <ChevronRight size={16} /></button></article></section><section className="section-heading"><div><h2>书架导览</h2><p>沿着书脊寻找下一本想重新打开的书。</p></div><button className="text-button" onClick={() => changeView('library')}>查看全部 <ChevronRight size={17} /></button></section>{books.length ? <ShelfRow books={books.slice(0, 8)} offset={0} cardCount={(id) => cards.filter((card) => card.bookId === id).length} openBook={openBook} /> : <Empty icon={<Library />} title="书架还在等待第一本书" description="从右上角添加一本书，开始建立你的私人图书馆。" />}</>
}

function LibraryPage({ books, allBooks, activeBookId, cardCount, selectFilter, openBook, addBook }: { books: Book[]; allBooks: Book[]; activeBookId: string; cardCount: (id: string) => number; selectFilter: (id: string) => void; openBook: (book: Book) => void; addBook: () => void }) {
  const shelfCapacity = 16
  const shelves = Array.from({ length: Math.ceil(books.length / shelfCapacity) }, (_, index) => books.slice(index * shelfCapacity, index * shelfCapacity + shelfCapacity))
  return <><PageTitle eyebrow="MY LIBRARY" title="我的书架" description="沿着书脊慢慢找书，点击任意一本，即可重新进入它的知识空间。" action={<button className="add" onClick={addBook}><Plus size={16} />添加书籍</button>} /><div className="filterbar library-filterbar"><button className={activeBookId === 'all' ? 'active' : ''} onClick={() => selectFilter('all')}>全部 <span>{allBooks.length}</span></button>{allBooks.map((book) => <button className={activeBookId === book.id ? 'active' : ''} onClick={() => selectFilter(book.id)} key={book.id}>{book.title}</button>)}</div>{books.length ? <section className="library-gallery"><div className="library-gallery-intro"><p>PRIVATE COLLECTION</p><h2>为思考保留一间安静的藏书室。</h2><span>选择一层书架，慢慢翻阅；每一个书脊都通向你的笔记、理解和关联。</span></div><div className="library-shelves">{shelves.map((shelf, index) => <ShelfRow key={`${activeBookId}-${index}`} books={shelf} offset={index * shelfCapacity} cardCount={cardCount} openBook={openBook} />)}</div></section> : <Empty icon={<Search />} title="没有匹配的书籍" description="换个关键词，或从右上角添加一本新书。" />}</>
}

function CardsPage({ cards, books, openCard, addCard }: { cards: KnowledgeCard[]; books: Book[]; openCard: (card: KnowledgeCard) => void; addCard: () => void }) {
  return <><PageTitle eyebrow="KNOWLEDGE CARDS" title="知识卡片" description="每张卡片都支持完整编辑、标签、来源、应用场景和双向关联。" action={<button className="add" onClick={addCard}><Plus size={16} />新建卡片</button>} />{cards.length ? <div className="card-grid">{cards.map((card, index) => <button className={`knowledge-card card-tint-${index % 4}`} key={card.id} onClick={() => openCard(card)}><div className="card-topline"><span>{card.category}</span><b>{'✦'.repeat(card.importance)}</b></div><h2>{card.title}</h2><blockquote>“{card.excerpt || '未填写原文摘录'}”</blockquote><p>{card.insight || '未填写个人理解'}</p><div className="card-tags">{card.tags.map((tag) => <i key={tag}>#{tag}</i>)}</div><footer><BookOpen size={14} />《{books.find((book) => book.id === card.bookId)?.title ?? '未关联书籍'}》<span>{card.relatedCardIds.length} 个关联</span></footer></button>)}</div> : <Empty icon={<NotebookPen />} title="还没有知识卡片" description="先创建一张卡片，或在添加书籍时导入 TXT / Markdown。" />}</>
}

function MapPage({ cards, books, openCard }: { cards: KnowledgeCard[]; books: Book[]; openCard: (card: KnowledgeCard) => void }) {
  const nodes = cards.slice(0, 12)
  const links = nodes.flatMap((card) => card.relatedCardIds.filter((id) => nodes.some((node) => node.id === id)).map((id) => [card.id, id] as const)).filter(([from, to]) => from < to)
  const positions = nodes.map((_, index) => { const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2; return { x: 50 + Math.cos(angle) * 37, y: 50 + Math.sin(angle) * 37 } })
  const pos = (id: string) => positions[nodes.findIndex((node) => node.id === id)]
  return <><PageTitle eyebrow="KNOWLEDGE GRAPH" title="知识地图" description="这里显示你在卡片编辑器里创建的真实关联，不再是演示数据。" />{nodes.length ? <section className="map-layout"><div className="map-canvas"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{links.map(([from, to]) => { const a = pos(from); const b = pos(to); return a && b ? <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null })}</svg>{nodes.map((card, index) => <button key={card.id} className="map-node" style={{ left: `${positions[index].x}%`, top: `${positions[index].y}%` }} onClick={() => openCard(card)}><span>{card.relatedCardIds.length}</span><b>{card.title}</b><small>《{books.find((book) => book.id === card.bookId)?.title}》</small></button>)}</div><aside className="map-sidebar"><p className="overline">真实关系</p><h2>{links.length} 条连接</h2><p>在卡片编辑器中勾选“关联卡片”即可建立连接。知识地图会立即根据你的数据重绘。</p><div className="tag-summary">{Array.from(new Set(cards.flatMap((card) => card.tags))).slice(0, 8).map((tag) => <span key={tag}>#{tag}</span>)}</div></aside></section> : <Empty icon={<Network />} title="知识地图等待第一条连接" description="创建两张卡片后，在编辑器中互相关联即可看到节点和连线。" />}</>
}
function AssistantPage({ question, setQuestion, cards, books, openCard }: { question: string; setQuestion: (question: string) => void; cards: KnowledgeCard[]; books: Book[]; openCard: (card: KnowledgeCard) => void }) {
  const [asked, setAsked] = useState(false)
  const results = useMemo(() => {
    const normalized = question.trim().toLowerCase()
    if (!normalized) return []
    const tokens = Array.from(new Set([normalized, ...normalized.split(/[\s，。；、,./!?？]+/).filter((token) => token.length > 1), ...Array.from({ length: Math.max(0, normalized.length - 1) }, (_, index) => normalized.slice(index, index + 2))]))
    return cards.map((card) => {
      const text = `${card.title} ${card.category} ${card.excerpt} ${card.insight} ${card.application} ${card.tags.join(' ')}`.toLowerCase()
      const score = tokens.reduce((sum, token) => sum + (text.includes(token) ? (card.title.toLowerCase().includes(token) ? 5 : card.tags.join(' ').toLowerCase().includes(token) ? 4 : 1) : 0), 0)
      return { card, score }
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6)
  }, [question, cards])
  const prompts = ['找出所有和长期主义有关的观点', '我读过哪些关于品牌建设的方法？', '总结我知识库里的创业原则']
  return <><PageTitle eyebrow="LOCAL KNOWLEDGE RETRIEVAL" title="在自己的知识库中检索。" description="这是浏览器内的真实内容检索：不会把你的笔记发送到任何第三方。" />
    <section className="assistant-shell"><div className="assistant-intro"><span><Bot size={27} /></span><h2>本地知识助手</h2><p>输入一个问题，它会按标题、标签、原文、理解和应用场景搜索你的卡片。</p><div>{prompts.map((prompt) => <button key={prompt} onClick={() => { setQuestion(prompt); setAsked(true) }}><Sparkles size={13} />{prompt}</button>)}</div></div>
      {asked && <article className="assistant-answer"><b><Bot size={15} />检索结果 · {results.length} 张卡片</b>{results.length ? <><p>以下结果按与你问题的匹配程度排序。它们是你的原始记录，而非虚构的 AI 总结。</p><div className="answer-results">{results.map(({ card, score }) => <button key={card.id} onClick={() => openCard(card)}><span>{score}</span><div><strong>{card.title}</strong><p>{card.insight || card.excerpt}</p><small>《{books.find((book) => book.id === card.bookId)?.title ?? '未关联书籍'}》 · #{card.tags.join(' #')}</small></div><ChevronRight size={16} /></button>)}</div></> : <p>没有找到匹配的内容。尝试使用书名、标签或更短的关键词；也可以先添加卡片。</p>}</article>}
      <div className="askbar"><textarea rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); setAsked(true) } }} placeholder="例如：我记录过哪些关于用户心智的观点？" /><button aria-label="开始检索" onClick={() => setAsked(true)}><ArrowUpRight size={18} /></button><small>Enter 检索 · 仅搜索当前浏览器的本地数据</small></div>
    </section></>
}

function BookPanel({ book, cards, onClose, onEdit, onDelete, onOpenCard, onAddCard }: { book: Book; cards: KnowledgeCard[]; onClose: () => void; onEdit: () => void; onDelete: () => void; onOpenCard: (card: KnowledgeCard) => void; onAddCard: () => void }) {
  return <div className="overlay" onMouseDown={onClose}><aside className="side-panel" onMouseDown={(event) => event.stopPropagation()}><div className="panel-head"><button className="icon-button" onClick={onClose}><ArrowLeft size={18} /></button><div><button className="icon-button" onClick={onEdit}><Pencil size={17} /></button><button className="icon-button danger" onClick={onDelete}><Trash2 size={17} /></button></div></div><p className="eyebrow">BOOK DETAILS</p><h2>{book.title}</h2><p className="muted">{book.author} · {book.category}</p><div className="panel-meta"><StatusLabel status={book.status} /><span>评分 {book.rating || '—'} / 5</span><span>{cards.length} 张卡片</span></div>{book.sourceText && <section className="source-preview"><label>已保存的导入文本</label><p>{book.sourceText.slice(0, 360)}{book.sourceText.length > 360 ? '…' : ''}</p></section>}<section className="panel-section"><div><h3>这本书的知识卡片</h3><button className="text-button" onClick={onAddCard}><Plus size={15} />新建</button></div>{cards.length ? <div className="book-card-list">{cards.map((card) => <button key={card.id} onClick={() => onOpenCard(card)}><span><NotebookPen size={15} /></span><div><b>{card.title}</b><p>{card.insight || card.excerpt}</p></div><ChevronRight size={16} /></button>)}</div> : <p className="empty-text">还没有卡片。点击“新建”开始沉淀这本书的知识。</p>}</section></aside></div>
}

function CardPanel({ card, book, related, onClose, onEdit, onDelete, onOpenCard }: { card: KnowledgeCard; book?: Book; related: KnowledgeCard[]; onClose: () => void; onEdit: () => void; onDelete: () => void; onOpenCard: (card: KnowledgeCard) => void }) {
  return <div className="overlay" onMouseDown={onClose}><aside className="side-panel card-panel" onMouseDown={(event) => event.stopPropagation()}><div className="panel-head"><button className="icon-button" onClick={onClose}><ArrowLeft size={18} /></button><div><button className="icon-button" onClick={onEdit}><Pencil size={17} /></button><button className="icon-button danger" onClick={onDelete}><Trash2 size={17} /></button></div></div><p className="eyebrow">{card.category}</p><h2>{card.title}</h2><p className="muted"><BookOpen size={15} />《{book?.title ?? '未关联书籍'}》</p><section><label>原文摘录</label><blockquote>“{card.excerpt || '尚未填写'}”</blockquote></section><section><label>我的理解</label><p>{card.insight || '尚未填写'}</p></section><section className="application-block"><label>可以如何应用</label><p>{card.application || '尚未填写'}</p></section><div className="card-tags panel-tags">{card.tags.map((tag) => <i key={tag}>#{tag}</i>)}</div><section className="panel-section"><div><h3>关联卡片</h3><span>{related.length} 条</span></div>{related.length ? <div className="book-card-list">{related.map((item) => <button key={item.id} onClick={() => onOpenCard(item)}><span><Link2 size={15} /></span><div><b>{item.title}</b><p>{item.insight || item.excerpt}</p></div><ChevronRight size={16} /></button>)}</div> : <p className="empty-text">还未创建关联。点击编辑按钮即可选择相关知识卡片。</p>}</section></aside></div>
}

function BookModal({ book, onClose, onSave }: { book?: Book; onClose: () => void; onSave: (book: Omit<Book, 'id' | 'color' | 'cover' | 'createdAt' | 'updatedAt'> & { id?: string }) => void }) {
  const [title, setTitle] = useState(book?.title ?? ''), [author, setAuthor] = useState(book?.author ?? ''), [category, setCategory] = useState(book?.category ?? '商业')
  const [status, setStatus] = useState<BookStatus>(book?.status ?? 'reading'), [rating, setRating] = useState(String(book?.rating ?? 0)), [sourceText, setSourceText] = useState(book?.sourceText ?? '')
  function importText(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setSourceText(String(reader.result ?? '')); reader.readAsText(file) }
  function submit(event: FormEvent) { event.preventDefault(); if (!title.trim()) return; onSave({ id: book?.id, title: title.trim(), author: author.trim() || '未知作者', category: category.trim() || '未分类', status, rating: Math.max(0, Math.min(5, Number(rating) || 0)), sourceText }) }
  return <div className="overlay modal-wrap" onMouseDown={onClose}><form className="modal book-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">{book ? 'EDIT BOOK' : 'NEW BOOK'}</p><h2>{book ? '编辑书籍' : '加入一本新书'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="form-grid"><label>书名<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：从 0 到 1" /></label><label>作者<input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="作者姓名" /></label><label>领域<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="例如：商业 / 哲学" /></label><label>阅读状态<select value={status} onChange={(event) => setStatus(event.target.value as BookStatus)}><option value="to-read">想读</option><option value="reading">在读</option><option value="done">已读</option></select></label><label>评分（0–5）<input type="number" min="0" max="5" value={rating} onChange={(event) => setRating(event.target.value)} /></label></div><label className="file-picker"><Upload size={16} />导入 TXT / Markdown<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={importText} /></label><label>原始文本（可选）<textarea rows={7} value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="粘贴书摘、章节笔记，或通过上方导入 TXT / Markdown。新建书籍时，系统会按段落生成待整理卡片。" /></label><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>取消</button><button className="add" type="submit"><Check size={16} />{book ? '保存修改' : '创建书籍'}</button></div></form></div>
}
function CardModal({ card, books, allCards, onClose, onSave }: { card?: KnowledgeCard; books: Book[]; allCards: KnowledgeCard[]; onClose: () => void; onSave: (card: Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void }) {
  const [bookId, setBookId] = useState(card?.bookId ?? books[0]?.id ?? ''), [title, setTitle] = useState(card?.title ?? ''), [category, setCategory] = useState(card?.category ?? '我的思考')
  const [excerpt, setExcerpt] = useState(card?.excerpt ?? ''), [insight, setInsight] = useState(card?.insight ?? ''), [application, setApplication] = useState(card?.application ?? ''), [tags, setTags] = useState(card?.tags.join(', ') ?? ''), [importance, setImportance] = useState(String(card?.importance ?? 3)), [related, setRelated] = useState<string[]>(card?.relatedCardIds ?? [])
  function submit(event: FormEvent) { event.preventDefault(); onSave({ id: card?.id, bookId, title: title.trim(), category: category.trim() || '我的思考', excerpt: excerpt.trim(), insight: insight.trim(), application: application.trim(), tags: tags.split(/[,，\n]/).map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean), importance: Math.max(1, Math.min(5, Number(importance) || 3)), relatedCardIds: related }) }
  return <div className="overlay modal-wrap" onMouseDown={onClose}><form className="modal card-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">{card ? 'EDIT CARD' : 'NEW KNOWLEDGE CARD'}</p><h2>{card ? '编辑知识卡片' : '捕捉一个洞见'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="form-grid"><label>关联书籍<select required value={bookId} onChange={(event) => setBookId(event.target.value)}>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label><label>知识点标题<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第一性原理" /></label><label>分类<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="例如：品牌定位" /></label><label>重要性<select value={importance} onChange={(event) => setImportance(event.target.value)}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label></div><label>原文摘录<textarea rows={3} value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="记录书中的原文或关键事实" /></label><label>我的理解<textarea rows={4} value={insight} onChange={(event) => setInsight(event.target.value)} placeholder="用自己的话说明它为什么重要" /></label><label>应用场景<textarea rows={3} value={application} onChange={(event) => setApplication(event.target.value)} placeholder="我准备在哪个项目或生活场景中应用？" /></label><label>标签（用逗号分隔）<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="品牌, 长期主义, 决策" /></label><fieldset><legend><Link2 size={15} />关联卡片</legend><p>选择相关观点，地图会立即绘制这条连接。</p><div className="relation-picker">{allCards.filter((item) => item.id !== card?.id).map((item) => <label key={item.id}><input type="checkbox" checked={related.includes(item.id)} onChange={(event) => setRelated((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span>{item.title}<small>《{books.find((book) => book.id === item.bookId)?.title}》</small></span></label>)}</div></fieldset><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>取消</button><button className="add" type="submit"><Check size={16} />保存卡片</button></div></form></div>
}

function Empty({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) { return <div className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{description}</p></div> }


