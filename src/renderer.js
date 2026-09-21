/* ============================================================
   PEEKitUP renderer — view, edit, save
   Sections: 1 state  2 load/save  3 editing helpers
             4 toolbar  5 editor keys  6 drag&drop  7 buttons  8 shortcuts
   ============================================================ */

const $ = (id) => document.getElementById(id);
const body = document.body;
const editor = $("editor");
const page = $("page");
const filename = $("filename");
const MD_RE = /\.(md|markdown|mdown|mkd|txt)$/i;

/* ---------- 1. state ---------- */
let doc = { name: "PEEKitUP", path: null, saved: "" }; // saved = text as last written to disk
let lastDirty = false;
let raf = 0;

const hasFile = () => body.classList.contains("has-file");
const isDirty = () => hasFile() && editor.value !== doc.saved;

function refresh() {
  const d = isDirty();
  body.classList.toggle("dirty", d);
  if (d !== lastDirty) {
    lastDirty = d;
    window.api.setDirty(d);
  }
  filename.textContent = doc.name;
  filename.title = doc.path || "";
  document.title = (d ? "● " : "") + doc.name + " — PEEKitUP";
}

function renderNow() {
  page.innerHTML = MD.render(editor.value);
}
function renderSoon() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(renderNow);
}

let toastTimer = 0;
function flash(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

const confirmDiscard = () => !isDirty() || confirm("You have unsaved changes. Discard them?");

/* ---------- 2. load / save ---------- */
function load(data) {
  if (!data || !confirmDiscard()) return;
  editor.value = data.text;
  doc = { name: data.name, path: data.path || null, saved: editor.value };
  body.classList.add("has-file");
  renderNow();
  $("content").scrollTop = 0;
  editor.scrollTop = 0;
  refresh();
}

function newDoc() {
  if (!confirmDiscard()) return;
  editor.value = "";
  doc = { name: "untitled.md", path: null, saved: "" };
  body.classList.add("has-file");
  renderNow();
  refresh();
  setEditing(true);
}

async function save() {
  if (!hasFile()) return;
  if (!doc.path) return saveAs(); // never saved before -> ask where
  try {
    const text = editor.value;
    await window.api.saveFile(doc.path, text); // overwrite the same file
    doc.saved = text;
    refresh();
    flash("Saved");
  } catch (err) {
    alert("Could not save: " + err.message);
  }
}

async function saveAs() {
  if (!hasFile()) return;
  try {
    const text = editor.value;
    const r = await window.api.saveAs(doc.name, text); // new file; original untouched
    if (!r) return;
    doc = { name: r.name, path: r.path, saved: text };
    refresh();
    flash("Saved as " + r.name);
  } catch (err) {
    alert("Could not save: " + err.message);
  }
}

function setEditing(on) {
  if (!hasFile()) return;
  body.classList.toggle("editing", on);
  $("editBtn").textContent = on ? "👁 Preview only" : "✎ Edit";
  if (on) editor.focus();
}

/* ---------- 3. editing helpers ---------- */
// insert() keeps Ctrl+Z working (plain .value= would wipe undo history)
function insert(str) {
  editor.focus();
  if (!str) {
    document.execCommand("delete");
  } else if (!document.execCommand("insertText", false, str)) {
    editor.setRangeText(str, editor.selectionStart, editor.selectionEnd, "end");
    editor.dispatchEvent(new Event("input"));
  }
}

// wrap selection: **text**, *text*, `text` ...
function wrap(before, after = before, placeholder = "text") {
  editor.focus();
  const s = editor.selectionStart;
  const sel = editor.value.slice(s, editor.selectionEnd) || placeholder;
  insert(before + sel + after);
  editor.setSelectionRange(s + before.length, s + before.length + sel.length);
}

// change every selected line: fn(line, index) -> new line
function lines(fn) {
  editor.focus();
  const v = editor.value;
  const ls = v.lastIndexOf("\n", editor.selectionStart - 1) + 1;
  let le = v.indexOf("\n", editor.selectionEnd);
  if (le === -1) le = v.length;
  const out = v.slice(ls, le).split("\n").map(fn).join("\n");
  editor.setSelectionRange(ls, le);
  insert(out);
  editor.setSelectionRange(ls, ls + out.length);
}

function heading(n) {
  const mark = "#".repeat(n) + " ";
  lines((l) => (l.startsWith(mark) ? l.slice(mark.length) : mark + l.replace(/^#{1,6}\s+/, "")));
}

const toggle = (prefix) => lines((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l));

/* ---------- 4. toolbar ---------- */
const ACT = {
  h1: () => heading(1),
  h2: () => heading(2),
  h3: () => heading(3),
  bold: () => wrap("**"),
  italic: () => wrap("*"),
  strike: () => wrap("~~"),
  code: () => wrap("`"),
  link: () => wrap("[", "](https://)", "link text"),
  ul: () => toggle("- "),
  ol: () =>
    lines((l, i) => (/^\d+\.\s/.test(l) ? l.replace(/^\d+\.\s/, "") : `${i + 1}. ${l}`)),
  task: () => toggle("- [ ] "),
  quote: () => toggle("> "),
  codeblock: () => {
    const s = editor.selectionStart;
    const sel = editor.value.slice(s, editor.selectionEnd) || "code";
    insert("```\n" + sel + "\n```");
    editor.setSelectionRange(s + 4, s + 4 + sel.length);
  },
  table: () => insert("\n| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n"),
  hr: () => insert("\n\n---\n\n"),
};

const tools = $("tools");
tools.addEventListener("mousedown", (e) => e.preventDefault()); // keep cursor in editor
tools.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (b) ACT[b.dataset.act]();
});

/* ---------- 5. editor keys ---------- */
editor.addEventListener("input", () => {
  renderSoon();
  refresh();
});

editor.addEventListener("keydown", (e) => {
  // Tab = indent, Shift+Tab = outdent
  if (e.key === "Tab") {
    e.preventDefault();
    const multi = editor.value.slice(editor.selectionStart, editor.selectionEnd).includes("\n");
    if (e.shiftKey) lines((l) => l.replace(/^ {1,2}/, ""));
    else if (multi) lines((l) => "  " + l);
    else insert("  ");
    return;
  }

  // Enter inside a list = continue the list; on an empty item = end the list
  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey &&
      editor.selectionStart === editor.selectionEnd) {
    const v = editor.value;
    const pos = editor.selectionStart;
    const ls = v.lastIndexOf("\n", pos - 1) + 1;
    const line = v.slice(ls, pos);
    const m = /^(\s*)(?:([-*+])|(\d+)\.)\s(\[[ xX]\]\s)?/.exec(line);
    if (m) {
      e.preventDefault();
      if (line.length === m[0].length) {
        editor.setSelectionRange(ls, pos);
        insert("");
      } else {
        const marker = m[2] ? m[2] : parseInt(m[3], 10) + 1 + ".";
        insert("\n" + m[1] + marker + " " + (m[4] ? "[ ] " : ""));
      }
    }
  }
});

/* ---------- 6. drag & drop ---------- */
let depth = 0;
window.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; body.classList.add("dragging"); });
window.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
window.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; body.classList.remove("dragging"); } });

window.addEventListener("drop", async (e) => {
  e.preventDefault();
  depth = 0;
  body.classList.remove("dragging");
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!MD_RE.test(file.name)) {
    alert("Only Markdown files for now (.md, .markdown).");
    return;
  }
  try {
    const p = window.api.pathForFile(file);
    load(p ? await window.api.readFile(p) : { name: file.name, text: await file.text() });
  } catch (err) {
    alert("Could not read file: " + err.message);
  }
});

/* ---------- 7. buttons ---------- */
$("newBtn").addEventListener("click", newDoc);
$("openBtn").addEventListener("click", async () => load(await window.api.pickFile()));
$("editBtn").addEventListener("click", () => setEditing(!body.classList.contains("editing")));
$("saveBtn").addEventListener("click", save);
$("saveAsBtn").addEventListener("click", saveAs);
$("helpBtn").addEventListener("click", () => body.classList.toggle("help"));
$("closeHelp").addEventListener("click", () => body.classList.remove("help"));

$("themeBtn").addEventListener("click", () => {
  const cur =
    document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (_) {}
});
try {
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.dataset.theme = saved;
} catch (_) {}

window.api.onFileOpened(load); // file opened from OS (double-click / Open with)

/* ---------- 8. shortcuts ---------- */
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { body.classList.remove("help"); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  const inEditor = body.classList.contains("editing") && document.activeElement === editor;

  if (k === "s")      { e.preventDefault(); e.shiftKey ? saveAs() : save(); }
  else if (k === "o") { e.preventDefault(); $("openBtn").click(); }
  else if (k === "n") { e.preventDefault(); newDoc(); }
  else if (k === "e") { e.preventDefault(); setEditing(!body.classList.contains("editing")); }
  else if (k === "/" || k === "?") { e.preventDefault(); body.classList.toggle("help"); }
  else if (inEditor && k === "b") { e.preventDefault(); ACT.bold(); }
  else if (inEditor && k === "i") { e.preventDefault(); ACT.italic(); }
  else if (inEditor && k === "k") { e.preventDefault(); ACT.link(); }
  else if (inEditor && ["1", "2", "3"].includes(k)) { e.preventDefault(); heading(+k); }
});
