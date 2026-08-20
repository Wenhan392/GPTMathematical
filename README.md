# GPT Mathematical Clipboard Overlay

A local Windows desktop prototype that watches the clipboard and converts ChatGPT-style math, Markdown, tables, code blocks, and STEM notation into paste-friendly rich HTML for Word, Google Docs, and OneNote.

## Run

```powershell
npm install
npm start
```

The app starts in the system tray. Copy math-heavy ChatGPT output and the app will replace the clipboard with formatted HTML plus a readable plain-text fallback. Use the tray menu to disable auto-fix, convert the current clipboard manually, open settings, or quit.

## Test

```powershell
npm test
```

## Marketing site

Open `marketing/index.html` in a browser to view the static sales website for the app.

## Launch web app

The production launch site and account/payment portal now live in `web/`.

```powershell
cd web
npm install
Copy-Item .env.example .env.local
npm run dev
```

Use Supabase SQL from `web/supabase/schema.sql`, configure Stripe Checkout price IDs and webhook secrets in Vercel, then deploy with `web/` as the Vercel project root.

## Local test activation

For development only, the desktop app can unlock with an ignored `.env.local` file in the repo root:

```powershell
GPT_MATH_ENABLE_LOCAL_TEST_LICENSE=true
GPT_MATH_TEST_LICENSE_EMAIL=admin-test@gptmathematical.local
GPT_MATH_TEST_LICENSE_KEY=GPTM-TEST-...
```

When this flag is not set, activation must go through the configured license API.

## v1 Notes

- Everything runs locally.
- The first target is visual fidelity when pasting, not editable native Word equations.
- Mermaid blocks are detected and preserved as formatted SVG source cards in this prototype.
