# Connection problems, and how to fix them properly

If Kultr says

> Could not reach the server. Check the address, that it is running, and that
> cross-origin requests are allowed.

…and you are certain the address is right and Navidrome is up, this page is for
you. It is almost always the browser's same-origin rule, not a bug.

---

## The 30-second version

A page loaded from `https://a.example` is not allowed to call an API at
`https://b.example` unless `b.example` sends a header saying it is fine. That
rule is **CORS**, and Navidrome does not send that header by default.

**The fix is not to make Navidrome permissive. The fix is to stop making a
cross-origin request at all** — put Kultr and Navidrome on one address, with
one reverse proxy. Then the browser has nothing to object to.

Every install option in [INSTALL.md](INSTALL.md) already does this for you.

---

## Why same-origin is worth the small effort

It is not only about the error message. When the audio comes from the page's
own origin, the browser lets Web Audio read the samples. That is what powers:

- the **10-band equaliser**
- InjeKt's **bass swap** (the low-shelf filters on each deck)

Cross-origin audio without CORS headers is played but not readable, so
`MediaElementSource` outputs silence. Kultr detects that — it watches for the
analyser reporting a flat zero while the track is clearly playing — and
automatically rebuilds its decks without Web Audio, telling you what happened.
Playback and crossfade keep working. Those three features do not.

So: same origin gets you the full app, and no configuration anywhere.

---

## How to get to one address

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

## If you really must stay cross-origin

For example, using the hosted demo against your own server. You then have to
add the headers in front of Navidrome. Be deliberate about it: this is telling
browsers that a page you do not control may talk to your music server.

Allow **one specific origin**, never `*`:

<details>
<summary>Caddy</summary>

```caddy
music.example.com {
	@cors header Origin https://evropiani.github.io
	handle /rest/* {
		header @cors Access-Control-Allow-Origin "https://evropiani.github.io"
		header @cors Vary "Origin"
		reverse_proxy navidrome:4533
	}
	handle { reverse_proxy navidrome:4533 }
}
```
</details>

<details>
<summary>nginx</summary>

```nginx
location /rest/ {
    if ($http_origin = "https://evropiani.github.io") {
        add_header Access-Control-Allow-Origin "$http_origin" always;
        add_header Vary "Origin" always;
    }
    # Preflight
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "$http_origin" always;
        add_header Access-Control-Allow-Headers "Accept, Range" always;
        add_header Access-Control-Max-Age 86400 always;
        return 204;
    }
    proxy_pass http://127.0.0.1:4533;
    proxy_set_header Host $host;
}
```
</details>

Two things to know if you go this way:

- **Mixed content.** An HTTPS page cannot call an `http://` address at all. If
  Kultr is on HTTPS, Navidrome must be too. Browsers make an exception for
  `http://localhost`.
- The equaliser and bass swap still need the audio responses to
  carry the header too, not just the API — which the `/rest/` block above does
  cover, since streaming lives under `/rest/stream`.

---

## Quick diagnosis

Open your browser's developer console (<kbd>F12</kbd>) and look at the failing
request.

| What you see | What it means |
|---|---|
| `blocked by CORS policy` | Classic cross-origin block. Use a reverse proxy. |
| `Mixed Content: ... was loaded over HTTPS, but requested an insecure resource` | HTTPS page, `http://` server. Put Navidrome behind HTTPS too. |
| `ERR_CONNECTION_REFUSED` | Nothing is listening. Wrong port, or Navidrome is down. |
| `ERR_NAME_NOT_RESOLVED` | The hostname does not exist from where the browser is. |
| `404` on `/rest/ping` | The address is not Navidrome, or a path prefix is missing. |
| `401`/`403`, or Kultr says "Wrong username or password" | You reached the server — this is just credentials. |
| Works on your PC, fails on your phone | `localhost` means the phone itself. Use the machine's LAN address. |

A useful check from the machine running Kultr:

```bash
curl -s "http://YOUR-NAVIDROME:4533/rest/ping?u=x&p=x&v=1.16.1&c=Kultr&f=json"
```

If that returns JSON, the server is fine and the problem is in the browser's
view of it — which is what this page is about.
