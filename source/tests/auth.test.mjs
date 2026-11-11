import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../scripts/local-db.mjs';
import worker from '../dist/server/index.js';

const origin='https://nd.test';
const password='a disposable preview passphrase';
function request(path,options={}){
  const headers=new Headers({'oai-authenticated-user-id':options.subject||'owner','oai-authenticated-user-email':'owner@example.test',...options.headers});
  if(options.anonymous){headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');}
  if(options.cookie)headers.set('cookie',options.cookie);
  if(options.body){headers.set('content-type','application/json');headers.set('origin',options.origin||origin);}
  return new Request(origin+path,{method:options.body?'POST':'GET',headers,body:options.body?JSON.stringify(options.body):undefined});
}
const setup={email:'owner@example.test',password};
async function create(db){const r=await worker.fetch(request('/api/auth/setup',{body:setup}),{DB:db});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}

test('first visit requires login; protected app code is not served',async()=>{
  const db=database();
  assert.match(await (await worker.fetch(request('/'),{DB:db})).text(),/id="auth-form"/);
  assert.equal((await worker.fetch(request('/app.js'),{DB:db})).status,401);
  const status=await (await worker.fetch(request('/api/auth/status'),{DB:db})).json();
  assert.deepEqual(status,{authenticated:false,needsSetup:true,email:'owner@example.test'});
  assert.equal((await worker.fetch(request('/api/auth/status',{anonymous:true}),{DB:db})).status,401);db.close();
});
test('setup hashes passwords and issues a secure, opaque session',async()=>{
  const db=database();const response=await worker.fetch(request('/api/auth/setup',{body:setup}),{DB:db});
  assert.equal(response.status,200);const header=response.headers.get('set-cookie');
  for(const flag of ['__Host-nd-session=','HttpOnly','Secure','SameSite=Strict','Path=/'])assert(header.includes(flag));
  const row=db.sqlite.prepare('SELECT * FROM nd_accounts').get();assert.notEqual(row.password_hash,password);assert.equal(row.password_hash.length,64);assert.equal(row.password_salt.length,32);
  const stored=db.sqlite.prepare('SELECT * FROM nd_sessions').get();assert(!header.includes(stored.token_hash));
  const cookie=header.split(';')[0];
  assert.match(await (await worker.fetch(request('/',{cookie}),{DB:db})).text(),/id="app"/);
  assert.equal((await worker.fetch(request('/app.js',{cookie}),{DB:db})).status,200);db.close();
});
test('wrong password/email rejected; valid login works without overwriting account',async()=>{
  const db=database();await create(db);
  for(const body of [{...setup,password:'wrong password'},{...setup,email:'other@example.test'}])assert.equal((await worker.fetch(request('/api/auth/login',{body}),{DB:db})).status,401);
  assert.equal((await worker.fetch(request('/api/auth/setup',{body:setup}),{DB:db})).status,409);
  assert.equal((await worker.fetch(request('/api/auth/login',{body:setup}),{DB:db})).status,200);db.close();
});
test('CSRF, short passwords, foreign email and oversized bodies are rejected',async()=>{
  const db=database();
  assert.equal((await worker.fetch(request('/api/auth/setup',{body:setup,origin:'https://attacker.test'}),{DB:db})).status,403);
  assert.equal((await worker.fetch(request('/api/auth/setup',{body:{...setup,password:'short'}}),{DB:db})).status,400);
  assert.equal((await worker.fetch(request('/api/auth/setup',{body:{...setup,email:'attacker@example.test'}}),{DB:db})).status,400);
  assert.equal((await worker.fetch(request('/api/auth/setup',{body:{...setup,password:'x'.repeat(5000)}}),{DB:db})).status,413);db.close();
});
test('sessions cannot cross identities, forged/expired tokens cannot open the portal',async()=>{
  const db=database();const cookie=await create(db);
  assert.equal((await worker.fetch(request('/app.js',{cookie,subject:'someone-else'}),{DB:db})).status,401);
  assert.equal((await worker.fetch(request('/app.js',{cookie:'__Host-nd-session='+'a'.repeat(64)}),{DB:db})).status,401);
  db.sqlite.prepare('UPDATE nd_sessions SET expires_at=0').run();
  assert.equal((await worker.fetch(request('/app.js',{cookie}),{DB:db})).status,401);db.close();
});
test('logout revokes server session; replaying the old cookie fails',async()=>{
  const db=database();const cookie=await create(db);
  const response=await worker.fetch(request('/api/auth/logout',{cookie,body:{}}),{DB:db});
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM nd_sessions').get().n,0);
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
