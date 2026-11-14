import {auth,identity,session} from './auth.mjs';
import {assets} from './assets.generated.mjs';
import {workspace} from './workspace.mjs';
import {emailAuth} from './mail.mjs';

const publicAssets = new Set(['/login.css','/login.js','/style.css','/themes.css','/theme-init.js','/entry.css','/entry.js','/product.css','/manifest.webmanifest','/assets/Manrope.ttf','/assets/OFL-Manrope.txt','/assets/apple-touch-icon.png','/assets/icon-192.png','/assets/icon-512.png']);
const headers = {
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'same-origin',
  'x-frame-options':'DENY',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
function asset(name,method) {
  const entry = assets[name];
  if (!entry) return new Response('Not found',{status:404,headers});
  const bytes = Uint8Array.from(atob(entry.data),c=>c.charCodeAt(0));
  return new Response(method === 'HEAD' ? null : bytes,{headers:{...headers,'content-type':entry.type}});
}
export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    if(['/api/auth/forgot','/api/auth/reset','/api/auth/verify','/api/auth/send-verification'].includes(url.pathname))return emailAuth(request,env);
    if (url.pathname.startsWith('/api/auth/')) return auth(request,env.DB);
    if (url.pathname.startsWith('/api/app/')) return workspace(request,env);
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers});
    if (publicAssets.has(url.pathname)) return asset(url.pathname,request.method);
    const user = identity(request);
    if (!user) return new Response('Sign in with ChatGPT to open your private demo.',{status:401,headers});
    if(url.pathname==='/account')return asset('/login.html',request.method);
    let signedIn;
    try { signedIn = await session(request,env.DB,user); }
    catch { return new Response('Temporarily unavailable. Please try again.',{status:503,headers}); }
    if (!signedIn) {
      if (url.pathname === '/' || url.pathname === '/index.html') return asset('/login.html',request.method);
      return new Response('Authentication required',{status:401,headers});
    }
    return asset(url.pathname === '/' ? '/index.html' : url.pathname,request.method);
  }
};
