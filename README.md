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

## v1 Notes

- Everything runs locally.
- The first target is visual fidelity when pasting, not editable native Word equations.
- Mermaid blocks are detected and preserved as formatted SVG source cards in this prototype.
