import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {database} from '../scripts/local-db.mjs';
import {derive,sha} from '../worker/auth.mjs';

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
test('reserved owner registration needs the setup secret while student signup stays open',async()=>{
  const db=database();try{
    let r=await worker.fetch(request('/api/auth/register',{body:{...signup,setupCode:'wrong'}}),env(db),{});assert.equal(r.status,403);assert.equal((await r.json()).error,'invalid_setup_code');
    r=await worker.fetch(request('/api/auth/register',{body:signup}),{DEMO_OWNER_EMAIL:owner,DB:db},{});assert.equal(r.status,503);
    assert.equal((await r.json()).error,'setup_unavailable');
    r=await worker.fetch(request('/api/auth/register',{body:signup}),{...env(db),ND_SETUP_CODE:'too-short'},{});assert.equal(r.status,503);assert.equal((await r.json()).error,'setup_code_too_short');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM nd_members').get().n,0);
    const cookie=await register(db);
    const status=await (await worker.fetch(request('/api/auth/status',{headers:{cookie}}),env(db),{})).json();assert.equal(status.canRegister,true);assert.equal(status.ownerOnly,false);
    assert.equal((await worker.fetch(request('/api/auth/register',{body:signup}),env(db),{})).status,409);
    const profile=await (await worker.fetch(request('/api/app/bootstrap',{headers:{cookie}}),env(db),{})).json();assert.equal(profile.profile.role,'owner');assert.equal(profile.profile.full_name,'Дартай Диас');
  }finally{db.close();}
});

test('a student can register without a setup code, log out and log back in with their own email',async()=>{
  const db=database(),student={email:'Student@MAIL.ru',password:'Student123!',role:'owner',legacy_subject:'forged'};
  const settings={DEMO_OWNER_EMAIL:owner,DB:db};
  try{
    const response=await worker.fetch(request('/api/auth/register',{body:student}),settings,{});
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    const status=await (await worker.fetch(request('/api/auth/status',{headers:{cookie}}),settings,{})).json();
    assert.equal(status.authenticated,true);assert.equal(status.email,'student@mail.ru');assert.equal(status.canRegister,true);
    const bootstrap=await (await worker.fetch(request('/api/app/bootstrap',{headers:{cookie}}),settings,{})).json();
    assert.equal(bootstrap.profile.role,'student');assert.equal(bootstrap.profile.full_name,'student');assert.equal(bootstrap.permissions.manageRoles,false);assert.equal(bootstrap.permissions.write,false);
    assert.equal(db.sqlite.prepare('SELECT legacy_subject FROM nd_members').get().legacy_subject,null);
    assert.equal((await worker.fetch(request('/app.js',{headers:{cookie}}),settings,{})).status,200);
    assert.equal((await worker.fetch(request('/api/auth/register',{body:{email:'STUDENT@mail.ru',password:'Different123!'}}),settings,{})).status,409);
    await worker.fetch(request('/api/auth/logout',{headers:{cookie},body:{}}),settings,{});
    assert.equal((await worker.fetch(request('/app.js',{headers:{cookie}}),settings,{})).status,401);
    assert.equal((await worker.fetch(request('/api/auth/login',{body:{...student,password:'Wrong123!'}}),settings,{})).status,401);
    const login=await worker.fetch(request('/api/auth/login',{body:student}),settings,{});assert.equal(login.status,200);
    const next=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await worker.fetch(request('/',{headers:{cookie:next}}),settings,{})).status,200);
  }finally{db.close();}
});

test('different students stay separate and cannot gain owner access through headers or role fields',async()=>{
  const db=database();
  try{
    const ownerCookie=await register(db);
    const people=[];
    for(const email of ['first@gmail.com','second@mail.ru']){
      const r=await worker.fetch(request('/api/auth/register',{body:{email,password:'Student123!',role:'owner'}}),env(db),{});
      assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
      const p=await (await worker.fetch(request('/api/app/bootstrap',{headers:{cookie,'oai-authenticated-user-email':owner}}),env(db),{})).json();
      assert.equal(p.profile.email,email);assert.equal(p.profile.role,'student');assert.deepEqual(p.people,[]);
      people.push(p.profile.member_id);
      assert.equal((await worker.fetch(request('/api/app/role',{headers:{cookie},body:{member_id:p.profile.member_id,role:'owner'}}),env(db),{})).status,403);
      assert.equal((await worker.fetch(request('/api/app/announcement',{headers:{cookie},body:{title:'forged'}}),env(db),{})).status,403);
    }
    assert.notEqual(people[0],people[1]);
    const own=await (await worker.fetch(request('/api/app/bootstrap',{headers:{cookie:ownerCookie}}),env(db),{})).json();
    assert.equal(own.profile.role,'owner');assert.equal(own.profile.full_name,'Дартай Диас');assert.equal(own.permissions.manageRoles,true);
    assert.equal((await worker.fetch(request('/api/auth/register',{body:{...signup,setupCode:'wrong'}}),env(db),{})).status,409);
  }finally{db.close();}
});

test('the public signup endpoint validates passwords and origins and limits successful account creation',async()=>{
  const db=database();
  try{
    assert.equal((await worker.fetch(request('/api/auth/register',{body:{email:'x@gmail.com',password:'Student123!'},headers:{origin:'https://other.test'}}),env(db),{})).status,403);
    for(const password of ['short','Пароль123','Password 1','12345678'])assert.equal((await worker.fetch(request('/api/auth/register',{body:{email:'x@gmail.com',password},headers:{'cf-connecting-ip':'192.0.2.3'}}),env(db),{})).status,400);
    for(let i=0;i<8;i++)assert.equal((await worker.fetch(request('/api/auth/register',{body:{email:'s'+i+'@gmail.com',password:'Abcd123!'},headers:{'cf-connecting-ip':'192.0.2.4'}}),env(db),{})).status,200);
    const limited=await worker.fetch(request('/api/auth/register',{body:{email:'ninth@gmail.com',password:'Abcd123!'},headers:{'cf-connecting-ip':'192.0.2.4'}}),env(db),{});
    assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'900');
    assert.equal((await worker.fetch(request('/api/auth/register',{body:{email:'another@mail.ru',password:'Abcd123!'},headers:{'cf-connecting-ip':'192.0.2.5'}}),env(db),{})).status,200);
    assert(!db.sqlite.prepare('SELECT subject FROM nd_auth_attempts').all().some(x=>x.subject.includes('192.0.2.4')));
  }finally{db.close();}
});

test('pre-existing Cloudflare owner sessions and passwords survive public registration',async()=>{
  const db=database();
  try{
    const subject='cf-owner:'+await sha(owner),salt='legacy-fixture',value='a'.repeat(64),password='Previous123!';
    await db.prepare('INSERT INTO nd_accounts(subject,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)').bind(subject,owner,await derive(password,salt),salt,Date.now()).run();
    await db.prepare('INSERT INTO nd_sessions(token_hash,subject,expires_at) VALUES (?,?,?)').bind(await sha(value),subject,Date.now()+100000).run();
    const cookie='__Host-nd-session='+value;
    const current=await (await worker.fetch(request('/api/app/bootstrap',{headers:{cookie}}),env(db),{})).json();
    assert.equal(current.profile.role,'owner');assert.equal(current.profile.full_name,'Дартай Диас');
    assert.equal((await worker.fetch(request('/api/auth/login',{body:{email:owner,password}}),env(db),{})).status,200);
    assert.equal((await worker.fetch(request('/api/auth/register',{body:{email:'new@gmail.com',password:'Student123!'}}),env(db),{})).status,200);
    assert.equal((await worker.fetch(request('/app.js',{headers:{cookie}}),env(db),{})).status,200);
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
