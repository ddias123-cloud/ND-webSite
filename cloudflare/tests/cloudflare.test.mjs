import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {database} from '../scripts/local-db.mjs';

const origin='https://nd.example.workers.dev',owner='owner@example.test';
const setupCode='Test-only-setup-code-1234567890';
const signup={email:owner,password:'Fixture123!',setupCode};
function request(path='/',options={}){return new Request(origin+path,{method:options.body?'POST':'GET',headers:{...(options.body?{origin,'content-type':'application/json'}:{}),...options.headers},body:options.body?JSON.stringify(options.body):undefined});}
const env=db=>({DEMO_OWNER_EMAIL:owner,ND_SETUP_CODE:setupCode,DB:db});
async function register(db){const r=await worker.fetch(request('/api/auth/register',{body:signup}),env(db),{});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}

test('missing owner configuration fails closed, and anonymous visitors see only the login assets',async()=>{
  const db=database();try{
    assert.equal((await worker.fetch(request('/'),{DB:db},{})).status,503);
    assert.match(await (await worker.fetch(request('/'),env(db),{})).text(),/id="auth-form"/);
    assert.equal((await worker.fetch(request('/login.js'),env(db),{})).status,200);
    for(const path of ['/app.js','/product.js','/api/app/bootstrap'])assert.equal((await worker.fetch(request(path),env(db),{})).status,401,path);
  }finally{db.close();}
});
test('initial owner registration needs the setup secret, rejects other emails, and then closes',async()=>{
  const db=database();try{
    let r=await worker.fetch(request('/api/auth/register',{body:{...signup,setupCode:'wrong'}}),env(db),{});assert.equal(r.status,403);assert.equal((await r.json()).error,'invalid_setup_code');
    r=await worker.fetch(request('/api/auth/register',{body:{...signup,email:'other@example.test'}}),env(db),{});assert.equal(r.status,401);
    r=await worker.fetch(request('/api/auth/register',{body:signup}),{DEMO_OWNER_EMAIL:owner,DB:db},{});assert.equal(r.status,503);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM nd_members').get().n,0);
    const cookie=await register(db);
    const status=await (await worker.fetch(request('/api/auth/status',{headers:{cookie}}),env(db),{})).json();assert.equal(status.canRegister,false);assert.equal(status.ownerOnly,true);
    assert.equal((await worker.fetch(request('/api/auth/register',{body:signup}),env(db),{})).status,409);
    const profile=await (await worker.fetch(request('/api/app/bootstrap',{headers:{cookie}}),env(db),{})).json();assert.equal(profile.profile.role,'owner');assert.equal(profile.profile.full_name,'Дартай Диас');
  }finally{db.close();}
});
test('forged platform and Access identity headers cannot open the app; valid owner sessions can',async()=>{
  const db=database();try{
    const forged={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':owner,'cf-access-authenticated-user-email':owner};
    assert.equal((await worker.fetch(request('/app.js',{headers:forged}),env(db),{access:{async getIdentity(){return {email:owner};}}})).status,401);
    const cookie=await register(db);
    const r=await worker.fetch(request('/',{headers:{...forged,cookie}}),env(db),{});assert.equal(r.status,200);assert.match(await r.text(),/src="app.js"/);
    assert.equal((await worker.fetch(request('/api/auth/login',{body:{email:owner,password:'Wrong123!'}}),env(db),{})).status,401);
    assert.equal((await worker.fetch(request('/api/auth/login',{body:{email:owner,password:signup.password}}),env(db),{})).status,200);
    await worker.fetch(request('/api/auth/logout',{headers:{cookie},body:{}}),env(db),{});
    assert.equal((await worker.fetch(request('/app.js',{headers:{cookie}}),env(db),{})).status,401);
  }finally{db.close();}
});
test('password guesses are limited per edge IP so a different visitor does not lock out the owner',async()=>{
  const db=database();try{
    await register(db);
    const bad={email:owner,password:'Wrong123!'};
    for(let i=0;i<8;i++)assert.equal((await worker.fetch(request('/api/auth/login',{body:bad,headers:{'cf-connecting-ip':'192.0.2.1'}}),env(db),{})).status,401);
    assert.equal((await worker.fetch(request('/api/auth/login',{body:bad,headers:{'cf-connecting-ip':'192.0.2.1'}}),env(db),{})).status,429);
    assert.equal((await worker.fetch(request('/api/auth/login',{body:{email:owner,password:signup.password},headers:{'cf-connecting-ip':'192.0.2.2'}}),env(db),{})).status,200);
    assert(!db.sqlite.prepare('SELECT subject FROM nd_auth_attempts').all().some(row=>row.subject.includes('192.0.2.1')));
  }finally{db.close();}
});
