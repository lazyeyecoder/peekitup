# PEEKitUP — tiny local file viewer (Markdown first)

Drop a `.md` file, read it the way it is meant to look. Click **Edit** to change it with live preview.

## Run

```bash
npm install
npm start
```

## Features

- Drag & drop, **Open…**, or double-click `.md` in Explorer (after installing)
- **Edit** mode: text on left, live preview on right (Ctrl+E)
- **Save** (Ctrl+S) overwrites the file. **Save As…** (Ctrl+Shift+S) writes a new copy, original stays untouched
- **New** (Ctrl+N) blank document
- Format toolbar: H1 H2 H3, bold, italic, strike, code, link, lists, tasks, quote, code block, table, divider
- Shortcuts: Ctrl+B / I / K, Ctrl+1/2/3 headings, Tab indent, Enter continues lists
- **?** button (Ctrl+/) opens the Markdown guide: `#` = H1, `##` = H2, `###` = H3 ...
- Unsaved dot + warning before closing
- Dark mode (follows system, toggle remembered)

## Which file does what

| File | Change it when you want to... |
|------|-------------------------------|
| `src/markdown.js` | support more Markdown syntax (how text becomes HTML) |
| `src/style.css` | change how the page / editor / buttons look |
| `src/index.html` | add a button, toolbar item, or a line in the guide panel |
| `src/renderer.js` | change what buttons/shortcuts DO (section 4 = toolbar actions, section 8 = shortcuts) |
| `main.js` | disk access, dialogs, window options, auto-update |
| `preload.js` | expose a new main-process function to the page |

### Add a toolbar button (example: highlight)
1. `index.html` → inside `#tools` add `<button data-act="mark">Mark</button>`
2. `renderer.js` → inside `ACT = { ... }` add `mark: () => wrap("==")`
3. `markdown.js` → teach `inline()` to turn `==x==` into `<mark>x</mark>`

## Build installer

```bash
npm run dist:win      # Windows: dist/PEEKitUP Setup x.y.z.exe + portable exe
```

## Auto-update (one time setup)

1. Make a **public** GitHub repo, e.g. `peekitup`. Push this folder.
2. In `package.json` → `build.publish` → set `owner` to your GitHub username.
3. GitHub → Settings → Developer settings → Personal access tokens → create one with `repo` scope.
4. PowerShell: `$env:GH_TOKEN="ghp_yourtoken"`

### Every update after that

```bash
# edit code, test with: npm start
npm version patch        # 1.1.0 -> 1.1.1  (version MUST go up)
npm run release          # builds + uploads to GitHub Releases
```

Installed copies check GitHub on start, download the new version, ask "Restart now / Later".

Notes:
- Only the **installer** version updates itself. The portable exe does not.
- Windows may show a "SmartScreen" warning for unsigned apps. Click More info → Run anyway. A code-signing certificate removes it (costs money, optional).
- Icon: put `build/icon.ico` and `build/icon.png` before building.

## Add another file type later

One module per type: `src/viewers/psd.js` with `canOpen(ext)` and `render(buffer)`. Renderer picks by extension. PSD parsing: `ag-psd`.

MIT.
