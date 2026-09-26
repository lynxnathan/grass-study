# Publishing the field

Public address: **https://grass.capybaragpt.xyz/**.
Worker: `grass-not-what-you-think`.

Version **0.1.0**, deployed on 2026-09-27. Cloudflare version:
`a5f496d5-4b44-4bf7-86fa-da64adae81d8`.

The site is a static Vite build hosted with
[Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).
Rendering and interaction run in the browser. The same `dist/` directory can be
served by another static host; Cloudflare configuration stays in `wrangler.jsonc`.

## Deploy

```sh
npm ci
npx wrangler login
npm run deploy
```

`npm run deploy` builds the project before uploading `dist/`. The character and its
CC0 license are included. Source files, local screenshots, tests and credentials
are outside the upload directory.

On Nathan's desktop, run Wrangler as `lynxnathan` (UID 1000). Its encrypted login
uses the GNOME keyring through the user's session bus:

```sh
export XDG_CONFIG_HOME=/home/lynxnathan/.config
export XDG_RUNTIME_DIR=/run/user/1000
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
npm run deploy
```

An existing authenticated session does not need another login. Credentials stay
in Wrangler's credential store, outside this repository.

## Check a release

Open the deployed URL in a fresh browser session. Confirm the character loads,
jump from 00 through 13 and back, move and orbit, brush the grass, and add or
reverse a wind. Use Tab with scene focus to fade Force view in/out; V/B filter
wind/contact, and Shift+Tab enters the toolbar. In 10–13, reveal layers, switch tuft construction, separate
shells, show sample visits, and place/remove a contact stone. In 09, stop the rain and move the sky into night. Check the browser console and asset requests for errors. The production
build omits the development-only `window.__study` inspection hook.

For a local production preview, use `npm run build` followed by `npm run preview`.
