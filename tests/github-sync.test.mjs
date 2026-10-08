import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGitHubConnection, pushGitHubGarden, pullGitHubGarden, GitHubConflictError } from '../src/githubSync.ts';
import { fixture } from './fixtures.mjs';

const config={owner:'isolated-test-user',repo:'isolated-test-repo',branch:'main',path:'data/garden.json',token:'FAKE-TEST-TOKEN',passphrase:'test-only-passphrase'};
test('GitHub encrypted synchronization: all requests mocked, no real credentials or network', async t=>{
  const previous=globalThis.fetch;let remote=null, requests=[];let isPublic=false, conflict=false;
  globalThis.fetch=async (url,options={})=>{
    assert.ok(String(url).startsWith('https://api.github.com/repos/isolated-test-user/isolated-test-repo'));
    requests.push({method:options.method??'GET',url:String(url)});
    if(!String(url).includes('/contents/')) return Response.json({private:!isPublic,default_branch:'main',permissions:{push:true}});
    if(options.method==='PUT') {
      if(conflict)return Response.json({message:'conflict'},{status:409});
      remote=JSON.parse(options.body);return Response.json({content:{sha:'test-sha-2'}});
    }
    return remote?Response.json({type:'file',sha:'test-sha-2',encoding:'base64',content:remote.content}):Response.json({message:'Not Found'},{status:404});
  };
  try {
    await t.test('private repository connection is verified',async()=>assert.equal((await verifyGitHubConnection(config)).repo,config.repo));
    await t.test('public repositories are rejected',async()=>{isPublic=true;await assert.rejects(verifyGitHubConnection(config),/私有/);isPublic=false;});
    await t.test('empty remote returns null, not an empty replacement',async()=>assert.equal(await pullGitHubGarden(config),null));
    const garden=fixture();
    await t.test('encryption round trip preserves the complete knowledge library',async()=>{
      await pushGitHubGarden(config,garden);assert.ok(!Buffer.from(remote.content,'base64').toString().includes(garden.books[0].title));
      const pulled=await pullGitHubGarden(config);assert.deepEqual(pulled.garden,garden);
    });
    await t.test('wrong encryption password returns a recoverable error',async()=>await assert.rejects(pullGitHubGarden({...config,passphrase:'not-the-right-password'}),/加密密码/));
    await t.test('compare-and-swap conflicts never silently retry an overwrite',async()=>{
      conflict=true;const count=requests.length;await assert.rejects(pushGitHubGarden(config,garden,'stale-sha'),GitHubConflictError);assert.equal(requests.length-count,1);
    });
  } finally {globalThis.fetch=previous;}
});
