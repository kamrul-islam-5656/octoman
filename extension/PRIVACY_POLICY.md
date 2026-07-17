# Octoman Local Request Helper — Privacy Policy

_Last updated: 2026-07-16_

Octoman Local Request Helper ("the extension") does not collect, store, sell, or transmit any
personal data or browsing activity, to us or to any third party.

## What the extension does

When you send a request to a `localhost`, `127.0.0.1`, or private-network address from the
Octoman web app, the extension's background script makes that network call on your behalf and
returns the response directly to the Octoman page in your browser. This happens entirely on
your device.

## What the extension does not do

- It does not read, log, or transmit the contents of requests or responses anywhere.
- It does not track your browsing activity.
- It does not run on any site other than Octoman's own pages (see the extension's manifest for
  the exact list).
- It contains no analytics, telemetry, or third-party scripts.

## Permissions

The extension requests broad host permissions (`http://*/*`, `https://*/*`) so its background
script can reach whatever local or private address you point Octoman at — this is required for
the extension to function, since users test different backends on different ports. This
permission is used exclusively to fulfill requests you explicitly initiate from Octoman; it is
never used to access or transmit data from other sites you visit.

## Contact

Questions about this policy: replace with your support email before publishing.
