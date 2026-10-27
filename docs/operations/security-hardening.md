# Server security hardening

Applied 23 October 2026; verified 27 October 2026 (the weekly check of 26 October passed every item).

The VPS (Hetzner Cloud, Nuremberg; `ssh ge-vps`) was still on the hosting
image's defaults: SSH accepted passwords and root password logins (about
19,000 password guesses a day), there was no fail2ban, the firewall opened
PostgreSQL's port 5432 to the internet, and a kernel update waited for a
reboot. Nothing suggests a break-in: every login of the previous week used
an SSH key.

## What changed

| Area | Before | After |
|---|---|---|
| SSH login | passwords allowed; root with a password | keys only; root with a key only (`prohibit-password`); `MaxAuthTries 3`; keyboard-interactive off |
| Brute-force protection | none | fail2ban 1.1: `sshd` jail (5 failures in 10 min → banned 1 h), `recidive` jail (5 bans in a day → banned a week, every port); bans through ufw; the owner's address and localhost never banned |
| Firewall (ufw) | 22, 80/443, **5432** open | 22, 80/443 only; incoming denied by default. PostgreSQL itself only ever listened on localhost |
| Packages | 28 updates pending, kernel 7.0.0-34 | 23 upgraded, kernel 7.0.0-38 after a reboot (34 s offline). 5 held back by Ubuntu (cloud-init, qemu-guest-agent, ubuntu-virt and its helper: new dependencies / staged rollout); automatic security updates stay on |
| Checks | none | `ge-security-check` before every release, and weekly |

Files on the server:

- `/etc/ssh/sshd_config.d/00-root-password.conf` — the hosting image's file,
  now holding the hardened values. sshd reads the first value it finds, and
  this file is read first, so nothing later can override it (checked with
  `sshd -T`).
- `/etc/fail2ban/jail.local` — the two jails.
- `/usr/local/sbin/ge-security-check` — the check (source: `ops/security-check.sh`).
- `/etc/systemd/system/ge-security-check.{service,timer}` — weekly run,
  Mondays 06:00 UTC (source: `ops/`), output appended to
  `/var/log/ge-security-check.log`.
- Backups taken first: `/root/backups/ssh-20261023-135230/` (the SSH
  configuration) and the database dump `ge-prod-20261023-135355.dump`
  (SHA-256 `91b1363c…2bee`, with a matching copy on the owner's computer).

## How it was applied (no lockout)

1. A second SSH session stayed open during the change.
2. An automatic rollback (systemd timer, 10 minutes) was armed before the
   SSH reload, and cancelled only after a **new** session logged in with a
   key and a password-only attempt was refused (`Permission denied
   (publickey)`; the server now offers `publickey` only).
3. fail2ban was started with the owner's address in `ignoreip`, then
   checked: not banned.

## How to check

```sh
ssh ge-vps /usr/local/sbin/ge-security-check      # PASS/FAIL lines, exit code 0 = all passed
ssh ge-vps 'tail -20 /var/log/ge-security-check.log; systemctl list-timers ge-security-check.timer'
ssh ge-vps 'sshd -T | grep -E "^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication|maxauthtries) "'
ssh ge-vps 'fail2ban-client status sshd; ufw status verbose'
```

The check fails when SSH accepts passwords or keyboard-interactive login,
root can log in with anything but a key, fail2ban (with its sshd jail)
isn't running, the firewall is off or lets in anything but 22/80/443, or a
service listens publicly on another TCP port. The release scripts call it
first (`security_preflight` in the runbook's `common.sh`) and stop if it
fails.

## Rollback

- **SSH:** copy the files back from `/root/backups/ssh-20261023-135230/`
  (`sshd_config`, `sshd_config.d/`), run `sshd -t`, then
  `systemctl reload ssh`. This brings password login back, so only do it
  if key login is broken — and from the Hetzner Cloud console if SSH itself
  is unreachable.
- **fail2ban:** `systemctl disable --now fail2ban`; to lift one ban:
  `fail2ban-client set sshd unbanip <address>`.
- **Firewall:** `ufw allow 5432` reopens PostgreSQL's port (not needed: the
  database is reached only from the server itself).
- **Kernel:** the previous kernel (7.0.0-34) is still installed and can be
  chosen at boot from the Hetzner console.
- **Weekly check:** `systemctl disable --now ge-security-check.timer`.

## Locked out?

If a key stops working (a new computer, a lost key), log in from the
Hetzner Cloud Console (web console, root password), add the new public key
to `/root/.ssh/authorized_keys`, and keep password login off.
