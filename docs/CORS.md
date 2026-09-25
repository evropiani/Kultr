# Connection problems, and how to fix them properly

If Kultr says

> Could not reach the server. Check the address, that it is running, and that
> cross-origin requests are allowed.

…and you are certain the address is right and your server is up, this page is
for you.

---

## The 30-second version

A page loaded from one address may only call an API at another address if that
server sends a header saying it is fine. That rule is **CORS**.

**Navidrome sends that header out of the box.** Every Subsonic API response,
the audio included, comes with `Access-Control-Allow-Origin: *` — it has done
so since at least version 0.40 (2021), and still does in 0.64. So the hosted
app at <https://web.kultr.cc>, or an address typed into the login screen,
normally just works with Navidrome as it is, equaliser and bass swap included.

When it does not, it is almost always one of these:

1. **An HTTPS page and an `http://` server.** The hosted app is HTTPS, and a
   browser will not let an HTTPS page call a plain `http://` address (only
   `http://localhost` is exempt). Put Navidrome behind HTTPS.
2. **Something in front of Navidrome** — a reverse proxy that adds a *second*
   `Access-Control-Allow-Origin` header (browsers reject a response with two),
   or a login gateway such as Authelia, Authentik or Cloudflare Access that
   answers `/rest` requests with its own login page.
3. **A server other than Navidrome** that does not send the header — see
   [Other servers](#other-servers) below.

And one setup avoids all of it: **Kultr and your server on one address**, so
the browser never makes a cross-origin request in the first place. Every
install option in [INSTALL.md](INSTALL.md) already does this for you.

---

## Using the hosted app, or a typed address

With a plain Navidrome there is nothing to configure. Check the three points
above, in order:

- **HTTPS.** Use an address starting with `https://`, with a certificate your
  browser trusts — Caddy gets one from Let's Encrypt automatically. A
  self-signed certificate just fails: a browser never asks about a certificate
  for a request a page makes in the background.
- **Login gateways.** Let `/rest/` and `/share/` through without the gateway's
  login. Subsonic apps sign in with their own username and password on every
  request; they cannot fill in a login page.
- **Do not add CORS headers in front of Navidrome.** It already sends them;
  a proxy that adds its own produces two, and the browser then blocks every
  request. If a guide told you to add `add_header Access-Control-Allow-Origin`
  (or Caddy's `header Access-Control-Allow-Origin`), take it out.

### Allowing only the hosted app

Navidrome's `*` lets any web page talk to your server — although only with a
username and password that page would have to know. If you would rather allow
just one origin, **replace** Navidrome's header in your proxy instead of adding
another. The origin is the page's address with no path: `https://web.kultr.cc`.
(It used to be `https://evropiani.github.io`; if you allowed that before, it no
longer matches.)

<details>
<summary>Caddy</summary>

```caddy
music.example.com {
	reverse_proxy navidrome:4533 {
		# Replaces Navidrome's own header rather than adding a second one.
		header_down Access-Control-Allow-Origin "https://web.kultr.cc"
	}
}
```
</details>

<details>
<summary>nginx</summary>

```nginx
location /rest/ {
    proxy_pass http://127.0.0.1:4533;
    proxy_set_header Host $host;
    # Drop Navidrome's header, then send exactly one of our own.
    proxy_hide_header Access-Control-Allow-Origin;
    add_header Access-Control-Allow-Origin "https://web.kultr.cc" always;
}
```
</details>

Both were checked in front of Navidrome 0.64 with a browser on the allowed
origin: the API and the audio load, and Web Audio can read the audio. The
"add a header" versions of the same configs were blocked outright.

---

## Other servers

Kultr speaks the Subsonic API, so it can connect to other servers, but not all
of them send CORS headers everywhere Kultr needs them. Supysonic, for example,
sends them on API responses but not on audio or cover art.

Kultr asks for audio in a form Web Audio can read (that is what the equaliser
and InjeKt's bass swap work on), so when the audio responses carry no header
the browser refuses to load them and playback fails. With such a server, put
Kultr and the server on one address, as below.

---

## One address: nothing for the browser to object to

### You are using Kultr's own server or the Docker image

Already solved. Set `KULTR_NAVIDROME_URL` and Kultr forwards `/rest` and
`/share` to Navidrome itself:

```bash
KULTR_NAVIDROME_URL=http://localhost:4533 npm run serve
```

Then **leave the server field blank on the login screen.** That is the whole
trick — blank means "the same address this page came from".

Check it is proxying:

```bash
curl -s "http://localhost:4180/rest/ping?u=x&p=x&v=1.16.1&c=Kultr&f=json"
```

A JSON response (even an authentication error) means the proxy works. An HTML
page or a message about not proxying means `KULTR_NAVIDROME_URL` is not set.

### You are developing

```bash
echo "KULTR_PROXY_TARGET=http://localhost:4533" > .env
npm run dev
```

Vite proxies `/rest` and `/share` for you. Leave the server field blank.

### You already run Caddy

Copy [`deploy/Caddyfile`](../deploy/Caddyfile). The important part:

```caddy
music.example.com {
	handle /rest/*  { reverse_proxy navidrome:4533 }
	handle /share/* { reverse_proxy navidrome:4533 }
	handle          { reverse_proxy kultr:4180 }
}
```

### You already run nginx

Copy [`deploy/nginx.conf`](../deploy/nginx.conf). The important part:

```nginx
location /rest/ {
    proxy_pass http://127.0.0.1:4533;
    proxy_set_header Host $host;
    proxy_http_version 1.1;
}

location / {
    root /srv/kultr/dist;
    try_files $uri $uri/ /index.html;
}
```

### You already run Traefik

Two routers on the same host, with `/rest` taking priority:

```yaml
labels:
  - 'traefik.http.routers.navidrome.rule=Host(`music.example.com`) && (PathPrefix(`/rest`) || PathPrefix(`/share`))'
  - 'traefik.http.routers.navidrome.priority=100'
  - 'traefik.http.services.navidrome.loadbalancer.server.port=4533'
  # …and on the Kultr container:
  - 'traefik.http.routers.kultr.rule=Host(`music.example.com`)'
  - 'traefik.http.routers.kultr.priority=1'
  - 'traefik.http.services.kultr.loadbalancer.server.port=4180'
```

---

## Quick diagnosis

Open your browser's developer console (<kbd>F12</kbd>) and look at the failing
request.

| What you see | What it means |
|---|---|
| `Mixed Content: ... was loaded over HTTPS, but requested an insecure resource` | HTTPS page, `http://` server. Put Navidrome behind HTTPS. |
| `The 'Access-Control-Allow-Origin' header contains multiple values` | Your proxy adds a header Navidrome already sends. Remove it, or replace Navidrome's (above). |
| `blocked by CORS policy` … `No 'Access-Control-Allow-Origin' header` | Something in front of Navidrome answered instead of it (a login gateway, an error page), or the server does not send the header. |
| `ERR_CERT_AUTHORITY_INVALID` or another certificate error | The certificate is not trusted. Use a real one. |
| `ERR_CONNECTION_REFUSED` | Nothing is listening. Wrong port, or the server is down. |
| `ERR_NAME_NOT_RESOLVED` | The hostname does not exist from where the browser is. |
| `404` on `/rest/ping` | The address is not the music server, or a path prefix is missing. |
| `401`/`403`, or Kultr says "Wrong username or password" | You reached the server — this is just credentials. |
| Works on your PC, fails on your phone | `localhost` means the phone itself. Use the machine's LAN address or its domain. |

A useful check from any terminal:

```bash
curl -s -D - -o /dev/null -H "Origin: https://web.kultr.cc" \
  "https://YOUR-SERVER/rest/ping?u=x&p=x&v=1.16.1&c=Kultr&f=json"
```

You want an `HTTP/… 200` and exactly one `Access-Control-Allow-Origin` line.
None means something other than Navidrome answered; two means your proxy adds
one.
