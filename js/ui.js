/* ============================================================
   OniSteel Studios Board — UI Kit
   DOM helpers, formatters, modals, toasts, menus, drawers,
   emoji picker, markdown renderer.
   ============================================================ */
import { icon } from "./icons.js";

/* ---------- DOM helpers ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return node;
}
export function frag(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; }
export function mount(root, html) { root.innerHTML = html; return root; }

/* ---------- Escaping / formatting ---------- */
export function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function initials(name = "?") {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || (parts[0]?.[1] || ""))).toUpperCase() || "?";
}
export function colorFromString(str = "") {
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const palette = ["#4D6B91","#C12A2A","#8A6BD1","#3FB98A","#E6A23C","#4D8F91","#D16B9E","#6B8BD1","#B06B6B","#4DB0A0"];
  return palette[Math.abs(h) % palette.length];
}
export function avatarHTML(user, size = "md") {
  if (!user) return `<div class="avatar ${size}">?</div>`;
  const name = user.displayName || user.username || user.email || "?";
  const bg = user.photoURL ? "" : `style="background:linear-gradient(135deg, ${colorFromString(name)}, ${shade(colorFromString(name), -30)})"`;
  const inner = user.photoURL ? `<img src="${escapeHtml(user.photoURL)}" alt="${escapeHtml(name)}">` : escapeHtml(initials(name));
  const presence = user.online ? "online" : (user.status === "away" ? "away" : user.status === "busy" ? "busy" : "");
  const dot = presence ? `<span class="presence ${presence}"></span>` : "";
  return `<div class="avatar ${size}" ${bg} title="${escapeHtml(name)}">${inner}${dot}</div>`;
}
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

export function fmtBytes(bytes = 0) {
  if (bytes < 1024) return bytes + " B";
  const u = ["KB", "MB", "GB", "TB"]; let i = -1;
  do { bytes /= 1024; i++; } while (bytes >= 1024 && i < u.length - 1);
  return bytes.toFixed(bytes < 10 ? 1 : 0) + " " + u[i];
}
export function fmtDate(ts, opts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, opts || { month: "short", day: "numeric", year: "numeric" });
}
export function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function fmtDateTime(ts) { return fmtDate(ts) + " · " + fmtTime(ts); }
export function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 90) return "1 min ago";
  const m = Math.floor(s / 60); if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24); if (d < 7) return d + "d ago";
  const w = Math.floor(d / 7); if (w < 5) return w + "w ago";
  return fmtDate(ts);
}
export function timeUntil(ts) {
  const s = Math.floor((ts - Date.now()) / 1000);
  if (s < 0) { const a = Math.abs(s); return { overdue: true, text: relText(a) + " overdue" }; }
  return { overdue: false, text: "in " + relText(s) };
}
function relText(s) {
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60); if (m < 60) return m + "m";
  const h = Math.floor(m / 60); if (h < 24) return h + "h";
  const d = Math.floor(h / 24); if (d < 30) return d + "d";
  const mo = Math.floor(d / 30); return mo + "mo";
}
export function fmtDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return (h > 0 ? h + "h " : "") + m + "m";
}
export function fmtHours(h) {
  if (h == null) return "0h";
  return (Math.round(h * 10) / 10) + "h";
}

export function debounce(fn, wait = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
}
export function throttle(fn, wait = 200) {
  let last = 0, timer;
  return (...a) => {
    const rem = wait - (Date.now() - last);
    if (rem <= 0) { clearTimeout(timer); last = Date.now(); fn(...a); }
    else { clearTimeout(timer); timer = setTimeout(() => { last = Date.now(); fn(...a); }, rem); }
  };
}

/* ---------- Toasts ---------- */
let _toastWrap;
function toastWrap() {
  if (!_toastWrap) { _toastWrap = el("div", { class: "toast-wrap" }); document.body.appendChild(_toastWrap); }
  return _toastWrap;
}
export function toast(msg, opts = {}) {
  const { type = "info", title, duration = 3800 } = typeof opts === "string" ? { type: opts } : opts;
  const icons = { success: "check-circle", error: "x-circle", warning: "alert-triangle", info: "info" };
  const node = el("div", { class: `toast ${type}` });
  node.innerHTML = `
    <div class="t-ic">${icon(icons[type] || "info")}</div>
    <div class="t-body">
      ${title ? `<div class="t-title">${escapeHtml(title)}</div>` : ""}
      <div class="t-msg">${escapeHtml(msg)}</div>
    </div>
    <div class="t-x">${icon("x")}</div>
    <div class="t-progress" style="animation-duration:${duration}ms"></div>`;
  const close = () => { node.classList.add("out"); setTimeout(() => node.remove(), 250); };
  node.querySelector(".t-x").onclick = close;
  toastWrap().appendChild(node);
  if (duration) setTimeout(close, duration);
  return { close };
}

/* ---------- Modal system ---------- */
export function openModal({ title, subtitle, body, size = "md", footer, onClose, closeOnBackdrop = true, icon: ic } = {}) {
  const overlay = el("div", { class: "overlay" });
  const modal = el("div", { class: `modal ${size}` });
  const head = el("div", { class: "modal-head" });
  head.innerHTML = `
    ${ic ? `<div class="mh-ic" style="color:var(--steel-light)">${icon(ic)}</div>` : ""}
    <div class="grow"><h3>${escapeHtml(title || "")}</h3>${subtitle ? `<div class="mh-sub">${escapeHtml(subtitle)}</div>` : ""}</div>
    <button class="iconbtn x" aria-label="Close">${icon("x")}</button>`;
  const bodyEl = el("div", { class: "modal-body" });
  if (typeof body === "string") bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  modal.append(head, bodyEl);
  let footEl;
  if (footer) {
    footEl = el("div", { class: "modal-foot" });
    if (typeof footer === "string") footEl.innerHTML = footer; else footEl.appendChild(footer);
    modal.appendChild(footEl);
  }
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  const close = (val) => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 240);
    document.removeEventListener("keydown", onKey);
    if (onClose) onClose(val);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  head.querySelector(".x").onclick = () => close();
  if (closeOnBackdrop) overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  return { overlay, modal, body: bodyEl, head, foot: footEl, close };
}

export function confirmDialog({ title = "Are you sure?", message = "", confirmText = "Confirm", cancelText = "Cancel", danger = false, icon: ic = "alert-triangle" } = {}) {
  return new Promise((resolve) => {
    const foot = el("div", {});
    const m = openModal({
      title, size: "sm", icon: ic,
      body: `<p class="muted" style="font-size:14px;line-height:1.6">${escapeHtml(message)}</p>`,
      footer: foot,
      onClose: () => resolve(false)
    });
    foot.append(
      el("button", { class: "btn ghost", onClick: () => { m.close(); resolve(false); } }, cancelText),
      el("button", { class: `btn ${danger ? "danger" : "primary"}`, onClick: () => { m.__ok = true; m.close(); resolve(true); } }, confirmText)
    );
  });
}

export function promptDialog({ title = "Enter value", label = "", value = "", placeholder = "", confirmText = "Save", multiline = false } = {}) {
  return new Promise((resolve) => {
    const input = multiline
      ? el("textarea", { class: "textarea", placeholder })
      : el("input", { class: "input", placeholder, value });
    if (!multiline) input.value = value;
    else input.value = value;
    const foot = el("div", {});
    const m = openModal({
      title, size: "sm",
      body: el("div", { class: "field" }, label ? el("label", { text: label }) : null, input),
      footer: foot,
      onClose: () => resolve(null)
    });
    foot.append(
      el("button", { class: "btn ghost", onClick: () => { m.close(); resolve(null); } }, "Cancel"),
      el("button", { class: "btn primary", onClick: () => { const v = input.value.trim(); m.close(); resolve(v || null); } }, confirmText)
    );
    setTimeout(() => input.focus(), 60);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !multiline) { const v = input.value.trim(); m.close(); resolve(v || null); } });
  });
}

/* ---------- Drawer ---------- */
export function openDrawer({ content, side = "right", width, onClose } = {}) {
  const ov = el("div", { class: "drawer-overlay" });
  const dr = el("div", { class: `drawer ${side}` });
  if (width) dr.style.width = width;
  if (typeof content === "string") dr.innerHTML = content; else if (content) dr.appendChild(content);
  document.body.append(ov, dr);
  requestAnimationFrame(() => { ov.classList.add("show"); dr.classList.add("show"); });
  const close = () => { ov.classList.remove("show"); dr.classList.remove("show"); setTimeout(() => { ov.remove(); dr.remove(); }, 400); document.removeEventListener("keydown", onKey); if (onClose) onClose(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.onclick = close;
  return { drawer: dr, close };
}

/* ---------- Dropdown / context menu ---------- */
let _openMenu = null;
export function closeMenu() { if (_openMenu) { _openMenu.remove(); _openMenu = null; document.removeEventListener("click", _onDocClick, true); window.removeEventListener("resize", closeMenu); } }
function _onDocClick(e) { if (_openMenu && !_openMenu.contains(e.target)) closeMenu(); }

export function showMenu(x, y, items, { align = "left" } = {}) {
  closeMenu();
  const menu = el("div", { class: "menu" });
  for (const it of items) {
    if (it === "sep" || it.sep) { menu.appendChild(el("div", { class: "menu-sep" })); continue; }
    if (it.label && it.header) { menu.appendChild(el("div", { class: "menu-label", text: it.label })); continue; }
    const item = el("div", { class: `menu-item ${it.danger ? "danger" : ""} ${it.disabled ? "disabled" : ""}` });
    item.innerHTML = `${it.icon ? icon(it.icon) : ""}<span>${escapeHtml(it.label)}</span>${it.shortcut ? `<span class="shortcut">${it.shortcut}</span>` : ""}${it.checked ? `<span class="check-ic">${icon("check")}</span>` : ""}`;
    if (!it.disabled) item.onclick = (e) => { e.stopPropagation(); closeMenu(); it.onClick && it.onClick(); };
    menu.appendChild(item);
  }
  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let px = align === "right" ? x - mw : x;
  let py = y;
  if (px + mw > window.innerWidth - 8) px = window.innerWidth - mw - 8;
  if (px < 8) px = 8;
  if (py + mh > window.innerHeight - 8) py = Math.max(8, y - mh);
  menu.style.left = px + "px"; menu.style.top = py + "px";
  requestAnimationFrame(() => menu.classList.add("show"));
  _openMenu = menu;
  setTimeout(() => document.addEventListener("click", _onDocClick, true), 0);
  window.addEventListener("resize", closeMenu);
  return menu;
}
export function menuFromEvent(e, items, opts) {
  e.preventDefault(); e.stopPropagation();
  return showMenu(e.clientX, e.clientY, items, opts);
}
export function dropdown(anchorEl, items, opts = {}) {
  const r = anchorEl.getBoundingClientRect();
  return showMenu(opts.align === "right" ? r.right : r.left, r.bottom + 6, items, opts);
}

/* ---------- Emoji picker ---------- */
export const EMOJIS = {
  Smileys: ["😀","😁","😂","🤣","😊","😍","😎","🤩","😴","🤔","😅","😇","🙃","😉","😌","😢","😭","😤","😡","🥳","🤯","😱","🥶","🤗","🤝","🙏","💪","👏","🙌","👀"],
  Gestures: ["👍","👎","👌","✌️","🤞","🤘","👊","✊","🫰","🖖","🤙","👋","🫡","🫶","💯","🔥","⭐","✨","💥","⚡"],
  Dev: ["💻","🖥️","⌨️","🐛","🚀","🛠️","⚙️","🔧","📦","🧩","🎮","🕹️","🎯","🏆","📈","📉","✅","❌","⚠️","🔒"],
  Game: ["⚔️","🛡️","🗡️","🏹","🐉","👾","🎨","🖌️","🎭","🎬","🎵","🎧","🌋","🏰","💀","🔮","🗺️","💎","🧙","🦾"],
  Objects: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🎉","🎊","💡","📌","📎","🔗","📁","📄","🏁","⏰","📅","☕"]
};
export function emojiPicker(onPick) {
  const wrap = el("div", { class: "emoji-picker glass", style: { padding: "10px", borderRadius: "14px", width: "300px", maxHeight: "300px", overflow: "auto" } });
  for (const [cat, list] of Object.entries(EMOJIS)) {
    wrap.appendChild(el("div", { class: "menu-label", text: cat }));
    const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: "2px" } });
    list.forEach(e => {
      const b = el("button", { class: "emoji-btn", style: { fontSize: "20px", height: "32px", border: "none", background: "transparent", cursor: "pointer", borderRadius: "8px" }, text: e });
      b.onmouseenter = () => b.style.background = "rgba(255,255,255,.1)";
      b.onmouseleave = () => b.style.background = "transparent";
      b.onclick = () => onPick(e);
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
  }
  return wrap;
}
export function popover(anchorEl, contentEl, { align = "left", offset = 8 } = {}) {
  closeMenu();
  const pop = el("div", { class: "menu", style: { padding: "0", minWidth: "auto" } });
  pop.appendChild(contentEl);
  document.body.appendChild(pop);
  const r = anchorEl.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let px = align === "right" ? r.right - pw : r.left;
  let py = r.bottom + offset;
  if (px + pw > innerWidth - 8) px = innerWidth - pw - 8;
  if (px < 8) px = 8;
  if (py + ph > innerHeight - 8) py = Math.max(8, r.top - ph - offset);
  pop.style.left = px + "px"; pop.style.top = py + "px";
  requestAnimationFrame(() => pop.classList.add("show"));
  _openMenu = pop;
  setTimeout(() => document.addEventListener("click", _onDocClick, true), 0);
  window.addEventListener("resize", closeMenu);
  return { pop, close: closeMenu };
}

/* ---------- Minimal Markdown renderer (safe) ---------- */
export function renderMarkdown(md = "") {
  let src = escapeHtml(md);
  const blocks = [];
  src = src.replace(/```([\s\S]*?)```/g, (_, code) => { blocks.push(`<pre><code>${code.replace(/^\n/, "")}</code></pre>`); return ` ${blocks.length - 1} `; });
  src = src.replace(/`([^`]+)`/g, "<code>$1</code>");
  src = src.replace(/^###### (.*)$/gm, "<h6>$1</h6>").replace(/^##### (.*)$/gm, "<h5>$1</h5>")
    .replace(/^#### (.*)$/gm, "<h4>$1</h4>").replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>");
  src = src.replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>");
  src = src.replace(/^\s*[-*] \[x\] (.*)$/gim, '<li class="task"><input type="checkbox" checked disabled> $1</li>')
           .replace(/^\s*[-*] \[ \] (.*)$/gim, '<li class="task"><input type="checkbox" disabled> $1</li>');
  src = src.replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>");
  src = src.replace(/^\s*\d+\. (.*)$/gm, "<li class='ol'>$1</li>");
  src = src.replace(/(<li>[\s\S]*?<\/li>)(?![\s\S]*<li)/g, (m) => m);
  src = src.replace(/(?:<li>.*?<\/li>\s*)+/gs, (m) => m.includes("ol'") ? `<ol>${m}</ol>` : `<ul>${m}</ul>`);
  src = src.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  src = src.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  src = src.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  src = src.replace(/^---$/gm, "<hr>");
  src = src.split(/\n{2,}/).map(p => {
    if (/^\s*<(h\d|ul|ol|pre|blockquote|hr|img|table)/.test(p.trim())) return p;
    if (p.includes(" ")) return p;
    return p.trim() ? `<p>${p.replace(/\n/g, "<br>")}</p>` : "";
  }).join("\n");
  src = src.replace(/ (\d+) /g, (_, i) => blocks[+i]);
  return src;
}
/* linkify + mentions for chat */
export function renderChat(text = "", memberMap = {}) {
  let s = escapeHtml(text);
  s = s.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/@(\w+)/g, (m, u) => memberMap[u.toLowerCase()] ? `<span class="mention">@${escapeHtml(memberMap[u.toLowerCase()])}</span>` : m);
  s = s.replace(/\n/g, "<br>");
  return s;
}

/* ---------- Spinner / loader helpers ---------- */
export function showPageLoader(text = "Loading…") {
  const l = el("div", { class: "page-loader", id: "pageLoader" });
  l.innerHTML = `<img class="pl-logo" src="assets/images/logo.svg" alt=""><div class="spin lg"></div><div class="muted">${escapeHtml(text)}</div>`;
  document.body.appendChild(l);
  return () => { l.style.opacity = "0"; l.style.transition = "opacity .3s"; setTimeout(() => l.remove(), 300); };
}
export function skeletonList(n = 4) {
  return Array.from({ length: n }, () => `<div class="skeleton sk-card" style="margin-bottom:10px"></div>`).join("");
}

/* ---------- File picker ---------- */
export function pickFile({ accept = "*/*", multiple = false } = {}) {
  return new Promise((resolve) => {
    const inp = el("input", { type: "file", accept, multiple, style: { display: "none" } });
    inp.onchange = () => { resolve(multiple ? [...inp.files] : inp.files[0] || null); inp.remove(); };
    document.body.appendChild(inp); inp.click();
  });
}
export function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

/* ---------- Copy to clipboard ---------- */
export async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied to clipboard", "success"); }
  catch { toast("Copy failed", "error"); }
}

/* ---------- Color helpers ---------- */
export function hexToRgba(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`;
}
