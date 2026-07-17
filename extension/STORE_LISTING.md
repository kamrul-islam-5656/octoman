# Chrome Web Store listing draft

Copy/paste starting points for the Developer Dashboard fields when you submit.

## Name
Octoman Local Request Helper

## Short description (max 132 characters)
Lets Octoman reach localhost and private-network backends from your browser, without CORS setup.

## Detailed description
Octoman is an API testing workspace (like Postman) that runs as a web app. Browsers block a
web page from calling `localhost` or private-network addresses unless that server explicitly
allows it via CORS — which most local dev servers don't.

This extension removes that restriction for Octoman. Once installed, requests you send to
`localhost`, `127.0.0.1`, or private IP ranges (10.x, 172.16–31.x, 192.168.x) are executed by
the extension's background script instead of the page itself, so your local server doesn't
need any CORS configuration at all.

- Works automatically once installed — nothing to run or configure.
- Only activates for Octoman's own pages.
- Does not collect, store, or transmit any of your data anywhere. It only relays requests you
  initiate from Octoman to the destination you specify, and returns the response to the page.

## Category
Developer Tools

## Permission justification (for the review form)
- **host_permissions (`http://*/*`, `https://*/*`)**: required so the background script can
  fetch whatever URL the user enters in Octoman — including arbitrary localhost ports and
  private-network addresses used by their own development backends. Scoping this to a fixed
  list isn't possible since users test different local ports/services.
- **content_scripts on Octoman's own origin(s) only**: used solely to relay messages between
  the Octoman page and the background script; it does not read or modify page content.

## Privacy policy
See `PRIVACY_POLICY.md` in this folder — host its contents at a public URL (e.g. a page on
your own site) and link it from the Web Store listing.
