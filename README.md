# Algo and Architecture

Spaced-repetition practice for data structures and algorithms (Blind 75, NeetCode 150, Grind 75) and a system design path. Solve a problem, rate it Red, Yellow or Green, and it comes back when it's due. Every problem has notes, a full attempt history and an Excalidraw worksheet.

It runs on **Vercel** (the site and a few small functions), stores data in **Neon** (Postgres), and signs you in with **GitHub**. Optionally, it syncs everything to a private GitHub repo.

## What's in here

```
public/index.html        The app (one page, no build step)
api/auth/login.js        Starts "Sign in with GitHub" (profile only, no repo access)
api/auth/callback.js     Finishes sign-in, and finishes connecting GitHub sync
api/auth/logout.js       Signs out
api/me.js                Who is signed in
api/docs.js              Your tracker records: read, save, delete
api/github/connect.js    Optional: asks GitHub for repo access to turn on sync
api/github/status.js     Sync status, and turning auto-sync on or off
api/github/sync.js       Writes a snapshot of your data to the repo as one commit
api/github/disconnect.js Turns sync off and revokes the repo access
lib/                     Shared code: database, cookies and encryption, GitHub
```

The database tables are created automatically the first time the app talks to Neon. There's nothing to run by hand.

## Set it up (about 15 minutes)

You need a GitHub account and a Vercel account (you can sign up for Vercel with GitHub). Node.js is only needed if you want to run it on your own computer.

### 1. Put this folder in a GitHub repo

Create a new repository called `algo-and-architecture` (public or private both work) and push this folder to it. The code holds no secrets: those live in Vercel's environment variables, and `.env` files are ignored by git.

### 2. Deploy it on Vercel

1. In Vercel, choose **Add New → Project** and import the repo.
2. Framework Preset: **Other**. Leave the build and output settings as they are, then **Deploy**.
3. Note your site's address, for example `https://algo-and-architecture.vercel.app`. The first deploy will load, but sign-in won't work until the steps below are done.

### 3. Add the Neon database

1. In your Vercel project, open the **Storage** tab, choose **Neon** (Postgres), and create a database on the **Free** plan.
2. Connect it to this project. Vercel adds `DATABASE_URL` to the project's environment variables for you.

### 4. Create the GitHub OAuth app

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App** (github.com/settings/developers).
2. Application name: `Algo and Architecture` (anything you like).
3. Homepage URL: your Vercel address from step 2.
4. Authorization callback URL: your Vercel address plus `/api/auth/callback`, for example `https://algo-and-architecture.vercel.app/api/auth/callback`.
5. Register the app, then click **Generate a new client secret** and copy it.

### 5. Add the remaining environment variables

In Vercel, open **Settings → Environment Variables** and add:

| Name | Value |
|---|---|
| `GITHUB_CLIENT_ID` | The Client ID from the OAuth app |
| `GITHUB_CLIENT_SECRET` | The client secret you generated |
| `SESSION_SECRET` | A random string of at least 32 characters. On a Mac or Linux terminal: `openssl rand -base64 48` |
| `PUBLIC_URL` | Optional. Only if you add a custom domain, e.g. `https://algo.example.com` (also add that domain's callback URL to the OAuth app) |

Then go to **Deployments**, open the latest one and choose **Redeploy** so the new variables take effect.

### 6. Sign in and bring your data over

1. Open your site and click **Sign in with GitHub**.
2. Go to **Settings → Backup → Restore from file** and choose `blind75-tracker-backup-2026-11-20.json` (sent alongside this project). Your attempts, notes, paused items and settings come across.

### 7. Optional: sync to a GitHub repo

In **Settings → Sync to GitHub**, click **Connect GitHub**. GitHub asks you to allow repository access (this is separate from sign-in, which never asks for it). The app then creates a private repo called `algo-and-architecture-data` (separate from this public code repo) and writes:

- `notes/coding/<problem>.md` and `notes/design/<topic>.md`: a readable page per problem with its attempts table and your notes
- `worksheets/.../*.excalidraw`: your drawings, which open at excalidraw.com
- `data/*.json`: the raw records
- `README.md`: a summary table

Each sync is a single commit, and nothing is committed when nothing changed. With auto-sync on, it syncs 30 seconds after you stop making changes. **Turn off sync** stops it and revokes the repo access; the repo itself stays yours.

## Good to know

- **Free tiers.** A personal tracker sits well inside Neon's free plan and Vercel's free Hobby plan (which is for personal, non-commercial use).
- **Privacy.** Each person who signs in gets their own data. Sessions are signed cookies; the sync token is stored encrypted with a key derived from `SESSION_SECRET`.
- **Changing `SESSION_SECRET`** signs everyone out and makes stored sync tokens unreadable, so GitHub sync would need to be connected again.
- **Other devices.** The app checks for changes every minute and whenever you come back to the tab.
- **Preview deployments.** GitHub sign-in only works on the URLs listed as callback URLs in the OAuth app. GitHub OAuth apps accept several callback URLs, so you can add a preview URL if you want to test there.

## Run it locally (optional)

```
npm install
npm i -g vercel
vercel link            # connect to your Vercel project
vercel env pull .env.local
vercel dev             # serves on http://localhost:3000
```

Add `http://localhost:3000/api/auth/callback` as an extra callback URL in the OAuth app, and set `PUBLIC_URL=http://localhost:3000` in `.env.local`.
