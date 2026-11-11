import {json,error,body,identity,session,derive,validEmail,validPassword,random,sha,throttle} from './auth.mjs';

export async function deliverEmail(env,to,subject,text,key){
  if(!env.RESEND_API_KEY||!env.EMAIL_FROM)throw error(503,'email_unavailable');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env.EMAIL_FROM,to:[to],subject,text}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw error(503,'email_unavailable');
}

export async function emailAuth(request,env){
  const visitor=identity(request);if(!visitor)return json({error:'platform_signin_required'},401);
  try{
    if(request.method!=='POST')throw error(405,'method_not_allowed');
    const d=await body(request),db=env.DB,path=new URL(request.url).pathname,now=Date.now();
    await throttle(db,'mail:'+visitor.subject);
    if(path==='/api/auth/forgot'||path==='/api/auth/send-verification'){
      if(!env.RESEND_API_KEY||!env.EMAIL_FROM)throw error(503,'email_unavailable');
      let member,purpose;
      if(path.endsWith('send-verification')){
        const current=await session(request,db,visitor);if(!current)throw error(401,'signin_required');
        member=await db.prepare('SELECT id,email,email_verified_at FROM nd_members WHERE id=?').bind(current.id).first();
        if(member.email_verified_at)return json({ok:true,verified:true});
        purpose='verify';
      }else{
        const email=typeof d.email==='string'?d.email.trim().toLowerCase():'';
        if(!validEmail(email))throw error(400,'invalid_email');
        member=await db.prepare('SELECT id,email FROM nd_members WHERE email=?').bind(email).first();
        if(!member){
          // Preserve password recovery for an existing account that has not migrated yet.
          const legacy=await db.prepare('SELECT * FROM nd_accounts WHERE email=? AND subject=?').bind(email,visitor.subject).first();
          if(legacy){await db.prepare('INSERT INTO nd_members(id,email,password_hash,password_salt,legacy_subject,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING').bind(crypto.randomUUID(),email,legacy.password_hash,legacy.password_salt,legacy.subject,legacy.created_at).run();member=await db.prepare('SELECT id,email FROM nd_members WHERE email=?').bind(email).first();}
        }
        purpose='reset';
      }
      if(member){
        const value=random(32),tokenHash=await sha(value);
        await db.batch([db.prepare('UPDATE nd_email_tokens SET used_at=? WHERE member_id=? AND purpose=? AND used_at IS NULL').bind(now,member.id,purpose),db.prepare('INSERT INTO nd_email_tokens(token_hash,member_id,purpose,expires_at) VALUES (?,?,?,?)').bind(tokenHash,member.id,purpose,now+(purpose==='reset'?30:60)*60000)]);
        const link=new URL(request.url).origin+'/account#'+purpose+'/'+value;
        try{await deliverEmail(env,member.email,purpose==='reset'?'N&D — Құпиясөзді қалпына келтіру / Сброс пароля':'N&D — Email растау / Подтверждение почты',(purpose==='reset'?'Жаңа құпиясөз орнату / Задать новый пароль: ':'Email растау / Подтвердить почту: ')+link+'\n\nБұл сілтемені ешкімге жіберме / Не передавайте эту ссылку другим.',tokenHash);}
        catch(e){await db.prepare('DELETE FROM nd_email_tokens WHERE token_hash=?').bind(tokenHash).run();if(purpose==='verify')throw e;}
      }
      return json({ok:true});
    }
    if(!['/api/auth/verify','/api/auth/reset'].includes(path))throw error(404,'not_found');
    if(typeof d.token!=='string'||!/^[a-f0-9]{64}$/.test(d.token))throw error(400,'invalid_link');
    const purpose=path.endsWith('/reset')?'reset':'verify';
    if(purpose==='reset'&&!validPassword(d.password||''))throw error(400,'password_characters');
    const tokenHash=await sha(d.token);
    const entry=await db.prepare('SELECT * FROM nd_email_tokens WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?').bind(tokenHash,purpose,now).first();
    if(!entry)throw error(400,'invalid_link');
    if(purpose==='reset'){
      const salt=random(16),hash=await derive(d.password,salt);
      // UPDATE ... RETURNING consumes a token once, even when two requests race.
      const consumed=await db.prepare('UPDATE nd_email_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING member_id').bind(now,tokenHash,Date.now()).first();if(!consumed)throw error(400,'invalid_link');
      await db.batch([db.prepare('UPDATE nd_members SET password_hash=?,password_salt=? WHERE id=?').bind(hash,salt,entry.member_id),db.prepare('UPDATE nd_accounts SET password_hash=?,password_salt=? WHERE subject=(SELECT legacy_subject FROM nd_members WHERE id=?)').bind(hash,salt,entry.member_id),db.prepare('DELETE FROM nd_member_sessions WHERE member_id=?').bind(entry.member_id),db.prepare('DELETE FROM nd_sessions WHERE subject=(SELECT legacy_subject FROM nd_members WHERE id=?)').bind(entry.member_id),db.prepare('UPDATE nd_email_tokens SET used_at=? WHERE member_id=? AND purpose=? AND used_at IS NULL').bind(now,entry.member_id,'reset')]);
    }else{
      const consumed=await db.prepare('UPDATE nd_email_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING member_id').bind(now,tokenHash,Date.now()).first();if(!consumed)throw error(400,'invalid_link');
      await db.prepare('UPDATE nd_members SET email_verified_at=? WHERE id=?').bind(now,entry.member_id).run();
    }
    return json({ok:true});
  }catch(e){return json({error:e.code||'service_unavailable'},e.status||503);}
}
