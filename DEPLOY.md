# Deploying Smetase (soft launch)

Draft. The API runs on Render (`render.yaml`); the three web front ends run on Cloudflare Pages. Steps marked **you** need an account, a payment or a decision only
you can make; the rest is in the repo.

## What gets deployed

| Piece | Where | Address |
|---|---|---|
| API + queue workers (one process) | Render web service (Docker) | `https://api.smetase.com` |
| PostgreSQL | Neon, free plan (until paid plans) | `*.neon.tech`, TLS |
| Redis (queues, rate counters) | Render Key Value | private network |
| Student app (`smetase-web`) | Cloudflare Pages | `https://app.smetase.com` |
| Staff app (dashboard repo) | Cloudflare Pages | `https://hub.smetase.com` |
| Landing page (`Lanr-org/smetase.com`) | Cloudflare Pages | `https://smetase.com` (+ `www`) |

The three hostnames must share one registrable domain: the login cookies are `SameSite=strict`, and
`*.onrender.com` addresses count as different sites, so login would silently fail on them.

## Free setup (until there is money for paid plans)

`render.yaml` is set up to cost nothing for now:

- **Database on Neon** (free, never expires, 1 GB). Render's free Postgres is deleted after 30 days, so it
  is not used. Neon sleeps after 5 minutes idle and wakes on the next query (a short delay).
- **API on Render free.** It sleeps after 15 minutes without traffic and takes about a minute to wake, which
  would delay Telegram replies. Keep it awake with a free pinger (below). Free services have no Shell and
  no pre-deploy step, so migrations run at start-up and the first admin is created from your laptop.
- **Redis on Render free Key Value.** In memory only: a restart drops jobs still waiting in the queue.
- Render gives 750 free hours a month per workspace. One API awake all month uses about 744, so keep
  it the only free web service there.

### Neon

1. Sign up at neon.com, create a project in **AWS Europe (Frankfurt)** (closest to Render's Frankfurt),
   Postgres 16 or newer.
2. Connection details: switch **off** "Connection pooling" and copy the direct connection string. It
   should end in `?sslmode=require`. This is `DATABASE_URL` in Render. Keep it in your password manager.
3. Watch Settings, Usage now and then: the free plan has 100 compute hours a month. Compute only runs
   while the app queries the database, so the pinger must use `/health/live` (no database), never
   `/health/ready`.

### Keep the API awake

At cron-job.org (free), add a job: `https://api.smetase.com/health/live`, every 10 minutes.

### Moving to paid plans later

Nothing is lost when you upgrade. Either stay on Neon (upgrade the Neon plan) or move the data to Render
Postgres with `pg_dump` from Neon and `pg_restore` into the new database, then change `DATABASE_URL`.
For the API, switch the plan to `starter`, put back `preDeployCommand: npx prisma migrate deploy` and
remove `dockerCommand`. Upgrading free Key Value wipes it (only queued jobs, which is fine), and the
pinger can then be removed.

## Before the first deploy

1. **Done: domain is `smetase.com`, DNS on Cloudflare.** The `api` record (to Render) must be DNS-only
   (grey cloud) so Render can issue its TLS certificate. Pages creates and proxies its own records.
2. **You: get the code onto `main`.** Render and Pages deploy `main`. The backend and the staff app
   currently work on `development`; `smetase-web` is already on `main`.
3. **You: Google sign-in.** In Google Cloud, add `https://app.smetase.com` as an authorised JavaScript
   origin on the web client, and publish the consent screen (it is in Testing mode, where only listed
   test users can sign in). You will paste the client ID into Render (`GOOGLE_CLIENT_ID`) and Pages
   (`VITE_GOOGLE_CLIENT_ID`).
4. **You: email.** Pick a provider (Resend, Brevo, Postmark, Amazon SES...), verify the sending domain
   (its SPF/DKIM DNS records), and note the SMTP host, user and password. Without this, staff
   invitations and password resets will not arrive.
5. **You: a separate production Telegram bot.** A bot has one webhook, so reusing the development bot
   would point it at production. In BotFather create a new bot, set its name and picture, and note the
   token and username. Make a webhook secret with `openssl rand -hex 32` (letters, digits, `_`, `-` only).
6. **You: AI key and limit.** Create a workspace-scoped Anthropic key (not a personal one) and set a
   monthly spend limit in the Anthropic console. This is the hard ceiling behind the app's own daily caps.
7. **You: Sentry.** Create a Node project and note its DSN.

## Create the API on Render

1. Render dashboard, New, **Blueprint**. Connect GitHub and give Render access to the backend repo
   (`School-Finder-AI-Agent-Backend`).
2. Pick the backend repo, branch `main`. Render reads `render.yaml`. Fix any validation message it shows
   (plan or field names are the likely ones).
3. Fill the prompted secrets: `DATABASE_URL` (Neon, see above), `GOOGLE_CLIENT_ID`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`,
   `SENTRY_DSN`.
4. Apply. Render builds the image, then the start command (`npm run start:migrate`) runs `prisma migrate deploy` and starts
   the API (on a paid plan, migrations move to the pre-deploy step). Watch the build log for errors.
5. In Cloudflare DNS, add the record Render shows for `api.smetase.com` (a CNAME to the
   `*.onrender.com` address), **DNS-only (grey cloud)**. Wait for the certificate to turn green.

## Create the web apps on Cloudflare Pages

Cloudflare dashboard, Workers & Pages, Create, Pages, **Connect to Git**. One project per repo:

| Project | Repo, branch | Build command | Output | Variables | Custom domain |
|---|---|---|---|---|---|
| `smetase-web` | `smetase-web`, `main` | `npm run build` | `dist` | `NODE_VERSION=22`, `VITE_API_URL=https://api.smetase.com/api/v1`, `VITE_GOOGLE_CLIENT_ID` | `app.smetase.com` |
| `smetase-staff` | `School-Finder-AI-Agent-Dashboard`, `main` | `npm run build` | `dist` | `NODE_VERSION=22`, `VITE_API_URL=https://api.smetase.com/api/v1` | `hub.smetase.com` |
| `smetase-landing` | `smetase.com`, `main` | `npm run build` | `dist` | `NODE_VERSION=22` | `smetase.com`, `www.smetase.com` |

- Add each custom domain in the project's Custom domains tab; Pages creates the DNS record itself.
- `VITE_*` values are baked in at build time: change one, then redeploy.
- Single-page routing needs nothing: with no `404.html`, Pages serves `index.html` for unknown paths,
  so `/study-plan` and `/p/:token` work on refresh.
- Security headers come from `public/_headers` in each repo.
- `www` to apex: add a Cloudflare Redirect Rule (Rules, Redirect Rules, "Redirect from WWW to root"
  template).
- Pages builds every push to `main`. To match Render's manual deploys, turn off automatic production
  deployments in the project's build settings if you want them gated.

## Create the first admin

Free services have no Shell, so run this once **from your laptop** (in the backend folder, in your own
PowerShell window, so the password never goes through a chat). Paste Neon's connection string and choose
a password (12+ characters with upper and lower case and a number):

    $env:DATABASE_URL = '<Neon connection string>'
    $env:BOOTSTRAP_ADMIN_PASSWORD = '<a strong password>'
    npx tsx scripts/bootstrap-admin.ts --email you@smetase.com --name "Your Name"
    Remove-Item Env:DATABASE_URL, Env:BOOTSTRAP_ADMIN_PASSWORD

On a paid plan you can instead run `npm run bootstrap:admin -- ...` in the service's Shell tab.

It creates the admin and the baseline setting groups and recommendation weights, and refuses to run if an
admin already exists. Then sign in at `https://hub.smetase.com`, change the password, and invite the team.

## Smoke test, in this order

1. `https://api.smetase.com/health/ready` returns `ready` with the database up.
2. Staff app: sign in, then invite someone and check the email arrives.
3. Student app: sign in with Google, finish the profile, see matches, choose a programme.
4. Telegram: the API log shows "Telegram webhook registered", then message the bot and get an AI reply.
5. Student app chat: send a message and get an AI reply.
6. Run a mock interview (web or `/interview`) through to the score.
7. Create and open a Study Plan share link.
8. Staff app: the student appears; assign an advisor; use "Talk to an advisor" from a student account.
9. Sentry: ask Claude Code to trigger a test error, and check it arrives with no tokens in it.

## Going live safely

- Auto-deploy is off in `render.yaml`, so nothing ships until you press Deploy. Roll back from the
  service's Events tab. On Pages, roll back from the project's Deployments list.
- Neon's free plan keeps 6 hours of restore history, not daily backups. The weekly GitHub backup
  below covers the rest.
- `TRUST_PROXY=3` is set (Cloudflare + two Render hops). With a wrong value every visitor shares one
  rate-limit bucket. Check it after infrastructure changes: a failed hub sign-in should show your own
  public IP in the audit log, not a 10.x or Cloudflare address.
- Seeing `AI daily reply cap reached` in Sentry means the platform-wide cap was hit; raise
  `AI_DAILY_REPLIES_GLOBAL` only after checking spend.
- Smetase is free for students, so AI cost is kept down with settings, not prices. Launch values
  (in `render.yaml`): `ANTHROPIC_MODEL=claude-sonnet-5-5`, `AI_DAILY_REPLIES_PER_STUDENT=20`,
  `AI_DAILY_REPLIES_GLOBAL=300`, `INTERVIEW_SESSIONS_PER_STUDENT_PER_DAY=1`, plus a monthly spend
  limit in the Anthropic console. If the service was created before these changed, set them in the
  Render dashboard too. After the first week, check what one student costs and raise the caps if it's small.

## Backups

`.github/workflows/neon-backup.yml` runs every Sunday at 02:00 UTC (and on demand from the Actions tab,
"Neon backup" -> Run workflow). It takes a `pg_dump` of Neon, encrypts it with AES-256, keeps it as a
workflow artifact for 90 days, then restores it into a throwaway Postgres and prints row counts. A red run
means either the backup or the restore test failed; GitHub emails you.

One-time setup, in the backend repo on GitHub: Settings -> Secrets and variables -> Actions -> New
repository secret:

- `NEON_DATABASE_URL`: the same direct Neon string as Render's `DATABASE_URL`.
- `BACKUP_PASSPHRASE`: a long random passphrase. Save it in the password manager first: without it the
  backups cannot be opened.

Then run it once by hand and check the restore step's row counts. Scheduled workflows only run from
`main`, and GitHub pauses them after 60 days without commits to the repo (re-enable from the Actions tab).

To restore: download the artifact from the run's page and unzip it, then (with Git Bash's `gpg` and a
PostgreSQL client of the same major version as Neon):

    gpg --decrypt --output smetase.dump smetase-YYYY-MM-DD.dump.gpg
    pg_restore --no-owner --no-privileges --dbname="<target database URL>" smetase.dump

Restore into a new, empty database (a new Neon branch or project), check it, then point `DATABASE_URL`
at it. Never restore over the live database.

## Known gaps

- First deployed 2026-10-14 on the free setup: the Docker image builds on Render and the Blueprint validates.
- On the free setup, a restart drops queued jobs (Key Value is in memory only).
- Centrifugo is not deployed (nothing subscribes to it yet).
- The two web apps do not report to Sentry yet (planned for after soft launch).
- One API instance only; scaling out needs the workers split into their own service first.
