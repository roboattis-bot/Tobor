# Tobor project instructions

The owner wants completed application changes committed and pushed to `https://github.com/roboattis-bot/Tobor` after relevant checks, unless they explicitly request a review-only task or ask to hold the push. Keep commits focused and describe the actual final changes.

Never commit passwords, private keys, `.env` files, local databases, uploads, session tokens, temporary deployment archives, or test artifacts. Preserve the exclusions in `.gitignore`.

The Raspberry Pi at `172.16.17.177` also hosts another project. Tobor must remain separate:

- Application and its private Node runtime: `/opt/tobor`.
- Persistent data: `/var/lib/tobor`.
- Configuration: `/etc/tobor`.
- Service: `tobor.service`; application port: `3001`.
- Preserve `/opt/cybercity`, `cybercity.service`, the existing Node installation, port 80, and other existing services. Do not reboot or change global runtime symlinks as part of a Tobor deployment.

Build on the development computer. Deploy compiled frontend and backend with backend-only runtime dependencies. Use SQLite's backup API for a running local database; never copy just a live `.sqlite` file without its committed WAL state. Never overwrite existing Pi data during a code update.

Use the repository's package scripts. Run backend tests for authentication or workflow changes, a TypeScript/build check for application changes, and browser tests when frontend behavior changes. Read `deploy/README.md` before updating the Pi deployment.
