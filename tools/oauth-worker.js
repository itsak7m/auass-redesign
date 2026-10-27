// Sign-in helper for the AUASS content manager ("الدخول بحساب GitHub").
// GitHub only hands out access tokens to a server that knows the OAuth app's
// secret, so this small Cloudflare Worker does that one step.
//
// Setup (once):
// 1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
//    Homepage URL: https://itsak7m.github.io/auass-redesign/
//    Authorization callback URL: https://<worker-name>.<account>.workers.dev/callback
// 2. Cloudflare → Workers → Create → paste this file → Deploy.
//    Settings → Variables: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (as a secret),
//    and SITE_ORIGIN = https://itsak7m.github.io
// 3. Put the worker address in src/admin/config.js as oauthUrl.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/auth') {
      const state = crypto.randomUUID();
      const gh = new URL('https://github.com/login/oauth/authorize');
      gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      gh.searchParams.set('scope', 'public_repo');
      gh.searchParams.set('state', state);
      return new Response(null, { status: 302, headers: { Location: gh.toString(), 'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600` } });
    }
    if (url.pathname === '/callback') {
      const cookie = (request.headers.get('Cookie') || '').match(/oauth_state=([\w-]+)/);
      let token = '';
      if (cookie && cookie[1] === url.searchParams.get('state')) {
        const r = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code') })
        });
        token = (await r.json()).access_token || '';
      }
      // Hand the token to the content manager window, then close.
      const html = `<!doctype html><meta charset="utf-8"><script>
        (window.opener || window.parent).postMessage({ type: 'auass-oauth', token: ${JSON.stringify(token)} }, ${JSON.stringify(env.SITE_ORIGIN)});
        window.close();
      </script>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'oauth_state=; Max-Age=0; Path=/' } });
    }
    return new Response('Not found', { status: 404 });
  }
};
