/* Tiny dependency-free Markdown -> HTML renderer.
   Supports: headings, bold/italic/strike, inline code, fenced & indented code,
   blockquotes, ordered/unordered/task lists (nested), tables, hr, links, images. */
(function (global) {
  "use strict";

  function esc(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeUrl(url) {
    const u = url.trim();
    if (/^\s*javascript:/i.test(u) || /^\s*data:text\/html/i.test(u)) return "#";
    return esc(u);
  }

  // ---- inline ----
  function inline(src) {
    let out = "";
    let i = 0;
    const s = src;

    while (i < s.length) {
      const c = s[i];

      // inline code
      if (c === "`") {
        let n = 0;
        while (s[i + n] === "`") n++;
        const fence = "`".repeat(n);
        const end = s.indexOf(fence, i + n);
        if (end !== -1) {
          out += "<code>" + esc(s.slice(i + n, end).trim()) + "</code>";
          i = end + n;
          continue;
        }
      }

      // image
      if (c === "!" && s[i + 1] === "[") {
        const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(s.slice(i));
        if (m) {
          out += `<img src="${safeUrl(m[2])}" alt="${esc(m[1])}"${m[3] ? ` title="${esc(m[3])}"` : ""}>`;
          i += m[0].length;
          continue;
        }
      }

      // link
      if (c === "[") {
        const m = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(s.slice(i));
        if (m) {
          out += `<a href="${safeUrl(m[2])}" target="_blank" rel="noreferrer">${inline(m[1])}</a>`;
          i += m[0].length;
          continue;
        }
      }

      // bold + italic
      if (c === "*" || c === "_") {
        const rest = s.slice(i);
        let m;
        if ((m = /^(\*\*\*|___)([\s\S]+?)\1/.exec(rest))) {
          out += "<strong><em>" + inline(m[2]) + "</em></strong>";
          i += m[0].length;
          continue;
        }
        if ((m = /^(\*\*|__)([\s\S]+?)\1/.exec(rest))) {
          out += "<strong>" + inline(m[2]) + "</strong>";
          i += m[0].length;
          continue;
        }
        if ((m = /^(\*|_)([^\s][\s\S]*?)\1/.exec(rest))) {
          out += "<em>" + inline(m[2]) + "</em>";
          i += m[0].length;
          continue;
        }
      }

      // strikethrough
      if (c === "~" && s[i + 1] === "~") {
        const m = /^~~([\s\S]+?)~~/.exec(s.slice(i));
        if (m) {
          out += "<del>" + inline(m[1]) + "</del>";
          i += m[0].length;
          continue;
        }
      }

      // autolink
      if (c === "<") {
        const m = /^<((?:https?|mailto):[^>\s]+)>/.exec(s.slice(i));
        if (m) {
          out += `<a href="${safeUrl(m[1])}" target="_blank" rel="noreferrer">${esc(m[1])}</a>`;
          i += m[0].length;
          continue;
        }
      }

      // hard break
      if (c === "\n") {
        out += "<br>";
        i++;
        continue;
      }

      // escaped char
      if (c === "\\" && i + 1 < s.length) {
        out += esc(s[i + 1]);
        i += 2;
        continue;
      }

      out += esc(c);
      i++;
    }
    return out;
  }

  // ---- block ----
  function slug(t) {
    return t.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
  }

  function parseList(lines, start, indent) {
    const first = lines[start];
    const ordered = /^\s*\d+[.)]\s/.test(first);
    let html = ordered ? "<ol>" : "<ul>";
    let i = start;

    while (i < lines.length) {
      const line = lines[i];
      const m = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
      if (!m) break;
      const ind = m[1].replace(/\t/g, "    ").length;
      if (ind < indent) break;
      if (ind > indent) {
        const sub = parseList(lines, i, ind);
        html = html.replace(/<\/li>$/, sub.html + "</li>");
        i = sub.next;
        continue;
      }
      if (ordered !== !!m[3]) break;

      let text = m[4];
      let cls = "";
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
      if (task) {
        cls = ' class="task"';
        text =
          `<input type="checkbox" disabled${task[1] !== " " ? " checked" : ""}> ` + inline(task[2]);
      } else {
        text = inline(text);
      }

      // lazy continuation lines
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^(\s*)(?:[-*+]|\d+[.)])\s+/.test(lines[i]) &&
        !/^\s*(#{1,6}\s|>|```)/.test(lines[i])
      ) {
        text += "<br>" + inline(lines[i].trim());
        i++;
      }
      html += `<li${cls}>${text}</li>`;

      if (i < lines.length && lines[i].trim() === "") {
        const nxt = lines[i + 1];
        if (!nxt || !/^(\s*)(?:[-*+]|\d+[.)])\s+/.test(nxt)) break;
        i++;
      }
    }
    return { html: html + (ordered ? "</ol>" : "</ul>"), next: i };
  }

  function parseTable(lines, i) {
    const header = lines[i];
    const sep = lines[i + 1];
    if (!sep || !/^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(sep)) return null;

    const split = (row) =>
      row.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());

    const aligns = split(sep).map((c) =>
      /^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : /^:-+/.test(c) ? "left" : ""
    );

    let html = "<table><thead><tr>";
    split(header).forEach((c, k) => {
      html += `<th${aligns[k] ? ` style="text-align:${aligns[k]}"` : ""}>${inline(c)}</th>`;
    });
    html += "</tr></thead><tbody>";

    let j = i + 2;
    for (; j < lines.length && lines[j].trim() !== "" && lines[j].includes("|"); j++) {
      html += "<tr>";
      split(lines[j]).forEach((c, k) => {
        html += `<td${aligns[k] ? ` style="text-align:${aligns[k]}"` : ""}>${inline(c)}</td>`;
      });
      html += "</tr>";
    }
    return { html: html + "</tbody></table>", next: j };
  }

  function render(md) {
    const lines = String(md).replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
    let html = "";
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim() === "") { i++; continue; }

      // fenced code
      const fence = /^\s*(```|~~~)\s*([\w+-]*)\s*$/.exec(line);
      if (fence) {
        const mark = fence[1];
        const lang = fence[2];
        const buf = [];
        i++;
        while (i < lines.length && !new RegExp("^\\s*" + mark + "\\s*$").test(lines[i])) {
          buf.push(lines[i]); i++;
        }
        i++;
        html += `<pre><code${lang ? ` class="lang-${esc(lang)}"` : ""}>${esc(buf.join("\n"))}</code></pre>`;
        continue;
      }

      // heading
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) {
        const t = inline(h[2]);
        html += `<h${h[1].length} id="${slug(h[2])}">${t}</h${h[1].length}>`;
        i++;
        continue;
      }

      // setext heading
      if (lines[i + 1] && /^\s*(=+|-+)\s*$/.test(lines[i + 1]) && line.trim()) {
        const lvl = lines[i + 1].trim()[0] === "=" ? 1 : 2;
        html += `<h${lvl} id="${slug(line)}">${inline(line.trim())}</h${lvl}>`;
        i += 2;
        continue;
      }

      // hr
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { html += "<hr>"; i++; continue; }

      // blockquote
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && (/^\s*>/.test(lines[i]) || (lines[i].trim() && buf.length))) {
          buf.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        html += "<blockquote>" + render(buf.join("\n")) + "</blockquote>";
        continue;
      }

      // table
      if (line.includes("|")) {
        const t = parseTable(lines, i);
        if (t) { html += t.html; i = t.next; continue; }
      }

      // list
      if (/^(\s*)(?:[-*+]|\d+[.)])\s+/.test(line)) {
        const ind = (/^(\s*)/.exec(line)[1] || "").length;
        const r = parseList(lines, i, ind);
        html += r.html;
        i = r.next;
        continue;
      }

      // indented code
      if (/^ {4}\S/.test(line)) {
        const buf = [];
        while (i < lines.length && (/^ {4}/.test(lines[i]) || lines[i].trim() === "")) {
          buf.push(lines[i].slice(4)); i++;
        }
        html += "<pre><code>" + esc(buf.join("\n").replace(/\n+$/, "")) + "</code></pre>";
        continue;
      }

      // paragraph
      const buf = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^\s*(#{1,6}\s|>|```|~~~)/.test(lines[i]) &&
        !/^(\s*)(?:[-*+]|\d+[.)])\s+/.test(lines[i]) &&
        !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])
      ) {
        buf.push(lines[i].trim()); i++;
      }
      if (buf.length) html += "<p>" + inline(buf.join("\n")) + "</p>";
      else i++;
    }
    return html;
  }

  global.MD = { render: render };
})(window);
