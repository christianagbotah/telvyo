import { authorizeAdmin, createAdminHandler } from './admin.js';
const handleAdmin = createAdminHandler();
const adminHeaders = {
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com",
};
function accessPage(status) {
  const signIn = status === 401;
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Telvyo administration</title><main><h1>${signIn ? 'Sign in to Telvyo administration' : 'Administration is restricted to the app owner'}</h1><p>${signIn ? 'Use the ChatGPT account that owns Telvyo.' : 'Use the owner account, or check the owner access setting in Sites.'}</p>${signIn ? '<a href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">Sign in with ChatGPT</a>' : '<a href="/signout-with-chatgpt?return_to=%2Fadmin" target="_top">Switch account</a>'}<p><a href="/">Back to Telvyo</a></p></main></html>`, {status,headers:{...adminHeaders,'content-type':'text/html;charset=utf-8'}});
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      let path;
      try { path = decodeURIComponent(url.pathname); }
      catch { return new Response('Not found',{status:404}); }
      const api = await handleAdmin(request,env);
      if(api) return api;
      const admin = path === '/admin' || path.startsWith('/admin/');
      if(admin) {
        const denied = authorizeAdmin(request,env);
        if(denied) return accessPage(denied.status);
      }
      if(!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD'}});
      if(!env.ASSETS) return new Response('The app is temporarily unavailable.',{status:503,headers:{'cache-control':'no-store'}});
      if(path === '/') url.pathname='/index.html';
      else if(path === '/admin' || path === '/admin/') url.pathname='/admin/index.html';
      const response=await env.ASSETS.fetch(new Request(url,request));
      if(!admin) return response;
      const headers=new Headers(response.headers);
      for(const [key,value] of Object.entries(adminHeaders)) headers.set(key,value);
      return new Response(request.method === 'HEAD' ? null : response.body,{status:response.status,headers});
    } catch {
      return new Response('The app is temporarily unavailable.',{status:503,headers:{'cache-control':'no-store'}});
    }
  },
};
