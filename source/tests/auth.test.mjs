import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../scripts/local-db.mjs';
import worker from '../dist/server/index.js';
import {derive} from '../worker/auth.mjs';

const origin='https://nd.test';
const password='Demo123!';
function request(path,options={}){
  const headers=new Headers({'oai-authenticated-user-id':options.subject||'owner','oai-authenticated-user-email':'owner@example.test',...options.headers});
  if(options.anonymous){headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');}
  if(options.cookie)headers.set('cookie',options.cookie);
  if(options.body){headers.set('content-type','application/json');headers.set('origin',options.origin||origin);}
  return new Request(origin+path,{method:options.body?'POST':'GET',headers,body:options.body?JSON.stringify(options.body):undefined});
}
const setup={email:'owner@example.test',password};
async function create(db){const r=await worker.fetch(request('/api/auth/register',{body:setup}),{DB:db});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}

test('first visit requires login; protected app code is not served',async()=>{
  const db=database();
  assert.match(await (await worker.fetch(request('/'),{DB:db})).text(),/id="auth-form"/);
  assert.equal((await worker.fetch(request('/app.js'),{DB:db})).status,401);
  const status=await (await worker.fetch(request('/api/auth/status'),{DB:db})).json();
  assert.deepEqual(status,{authenticated:false,email:null,canRegister:true});
  assert.equal((await worker.fetch(request('/api/auth/status',{anonymous:true}),{DB:db})).status,401);db.close();
});
test('setup hashes passwords and issues a secure, opaque session',async()=>{
  const db=database();const response=await worker.fetch(request('/api/auth/register',{body:setup}),{DB:db});
  assert.equal(response.status,200);const header=response.headers.get('set-cookie');
  for(const flag of ['__Host-nd-session=','HttpOnly','Secure','SameSite=Strict','Path=/'])assert(header.includes(flag));
  const row=db.sqlite.prepare('SELECT * FROM nd_members').get();assert.notEqual(row.password_hash,password);assert.equal(row.password_hash.length,64);assert.equal(row.password_salt.length,32);
  const stored=db.sqlite.prepare('SELECT * FROM nd_member_sessions').get();assert(!header.includes(stored.token_hash));
  const cookie=header.split(';')[0];
  assert.match(await (await worker.fetch(request('/',{cookie}),{DB:db})).text(),/id="app"/);
  assert.equal((await worker.fetch(request('/app.js',{cookie}),{DB:db})).status,200);db.close();
});
test('wrong password/email rejected; valid login works without overwriting account',async()=>{
  const db=database();await create(db);
  for(const body of [{...setup,password:'wrong password'},{...setup,email:'other@example.test'}])assert.equal((await worker.fetch(request('/api/auth/login',{body}),{DB:db})).status,401);
  assert.equal((await worker.fetch(request('/api/auth/register',{body:setup}),{DB:db})).status,409);
  assert.equal((await worker.fetch(request('/api/auth/login',{body:setup}),{DB:db})).status,200);db.close();
});
test('CSRF, short passwords, malformed emails and oversized bodies are rejected',async()=>{
  const db=database();
  assert.equal((await worker.fetch(request('/api/auth/register',{body:setup,origin:'https://attacker.test'}),{DB:db})).status,403);
  assert.equal((await worker.fetch(request('/api/auth/register',{body:{...setup,password:'short'}}),{DB:db})).status,400);
  assert.equal((await worker.fetch(request('/api/auth/register',{body:{...setup,email:'not-an-email'}}),{DB:db})).status,400);
  assert.equal((await worker.fetch(request('/api/auth/register',{body:{...setup,password:'x'.repeat(5000)}}),{DB:db})).status,413);db.close();
});
test('sessions cannot cross identities, forged/expired tokens cannot open the portal',async()=>{
  const db=database();const cookie=await create(db);
  assert.equal((await worker.fetch(request('/app.js',{cookie,subject:'someone-else'}),{DB:db})).status,401);
  assert.equal((await worker.fetch(request('/app.js',{cookie:'__Host-nd-session='+'a'.repeat(64)}),{DB:db})).status,401);
  db.sqlite.prepare('UPDATE nd_member_sessions SET expires_at=0').run();
  assert.equal((await worker.fetch(request('/app.js',{cookie}),{DB:db})).status,401);db.close();
});
test('logout revokes server session; replaying the old cookie fails',async()=>{
  const db=database();const cookie=await create(db);
  const response=await worker.fetch(request('/api/auth/logout',{cookie,body:{}}),{DB:db});
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM nd_member_sessions').get().n,0);
  assert.equal((await worker.fetch(request('/app.js',{cookie}),{DB:db})).status,401);db.close();
});
test('persistent rate limit caps password guesses and resets after the window',async()=>{
  const db=database();await create(db);
  for(let i=0;i<8;i++)assert.equal((await worker.fetch(request('/api/auth/login',{body:{...setup,password:'incorrect'}}),{DB:db})).status,401);
  const response=await worker.fetch(request('/api/auth/login',{body:setup}),{DB:db});
  assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'900');
  db.sqlite.prepare('UPDATE nd_auth_attempts SET window_start=0').run();
  assert.equal((await worker.fetch(request('/api/auth/login',{body:setup}),{DB:db})).status,200);db.close();
});

test('Gmail, Mail.ru and university emails register independently of the ChatGPT email',async()=>{
  const db=database();
  for(const email of ['student@gmail.com','teacher@mail.ru','first.last+demo@university.kz']){
    const registration=await worker.fetch(request('/api/auth/register',{body:{email,password}}),{DB:db});
    assert.equal(registration.status,200);
    const cookie=registration.headers.get('set-cookie').split(';')[0];
    const status=await (await worker.fetch(request('/api/auth/status',{cookie}),{DB:db})).json();
    assert.equal(status.email,email);assert.equal(status.authenticated,true);
    assert.equal((await worker.fetch(request('/api/auth/login',{body:{email,password}}),{DB:db})).status,200);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM nd_members').get().n,3);db.close();
});

test('eight ASCII characters with a Latin letter are accepted; invalid password alphabets are rejected server-side',async()=>{
  const db=database();
  for(const invalid of ['Abc1234','Пароль12','Password 1','12345678','Pässword1','Pass🙂123']){
    const response=await worker.fetch(request('/api/auth/register',{body:{email:'test@gmail.com',password:invalid}}),{DB:db});
    assert.equal(response.status,400,invalid);
  }
  assert.equal((await worker.fetch(request('/api/auth/register',{body:{email:'test@gmail.com',password:'Abcd123!'}}),{DB:db})).status,200);db.close();
});

test('duplicate email is case-insensitive and cannot overwrite an existing password',async()=>{
  const db=database();
  await worker.fetch(request('/api/auth/register',{body:{email:'Student@GMAIL.com',password}}),{DB:db});
  const duplicate=await worker.fetch(request('/api/auth/register',{body:{email:'student@gmail.com',password:'Other123!'}}),{DB:db});
  assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).error,'email_registered');
  assert.equal((await worker.fetch(request('/api/auth/login',{body:{email:'STUDENT@gmail.com',password}}),{DB:db})).status,200);
  assert.equal((await worker.fetch(request('/api/auth/login',{body:{email:'student@gmail.com',password:'Other123!'}}),{DB:db})).status,401);db.close();
});

test('existing passwords and sessions survive; legacy account is imported only after a valid login',async()=>{
  const db=database(),oldPassword='Старый пароль with spaces',salt='legacy-test-salt';
  await db.prepare('INSERT INTO nd_accounts(subject,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)').bind('owner','owner@example.test',await derive(oldPassword,salt),salt,Date.now()).run();
  const oldToken='b'.repeat(64),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(oldToken))).toString('hex');
  await db.prepare('INSERT INTO nd_sessions(token_hash,subject,expires_at) VALUES (?,?,?)').bind(hash,'owner',Date.now()+100000).run();
  const oldCookie='__Host-nd-session='+oldToken;
  assert.equal((await (await worker.fetch(request('/api/auth/status',{cookie:oldCookie}),{DB:db})).json()).authenticated,true);
  assert.equal((await worker.fetch(request('/api/auth/register',{body:setup}),{DB:db})).status,409);
  assert.equal((await worker.fetch(request('/api/auth/login',{body:{...setup,password:'Incorrect!'}}),{DB:db})).status,401);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM nd_members').get().n,0);
  assert.equal((await worker.fetch(request('/api/auth/login',{body:{...setup,password:oldPassword}}),{DB:db})).status,200);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM nd_members').get().n,1);
  assert.equal((await worker.fetch(request('/api/auth/logout',{cookie:oldCookie,body:{}}),{DB:db})).status,200);
  assert.equal((await worker.fetch(request('/app.js',{cookie:oldCookie}),{DB:db})).status,401);db.close();
});
