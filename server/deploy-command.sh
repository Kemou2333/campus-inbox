#!/bin/sh
set -eu
[ "${SSH_ORIGINAL_COMMAND:-}" = "deploy-campus-inbox" ] || exit 1
exec /usr/bin/sudo -n /usr/local/sbin/campus-inbox-install
