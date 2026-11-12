import {json,error,body,identity,session} from './auth.mjs';

const wpRoles=['student','teacher','curator','dean','rector','owner'];
const wpWriters=['teacher','dean','rector','owner'];
const wpText=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
const wpAll=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const wpGlobal=p=>['owner','rector'].includes(p.role);
const wpStaff=p=>p.role!=='student';
const wpDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));

export async function ensureProfile(db,current,visitor){
  let p=await db.prepare('SELECT p.*,m.email,m.email_verified_at FROM nd_profiles p JOIN nd_members m ON m.id=p.member_id WHERE p.member_id=?').bind(current.id).first();
  if(p)return p;
  const member=await db.prepare('SELECT legacy_subject FROM nd_members WHERE id=?').bind(current.id).first();
  const owner=member?.legacy_subject===visitor.subject;
  await db.prepare(`INSERT INTO nd_profiles(member_id,full_name,role,updated_at) VALUES (?,?,?,?) ON CONFLICT(member_id) DO NOTHING`).bind(current.id,owner?'Дартай Диас':'',owner?'owner':'student',Date.now()).run();
  return db.prepare('SELECT p.*,m.email,m.email_verified_at FROM nd_profiles p JOIN nd_members m ON m.id=p.member_id WHERE p.member_id=?').bind(current.id).first();
}

function wpScope(p,row){
  if(wpGlobal(p))return true;
  if(p.role==='dean')return !!p.faculty&&row.faculty===p.faculty;
  if(p.role==='curator')return !!p.group_name&&!!p.faculty&&row.group_name===p.group_name&&row.faculty===p.faculty;
  if(p.role==='teacher')return row.author_id===p.member_id||row.teacher_id===p.member_id;
  return !!p.group_name&&row.group_name===p.group_name&&(!row.faculty||row.faculty===p.faculty);
}

function wpNotify(db,author,title,message,target,group='',faculty=''){
  return db.prepare(`INSERT INTO nd_notifications(id,recipient_id,title,body,target,created_at)
    SELECT lower(hex(randomblob(16))),member_id,?,?,?,? FROM nd_profiles
    WHERE member_id<>? AND (?='' OR group_name=?) AND (?='' OR faculty=?)`)
    .bind(title,message,target,Date.now(),author,group,group,faculty,faculty);
}

export async function workspace(request,env){
  const db=env.DB,visitor=identity(request);
  if(!visitor)return json({error:'platform_signin_required'},401);
  const current=await session(request,db,visitor);
  if(!current)return json({error:'signin_required'},401);
  try{
    const p=await ensureProfile(db,current,visitor),path=new URL(request.url).pathname;
    if(path.startsWith('/api/app/avatar/')&&request.method==='GET'){
      const id=path.split('/').at(-1);
      const target=await db.prepare('SELECT * FROM nd_profiles WHERE member_id=?').bind(id).first();
      if(!target||(!wpGlobal(p)&&id!==p.member_id&&!wpScope(p,target)))throw error(403,'forbidden');
      if(!target.avatar_key||!env.BUCKET)return new Response(null,{status:404});
      const object=await env.BUCKET.get(target.avatar_key);
      return object?new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/webp','cache-control':'private,max-age=60','x-content-type-options':'nosniff'}}):new Response(null,{status:404});
    }
    if(request.method==='GET'){
      if(path==='/api/app/notifications')return json({notifications:await wpAll(db,'SELECT * FROM nd_notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 60',p.member_id)});
      if(path!=='/api/app/bootstrap')throw error(404,'not_found');
      const tasks=(await wpAll(db,'SELECT t.*,p.full_name AS author_name FROM nd_tasks t LEFT JOIN nd_profiles p ON p.member_id=t.author_id ORDER BY t.created_at DESC LIMIT 500')).filter(t=>wpScope(p,t));
      const lessons=(await wpAll(db,'SELECT l.*,p.full_name AS teacher_name FROM nd_lessons l LEFT JOIN nd_profiles p ON p.member_id=l.teacher_id ORDER BY l.starts_at LIMIT 500')).filter(l=>wpScope(p,l));
      const people=wpStaff(p)?(await wpAll(db,`SELECT p.member_id,p.full_name,p.role,p.requested_role,p.university,p.faculty,p.course,p.group_name FROM nd_profiles p ORDER BY p.full_name LIMIT 500`)).filter(person=>wpGlobal(p)||wpScope(p,person)||(p.role==='teacher'&&tasks.concat(lessons).some(t=>t.group_name&&t.group_name===person.group_name&&(!t.faculty||t.faculty===person.faculty)))):[];
      const grades=(await wpAll(db,`SELECT g.*,p.full_name AS student_name,p.group_name,p.faculty FROM nd_grades g JOIN nd_profiles p ON p.member_id=g.student_id ORDER BY g.created_at DESC LIMIT 500`)).filter(g=>g.student_id===p.member_id||wpGlobal(p)||(p.role==='teacher'&&g.teacher_id===p.member_id)||(['dean','curator'].includes(p.role)&&wpScope(p,g)));
      const submissions=(await wpAll(db,`SELECT s.*,p.full_name AS student_name FROM nd_submissions s JOIN nd_profiles p ON p.member_id=s.student_id ORDER BY submitted_at DESC LIMIT 500`)).filter(s=>s.student_id===p.member_id||(wpStaff(p)&&tasks.some(t=>t.id===s.task_id&&wpScope(p,t))));
      const announcements=(await wpAll(db,`SELECT a.*,p.full_name AS author_name FROM nd_announcements a JOIN nd_profiles p ON p.member_id=a.author_id ORDER BY a.created_at DESC LIMIT 100`)).filter(a=>wpGlobal(p)||a.author_id===p.member_id||((!a.group_name||a.group_name===p.group_name)&&(!a.faculty||a.faculty===p.faculty)));
      const notifications=await wpAll(db,'SELECT * FROM nd_notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 60',p.member_id);
      return json({profile:p,permissions:{write:wpWriters.includes(p.role),manageRoles:p.role==='owner'},tasks,lessons,people,grades,submissions,announcements,notifications,emailDelivery:!!(env.RESEND_API_KEY&&env.EMAIL_FROM)});
    }
    if(request.method==='PUT'&&path==='/api/app/avatar'){
      if(request.headers.get('origin')!==new URL(request.url).origin)throw error(403,'invalid_origin');
      if(!env.BUCKET)throw error(503,'storage_unavailable');
      const reader=request.body?.getReader();if(!reader)throw error(400,'invalid_image');
      const pieces=[];let size=0;
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw error(413,'image_too_large');}pieces.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}
      const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
      const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
      if(!png&&!jpg&&!webp)throw error(400,'invalid_image');
      const key='avatars/'+p.member_id+'/'+crypto.randomUUID();
      await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:png?'image/png':jpg?'image/jpeg':'image/webp'}});
      await db.prepare('UPDATE nd_profiles SET avatar_key=?,updated_at=? WHERE member_id=?').bind(key,Date.now(),p.member_id).run();
      if(p.avatar_key)await env.BUCKET.delete(p.avatar_key);
      return json({ok:true});
    }
    if(request.method!=='POST')throw error(405,'method_not_allowed');
    const d=await body(request),now=Date.now();
    if(path==='/api/app/profile'){
      const name=wpText(d.full_name,80);if(name.length<2)throw error(400,'name_required');
      const course=d.course===''||d.course==null?null:Number(d.course);
      if(course!==null&&(!Number.isInteger(course)||course<1||course>8))throw error(400,'invalid_course');
      const selfScope=p.role==='student'||p.role==='owner';
      await db.prepare('UPDATE nd_profiles SET full_name=?,university=?,faculty=?,course=?,group_name=?,updated_at=? WHERE member_id=?').bind(name,wpText(d.university),selfScope?wpText(d.faculty):p.faculty,course,selfScope?wpText(d.group_name,40):p.group_name,now,p.member_id).run();
      return json({ok:true});
    }
    if(path==='/api/app/role-request'){
      if(!['student','teacher','curator'].includes(d.role)||p.role==='owner')throw error(400,'invalid_role');
      await db.batch([db.prepare('UPDATE nd_profiles SET requested_role=? WHERE member_id=?').bind(d.role,p.member_id),db.prepare(`INSERT INTO nd_notifications(id,recipient_id,title,body,target,created_at) SELECT lower(hex(randomblob(16))),member_id,?,?,?,? FROM nd_profiles WHERE role='owner'`).bind('Рөлге сұрау / Запрос роли',p.full_name||p.email,'people',now)]);
      return json({ok:true});
    }
    if(path==='/api/app/role'){
      if(p.role!=='owner')throw error(403,'forbidden');
      if(!wpRoles.includes(d.role)||d.member_id===p.member_id||d.role==='owner')throw error(400,'invalid_role');
      const target=await db.prepare('SELECT member_id FROM nd_profiles WHERE member_id=?').bind(d.member_id).first();if(!target)throw error(404,'not_found');
      await db.batch([db.prepare('UPDATE nd_profiles SET role=?,faculty=?,group_name=?,requested_role=NULL,updated_at=? WHERE member_id=?').bind(d.role,wpText(d.faculty),wpText(d.group_name,40),now,d.member_id),db.prepare('INSERT INTO nd_notifications(id,recipient_id,title,body,target,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),d.member_id,'Рөл жаңартылды / Роль обновлена',d.role,'profile',now)]);
      return json({ok:true});
    }
    if(path==='/api/app/read'){
      if(d.all)await db.prepare('UPDATE nd_notifications SET is_read=1 WHERE recipient_id=?').bind(p.member_id).run();
      else await db.prepare('UPDATE nd_notifications SET is_read=1 WHERE id=? AND recipient_id=?').bind(wpText(d.id,80),p.member_id).run();
      return json({ok:true});
    }
    if(path==='/api/app/submit'){
      if(p.role!=='student')throw error(403,'forbidden');
      const task=await db.prepare('SELECT * FROM nd_tasks WHERE id=?').bind(d.task_id).first();if(!task||!wpScope(p,task))throw error(403,'forbidden');
      const answer=wpText(d.answer,1500);if(!answer)throw error(400,'answer_required');
      await db.batch([db.prepare('INSERT INTO nd_submissions(task_id,student_id,answer,submitted_at) VALUES (?,?,?,?) ON CONFLICT(task_id,student_id) DO UPDATE SET answer=excluded.answer,submitted_at=excluded.submitted_at').bind(task.id,p.member_id,answer,now),db.prepare('INSERT INTO nd_notifications(id,recipient_id,title,body,target,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),task.author_id,'Жұмыс тапсырылды / Работа сдана',p.full_name+' · '+task.title,'tasks',now)]);
      return json({ok:true});
    }
    if(!wpWriters.includes(p.role))throw error(403,'forbidden');
    if(path==='/api/app/grade'){
      const target=await db.prepare('SELECT * FROM nd_profiles WHERE member_id=?').bind(d.student_id).first();
      if(!target||target.role!=='student')throw error(400,'invalid_student');
      if(!wpGlobal(p)&&p.role==='dean'&&!wpScope(p,target))throw error(403,'forbidden');
      if(p.role==='teacher'){
        const relation=await db.prepare(`SELECT id FROM nd_tasks WHERE author_id=? AND group_name=? AND (faculty='' OR faculty=?) UNION SELECT id FROM nd_lessons WHERE teacher_id=? AND group_name=? AND (faculty='' OR faculty=?) LIMIT 1`).bind(p.member_id,target.group_name,target.faculty,p.member_id,target.group_name,target.faculty).first();
        if(!relation)throw error(403,'forbidden');
      }
      const score=Number(d.score),subject=wpText(d.subject,100);
      if(!Number.isInteger(score)||score<0||score>100||!subject||d.score===''||d.score==null)throw error(400,'invalid_grade');
      await db.batch([db.prepare('INSERT INTO nd_grades(id,student_id,teacher_id,subject,score,feedback,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),target.member_id,p.member_id,subject,score,wpText(d.feedback,500),now),db.prepare('INSERT INTO nd_notifications(id,recipient_id,title,body,target,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),target.member_id,'Жаңа баға / Новая оценка',subject+' · '+score+'/100','grades',now)]);
      return json({ok:true});
    }
    const group=wpText(d.group_name,40),faculty=wpGlobal(p)?wpText(d.faculty):p.faculty;
    if(!wpGlobal(p)&&(!faculty||(p.role==='teacher'&&(!p.group_name||group!==p.group_name))))throw error(403,'scope_required');
    if(path==='/api/app/task'){
      if(!group||!wpText(d.title)||!wpText(d.subject)||!wpDate(d.due_at))throw error(400,'required_fields');
      await db.batch([db.prepare('INSERT INTO nd_tasks(id,title,details,subject,group_name,faculty,author_id,due_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),wpText(d.title),wpText(d.details,1000),wpText(d.subject),group,faculty,p.member_id,new Date(d.due_at).toISOString(),now),wpNotify(db,p.member_id,'Жаңа тапсырма / Новое задание',wpText(d.title),'tasks',group,faculty)]);
      return json({ok:true});
    }
    if(path==='/api/app/lesson'){
      if(!group||!wpText(d.subject)||!wpDate(d.starts_at)||!wpDate(d.ends_at)||Date.parse(d.ends_at)<=Date.parse(d.starts_at))throw error(400,'invalid_dates');
      await db.batch([db.prepare('INSERT INTO nd_lessons(id,subject,group_name,faculty,teacher_id,room,starts_at,ends_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),wpText(d.subject),group,faculty,p.member_id,wpText(d.room,60),new Date(d.starts_at).toISOString(),new Date(d.ends_at).toISOString(),now),wpNotify(db,p.member_id,'Кесте жаңарды / Расписание обновлено',wpText(d.subject),'schedule',group,faculty)]);
      return json({ok:true});
    }
    if(path==='/api/app/announcement'){
      if(!wpText(d.title)||!wpText(d.body)||(!wpGlobal(p)&&!group))throw error(400,'required_fields');
      await db.batch([db.prepare('INSERT INTO nd_announcements(id,title,body,author_id,group_name,faculty,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),wpText(d.title),wpText(d.body,1000),p.member_id,group,faculty,now),wpNotify(db,p.member_id,wpText(d.title),wpText(d.body,200),'campus',group,faculty)]);
      return json({ok:true});
    }
    throw error(404,'not_found');
  }catch(e){return json({error:e.code||'service_unavailable'},e.status||503);}
}
