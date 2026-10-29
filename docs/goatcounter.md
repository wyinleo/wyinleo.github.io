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

## Five-minute visit counting

The integration disables automatic page-load counting and records at most one
visit per browser, canonical page path, and five-minute interval measured from
the last recorded visit. The timestamp is stored in localStorage. An eligible
page load uses the official `count({no_session: true})` API to avoid the default
eight-hour session deduplication. Reopening or refreshing a page after five
minutes can therefore add another visit. Merely leaving a page open does not
generate visits. Background tabs wait until they first become visible.

This measures visits, not unique people. Different browsers or clearing browser
storage can lead to separate counts. If timestamp storage fails, the integration
falls back to GoatCounter's default session counting. Localhost, iframe, and
visitor opt-out filters remain in effect. The public counter's four-hour cache
is independent of this visit-counting interval and remains unchanged.

API documentation: https://www.goatcounter.com/help/js
