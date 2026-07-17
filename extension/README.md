# Octoman Local Request Helper (browser extension)

Lets the Octoman web app run requests against `localhost`/private-network
backends with zero CORS setup — no terminal, nothing to keep running. Once
installed it's just always active.

## How it works

The extension's background service worker isn't a web page, so it isn't
subject to CORS the way the Octoman tab's own JavaScript is. With this
extension installed, Octoman sends the request to the extension instead of
fetching it directly; the extension's background script makes the real
network call (to any local or public host) and hands the result back to the
page.

## Install (unpacked, for now)

1. Open `chrome://extensions` (or `edge://extensions` in Edge).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `extension` folder.
4. Reload the Octoman tab. That's it — no further setup, it stays active as
   long as the extension is enabled.

Chrome will show a permissions warning ("read and change data on all
websites") — that's expected: an API-testing tool needs to reach whatever
host you point it at, the same way Postman's own browser tooling does.

## Priority order

If both this extension and the [local agent](../agent) are available,
Octoman prefers the extension (no process to keep running). If neither is
present, it falls back to executing directly from the browser tab, which
then requires the target backend to send CORS headers itself.

## Publishing to the Chrome Web Store

The package is submission-ready: icons (16/32/48/128), a toolbar popup, a
store listing draft, and a privacy policy draft are all included.

1. Bump `version` in `manifest.json` if needed.
2. Zip the contents of this folder (not the folder itself — the zip's root
   should contain `manifest.json` directly).
3. Host `PRIVACY_POLICY.md`'s contents at a public URL (e.g. a page on your
   own site) and have the link ready.
4. Create/sign in to your Chrome Web Store developer account
   (one-time $5 registration) at the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   upload the zip, and fill in the listing fields using `STORE_LISTING.md` as
   a starting point (name, descriptions, category, permission justification,
   privacy policy URL).
5. Submit for review. Google's review queue is typically a few days for a
   first submission.

This step has to happen under your own developer account — not something
that can be done on your behalf.

## Package contents

- `manifest.json` — extension config (icons, permissions, content script).
- `background.js` — service worker that makes the actual (CORS-free) fetch.
- `content-script.js` — bridges the Octoman page and the background script.
- `popup.html` — small status popup shown when the toolbar icon is clicked.
- `icons/` — 16/32/48/128px icons.
- `STORE_LISTING.md` — copy/paste draft for the Web Store listing fields.
- `PRIVACY_POLICY.md` — draft privacy policy to host publicly before submitting.
