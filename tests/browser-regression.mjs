// This suite refuses non-local targets and blocks every external request except its GitHub mocks.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture, markdown, independentCard } from './fixtures.mjs';
import { emptyGarden } from '../src/gardenModel.ts';

const origin = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5179';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname),'Only an isolated local dev server is allowed');
const out = path.resolve(process.env.QA_ARTIFACT_DIR ?? '.tools/upgrade-verification');
await mkdir(out,{recursive:true});
let pw;
try { pw = await import('playwright'); }
catch {
  if(!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Playwright is required for browser tests. Install it locally or supply PLAYWRIGHT_MODULE_PATH; no browser profile or real cloud account is used.');
  pw = await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href);
}
pw = pw.default ?? pw;
const executablePath = process.env.BROWSER_EXECUTABLE ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await pw.chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const results=[];
async function run(name, fn) {
  const started=Date.now();
  try { await fn(); results.push({name,status:'passed',durationMs:Date.now()-started}); console.log('PASS '+name); }
  catch(error){results.push({name,status:'failed',error:error.stack,durationMs:Date.now()-started});console.error('FAIL '+name+'\n'+error.stack);}
}
async function context(seed=fixture(),viewport={width:1440,height:960},extras={}) {
  const c=await browser.newContext({viewport,...extras});
  await c.route('**/*',route=>new URL(route.request().url()).origin===new URL(origin).origin?route.continue():route.abort());
  if(seed!==null) await c.addInitScript(g=>{ if(!localStorage.getItem('knowledge-garden-v3')) localStorage.setItem('knowledge-garden-v3',JSON.stringify(g)); },seed);
  return c;
}
async function app(c,hash='') {
  const p=await c.newPage(); p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(origin+'/'+hash,{waitUntil:'networkidle'});await p.locator('.loading-state').waitFor({state:'hidden'});
  return p;
}
async function stored(p) {
  return p.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('knowledge-garden-v4',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{
      const db=r.result,q=db.transaction('state').objectStore('state').get('garden');q.onsuccess=()=>{const value=q.result;db.close();resolve(value);};q.onerror=()=>{db.close();reject(q.error);};
    };
  }));
}
async function waitForCards(p,count) { for(let i=0;i<100;i++){if((await stored(p))?.garden.cards.length===count)return;await p.waitForTimeout(30);}throw new Error('Timed out waiting for '+count+' cards'); }
async function openQuick(p,title,insight='测试理解') {
  await p.locator('.topbar').getByRole('button',{name:'快速记录',exact:true}).click();
  const d=p.getByRole('dialog',{name:'快速记录',exact:true});await d.getByLabel('标题',{exact:true}).fill(title);await d.getByLabel('我的理解',{exact:true}).fill(insight);return d;
}
async function blank(c) {const p=await c.newPage();await p.goto(origin+'/tests/blank.html');return p;}

try {
await run('legacy migration preserves original localStorage and safely retains invalid raw input',async()=>{
  const g=fixture();g.version=3;const c=await context(g);
  try{const p=await app(c);const actual=await stored(p);assert.equal(actual.garden.version,4);assert.equal(actual.garden.cards.length,g.cards.length);
    assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('knowledge-garden-v3')).version),3);assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
  const bad=await context({...g,books:[{...g.books[0],title:{invalid:true}}]});
  try{const p=await app(bad);assert.ok((await p.locator('.storage-warning').innerText()).includes('旧数据未自动载入'));await p.getByRole('button',{name:'下载原始旧数据'}).waitFor();assert.deepEqual(p.errors,[]);}finally{await bad.close();}
});
await run('two real browser tabs save independently without overwriting each other',async()=>{
  const c=await context();try{const a=await app(c),b=await app(c);const da=await openQuick(a,'来自第一页'),db=await openQuick(b,'来自第二页');
    await Promise.all([da.getByRole('button',{name:'保存卡片',exact:true}).click(),db.getByRole('button',{name:'保存卡片',exact:true}).click()]);
    await waitForCards(a,4);const data=(await stored(a)).garden;assert.ok(data.cards.some(c=>c.title==='来自第一页'));assert.ok(data.cards.some(c=>c.title==='来自第二页'));assert.deepEqual([...a.errors,...b.errors],[]);
  }finally{await c.close();}
});
await run('quota failure keeps text and stable IDs, then rebases retry onto another tab edits',async()=>{
  const c=await context(null);try{const p=await blank(c);
    const result=await p.evaluate(async()=>{
      const {GardenStore}=await import('/src/gardenStore.ts'),{newCard}=await import('/src/gardenModel.ts');
      const a=new GardenStore(),b=new GardenStore();await Promise.all([a.start(),b.start()]);const put=IDBObjectStore.prototype.put;
      let denied=true;IDBObjectStore.prototype.put=function(...args){if(denied)throw new DOMException('test quota','QuotaExceededError');return put.apply(this,args);};
      try{const saved=await a.mutate(g=>({...g,cards:[{...newCard(),title:'未保存输入'},...g.cards]}),'测试存储失败');const pendingId=a.state.garden.cards[0].id;
        assertBrowser(!saved&&a.state.pending===1,'failure is retained');denied=false;
        await b.mutate(g=>({...g,cards:[{...newCard(),title:'另一页修改'},...g.cards]}),'另一页写入');
        const retried=await a.retry();return {retried,pendingId,state:a.state,snapshots:await a.snapshots()};
      }finally{IDBObjectStore.prototype.put=put;a.close();b.close();}
      function assertBrowser(value,message){if(!value)throw new Error(message);}
    });
    assert.equal(result.retried,true);assert.equal(result.state.pending,0);assert.equal(result.state.garden.cards.length,2);assert.ok(result.state.garden.cards.some(c=>c.id===result.pendingId));
  }finally{await c.close();}
});
await run('snapshot retention is bounded and reading saves do not consume versions',async()=>{
  const c=await context(null);try{const p=await blank(c);const result=await p.evaluate(async()=>{
    const {GardenStore}=await import('/src/gardenStore.ts'),{newCard}=await import('/src/gardenModel.ts');const s=new GardenStore();await s.start();
    try{for(let i=0;i<23;i++)await s.mutate(g=>({...g,cards:[{...newCard(),title:'快照 '+i},...g.cards]}),'修改 '+i);
      const before=(await s.snapshots()).length;await s.mutate(g=>({...g,reading:{...g.reading,demo:{scrollY:100,updatedAt:new Date().toISOString()}}}),'阅读位置',false);
      return {before,after:(await s.snapshots()).length,cards:s.state.garden.cards.length};
    }finally{s.close();}
  });assert.deepEqual(result,{before:20,after:20,cards:23});}finally{await c.close();}
});
await run('quick note, comma-separated tags, draft recovery and native modal focus work without a book',async()=>{
  const c=await context(emptyGarden());try{const p=await app(c);let d=await openQuick(p,'独立笔记','未关闭前的草稿');
    await d.getByLabel('标签',{exact:true}).pressSequentially('alpha,beta');assert.equal(await d.getByLabel('标签',{exact:true}).inputValue(),'alpha,beta');
    const y=await p.evaluate(()=>scrollY);await p.mouse.wheel(0,600);await p.waitForTimeout(50);assert.equal(await p.evaluate(()=>scrollY),y);
    for(let i=0;i<12;i++)await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>!!document.activeElement?.closest('dialog[open]')),true);
    await d.getByRole('button',{name:'关闭快速记录'}).click();d=await openQuick(p,'独立笔记','未关闭前的草稿');assert.equal(await d.getByLabel('标签',{exact:true}).inputValue(),'alpha，beta');
    await d.getByRole('button',{name:'保存卡片',exact:true}).click();await waitForCards(p,1);const data=(await stored(p)).garden;assert.equal(data.books.length,0);assert.deepEqual(data.cards[0].tags,['alpha','beta']);assert.equal(data.cards[0].bookId,'');assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('card editing sits above details; saving and links beyond the original 16 are reachable',async()=>{
  const g=fixture();for(let i=0;i<29;i++)g.cards.push({...independentCard('关联候选 '+i),insight:'候选理解'});
  const c=await context(g);try{const p=await app(c,'#/cards');await p.locator('.card-open').first().click();await p.getByRole('dialog',{name:'卡片详情'}).getByRole('button',{name:'编辑卡片'}).click();
    const d=p.getByRole('dialog',{name:'编辑知识卡片'});await d.locator('summary').click();await d.getByLabel('查找关联卡片').fill('关联候选 28');await d.locator('.relation-options input').check();
    await d.getByLabel('我的理解',{exact:true}).fill('修改后仍可保存');await d.getByRole('button',{name:'保存卡片',exact:true}).click();await d.waitFor({state:'hidden'});
    const data=(await stored(p)).garden;assert.ok(data.cards.some(c=>c.insight==='修改后仍可保存'&&c.relatedCardIds.length));assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('global full-text search navigates to its source, survives refresh, and keeps filter scopes separate',async()=>{
  const g=fixture(),c=await context(g);try{const p=await app(c);await p.getByRole('textbox',{name:'全局搜索'}).fill('反馈校准');await p.locator('.search-result').first().waitFor();await p.locator('.search-result').filter({hasText:'章节'}).first().click();
    assert.ok(p.url().includes('#/book/'));assert.ok(p.url().includes('section='));await p.reload({waitUntil:'networkidle'});await p.locator('.reading-paper').waitFor();
    await p.goto(origin+'/#/library');await p.getByLabel('分类',{exact:true}).selectOption('学习');await p.goto(origin+'/#/cards');assert.equal(await p.locator('.knowledge-card').count(),2);assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('workbench pending count opens the actual queue and tab routing survives back navigation',async()=>{
  const c=await context();try{const p=await app(c);await p.getByRole('button',{name:/待整理内容/}).click();assert.ok(p.url().includes('tab=pending'));assert.equal(await p.locator('.knowledge-card').count(),2);
    await p.getByRole('tab',{name:/收集箱/}).click();await p.locator('.empty-state').waitFor();await p.goBack();await p.locator('.knowledge-card').first().waitFor();assert.equal(await p.locator('.knowledge-card').count(),2);assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('selected original text becomes an editable source-linked card',async()=>{
  const g=fixture(),c=await context(g);try{const p=await app(c,'#/book/'+encodeURIComponent(g.books[0].id));
    const selected=await p.locator('.markdown-content p').first().evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);e.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return e.textContent;});
    await p.getByRole('button',{name:'摘录为卡片'}).click();const d=p.getByRole('dialog',{name:'快速记录'});assert.equal(await d.getByLabel('证据 / 原文').inputValue(),selected);await d.getByLabel('标题',{exact:true}).fill('我的摘录');await d.getByRole('button',{name:'保存卡片',exact:true}).click();await waitForCards(p,3);
    assert.ok((await stored(p)).garden.cards.some(c=>c.title==='我的摘录'&&c.sectionId&&c.bookId===g.books[0].id));assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('empty library supports creating a book, its first chapter and a linked source card',async()=>{
  const c=await context(null);try{const p=await app(c);await p.getByRole('button',{name:'新建书籍',exact:true}).first().click();const book=p.getByRole('dialog',{name:'新建书籍'});
    await book.getByLabel('书名').fill('把阅读变成理解');await book.getByLabel('作者').fill('本地验收示例');await book.getByLabel('分类').fill('个人成长');await book.getByLabel('评分').selectOption('5');await book.getByLabel('标签',{exact:true}).fill('阅读，实践');await book.getByRole('button',{name:'保存书籍'}).click();await book.waitFor({state:'hidden'});
    await p.locator('.reader-toc').getByRole('button',{name:'添加章节',exact:true}).click();const chapter=p.getByRole('dialog',{name:'添加章节'});await chapter.getByLabel('章节标题').fill('从阅读走向实践');await chapter.getByLabel('Markdown 正文').fill('## 学习不是收藏\n\n读完之后，写下自己的理解，并尝试用一个行动检验它。');await chapter.getByRole('button',{name:'保存章节'}).click();await chapter.waitFor({state:'hidden'});
    await p.getByRole('tab',{name:'本书卡片 0'}).click();await p.getByRole('button',{name:'添加卡片',exact:true}).first().click();const card=p.getByRole('dialog',{name:'快速记录'});await card.getByLabel('标题',{exact:true}).fill('让阅读产生行动');await card.getByLabel('我的理解',{exact:true}).fill('用自己的语言解释，并找到一个小行动。');await card.getByRole('button',{name:'保存卡片',exact:true}).click();await waitForCards(p,1);
    const data=(await stored(p)).garden;assert.equal(data.books.length,1);assert.equal(data.books[0].rating,5);assert.deepEqual(data.books[0].tags,['阅读','实践']);assert.equal(data.books[0].sections.length,1);assert.equal(data.cards[0].bookId,data.books[0].id);assert.equal(data.cards[0].sectionId,data.books[0].sections[0].id);await p.goto(origin+'/#/book/'+encodeURIComponent(data.books[0].id)+'?tab=read',{waitUntil:'networkidle'});await p.reload({waitUntil:'networkidle'});await p.locator('.reading-section-heading').getByRole('heading',{name:'从阅读走向实践'}).waitFor();assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('chapter drafts recover after closing and re-import preserves the saved manual chapter',async()=>{
  const g=fixture(),c=await context(g);try{const p=await app(c,'#/book/'+encodeURIComponent(g.books[0].id));await p.locator('.reader-toc').getByRole('button',{name:'添加章节',exact:true}).click();let d=p.getByRole('dialog',{name:'添加章节'});
    await d.getByLabel('章节标题').fill('手工追加章节');await d.getByLabel('Markdown 正文').fill('不能丢失的手工正文');await d.getByRole('button',{name:'关闭添加章节'}).click();await p.locator('.reader-toc').getByRole('button',{name:'添加章节',exact:true}).click();d=p.getByRole('dialog',{name:'添加章节'});assert.equal(await d.getByLabel('Markdown 正文').inputValue(),'不能丢失的手工正文');await d.getByRole('button',{name:'保存章节'}).click();await d.waitFor({state:'hidden'});
    await p.locator('.reader-toc').getByRole('button',{name:'更新原始资料'}).click();await p.locator('input[type=file][accept*=".md"]').setInputFiles({name:'updated.md',mimeType:'text/markdown',buffer:Buffer.from(markdown+'\n\n追加原文')});
    await p.getByRole('dialog',{name:'确认资料导入'}).getByRole('button',{name:'安全更新资料'}).click();await p.getByRole('dialog',{name:'确认资料导入'}).waitFor({state:'hidden'});
    assert.ok((await stored(p)).garden.books[0].sections.some(s=>s.body==='不能丢失的手工正文'));assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('reading scroll and chapter location restore across reopening',async()=>{
  const g=fixture();g.books[0].sections[0].body=Array.from({length:70},(_,i)=>'第 '+i+' 段。阅读位置需要跨刷新保留。').join('\n\n');const c=await context(g);try{const p=await app(c,'#/book/'+encodeURIComponent(g.books[0].id));await p.evaluate(()=>scrollTo(0,600));await p.waitForTimeout(1000);
    const before=(await stored(p)).garden.reading[g.books[0].id];assert.ok(before.scrollY>=500);await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(150);assert.ok(await p.evaluate(()=>scrollY)>=500);assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('bulk tagging, inbox movement, review grading and recycle recovery are functional',async()=>{
  const c=await context();try{const p=await app(c,'#/cards');await p.getByRole('checkbox',{name:'选择本页卡片'}).check();await p.locator('.bulk-bar').getByRole('button',{name:'添加标签'}).click();const d=p.getByRole('dialog',{name:'批量添加标签'});await d.getByLabel('添加标签',{exact:true}).fill('批量测试,第二标签');await d.getByRole('button',{name:'确认批量修改'}).click();await d.waitFor({state:'hidden'});assert.ok((await stored(p)).garden.cards.every(c=>c.tags.includes('批量测试')));
    await p.getByRole('checkbox',{name:'选择本页卡片'}).check();await p.locator('.bulk-bar').getByRole('button',{name:'移动归属'}).click();const move=p.getByRole('dialog',{name:'移动卡片归属'});await move.getByRole('button',{name:'确认批量修改'}).click();await move.waitFor({state:'hidden'});assert.ok((await stored(p)).garden.cards.every(c=>!c.bookId&&!c.sectionId));
    await p.goto(origin+'/#/review');await p.getByRole('button',{name:'查看线索与理解'}).click();await p.getByRole('button',{name:'我理解了'}).click();assert.equal(Object.keys((await stored(p)).garden.reviews).length,1);
    await p.goto(origin+'/#/cards');await p.getByRole('checkbox',{name:'选择本页卡片'}).check();await p.locator('.bulk-bar').getByRole('button',{name:'移入回收站'}).click();await waitForCards(p,0);await p.goto(origin+'/#/data');await p.getByRole('button',{name:'恢复内容'}).first().click();await waitForCards(p,1);assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('malformed JSON is rejected without losing the current library; restore previews before replacing',async()=>{
  const c=await context();try{const p=await app(c,'#/data');const before=await stored(p);await p.locator('input[type=file][accept*=".json"]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...before.garden,cards:[{...before.garden.cards[0],tags:{invalid:true}}]}))});
    await p.getByRole('status').filter({hasText:'无法导入'}).waitFor();assert.deepEqual((await stored(p)).garden,before.garden);
    await p.locator('input[type=file][accept*=".json"]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...emptyGarden(),cards:[independentCard('恢复来的笔记')]}))});
    const d=p.getByRole('dialog',{name:'确认备份恢复'});assert.equal((await stored(p)).garden.cards.length,2);await d.getByRole('button',{name:'确认恢复备份'}).click();await waitForCards(p,3);assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
await run('remembered cloud configuration starts paused without any cloud request',async()=>{
  const c=await context();let calls=0;await c.addInitScript(()=>localStorage.setItem('knowledge-garden-github-sync-config-v1',JSON.stringify({owner:'test-user',repo:'test-repo',branch:'main',path:'data/garden.json',token:'FAKE-TOKEN',passphrase:'test-only-passphrase'})));
  await c.route('https://api.github.com/**',route=>{calls++;return route.abort();});try{const p=await app(c,'#/data');await p.waitForTimeout(2600);assert.equal(calls,0);assert.ok((await p.locator('.sync-section').innerText()).includes('请手动检查'));assert.equal((await stored(p)).garden.cards.length,2);assert.deepEqual(p.errors,[]);}finally{await c.close();}
});
await run('first cloud merge requires confirmation, includes edits during preview and pauses on SHA conflicts',async()=>{
  const local=fixture(),c=await context(local);let remote=null, writes=0, refuse=false, remoteSha='sha-one';
  await c.route('https://api.github.com/**',async route=>{
    const req=route.request();if(!req.url().includes('/contents/'))return route.fulfill({json:{private:true,permissions:{push:true},default_branch:'main'}});
    if(req.method()==='PUT'){writes++;if(refuse)return route.fulfill({status:409,json:{message:'simulated conflict'}});remote=JSON.parse(req.postData()).content;remoteSha='sha-'+writes;return route.fulfill({json:{content:{sha:remoteSha}}});}
    return remote?route.fulfill({json:{type:'file',sha:remoteSha,content:remote,encoding:'base64'}}):route.fulfill({status:404,json:{message:'Not Found'}});
  });
  try{const p=await app(c,'#/data');
    // Produce an encrypted mock cloud snapshot through the real browser crypto path, with a stubbed transport.
    remote=await p.evaluate(async()=>{const {pushGitHubGarden}=await import('/src/githubSync.ts'),{emptyGarden,newCard}=await import('/src/gardenModel.ts');const old=window.fetch;let content='';window.fetch=async(_url,options)=>{content=JSON.parse(options.body).content;return Response.json({content:{sha:'seed'}});};try{await pushGitHubGarden({owner:'test-user',repo:'test-repo',branch:'main',path:'data/garden.json',token:'FAKE-TOKEN',passphrase:'test-only-passphrase'},{...emptyGarden(),cards:[{...newCard(),title:'云端独有笔记'}]});return content;}finally{window.fetch=old;}});
    const form=p.locator('.sync-form');await form.getByLabel('GitHub 用户名').fill('test-user');await form.getByLabel('私有仓库',{exact:true}).fill('test-repo');await form.getByLabel('访问令牌').fill('FAKE-TOKEN');await form.getByLabel('加密密码',{exact:true}).fill('test-only-passphrase');await form.locator('button[type=submit],button.primary-button').last().click();
    const plan=p.getByRole('dialog',{name:'确认同步合并'});await plan.waitFor();assert.equal(writes,0);assert.equal((await stored(p)).garden.cards.length,2);
    await p.evaluate(async()=>{const {GardenStore}=await import('/src/gardenStore.ts'),{newCard}=await import('/src/gardenModel.ts');const s=new GardenStore();await s.start();await s.mutate(g=>({...g,cards:[{...newCard(),title:'预览期间新增'},...g.cards]}),'预览期间新增');s.close();});
    await plan.getByRole('button',{name:'合并并保存双方'}).click();await plan.waitFor({state:'hidden'});await waitForCards(p,4);assert.equal(writes,1);
    refuse=true;await p.locator('.sync-section').getByRole('button',{name:'检查并同步'}).click(); // unchanged libraries require no write
    let d=await openQuick(p,'触发冲突的本机笔记');await d.getByRole('button',{name:'保存卡片',exact:true}).click();await waitForCards(p,5);await p.waitForTimeout(3200);assert.ok(writes>=2);
    assert.ok((await stored(p)).garden.cards.some(c=>c.title==='触发冲突的本机笔记'));assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
for(const width of [320,375,390,414,768,1440]) await run('responsive navigation and layout at '+width+'px',async()=>{
  const g=fixture(),c=await context(g,{width,height:900});try{const p=await app(c);await p.screenshot({path:path.join(out,'workbench-'+width+'.png'),fullPage:true});
    for(const view of ['library','cards','data','review']){await p.goto(origin+'/#/'+view);await p.locator('main h1').waitFor();const size=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width,'horizontal overflow in '+view+': '+JSON.stringify(size));}
    await p.goto(origin+'/#/book/'+encodeURIComponent(g.books[0].id));await p.locator('.reading-paper').waitFor();if(width<=900){assert.equal(await p.locator('.mobile-nav a').count(),4);await p.locator('.mobile-toc select').selectOption(g.books[0].sections[1].id);assert.ok(p.url().includes('section='));}
    const size=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width,'reading horizontal overflow');await p.screenshot({path:path.join(out,'reader-'+width+'.png'),fullPage:true});
    await p.locator('.topbar').getByRole('button',{name:'快速记录',exact:true}).click();const d=p.getByRole('dialog',{name:'快速记录'});const bounds=await d.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);await p.screenshot({path:path.join(out,'editor-'+width+'.png')});assert.deepEqual(p.errors,[]);
  }finally{await c.close();}
});
} finally {await browser.close();await writeFile(path.join(out,'browser-results.json'),JSON.stringify({target:origin,network:'external traffic blocked; GitHub mocked',results},null,2)+'\n');}
const failures=results.filter(r=>r.status!=='passed');console.log('Browser checks: '+(results.length-failures.length)+'/'+results.length+' passed');if(failures.length)process.exitCode=1;
