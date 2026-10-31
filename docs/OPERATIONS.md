# Render setup and release checks

Starter compute alone does not attach storage. In the existing Web Service add a Persistent Disk mounted at `/data`. Set `DATA_DIR=/data` and health check `/api/health`. Verify the disk appears in Render before creating real accounts. Data written before attaching the disk needs exporting first; attaching a disk does not migrate the ephemeral filesystem.

For Resend configure server environment variables (never VITE_ variables):
- `APP_URL=https://talyavaxbaum.onrender.com`
- `RESEND_API_KEY`: enter securely in Render, not chat or Git.
- `EMAIL_FROM`: verified sender/domain in Resend.
- `EMAIL_NOTIFICATIONS=1`: enable generic emails for new thread messages and check-in replies. Demo accounts do not receive notifications. No training, nutrition or health details are included in email.

Password reset works when the first three variables are configured. Links expire after 30 minutes and are single use; resetting revokes every existing session. Known and unknown addresses receive the same response. Notification delivery failures do not discard saved messages. Delivery retry queues, reminder scheduling and push notifications are not implemented.

After deployment: confirm `/api/health` returns `{"ok":true}`, sign in, verify an uploaded photo persists across a controlled redeploy, then test a reset email using an account you own. Actual email delivery and Render configuration cannot be validated without access to those services.

## Backups

Run `DATA_DIR=/data node --import tsx scripts/backup.ts /tmp/movement-backup-YYYY-MM-DD` from Render Shell. Choose a new destination each time. This uses SQLite VACUUM INTO for a consistent database copy and verifies integrity, then copies uploads. Pause uploads during the backup so database references and files describe the same point in time. Copy the resulting directory to separate durable storage immediately; `/tmp` is not durable and a backup on the same disk is not disaster recovery.

Schedule daily backups in your hosting/backup system once an external storage destination is selected. Automation and external retention are not configured by this repository script. Keep access restricted because backups contain personal data.

Restore on a separate instance first: stop the app, restore movement.db and uploads into an empty data directory, start with that DATA_DIR, verify health, sign-in, sample logs and media. Never overwrite a running SQLite database or leave old WAL/SHM files beside a restored database.

## Content needed before onboarding real clients

Talya must supply original photos/videos and approve her privacy/consent policy, including business identity, contact, data retention, hosting region and deletion requests. The existing placeholder consent is not a completed policy. No legal or health promises have been invented.
