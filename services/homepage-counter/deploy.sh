#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
host=${DEPLOY_HOST:-tencent-remote-beijing}
release=$(date -u +%Y%m%dT%H%M%SZ)
archive=$(mktemp /tmp/homepage-counter.XXXXXX)
trap 'rm -f "$archive"' EXIT
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$archive" server.mjs server.test.mjs seed.json homepage-counter.service nginx-location.conf nginx-rate.conf
scp "$archive" "$host:/tmp/homepage-counter-$release.tar.gz"
ssh -o BatchMode=yes "$host" "sudo -n bash -s -- '$release'" <<'REMOTE'
set -euo pipefail
release=$1
root=/srv/homepage-counter
backup=/var/backups/homepage-counter/$release
nginx_site=/etc/nginx/sites-available/yamayuki
snippet=/etc/nginx/snippets/homepage-counter.conf
rate=/etc/nginx/conf.d/homepage-counter-rate.conf
unit=/etc/systemd/system/homepage-counter.service
install -d -m 700 "$backup"
cp -a "$nginx_site" "$backup/yamayuki"
for f in "$snippet" "$rate" "$unit"; do
    if [ -f "$f" ]; then cp -a "$f" "$backup/$(basename "$f")"; fi
done
previous=$(readlink "$root/current" || true)
if [ ! -f "$unit" ]; then previous=; fi
rollback() {
    systemctl stop homepage-counter || true
    cp -a "$backup/yamayuki" "$nginx_site"
    for f in "$snippet" "$rate" "$unit"; do
        if [ -f "$backup/$(basename "$f")" ]; then
            cp -a "$backup/$(basename "$f")" "$f"
        else
            rm -f "$f"
        fi
    done
    if [ -n "$previous" ]; then
        ln -sfn "$previous" "$root/current"
        systemctl daemon-reload
        systemctl restart homepage-counter || true
    else
        rm -f "$root/current"
        systemctl daemon-reload
    fi
    nginx -t && systemctl reload nginx
}
trap rollback ERR
getent passwd homepagecounter >/dev/null || useradd --system --home-dir "$root" --shell /usr/sbin/nologin homepagecounter
install -d -m 755 "$root" "$root/releases" "$root/releases/$release"
install -d -m 700 "$root/config"
install -d -m 700 -o homepagecounter -g homepagecounter "$root/data"
tar -xzf "/tmp/homepage-counter-$release.tar.gz" -C "$root/releases/$release"
chmod -R a+rX "$root/releases/$release"
cd "$root/releases/$release"
/snap/node/current/bin/node --test server.test.mjs
if [ ! -f "$root/config/counter.env" ]; then
    umask 077
    {
        printf 'COUNTER_SECRET=%s\n' "$(openssl rand -hex 32)"
        printf 'COUNTER_DB=%s/data/counter.sqlite\n' "$root"
        printf 'COUNTER_SEED_FILE=%s/current/seed.json\n' "$root"
        printf 'COUNTER_ORIGINS=https://wyinleo.github.io\nPORT=3210\n'
    } > "$root/config/counter.env"
fi
ln -s "$root/releases/$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
install -m 644 homepage-counter.service "$unit"
install -m 644 nginx-location.conf "$snippet"
install -m 644 nginx-rate.conf "$rate"
python3 - "$nginx_site" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
line = '    include /etc/nginx/snippets/homepage-counter.conf;'
anchor = '    include /etc/nginx/snippets/yamayuki-site-links.conf;'
if line not in text:
    if text.count(anchor) != 1:
        raise SystemExit('Unexpected Nginx configuration; no changes made')
    path.write_text(text.replace(anchor, anchor + '\n' + line))
PY
nginx -t
systemctl daemon-reload
systemctl restart homepage-counter
for attempt in 1 2 3 4 5; do
    if curl --noproxy '*' -fsS http://127.0.0.1:3210/health >/dev/null; then break; fi
    sleep 1
done
curl --noproxy '*' -fsS http://127.0.0.1:3210/api/stats
systemctl reload nginx
for attempt in 1 2 3 4 5; do
    if curl --noproxy '*' -fsS --resolve yamayuki.space:443:127.0.0.1 https://yamayuki.space/homepage-counter/health >/dev/null; then break; fi
    sleep 1
done
curl --noproxy '*' -fsS --resolve yamayuki.space:443:127.0.0.1 https://yamayuki.space/homepage-counter/api/stats
curl --noproxy '*' -fsS --resolve yamayuki.space:443:127.0.0.1 https://yamayuki.space/ >/dev/null
curl --noproxy '*' -fsS http://127.0.0.1:3100/api/health
systemctl enable homepage-counter
trap - ERR
printf '\nCounter release: %s\nConfiguration backup: %s\n' "$release" "$backup"
REMOTE
