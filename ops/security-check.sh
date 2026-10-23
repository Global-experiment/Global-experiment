#!/bin/bash
# Server security check (docs/operations/security-hardening-2026-10-23.md).
#
# Installed on the VPS as /usr/local/sbin/ge-security-check. Every release
# runs it first and stops if it fails; a weekly systemd timer
# (ge-security-check.timer) appends its result to /var/log/ge-security-check.log.
#
# Fails when: SSH accepts passwords or keyboard-interactive login, root can
# log in with anything but a key, fail2ban (with its sshd jail) isn't
# running, the firewall is off or lets in anything but 22/80/443, or a
# service listens on a public address on another TCP port.
# Prints PASS/FAIL lines only, never secrets. Exit code 0 = all passed.
set -uo pipefail

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

sshd_value() { sshd -T 2>/dev/null | awk -v key="$1" '$1 == key { print $2; exit }'; }

[ "$(sshd_value passwordauthentication)" = "no" ] && pass "SSH password login is off" || fail "SSH password login is on (passwordauthentication $(sshd_value passwordauthentication))"
[ "$(sshd_value kbdinteractiveauthentication)" = "no" ] && pass "SSH keyboard-interactive login is off" || fail "SSH keyboard-interactive login is on"
case "$(sshd_value permitrootlogin)" in
  prohibit-password | without-password | no) pass "root can log in with a key only ($(sshd_value permitrootlogin))" ;;
  *) fail "root login isn't key-only (permitrootlogin $(sshd_value permitrootlogin))" ;;
esac

if systemctl is-active --quiet fail2ban && fail2ban-client status sshd > /dev/null 2>&1; then
  pass "fail2ban is running with the sshd jail ($(fail2ban-client status sshd | awk -F'\t' '/Currently banned/ {print $2}') banned now)"
else
  fail "fail2ban isn't running, or has no sshd jail"
fi

ufw_status=$(ufw status verbose 2>/dev/null)
if printf '%s\n' "$ufw_status" | grep -q "^Status: active" && printf '%s\n' "$ufw_status" | grep -q "deny (incoming)"; then
  pass "firewall is active, incoming denied by default"
else
  fail "firewall is off or allows incoming by default"
fi
# ALLOW rules may only open 22 and 80/443 (fail2ban's REJECT rules are fine).
extra=$(printf '%s\n' "$ufw_status" | awk '/ALLOW IN/ { print $1 }' | grep -vE '^(22/tcp|80,443/tcp|80/tcp|443/tcp)$' | sort -u | tr '\n' ' ')
[ -z "$extra" ] && pass "firewall opens only 22, 80 and 443" || fail "firewall also opens: $extra"

# Listening TCP ports on non-loopback addresses.
public=$(ss -ltnH | awk '{ print $4 }' | grep -vE '^(127\.|\[::1\]|\[::ffff:127\.)' | sed -E 's/.*:([0-9]+)$/\1/' | sort -un | grep -vxE '22|80|443' | tr '\n' ' ')
[ -z "$public" ] && pass "only ports 22, 80 and 443 listen publicly" || fail "also listening publicly on TCP: $public"

if [ "$failures" -eq 0 ]; then
  echo "RESULT: all checks passed"
else
  echo "RESULT: $failures check(s) failed"
fi
exit "$failures"
