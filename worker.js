// organisedmess.studio — tiny Worker in front of the static assets.
// Workers Static Assets can't do a 200 rewrite from _redirects, so the
// Capabilities deep link is served here; everything else passes straight through.
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (/^\/capabilities\/?$/.test(url.pathname)) {
			url.pathname = '/';
			const res = await env.ASSETS.fetch(new Request(url.toString(), request));
			return new Response(res.body, res);
		}
		return env.ASSETS.fetch(request);
	}
};
