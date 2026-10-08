import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyGarden, normalizeGarden, upsertCard, applyImport, trashItems, restoreTrash, dueCards, reviewCard, canonical, tagsFrom } from '../src/gardenModel.ts';
import { parseMarkdownDocument } from '../src/markdownArchive.ts';
import { mergeGardens } from '../src/gardenMerge.ts';
import { searchGarden } from '../src/gardenSearch.ts';
import { fixture, markdown, independentCard } from './fixtures.mjs';

const clone = structuredClone;
test('migrates v3 without mutating its source, supports unfiled quick notes', () => {
  const old = fixture(); old.version = 3; delete old.trash; delete old.tombstones; delete old.reading; delete old.reviews;
  const source = JSON.stringify(old), garden = normalizeGarden(old, true);
  assert.equal(garden.version, 4); assert.equal(JSON.stringify(old), source);
  const note = independentCard(); assert.equal(normalizeGarden(upsertCard(garden, note)).cards.find(c => c.id === note.id).bookId, '');
});
test('malformed imported fields fail explicitly before any data mutation', () => {
  for (const edit of [g => g.books[0].title = {}, g => g.cards[0].tags = 1, g => g.cards[0].archived = 'yes', g => g.books.push(clone(g.books[0])), g => g.version = 999]) {
    const g = fixture(); edit(g); assert.throws(() => normalizeGarden(g));
  }
});
test('legacy cross-book section IDs are disambiguated and relations become symmetric', () => {
  const g = fixture(), other = clone(g.books[0]); other.id = 'second-book'; g.books.push(other);
  const c = { ...g.cards[0], id: 'second-card', bookId: other.id }; g.cards.push(c);
  g.cards[0].relatedCardIds = [c.id]; c.relatedCardIds = [];
  const n = normalizeGarden(g);
  assert.notEqual(n.books[0].sections[0].id,n.books[1].sections[0].id);
  assert.equal(n.cards.find(x => x.id === c.id).sectionId, n.books[1].sections[0].id);
  assert.ok(n.cards.find(x => x.id === c.id).relatedCardIds.includes(g.cards[0].id));
});
test('parser masks code-fence headings and separates source text from personal insight', () => {
  const parsed = parseMarkdownDocument('# 笔记\n\n## 第一节\n\n正文\n\n```md\n## 不是章节\n```\n');
  assert.equal(parsed.sections.length, 1); assert.equal(parsed.cards[0].insight, '');
  assert.equal(parseMarkdownDocument(markdown).fingerprint, parseMarkdownDocument(markdown.replaceAll('\n','\r\n')).fingerprint);
  assert.throws(() => parseMarkdownDocument('  '));
});
test('identical re-import is a no-op, including manual edits and links', () => {
  const g = fixture(); g.cards[0].insight = '手工理解'; g.cards[0].relatedCardIds = [g.cards[1].id];
  assert.equal(applyImport(g,parseMarkdownDocument(markdown),{},g.books[0].id),g);
});
test('changed re-import preserves hand-written understanding, applications, tags and links', () => {
  let g = fixture(); const c = g.cards[0];
  g = upsertCard(g,{ ...c, title: '我修改的标题', excerpt: '手工摘录', insight: '我的理解', application: '我自己的应用', tags: ['我的标签'], relatedCardIds: [g.cards[1].id] });
  const next = applyImport(g,parseMarkdownDocument(markdown.replace('用反馈校准','使用观察校准')),{},g.books[0].id);
  const kept = next.cards.find(x => x.id === c.id);
  assert.equal(kept.title,'我修改的标题'); assert.equal(kept.excerpt,'手工摘录'); assert.equal(kept.insight,'我的理解'); assert.equal(kept.application,'我自己的应用');
  assert.ok(kept.tags.includes('我的标签')); assert.deepEqual(kept.relatedCardIds,[g.cards[1].id]); assert.equal(next.cards.length, g.cards.length);
});
test('re-import retains manually added and manually edited chapters, including moved notes', () => {
  const g = fixture(), book = g.books[0];
  const original = { ...book.sections[0], origin: 'manual', body: '人工补充正文必须保留' };
  book.sections[0] = original;
  book.sections.push({ id:'manual', title:'手工章节', body:'手工正文',kind:'other',level:2,order:99,origin:'manual' });
  g.cards[0].sectionId = 'manual';
  const next = applyImport(g,parseMarkdownDocument(markdown+'\n\n追加资料'),{},book.id);
  assert.ok(next.books[0].sections.some(s => s.id === original.id && s.body === original.body));
  assert.ok(next.books[0].sections.some(s => s.id === 'manual')); assert.equal(next.cards.find(c=>c.id === g.cards[0].id).sectionId,'manual');
  assert.doesNotThrow(() => normalizeGarden(next));
});
test('choosing no candidate cards still imports the entire reading text', () => {
  const parsed = parseMarkdownDocument(markdown), g = applyImport(emptyGarden(),parsed,{},undefined,[]);
  assert.equal(g.cards.length,0); assert.equal(g.books[0].sourceText,parsed.sourceText); assert.equal(g.books[0].sections.length,3);
});
test('deletion and recovery preserve book notes and restore symmetric links', () => {
  let g = fixture(); g = upsertCard(g,{ ...g.cards[0], relatedCardIds:[g.cards[1].id] });
  const deleted = trashItems(g,'card',[g.cards[0].id]); assert.equal(deleted.cards[0].relatedCardIds.length,0);
  const restored = restoreTrash(deleted,deleted.trash[0].id); assert.equal(restored.cards.length,2);
  assert.ok(restored.cards.find(c=>c.id === g.cards[1].id).relatedCardIds.includes(g.cards[0].id));
  const bookDeleted = trashItems(restored,'book',[g.books[0].id]); assert.equal(bookDeleted.books.length,0); assert.equal(bookDeleted.cards.length,0);
  assert.equal(restoreTrash(bookDeleted,bookDeleted.trash[0].id).cards.length,2);
});
test('restoring a stale recycle entry never replaces a newer active card', () => {
  const g = fixture(), deleted = trashItems(g,'card',[g.cards[0].id]);
  deleted.cards.push({...g.cards[0],insight:'较新的内容'});
  assert.equal(restoreTrash(deleted,deleted.trash[0].id).cards.find(c=>c.id===g.cards[0].id).insight,'较新的内容');
});
test('first connection merges independent local and cloud notes without replacing either', () => {
  const local = fixture(), remote = emptyGarden(); remote.cards.push(independentCard('云端独有笔记'));
  const next = mergeGardens(undefined,local,remote).garden;
  assert.equal(next.cards.length,3); assert.equal(next.books.length,1); assert.equal(local.cards.length,2);
});
test('three-way merge accepts unilateral changes and propagates agreed deletion', () => {
  const base = fixture(), local = clone(base), remote = clone(base); local.cards[0].insight='本机修改'; remote.cards[1].application='云端修改';
  let next=mergeGardens(base,local,remote); assert.equal(next.conflicts.length,0); assert.equal(next.garden.cards[0].insight,'本机修改'); assert.equal(next.garden.cards[1].application,'云端修改');
  remote.cards.splice(0,1); next=mergeGardens(base,base,remote); assert.ok(!next.garden.cards.some(c=>c.id===base.cards[0].id));
});
test('delete versus edit preserves the edited content and records a conflict', () => {
  const base=fixture(), local=trashItems(base,'card',[base.cards[0].id]), remote=clone(base); remote.cards[0].insight='保留修改';
  const next=mergeGardens(base,local,remote); assert.equal(next.garden.cards.find(c=>c.id===base.cards[0].id).insight,'保留修改'); assert.equal(next.conflicts.length,1);
});
test('tombstones prevent deleted items resurrecting when no common baseline exists', () => {
  const old=fixture(), local=trashItems(old,'card',[old.cards[0].id]);
  assert.ok(!mergeGardens(undefined,local,old).garden.cards.some(c=>c.id===old.cards[0].id));
});
test('divergent card edits retain both versions and do not redirect local links', () => {
  const base=fixture(); base.cards[0].relatedCardIds=[base.cards[1].id]; base.cards[1].relatedCardIds=[base.cards[0].id];
  const l=clone(base),r=clone(base); l.cards[0].insight='本机理解'; r.cards[0].insight='云端理解'; r.cards[1].application='远端应用';
  const result=mergeGardens(base,l,r), copy=result.garden.cards.find(c=>c.insight==='云端理解');
  assert.equal(result.garden.cards.length,3); assert.notEqual(copy.id,base.cards[0].id);
  assert.ok(result.garden.cards.find(c=>c.id===base.cards[0].id).relatedCardIds.includes(base.cards[1].id));
  assert.equal(mergeGardens(base,result.garden,r).garden.cards.length,3);
});
test('conflicting books copy their chapters and notes without deleting local originals', () => {
  const base=fixture(),l=clone(base),r=clone(base); l.books[0].title='本机书名'; r.books[0].title='云端书名';
  const result=mergeGardens(base,l,r).garden; assert.equal(result.books.length,2); assert.equal(result.cards.length,4);
  assert.equal(result.cards.filter(c=>c.bookId===base.books[0].id).length,2);
  for(const c of result.cards) assert.ok(result.books.find(b=>b.id===c.bookId).sections.some(s=>s.id===c.sectionId));
  assert.doesNotThrow(()=>normalizeGarden(result));
});
test('restored items do not retain stale remote recycle entries', () => {
  const old=fixture(),deleted=trashItems(old,'card',[old.cards[0].id]), restored=restoreTrash(deleted,deleted.trash[0].id);
  const next=mergeGardens(undefined,restored,deleted).garden; assert.equal(next.trash.length,0); assert.ok(next.cards.some(c=>c.id===old.cards[0].id));
});
test('global search covers full chapter text, author, tags and application logs', () => {
  const g=fixture();g.cards[0].applications=[{id:'log',text:'用在团队季度会议',createdAt:new Date().toISOString()}];g.cards[0].tags=['专用标签'];
  assert.ok(searchGarden(g,'反馈校准').some(r=>r.type==='section'&&r.sectionId));
  assert.ok(searchGarden(g,'隔离测试作者').some(r=>r.type==='book'));
  assert.ok(searchGarden(g,'专用标签').some(r=>r.type==='card'));assert.ok(searchGarden(g,'季度会议').some(r=>r.type==='card'));
  assert.equal(searchGarden(g,'').length,0);
});
test('review grades update due dates; archived cards stay out of the queue', () => {
  let g=fixture();const at=new Date('2026-10-08T08:00:00Z');g.cards[1].archived=true;
  assert.equal(dueCards(g,at.getTime()).length,1);g=reviewCard(g,g.cards[0].id,'good',at);
  assert.equal(dueCards(g,at.getTime()).length,0);assert.equal(g.reviews[g.cards[0].id].interval,2);
  g=reviewCard(g,g.cards[0].id,'again',at);assert.equal(Date.parse(g.reviews[g.cards[0].id].dueAt)-at.getTime(),600000);
});
test('comma-delimited tags keep order and remove duplicates', () => { assert.deepEqual(tagsFrom('管理，复盘,管理\n知识'),['管理','复盘','知识']); });
test('merge never mutates any of its three caller-owned inputs', () => {
  const base=fixture(),l=clone(base),r=clone(base);l.cards[0].insight='本机';r.cards[0].insight='云端';
  const originals=[base,l,r].map(canonical);mergeGardens(base,l,r);assert.deepEqual([base,l,r].map(canonical),originals);
});

test('relationship-only removals merge without forking otherwise unchanged cards', () => {
  let base=fixture();base=upsertCard(base,{...base.cards[0],relatedCardIds:[base.cards[1].id]});
  const left=upsertCard(base,{...base.cards[0],relatedCardIds:[]});
  const result=mergeGardens(base,left,base);
  assert.equal(result.conflicts.length,0);assert.equal(result.garden.cards.length,2);assert.ok(result.garden.cards.every(c=>c.relatedCardIds.length===0));
});

test('repeating a conflicting book merge does not make new copies or rename chapter IDs again', () => {
  const base=fixture(),l=clone(base),r=clone(base);l.books[0].title='本机版本';r.books[0].title='远端版本';
  const first=mergeGardens(base,l,r).garden,second=mergeGardens(base,first,r).garden;
  assert.equal(second.books.length,2);assert.equal(second.cards.length,4);assert.deepEqual(second.books.map(b=>b.sections.map(s=>s.id)),first.books.map(b=>b.sections.map(s=>s.id)));
});
test('already edited conflict copies are retained when the old remote conflict is merged again', () => {
  const base=fixture(),l=clone(base),r=clone(base);l.cards[0].insight='本机版本';r.cards[0].insight='远端版本';
  const first=mergeGardens(base,l,r).garden,copy=first.cards.find(c=>c.id!==base.cards[0].id&&c.insight==='远端版本');copy.insight='用户继续修改了副本';
  const second=mergeGardens(base,first,r).garden;
  assert.ok(second.cards.some(c=>c.id===copy.id&&c.insight==='用户继续修改了副本'));assert.ok(second.cards.some(c=>c.insight==='远端版本'));
});
