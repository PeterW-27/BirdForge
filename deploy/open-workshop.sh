#!/bin/sh
set -eu
: "${HOST:?Set HOST to your SSH user@host before running this template}"
if ! lsof -nP -iTCP:8790 -sTCP:LISTEN >/dev/null 2>&1; then
  ssh -f -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 8790:127.0.0.1:8790 "$HOST"
fi
open "http://localhost:8790/"
echo "Gunter's workshop is open at http://localhost:8790/ (only on this Mac)."
