# Homepage visit counter

Public endpoint: `https://yamayuki.space/r/7c62d953a0ef498b`.
Frontend: `assets/js/visit-counter.js`; Jekyll URL: `_config.yml` → `visit_counter_code`.

Papernote endpoint: `https://yamayuki.space/r/b84e19f620d34ac7`.
Frontend URLs are Base64 encoded; opaque paths reduce readability only, and remain
visible in browser network tools. They are not secrets or access controls.
Papernote uses a separate `papernote.sqlite`, imports the 30 visits in
`papernote-seed.json` exactly once, and exposes `GET /api/history` for its daily
README chart. Original historical day labels are preserved; new visits use
Beijing time. Paths under `/papernote/` are accepted only by the papernote endpoint.
Its frontend honors Do Not Track and `skipgc=t`.

## Counting and display

- `POST /api/visit`: validate the page path and optional random browser UUID,
  atomically record an eligible visit, and return total/today/month counts.
- The same browser and page count once within five minutes of the last accepted
  visit. Different pages count separately. No timer creates visits.
- A browser UUID is stored under `homepage-counter:visitor` in localStorage.
  Only its server-keyed HMAC is stored in SQLite. If browser storage is blocked,
  a keyed hash of the proxy-supplied IP and browser User-Agent is used instead.
  Deduplication records expire after 24 hours; daily aggregates are retained.
- `GET /api/stats` reads counts without incrementing. Responses use `no-store`.
  The footer updates after a visit and every five minutes while visible.
- Calendar day and month boundaries use `Asia/Shanghai`.
- The immutable `seed.json` snapshot imports 6 prior GoatCounter visits once.
  Baseline counts retain their original day/month and are never re-imported on
  restart. The historical source can be cached, so this is a migration snapshot,
  not a complete export of all past events.
- The original GoatCounter integration is no longer loaded. Its code and account
  are retained for reference and rollback.

These counts measure visits rather than unique people. Clearing browser storage,
changing browsers, spoofing a visitor ID, or automated clients can affect totals.
Origin checks and rate limits reduce accidental misuse but are not authentication.

## Runtime and deployment

Node 22.23.4 with built-in `node:sqlite`, no third-party packages. Service binds
only `127.0.0.1:3210`; Nginx exposes the HTTPS path and overwrites the client-IP
header. Only `https://wyinleo.github.io` may submit browser visits. Nginx caps
request bodies at 2 KiB and requests at 30/minute/IP with a burst of 20. The service
runs as `homepagecounter`, with a private database directory and 128 MiB memory cap.

```sh
node --test services/homepage-counter/server.test.mjs
bash services/homepage-counter/deploy.sh
```

The deployment checks the exact existing Nginx include anchor, saves configuration
backups, tests on the server's Node version, switches release directories, checks
Nginx, and verifies the counter and existing site/H5 health. On failure it restores
the prior configuration and service release. It does not reset the database.

Server paths:

- Code: `/srv/homepage-counter/current` → `releases/<UTC timestamp>`
- Data: `/srv/homepage-counter/data/counter.sqlite` (SQLite WAL mode)
- Secret/config: `/srv/homepage-counter/config/counter.env` (root-only)
- Unit: `/etc/systemd/system/homepage-counter.service`
- Nginx: `/etc/nginx/snippets/homepage-counter.conf`
- Rate limit: `/etc/nginx/conf.d/homepage-counter-rate.conf`
- Config backups: `/var/backups/homepage-counter/<UTC timestamp>/`

Operational checks:

```sh
ssh tencent-remote-beijing 'sudo systemctl status homepage-counter --no-pager'
curl https://yamayuki.space/r/7c62d953a0ef498b/api/stats
```

For a consistent database backup, use SQLite's online backup API (e.g. Python's
`sqlite3.Connection.backup`) rather than copying only the main database file while
the service runs. Restore only with the counter service stopped. Changing the
HMAC secret resets browser deduplication but does not erase aggregates.

For frontend rollback, restore the GoatCounter script tag and footer identifiers
from commit `62185dc` and rebuild Jekyll. Existing GoatCounter history remains in
that account. Reverting the backend code should retain its database and secret.
