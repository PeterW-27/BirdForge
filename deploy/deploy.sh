#!/bin/sh
set -eu
: "${HOST:?Set HOST to your SSH user@host before running this template}"
cd "$(dirname "$0")/.."

echo "Uploading Birdforge to $HOST ..."
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -czf - index.html forge.html package.json server src styles assets deploy/birdforge.service \
  | ssh "$HOST" 'set -e
    id birdforge >/dev/null 2>&1 || useradd --system --home /nonexistent --shell /usr/sbin/nologin birdforge
    rm -rf /srv/birdforge/app.new
    mkdir -p /srv/birdforge/app.new
    tar xzf - -C /srv/birdforge/app.new --no-same-owner
    chown -R root:root /srv/birdforge/app.new
    chmod -R a+rX /srv/birdforge/app.new
    if [ -d /srv/birdforge/app ]; then mv /srv/birdforge/app "/srv/birdforge/app.old.$(date +%s)"; fi
    mv /srv/birdforge/app.new /srv/birdforge/app
    install -m 0644 /srv/birdforge/app/deploy/birdforge.service /etc/systemd/system/birdforge.service
    systemctl daemon-reload
    systemctl enable birdforge.service >/dev/null 2>&1
    systemctl restart birdforge.service
    sleep 2
    systemctl is-active birdforge.service
    curl -s --unix-socket /run/birdforge/shop.sock http://localhost/api/health; echo
    curl -s http://127.0.0.1:8790/api/health; echo'
echo "Done. The shop service is running on the server."
