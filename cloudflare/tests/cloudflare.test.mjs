import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{cloudflarePortal} from '../dist/server/index.js';
import {database} from '../scripts/local-db.mjs';

const owner='owner@example.test',env={DEMO_OWNER_EMAIL:owner};
const context=email=>({access:{async getIdentity(){return {email};}}});
const request=(path='/',options={})=>new Request('https://nd.example.workers.dev'+path,options);

test('Cloudflare entry denies missing setup and missing Access for pages, scripts and APIs',async()=>{
  for(const path of ['/','/app.js','/login.css','/api/auth/status']){
    assert.equal((await worker.fetch(request(path),{},context(owner))).status,503);
    assert.equal((await worker.fetch(request(path),env,{})).status,403);
    assert.equal((await worker.fetch(request(path),env,context('other@example.test'))).status,403);
  }
});
test('forged client identity headers cannot bypass Access or impersonate its visitor',async()=>{
  const forged=request('/',{headers:{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':owner,'cf-access-authenticated-user-email':owner}});
  assert.equal((await worker.fetch(forged,env,{})).status,403);
  assert.equal((await worker.fetch(forged,env,context('someone@example.test'))).status,403);
  let received;
  const wrapper=cloudflarePortal({async fetch(r){received=r;return new Response('ok');}});
  assert.equal((await wrapper.fetch(forged,env,context(owner))).status,200);
  assert.match(received.headers.get('oai-authenticated-user-id'),/^cf-owner:[a-f0-9]{64}$/);
  assert.equal(received.headers.get('oai-authenticated-user-email'),owner);
});
test('verified owner can register and log in, while the app still requires an N&D session',async()=>{
  const db=database(),bindings={...env,DB:db},ctx=context(owner);
  try{
    assert.match(await (await worker.fetch(request('/'),bindings,ctx)).text(),/id="auth-form"/);
    assert.equal((await worker.fetch(request('/app.js'),bindings,ctx)).status,401);
    const r=await worker.fetch(request('/api/auth/register',{method:'POST',headers:{origin:'https://nd.example.workers.dev','content-type':'application/json'},body:JSON.stringify({email:'student@mail.ru',password:'Fixture123!'})}),bindings,ctx);
    assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
    const page=await worker.fetch(request('/',{headers:{cookie}}),bindings,ctx);
    assert.equal(page.status,200);assert.match(await page.text(),/src="app.js"/);
    assert.equal((await worker.fetch(request('/',{headers:{cookie}}),bindings,context('other@example.test'))).status,403);
  }finally{db.close();}
});
