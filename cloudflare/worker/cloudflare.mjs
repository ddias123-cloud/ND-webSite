// Cloudflare email/password accounts. No Sites or paid Access dependency.
// The stable installation realm preserves existing owner sessions. It is not a
// visitor identity: only a verified N&D session identifies the signed-in member.
import portal from './index.mjs';
import {body,json,sha,throttle} from './auth.mjs';

export function cloudflarePortal(inner=portal){return {
  async fetch(request,env,ctx){
    const privateHeaders={'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
    const owner=typeof env.DEMO_OWNER_EMAIL==='string'?env.DEMO_OWNER_EMAIL.trim().toLowerCase():'';
    if(!owner)return new Response('N&D: private demo is being configured.',{status:503,headers:privateHeaders});
    const path=new URL(request.url).pathname;
    const fingerprint=await sha(owner);
    const headers=new Headers(request.headers);
    headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
    headers.set('oai-authenticated-user-id','cf-owner:'+fingerprint);headers.set('oai-authenticated-user-email',owner);
    try{
      let submittedEmail='';
      if(request.method==='POST'&&['/api/auth/login','/api/auth/register','/api/auth/setup','/api/auth/forgot'].includes(path)){
        const data=await body(request.clone());
        submittedEmail=typeof data.email==='string'?data.email.trim().toLowerCase():'';
        if(path.endsWith('/register')||path.endsWith('/setup')){
          // Count successful registrations too; creating an account must not
          // clear this separate per-IP signup budget.
          await throttle(env.DB,'signup:'+fingerprint+':'+await sha(request.headers.get('cf-connecting-ip')||'unknown'));
          if(typeof data.email==='string'&&data.email.trim().toLowerCase()===owner){
            const existing=await env.DB.prepare('SELECT id FROM nd_members WHERE email=?').bind(owner).first();
            if(existing)return json({error:'email_registered'},409);
            const code=typeof env.ND_SETUP_CODE==='string'?env.ND_SETUP_CODE:'';
            if(!code)return json({error:'setup_unavailable'},503);
            if(code.length<24)return json({error:'setup_code_too_short'},503);
            const submitted=typeof data.setupCode==='string'?data.setupCode:'';
            const expectedHash=await sha(code),actualHash=await sha(submitted);let diff=0;
            for(let i=0;i<64;i++)diff|=expectedHash.charCodeAt(i)^actualHash.charCodeAt(i);
            if(diff)return json({error:'invalid_setup_code'},403);
          }
        }
      }
      const ownRequest=new Request(request,{headers});
      const response=await inner.fetch(ownRequest,env,ctx);
      if(path==='/api/auth/status'&&response.ok){
        const result=await response.json();
        return json({...result,canRegister:true,ownerOnly:false});
      }
      if(request.method==='POST'&&['/api/auth/register','/api/auth/setup'].includes(path)&&response.ok){
        if(submittedEmail===owner)
          await env.DB.prepare('UPDATE nd_members SET legacy_subject=? WHERE email=?').bind('cf-owner:'+fingerprint,owner).run();
      }
      return response;
    }catch(err){return json({error:err.code||'service_unavailable'},err.status||503,err.status===429?{'retry-after':'900'}:{});}
  }
};}
export default cloudflarePortal();
