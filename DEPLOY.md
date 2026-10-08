# Deploying Smetase (soft launch)

Draft. The API runs on Render (`render.yaml`); the three web front ends run on Cloudflare Pages. Steps marked **you** need an account, a payment or a decision only
you can make; the rest is in the repo.

## What gets deployed

| Piece | Where | Address |
|---|---|---|
| API + queue workers (one process) | Render web service (Docker) | `https://api.smetase.com` |
| PostgreSQL | Render Postgres | private network |
| Redis (queues, rate counters) | Render Key Value | private network |
| Student app (`smetase-web`) | Cloudflare Pages | `https://app.smetase.com` |
| Staff app (dashboard repo) | Cloudflare Pages | `https://hub.smetase.com` |
| Landing page (`Lanr-org/smetase.com`) | Cloudflare Pages | `https://smetase.com` (+ `www`) |

The three hostnames must share one registrable domain: the login cookies are `SameSite=strict`, and
`*.onrender.com` addresses count as different sites, so login would silently fail on them.

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
3. Fill the prompted secrets: `GOOGLE_CLIENT_ID`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`,
   `SENTRY_DSN`.
4. Apply. Render builds the image, runs `npx prisma migrate deploy` as the pre-deploy step, then starts
   the API. Watch the build log: **the Dockerfile has never been built before**, so this is its first test.
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

On the API service, open the Shell tab and run (once):

    BOOTSTRAP_ADMIN_PASSWORD='a-strong-password-12+' npm run bootstrap:admin -- --email you@smetase.com --name "Your Name"

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
- Postgres paid plans keep daily backups. Do one test restore into a scratch database before launch.
- `TRUST_PROXY=1` is set; leave it, or every student shares one rate-limit bucket.
- Seeing `AI daily reply cap reached` in Sentry means the platform-wide cap was hit; raise
  `AI_DAILY_REPLIES_GLOBAL` only after checking spend.

## Known gaps

- The Docker image is unbuilt and the blueprint is unvalidated against Render.
- The landing page is a holding page (teaser video + "coming soon"); the full site comes later.
- Centrifugo is not deployed (nothing subscribes to it yet).
- The two web apps do not report to Sentry yet (planned for after soft launch).
- One API instance only; scaling out needs the workers split into their own service first.
