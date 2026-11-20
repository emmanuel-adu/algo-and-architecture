# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Report a problem or suggest an idea

Open an issue: https://github.com/emmanuel-adu/algo-and-architecture/issues/new

For a bug, say what you did, what you expected and what happened instead. Include the browser and screen size if it's about layout.

## Run it on your computer

You need Node.js 22 or newer.

```
git clone https://github.com/emmanuel-adu/algo-and-architecture.git
cd algo-and-architecture
npm install
npm run dev
```

Open http://localhost:3000. With no setup, the app runs without an account and saves to your browser, which is enough for most changes to the page.

To work on sign-in, the database or GitHub sync, copy `.env.example` to `.env.local` and fill it in. The README's setup section explains each value. Use your own Neon database (a free branch is fine) and your own GitHub OAuth app with `http://localhost:3000/api/auth/callback` as its callback URL.

## How the code is laid out

- `public/index.html` is the whole app: markup, styles and script in one file, with no build step.
- `api/` holds the Vercel functions, and `lib/` the shared code they use (database, cookies, GitHub).
- `scripts/` holds the local server, the build checks and the database migration.

The README's "How it works" diagram shows how the pieces connect.

## Before you open a pull request

- Run `npm run build`. It checks that every function loads and the page's script parses; Vercel runs the same check on deploy.
- Try your change in light and dark mode, and at phone width (about 390px).
- Keep to plain JavaScript and the single page; new dependencies need a good reason.
- Keep pull requests small and focused, and describe what changed and why.

Never commit secrets. `.env` and `.env.local` are ignored by git; keep them that way.

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
