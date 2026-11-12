import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../scripts/local-db.mjs';
import {derive,sha} from '../worker/auth.mjs';
import worker from '../dist/server/portal-test.js';

const origin='https://nd.test',password='Fixture123!',salt='workspace-test';
const hash=await derive(password,salt);
function req(path,user,body,options={}){
  const headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test',cookie:user.cookie,...options.headers};
  if(body){headers.origin=origin;headers['content-type']='application/json';}
  return new Request(origin+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
}
async function member(db,id,role='student',faculty='IT',group='CS-101'){
  await db.prepare('INSERT INTO nd_members(id,email,password_hash,password_salt,legacy_subject,created_at) VALUES (?,?,?,?,?,?)').bind(id,id+'@example.test',hash,salt,role==='owner'?'owner':null,Date.now()).run();
  const token=crypto.randomUUID().replaceAll('-','').repeat(2);
  await db.prepare('INSERT INTO nd_member_sessions(token_hash,member_id,platform_subject,expires_at) VALUES (?,?,?,?)').bind(await sha(token),id,'owner',Date.now()+1000000).run();
  const user={id,cookie:'__Host-nd-session='+token};
  await worker.fetch(req('/api/app/bootstrap',user),{DB:db});
  if(role!=='owner')await db.prepare('UPDATE nd_profiles SET full_name=?,role=?,faculty=?,group_name=? WHERE member_id=?').bind(id,role,faculty,group,id).run();
  return user;
}
async function call(db,user,path,body,env={}){return worker.fetch(req('/api/'+path,user,body),{DB:db,...env});}
async function boot(db,user){const r=await call(db,user,'app/bootstrap');assert.equal(r.status,200);return r.json();}

test('owner profile comes from verified legacy identity; normal email cannot elevate role',async()=>{
  const db=database(),owner=await member(db,'original','owner'),student=await member(db,'student');
  const own=await boot(db,owner);assert.equal(own.profile.full_name,'Дартай Диас');assert.equal(own.permissions.manageRoles,true);
  assert.equal((await call(db,student,'app/profile',{full_name:'New name',university:'SDU',faculty:'IT',group_name:'CS-101',course:1,role:'owner'})).status,200);
  const result=await boot(db,student);assert.equal(result.profile.role,'student');assert.equal(result.profile.full_name,'New name');assert.equal(result.profile.course,1);assert.equal(result.permissions.write,false);
  for(const path of ['task','lesson','announcement','grade','role'])assert.equal((await call(db,student,'app/'+path,{role:'owner'})).status,403,path);
  assert.equal((await call(db,student,'app/profile',{full_name:'Name',course:9})).status,400);
  db.close();
});

test('role requests require owner assignment, with fixed faculty and group for staff',async()=>{
  const db=database(),owner=await member(db,'original','owner'),student=await member(db,'student');
  assert.equal((await call(db,student,'app/role-request',{role:'teacher'})).status,200);
  assert.equal((await boot(db,student)).profile.role,'student');assert((await boot(db,owner)).notifications.length>0);
  assert.equal((await call(db,owner,'app/role',{member_id:student.id,role:'teacher',faculty:'IT',group_name:'CS-101'})).status,200);
  assert.equal((await call(db,student,'app/profile',{full_name:'Teacher',faculty:'Finance',group_name:'Secret',course:''})).status,200);
  const p=(await boot(db,student)).profile;assert.equal(p.role,'teacher');assert.equal(p.faculty,'IT');assert.equal(p.group_name,'CS-101');assert.equal(p.requested_role,null);
  assert.equal((await call(db,owner,'app/role',{member_id:owner.id,role:'student'})).status,400);db.close();
});

test('teacher data reaches only the assigned group; submissions, grades and notifications stay scoped',async()=>{
  const db=database(),teacher=await member(db,'teacher','teacher'),student=await member(db,'student'),outsider=await member(db,'outsider','student','Finance','CS-101');
  const task={title:'Research',subject:'Algorithms',details:'Prepare a solution',group_name:'CS-101',faculty:'Finance',due_at:'2026-12-20T10:00:00Z'};
  assert.equal((await call(db,teacher,'app/task',{...task,group_name:'CS-999'})).status,403);
  assert.equal((await call(db,teacher,'app/task',task)).status,200);
  assert.equal((await call(db,teacher,'app/lesson',{subject:'Algorithms',group_name:'CS-101',starts_at:'2026-12-15T05:00:00Z',ends_at:'2026-12-15T06:00:00Z',room:'204'})).status,200);
  const a=await boot(db,student),b=await boot(db,outsider);assert.equal(a.tasks.length,1);assert.equal(a.lessons.length,1);assert.equal(a.notifications.length,2);assert.equal(b.tasks.length,0);assert.equal(b.lessons.length,0);assert.equal(b.notifications.length,0);assert.equal(a.tasks[0].faculty,'IT');
  assert.equal((await call(db,outsider,'app/submit',{task_id:a.tasks[0].id,answer:'stolen'})).status,403);
  assert.equal((await call(db,student,'app/submit',{task_id:a.tasks[0].id,answer:'My answer'})).status,200);
  assert.equal((await boot(db,teacher)).submissions[0].answer,'My answer');
  assert.equal((await call(db,teacher,'app/grade',{student_id:outsider.id,subject:'Algorithms',score:80})).status,403);
  assert.equal((await call(db,teacher,'app/grade',{student_id:student.id,subject:'Algorithms',score:92,feedback:'Good work'})).status,200);
  assert.equal((await boot(db,student)).grades[0].score,92);assert.equal((await boot(db,outsider)).grades.length,0);
  const notification=(await boot(db,student)).notifications[0];
  await call(db,outsider,'app/read',{id:notification.id});assert.equal((await boot(db,student)).notifications.find(n=>n.id===notification.id).is_read,0);
  await call(db,student,'app/read',{all:true});assert((await boot(db,student)).notifications.every(n=>n.is_read===1));
  db.close();
});

test('deans see their faculty, curators their faculty and group, and students only their own grades',async()=>{
  const db=database(),owner=await member(db,'original','owner'),dean=await member(db,'dean','dean'),curator=await member(db,'curator','curator'),student=await member(db,'student'),outsider=await member(db,'outsider','student','Finance','CS-101');
  for(const user of [student,outsider])assert.equal((await call(db,owner,'app/grade',{student_id:user.id,score:75,subject:'Math'})).status,200);
  for(const user of [dean,curator]){const data=await boot(db,user);assert.equal(data.grades.length,1);assert.equal(data.grades[0].student_id,student.id);assert(!data.people.some(p=>p.member_id===outsider.id));}
  assert.equal((await boot(db,student)).grades.length,1);db.close();
});

test('unconfigured email service reports unavailable and creates no recovery tokens',async()=>{
  const db=database(),user=await member(db,'student');
  for(const path of ['forgot','send-verification']){const r=await call(db,user,'auth/'+path,{email:'student@example.test'});assert.equal(r.status,503);assert.equal((await r.json()).error,'email_unavailable');}
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM nd_email_tokens').get().n,0);db.close();
});

test('email links are hashed, expire, are one-time, and password reset revokes sessions',async()=>{
  const db=database(),user=await member(db,'student'),env={RESEND_API_KEY:'test-only-key',EMAIL_FROM:'N&D <noreply@example.test>'};
  const originalFetch=globalThis.fetch;let message;
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');message=JSON.parse(options.body);return new Response('{}',{status:200});};
  try{
    assert.equal((await call(db,user,'auth/send-verification',{},env)).status,200);
    let token=message.text.match(/\/account#verify\/([a-f0-9]{64})/)[1];
    const row=db.sqlite.prepare('SELECT * FROM nd_email_tokens').get();assert.notEqual(row.token_hash,token);assert.equal(row.token_hash,await sha(token));
    assert.equal((await call(db,user,'auth/verify',{token},env)).status,200);assert((await boot(db,user)).profile.email_verified_at>0);
    assert.equal((await call(db,user,'auth/verify',{token},env)).status,400);
    assert.equal((await call(db,user,'auth/forgot',{email:'student@example.test'},env)).status,200);token=message.text.match(/#reset\/([a-f0-9]{64})/)[1];
    assert.equal((await call(db,user,'auth/reset',{token,password:'Пароль12'},env)).status,400);
    assert.equal((await call(db,user,'auth/reset',{token,password:'Changed123!'},env)).status,200);
    assert.equal((await call(db,user,'app/bootstrap')).status,401);
    assert.equal((await call(db,user,'auth/reset',{token,password:'Another123!'},env)).status,400);
    const login=await call(db,user,'auth/login',{email:'student@example.test',password:'Changed123!'});assert.equal(login.status,200);
    assert.equal((await call(db,user,'auth/forgot',{email:'student@example.test'},env)).status,200);token=message.text.match(/#reset\/([a-f0-9]{64})/)[1];
    db.sqlite.prepare('UPDATE nd_email_tokens SET expires_at=0 WHERE used_at IS NULL').run();
    db.sqlite.prepare('UPDATE nd_auth_attempts SET window_start=0').run();
    assert.equal((await call(db,user,'auth/reset',{token,password:'Another123!'},env)).status,400);
  }finally{globalThis.fetch=originalFetch;db.close();}
});

test('profile images require a session, origin, and image bytes; uploaded avatar persists',async()=>{
  const db=database(),user=await member(db,'student');let stored;
  const bucket={async put(key,bytes,meta){stored={key,bytes,meta};},async get(key){return stored?.key===key?{body:stored.bytes,httpMetadata:stored.meta.httpMetadata}:null;},async delete(){}};
  const upload=bytes=>new Request(origin+'/api/app/avatar',{method:'PUT',headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test',cookie:user.cookie,origin},body:bytes});
  assert.equal((await worker.fetch(upload(new TextEncoder().encode('<svg/>')),{DB:db,BUCKET:bucket})).status,400);
  assert.equal((await worker.fetch(upload(Uint8Array.from([137,80,78,71,13,10,26,10])),{DB:db,BUCKET:bucket})).status,200);
  assert((await boot(db,user)).profile.avatar_key);assert.equal((await call(db,user,'app/avatar/'+user.id,undefined,{BUCKET:bucket})).headers.get('content-type'),'image/png');db.close();
});
