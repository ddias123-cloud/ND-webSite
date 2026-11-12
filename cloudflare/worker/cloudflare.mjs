// Cloudflare-only owner account. No Sites or paid Access dependency.
// App data still requires its server-side N&D session; setup is invitation-gated.
import portal from './index.mjs';
import {body,json,sha} from './auth.mjs';

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
      if(request.method==='POST'&&['/api/auth/login','/api/auth/register','/api/auth/setup','/api/auth/forgot'].includes(path)){
        const data=await body(request.clone());
        if(typeof data.email!=='string'||data.email.trim().toLowerCase()!==owner)return json({error:'invalid_credentials'},401);
        if(path.endsWith('/register')||path.endsWith('/setup')){
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
      const ownRequest=new Request(request,{headers});
      const response=await inner.fetch(ownRequest,env,ctx);
      if(path==='/api/auth/status'&&response.ok){
        const result=await response.json();
        const existing=await env.DB.prepare('SELECT id FROM nd_members WHERE email=?').bind(owner).first();
        return json({...result,canRegister:!existing,ownerOnly:true});
      }
      if(request.method==='POST'&&['/api/auth/register','/api/auth/setup'].includes(path)&&response.ok){
        await env.DB.prepare('UPDATE nd_members SET legacy_subject=? WHERE email=?').bind('cf-owner:'+fingerprint,owner).run();
      }
      return response;
    }catch(err){return json({error:err.code||'service_unavailable'},err.status||503);}
  }
};}
export default cloudflarePortal();
