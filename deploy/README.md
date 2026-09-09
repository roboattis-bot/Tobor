# Tobor on the workshop Raspberry Pi

The Tobor LAN URL is `http://172.16.17.177:3001`. Devices must be able to reach that address on the workshop Wi-Fi. The Pi address is assigned by DHCP; reserving `172.16.17.177` on the router keeps the link stable.

## Isolation

Tobor uses `/opt/tobor` for its application and its own Node 24.18 runtime, `/var/lib/tobor` for SQLite and uploads, `/etc/tobor/tobor.env` for configuration, and `tobor.service` for automatic startup. CyberCity remains in `/opt/cybercity`, using its original Node 20 runtime and port 80. Tobor deployment does not change those files or restart that service.

The inspected Pi is a 64-bit Raspberry Pi 3 with approximately 1 GB RAM and 12 GB free disk space. Builds run on the development computer. Only the compiled application and backend runtime dependencies are installed on the Pi. The service uses a 160 MB Node JavaScript heap limit, two worker threads, lower scheduling priority, and a one-core CPU quota. These settings are not a total process memory limit: the Pi kernel currently has no memory cgroup controller enabled, and no boot configuration was changed.

The Three.js animation runs in each visitor's browser. It does not use the Pi's GPU to render the dashboard.

## Build and package

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run package:pi
```

`scripts/package-pi.mjs` creates a timestamped package under `.tools/pi-releases/` and writes its location into `.tools/pi-release.json`. It compiles the backend to `server.mjs`, copies `dist/`, pins the runtime's direct backend dependencies to the installed lockfile versions, and creates a SQLite backup with uploads. Existing local browser sessions are removed from the copy; accounts and business records are preserved. The local database is not changed.

Generate a runtime package lock in the package's `app` directory using `npm install --package-lock-only --ignore-scripts`, then transfer the release over SSH. Keep all archives private: the initial deployment archive contains a database backup. Backend dependencies install with `npm ci --omit=dev --ignore-scripts` using `/opt/tobor/node/bin` on `PATH`.

For the first deployment, initialize `/var/lib/tobor` from the state snapshot. For every subsequent update, deploy only a new application release and preserve `/var/lib/tobor`. Switch `/opt/tobor/current` to the new verified release, then restart only `tobor.service`. Keep the previous application release for rollback.

The ARM64 Node runtime is downloaded from Node.js and verified against its [official release checksums](https://nodejs.org/download/release/v24.18.0/SHASUMS256.txt). Database snapshots use the [Node SQLite backup API](https://nodejs.org/download/release/v24.18.0/docs/api/sqlite.html#sqlitebackupsource-db-path-options).

## Service operations

```bash
systemctl status tobor.service --no-pager
journalctl -u tobor.service -n 50 --no-pager
systemctl restart tobor.service
curl http://127.0.0.1:3001/api/health
systemctl is-active cybercity.service
curl -I http://127.0.0.1/
```

The checked-in `tobor.service` and `tobor.env.example` describe the deployment. The service starts at boot and restarts after a process failure. `COOKIE_SECURE=false` is an explicit choice for HTTP on this LAN; session cookies remain HTTP-only and SameSite Strict. If HTTPS is configured later, update `APP_ORIGIN` and set `COOKIE_SECURE=true`.

From the development computer on the same network, run `npm.cmd run check:deployment -- http://172.16.17.177:3001`. This read-only check verifies API health, preservation of the administrator setup, anonymous access restrictions, and the deployed desktop/mobile login page in Microsoft Edge. It saves screenshots in `test-results/` and does not create accounts or alter business records.

Back up `/var/lib/tobor` with SQLite's online backup API, or stop only Tobor cleanly before copying its complete data directory. Restore to a separate location and verify login, records and attachments before changing the live data. A copy on the same SD card is not protection against SD-card failure.

Do not store the SSH password or runtime configuration secrets in Git. Deployment archives and private data remain excluded by `.gitignore`.
