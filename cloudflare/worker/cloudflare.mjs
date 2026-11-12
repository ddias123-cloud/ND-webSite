// Cloudflare-only entry: trusted Access context replaces Sites identity headers.
// Missing Access or missing owner configuration denies every route, including assets.
import portal from './index.mjs';

export function cloudflarePortal(inner=portal){return {
  async fetch(request,env,ctx){
    const privateHeaders={'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
    const owner=typeof env.DEMO_OWNER_EMAIL==='string'?env.DEMO_OWNER_EMAIL.trim().toLowerCase():'';
    if(!owner)return new Response('N&D: private demo is being configured.',{status:503,headers:privateHeaders});
    if(!ctx?.access?.getIdentity)return new Response('N&D: Cloudflare Access sign-in required.',{status:403,headers:privateHeaders});
    let claims;try{claims=await ctx.access.getIdentity();}catch{return new Response('N&D: sign-in required.',{status:403,headers:privateHeaders});}
    const email=typeof claims?.email==='string'?claims.email.trim().toLowerCase():'';
    if(email!==owner)return new Response('N&D: access denied.',{status:403,headers:privateHeaders});
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email))),b=>b.toString(16).padStart(2,'0')).join('');
    const headers=new Headers(request.headers);
    headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
    headers.set('oai-authenticated-user-id','cf-owner:'+fingerprint);headers.set('oai-authenticated-user-email',email);
    return inner.fetch(new Request(request,{headers}),env,ctx);
  }
};}
export default cloudflarePortal();
