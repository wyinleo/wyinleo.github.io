# GoatCounter tracker

The official tracker is hosted alongside the website because requests to
`https://gc.zgo.at/count.js` repeatedly timed out during diagnosis on 2026-10-29,
while the GoatCounter site's public counter endpoint remained reachable.

Official self-hosting instructions: https://www.goatcounter.com/help/countjs-host

Source: https://github.com/arp242/goatcounter/blob/main/public/count.js
Git blob SHA: `3b5f6bc87a35c67875fd3efe52e75f8317949d85`
Retrieved: 2026-10-29

The source is copied unchanged to `assets/js/goatcounter-count.js` and
`_staticsite/goatcounter-count.js`. The upstream file declares the ISC license.
When updating, keep these copies and the tracked `_site/assets/js/` copy in sync.
The integration in `goatcounter.js` loads this sibling file and sends visits to
the configured GoatCounter site. No private API key is used.

The public `TOTAL.json` result can be cached for up to four hours. The displayed
count is not expected to increase immediately after a visit.
