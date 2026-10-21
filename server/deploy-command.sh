#!/bin/sh
set -eu
case "${SSH_ORIGINAL_COMMAND:-}" in
  deploy-campus-inbox) exec /usr/bin/sudo -n /usr/local/sbin/campus-inbox-install ;;
  deploy-campus-inbox-web) exec /usr/bin/sudo -n /usr/local/sbin/campus-inbox-web-install ;;
  *) exit 1 ;;
esac
