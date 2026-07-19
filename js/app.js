/* ============================================================
   OniSteel Studios Board — App Shell & Framework
   Boot, auth-guard, global state, sidebar/topbar chrome,
   workspace switcher, global search, notifications, command
   palette, keyboard shortcuts, theme.
   ============================================================ */
import { initBackend, backendMode, DB, Auth, uid } from "./store.js";
import { APP, WS_COLORS, SHORTCUTS, BOARD_ICONS } from "./constants.js";
import { icon } from "./icons.js";
import {
  $, $$, el, escapeHtml, avatarHTML, toast, showMenu, dropdown, closeMenu,
  openModal, confirmDialog, promptDialog, debounce, timeAgo, initials, colorFromString
} from "./ui.js";
import { watchAllUsers, watchMembers, listMembers, addMember, getUser, primeUser } from "./users.js";
import { watchNotifications, markRead, markAllRead, notifRow, requestBrowserNotify, browserNotify } from "./notifications.js";

/* ---------- Settings (per-device, mirrors profile prefs) ---------- */
const SET_KEY = "onisteel:settings:v1";
export const Settings = {
  all() { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch { return {}; } },
  get(k, d) { const v = this.all()[k]; return v === undefined ? d : v; },
  set(k, v) { const s = this.all(); s[k] = v; localStorage.setItem(SET_KEY, JSON.stringify(s)); applyTheme(); },
  merge(obj) { const s = { ...this.all(), ...obj }; localStorage.setItem(SET_KEY, JSON.stringify(s)); applyTheme(); }
};
export function applyTheme() {
  const s = Settings.all();
  const root = document.documentElement;
  root.dataset.theme = s.theme === "light" ? "light" : "dark";
  root.dataset.contrast = s.highContrast ? "high" : "normal";
  root.dataset.motion = s.reducedMotion ? "reduced" : "normal";
  if (s.accent) root.style.setProperty("--accent", s.accent);
}
applyTheme();

/* ---------- Global App State ---------- */
export const State = {
  user: null,
  workspaces: [],
  workspace: null,
  members: [],
  _subs: [],
  _listeners: new Set(),
  onChange(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); },
  emit() { this._listeners.forEach(cb => cb(this)); }
};
export function currentWorkspaceId() { return localStorage.getItem("onisteel:ws") || null; }
export function setCurrentWorkspace(id) { localStorage.setItem("onisteel:ws", id); }

/* ---------- Boot / auth guard ---------- */
export async function boot() {
  await initBackend();
  return new Promise((resolve) => {
    const unsub = Auth.onChange((user) => { resolve(user); });
    State._authUnsub = unsub;
  });
}

/**
 * initApp — call at the top of every authenticated page.
 * Guards auth, loads workspaces + members, renders shell chrome.
 * Returns { user, mountPoint } where mountPoint is the .content element.
 */
export async function initApp({ active = "dashboard", title = "", crumb = "", requireWs = true } = {}) {
  const user = await boot();
  if (!user) { location.href = "index.html"; return null; }
  primeUser(user);
  State.user = user;

  // Refresh presence on load
  DB.update("users", user.id, { online: true, lastSeen: Date.now() }).catch(() => {});
  window.addEventListener("beforeunload", () => { navigator.sendBeacon && DB.update("users", user.id, { online: false, lastSeen: Date.now() }).catch(() => {}); });

  requestBrowserNotify();

  // Load workspaces the user belongs to
  await loadWorkspaces(user);
  if (requireWs && State.workspaces.length === 0) {
    await createFirstWorkspace(user);
    await loadWorkspaces(user);
  }
  // resolve current workspace
  let wsId = currentWorkspaceId();
  if (!State.workspaces.find(w => w.id === wsId)) wsId = State.workspaces[0]?.id;
  if (wsId) { setCurrentWorkspace(wsId); State.workspace = State.workspaces.find(w => w.id === wsId); }

  // Preload members so member-dependent UI (counts, mentions, avatars) is ready on first render.
  if (State.workspace) { try { State.members = await listMembers(State.workspace.id); } catch { State.members = []; } }

  renderShell({ active, title, crumb });
  subscribeGlobal();
  bindShortcuts();

  return { user, content: $(".content"), shell: $(".shell") };
}

async function loadWorkspaces(user) {
  const memberships = await DB.list("members", { where: [["userId", "==", user.id]] });
  const wsIds = memberships.map(m => m.workspaceId);
  const all = await DB.list("workspaces", {});
  State.workspaces = all.filter(w => wsIds.includes(w.id) || w.ownerId === user.id)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  // attach member role
  State.workspaces.forEach(w => {
    const m = memberships.find(x => x.workspaceId === w.id);
    w._role = m ? m.role : (w.ownerId === user.id ? "owner" : "viewer");
  });
}

async function createFirstWorkspace(user) {
  const id = uid("ws");
  await DB.set("workspaces", id, {
    id, name: "Project Oni", description: "Your first OniSteel workspace.",
    color: WS_COLORS[0], ownerId: user.id, createdAt: Date.now()
  });
  await addMember(id, user.id, "owner");
  setCurrentWorkspace(id);
}

/* ---------- Global subscriptions (users, members, notifications) ---------- */
function subscribeGlobal() {
  State._subs.forEach(u => u && u());
  State._subs = [];
  // Prime the user cache once per load (avatars, names) instead of holding a
  // permanent all-users listener — keeps Firestore reads well inside the free tier.
  DB.list("users", {}).then(us => { us.forEach(primeUser); State.emit(); }).catch(() => {});
  // members of current workspace
  if (State.workspace) {
    State._subs.push(watchMembers(State.workspace.id, (members) => { State.members = members; State.emit(); renderMemberBits(); }));
  }
  // notifications
  let firstNotif = true;
  const prevIds = new Set();
  State._subs.push(watchNotifications(State.user.id, (notes) => {
    State.notifications = notes;
    const unread = notes.filter(n => !n.read).length;
    updateNotifBadge(unread);
    if (!firstNotif) {
      notes.filter(n => !n.read && !prevIds.has(n.id)).forEach(n => {
        browserNotify(n.title, n.body, n.link);
      });
    }
    notes.forEach(n => prevIds.add(n.id));
    firstNotif = false;
    renderNotifPanel();
  }));
}

/* ============================================================
   SHELL RENDER
   ============================================================ */
const NAV = [
  { section: "Studio", items: [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "dashboard.html" },
    { id: "boards", label: "Boards", icon: "board", href: "workspace.html" },
    { id: "calendar", label: "Calendar", icon: "calendar", href: "calendar.html" },
    { id: "chat", label: "Chat", icon: "chat", href: "chat.html" }
  ]},
  { section: "Workspace", items: [
    { id: "files", label: "Files & Assets", icon: "folder", href: "files.html" },
    { id: "docs", label: "Wiki", icon: "book", href: "docs.html" },
    { id: "notes", label: "Notes", icon: "edit-3", href: "notes.html" },
    { id: "whiteboard", label: "Whiteboard", icon: "pen-tool", href: "whiteboard.html" },
    { id: "analytics", label: "Analytics", icon: "bar-chart", href: "analytics.html" },
    { id: "members", label: "Members", icon: "users", href: "members.html" }
  ]}
];

export function renderShell({ active, title, crumb }) {
  document.body.classList.add("app");
  let app = $("#app");
  if (!app) { app = el("div", { id: "app" }); document.body.appendChild(app); }
  const collapsed = Settings.get("sidebarCollapsed", false);
  const ws = State.workspace;
  const u = State.user;

  app.innerHTML = `
  <div class="shell ${collapsed ? "collapsed" : ""}">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-head">
        <div class="brand" onclick="location.href='dashboard.html'">
          <img class="brand-logo" src="assets/images/logo.svg" alt="OniSteel">
          <div class="brand-txt">
            <div class="brand-name">ONI<span>STEEL</span></div>
            <div class="brand-sub">Studios Board</div>
          </div>
        </div>
      </div>
      <div class="sidebar-scroll">
        <div class="ws-switch" id="wsSwitch">
          <div class="ws-badge" style="background:linear-gradient(135deg, ${ws?.color || "#4D6B91"}, ${shadeColor(ws?.color || "#4D6B91", -30)})">${escapeHtml(initials(ws?.name || "W"))}</div>
          <div class="ws-switch-meta">
            <div class="n truncate">${escapeHtml(ws?.name || "No workspace")}</div>
            <div class="s">${State.members.length || 1} member${State.members.length === 1 ? "" : "s"}</div>
          </div>
          ${icon("chevron-down", 'class="ws-switch-caret" style="width:16px;opacity:.6"')}
        </div>
        ${NAV.map(sec => `
          <div class="side-section">
            <div class="side-section-title">${sec.section}</div>
            ${sec.items.map(it => `
              <a class="nav-item ${active === it.id ? "active" : ""}" href="${it.href}" data-nav="${it.id}">
                ${icon(it.icon)}<span class="nav-label">${it.label}</span>
                <span class="nav-badge" id="nav-badge-${it.id}"></span>
              </a>`).join("")}
          </div>`).join("")}
      </div>
      <div class="sidebar-foot">
        <div class="side-user" id="sideUser">
          ${avatarHTML(u, "sm")}
          <div class="meta"><div class="n truncate">${escapeHtml(u.displayName || u.username)}</div><div class="s">${escapeHtml(u.email || "")}</div></div>
          ${icon("more-vertical", 'class="side-user-caret" style="width:16px;opacity:.5"')}
        </div>
      </div>
    </aside>
    <div class="sidebar-scrim" id="sidebarScrim"></div>

    <main class="main">
      <header class="topbar">
        <button class="iconbtn mobile-topbar" id="menuBtn" style="margin-right:2px">${icon("menu")}</button>
        <button class="iconbtn" id="collapseBtn" data-tip="Toggle sidebar" style="display:none">${icon("chevrons-left")}</button>
        <div class="page-title">
          <h1>${escapeHtml(title || "")}</h1>
          ${crumb ? `<div class="crumb">${escapeHtml(crumb)}</div>` : ""}
        </div>
        <div class="topbar-search">
          <div class="searchbox">
            <span class="s-ic">${icon("search")}</span>
            <input id="globalSearch" placeholder="Search everything…  ( / )" autocomplete="off">
          </div>
        </div>
        <div class="topbar-actions">
          <button class="iconbtn" id="quickAddBtn" data-tip="Quick add (N)">${icon("plus-circle")}</button>
          <button class="iconbtn" id="cmdBtn" data-tip="Command palette (Ctrl K)">${icon("command")}</button>
          <button class="iconbtn" id="notifBtn" data-tip="Notifications">${icon("bell")}<span class="badge-dot hidden" id="notifDot"></span></button>
          <button class="iconbtn" id="themeBtn" data-tip="Toggle theme">${icon(Settings.get("theme") === "light" ? "moon" : "sun")}</button>
          <span id="avatarBtn" style="cursor:pointer;margin-left:4px">${avatarHTML(u, "sm")}</span>
        </div>
      </header>
      <div class="content" id="content"><div class="content-pad"><div class="content-inner" id="pageRoot"></div></div></div>
    </main>
  </div>
  <button class="fab" id="fab" data-tip="New task">${icon("plus")}</button>`;

  wireShell();
}

function shadeColor(hex, amt) {
  try { const n = parseInt(hex.slice(1), 16); let r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt)); return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0"); }
  catch { return hex; }
}

function wireShell() {
  // sidebar collapse (desktop)
  const collapseBtn = $("#collapseBtn");
  if (collapseBtn) {
    if (window.innerWidth > 900) collapseBtn.style.display = "inline-flex";
    collapseBtn.onclick = () => {
      const c = !Settings.get("sidebarCollapsed", false);
      Settings.set("sidebarCollapsed", c);
      $(".shell").classList.toggle("collapsed", c);
      collapseBtn.innerHTML = icon(c ? "chevrons-right" : "chevrons-left");
    };
  }
  // mobile menu
  const menuBtn = $("#menuBtn"), sidebar = $("#sidebar"), scrim = $("#sidebarScrim");
  const openSidebar = () => { sidebar.classList.add("open"); scrim.classList.add("show"); };
  const closeSidebar = () => { sidebar.classList.remove("open"); scrim.classList.remove("show"); };
  if (menuBtn) menuBtn.onclick = openSidebar;
  if (scrim) scrim.onclick = closeSidebar;
  $$(".nav-item").forEach(n => n.addEventListener("click", closeSidebar));

  // workspace switcher
  $("#wsSwitch").onclick = (e) => openWorkspaceSwitcher(e.currentTarget);
  // user menu
  $("#sideUser").onclick = (e) => openUserMenu(e.currentTarget);
  $("#avatarBtn").onclick = (e) => openUserMenu(e.currentTarget, "right");
  // theme toggle
  $("#themeBtn").onclick = () => {
    const t = Settings.get("theme") === "light" ? "dark" : "light";
    Settings.set("theme", t);
    $("#themeBtn").innerHTML = icon(t === "light" ? "moon" : "sun");
  };
  // notifications
  $("#notifBtn").onclick = (e) => toggleNotifPanel(e.currentTarget);
  // quick add + fab
  $("#quickAddBtn").onclick = () => quickAdd();
  $("#fab").onclick = () => quickAdd();
  // command palette
  $("#cmdBtn").onclick = () => commandPalette();
  // global search
  const gs = $("#globalSearch");
  if (gs) {
    gs.addEventListener("input", debounce(() => globalSearch(gs.value), 220));
    gs.addEventListener("focus", () => { if (gs.value) globalSearch(gs.value); });
    gs.addEventListener("keydown", (e) => { if (e.key === "Escape") { gs.blur(); closeSearchResults(); } });
  }
}

/* ---------- Workspace switcher ---------- */
function openWorkspaceSwitcher(anchor) {
  const items = State.workspaces.map(w => ({
    label: w.name, icon: "grid",
    checked: w.id === State.workspace?.id,
    onClick: () => { setCurrentWorkspace(w.id); location.reload(); }
  }));
  items.push("sep");
  items.push({ label: "New workspace", icon: "plus", onClick: () => newWorkspaceDialog() });
  items.push({ label: "Workspace settings", icon: "settings", onClick: () => location.href = "workspace.html?tab=settings" });
  const r = anchor.getBoundingClientRect();
  showMenu(r.left, r.bottom + 6, [{ label: "Workspaces", header: true }, ...items]);
}
export async function newWorkspaceDialog() {
  const name = await promptDialog({ title: "New Workspace", label: "Workspace name", placeholder: "Project Crimson", confirmText: "Create" });
  if (!name) return;
  const id = uid("ws");
  const color = WS_COLORS[State.workspaces.length % WS_COLORS.length];
  await DB.set("workspaces", id, { id, name, description: "", color, ownerId: State.user.id, createdAt: Date.now() });
  await addMember(id, State.user.id, "owner");
  setCurrentWorkspace(id);
  toast("Workspace created", "success");
  location.href = "workspace.html";
}

/* ---------- User menu ---------- */
function openUserMenu(anchor, align = "left") {
  const r = anchor.getBoundingClientRect();
  showMenu(align === "right" ? r.right : r.left, align === "right" ? r.bottom + 6 : r.top - 8, [
    { label: State.user.displayName || State.user.username, header: true },
    { label: "My Profile", icon: "user", onClick: () => location.href = `profile.html?u=${State.user.id}` },
    { label: "Settings", icon: "settings", onClick: () => location.href = "settings.html" },
    { label: "Keyboard shortcuts", icon: "command", onClick: showShortcuts },
    "sep",
    { label: `Backend: ${backendMode() === "firebase" ? "Firebase (live)" : "Demo (local)"}`, icon: backendMode() === "firebase" ? "database" : "cpu", onClick: () => toast(backendMode() === "firebase" ? "Connected to Firebase — realtime sync active." : "Running in demo mode. Add Firebase config in js/firebase.js to sync across devices.", { type: "info", duration: 6000 }) },
    "sep",
    { label: "Sign out", icon: "log-out", danger: true, onClick: async () => { await Auth.logout(); location.href = "index.html"; } }
  ], { align });
}

/* ---------- Notifications panel ---------- */
let _notifPanel = null;
function updateNotifBadge(n) {
  const dot = $("#notifDot");
  if (dot) dot.classList.toggle("hidden", n === 0);
  const navB = $("#nav-badge-chat");
}
function toggleNotifPanel(anchor) {
  if (_notifPanel) { _notifPanel.remove(); _notifPanel = null; return; }
  const panel = el("div", { class: "notif-panel glass" });
  panel.innerHTML = `
    <div class="np-head row between">
      <strong>Notifications</strong>
      <button class="btn link sm" id="npReadAll">Mark all read</button>
    </div>
    <div class="np-list" id="npList"></div>`;
  document.body.appendChild(panel);
  const r = anchor.getBoundingClientRect();
  panel.style.position = "fixed";
  panel.style.top = r.bottom + 8 + "px";
  panel.style.right = (window.innerWidth - r.right) + "px";
  panel.style.zIndex = "var(--z-menu)";
  _notifPanel = panel;
  renderNotifPanel();
  $("#npReadAll").onclick = () => markAllRead(State.user.id);
  const close = (e) => { if (_notifPanel && !panel.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { panel.remove(); _notifPanel = null; document.removeEventListener("click", close, true); } };
  setTimeout(() => document.addEventListener("click", close, true), 0);
}
function renderNotifPanel() {
  if (!_notifPanel) return;
  const list = $("#npList", _notifPanel);
  const notes = State.notifications || [];
  if (!notes.length) { list.innerHTML = `<div class="empty" style="padding:32px 16px"><div class="em-ic">${icon("bell")}</div><p>You're all caught up.</p></div>`; return; }
  list.innerHTML = notes.map(n => notifRow(n)).join("");
  $$(".notif-row", list).forEach(row => {
    row.onclick = () => {
      const id = row.dataset.id, link = row.dataset.link;
      markRead(id);
      if (link) location.href = link;
    };
  });
}

/* ---------- Quick add task ---------- */
export async function quickAdd() {
  const { openQuickTask } = await import("./tasks.js");
  openQuickTask();
}

/* ---------- Global search ---------- */
let _searchBox = null;
async function globalSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) return closeSearchResults();
  const wsId = State.workspace?.id;
  const [tasks, boards, files, docs, notes, users] = await Promise.all([
    DB.list("tasks", { where: [["workspaceId", "==", wsId]] }),
    DB.list("boards", { where: [["workspaceId", "==", wsId]] }),
    DB.list("files", { where: [["workspaceId", "==", wsId]] }),
    DB.list("docs", { where: [["workspaceId", "==", wsId]] }),
    DB.list("notes", { where: [["ownerId", "==", State.user.id]] }),
    DB.list("users", {})
  ]);
  const memberIds = new Set(State.members.map(m => m.userId));
  const match = (s) => (s || "").toLowerCase().includes(q);
  const groups = [
    { name: "Tasks", icon: "check-square", items: tasks.filter(t => match(t.title) || match(t.description)).slice(0, 6).map(t => ({ label: t.title, sub: "Task", href: `board.html?board=${t.boardId}&task=${t.id}` })) },
    { name: "Boards", icon: "board", items: boards.filter(b => match(b.name)).slice(0, 5).map(b => ({ label: b.name, sub: "Board", href: `board.html?board=${b.id}` })) },
    { name: "Files", icon: "folder", items: files.filter(f => match(f.name)).slice(0, 5).map(f => ({ label: f.name, sub: "File", href: `files.html?file=${f.id}` })) },
    { name: "Wiki", icon: "book", items: docs.filter(d => match(d.title) || match(d.content)).slice(0, 5).map(d => ({ label: d.title, sub: "Wiki", href: `docs.html?doc=${d.id}` })) },
    { name: "Notes", icon: "edit-3", items: notes.filter(n => match(n.title) || match(n.content)).slice(0, 4).map(n => ({ label: n.title || "Untitled note", sub: "Note", href: `notes.html?note=${n.id}` })) },
    { name: "People", icon: "users", items: users.filter(us => memberIds.has(us.id) && (match(us.displayName) || match(us.username) || match(us.email))).slice(0, 5).map(us => ({ label: us.displayName || us.username, sub: us.email, href: `profile.html?u=${us.id}`, avatar: us })) }
  ].filter(g => g.items.length);

  renderSearchResults(groups, q);
}
function renderSearchResults(groups, q) {
  closeSearchResults();
  const gs = $("#globalSearch");
  const box = el("div", { class: "search-results glass" });
  if (!groups.length) {
    box.innerHTML = `<div class="empty" style="padding:24px"><p>No results for "<strong>${escapeHtml(q)}</strong>"</p></div>`;
  } else {
    box.innerHTML = groups.map(g => `
      <div class="sr-group">
        <div class="sr-group-title">${icon(g.icon)} ${g.name}</div>
        ${g.items.map(it => `
          <a class="sr-item" href="${it.href}">
            ${it.avatar ? avatarHTML(it.avatar, "xs") : `<span class="sr-ic">${icon("chevron-right")}</span>`}
            <span class="grow truncate">${escapeHtml(it.label)}</span>
            <span class="sr-sub">${escapeHtml(it.sub || "")}</span>
          </a>`).join("")}
      </div>`).join("");
  }
  const r = gs.getBoundingClientRect();
  box.style.position = "fixed"; box.style.top = r.bottom + 8 + "px"; box.style.left = r.left + "px";
  box.style.width = r.width + "px"; box.style.zIndex = "var(--z-menu)";
  document.body.appendChild(box);
  _searchBox = box;
  const close = (e) => { if (_searchBox && !box.contains(e.target) && e.target !== gs) closeSearchResults(); };
  setTimeout(() => document.addEventListener("click", close, true), 0);
}
function closeSearchResults() { if (_searchBox) { _searchBox.remove(); _searchBox = null; } }

/* ---------- Command palette ---------- */
export function commandPalette() {
  const commands = [
    { label: "Go to Dashboard", icon: "dashboard", run: () => location.href = "dashboard.html" },
    { label: "Go to Boards", icon: "board", run: () => location.href = "workspace.html" },
    { label: "Go to Calendar", icon: "calendar", run: () => location.href = "calendar.html" },
    { label: "Go to Chat", icon: "chat", run: () => location.href = "chat.html" },
    { label: "Go to Files & Assets", icon: "folder", run: () => location.href = "files.html" },
    { label: "Go to Wiki", icon: "book", run: () => location.href = "docs.html" },
    { label: "Go to Notes", icon: "edit-3", run: () => location.href = "notes.html" },
    { label: "Go to Whiteboard", icon: "pen-tool", run: () => location.href = "whiteboard.html" },
    { label: "Go to Analytics", icon: "bar-chart", run: () => location.href = "analytics.html" },
    { label: "Go to Members", icon: "users", run: () => location.href = "members.html" },
    { label: "New task", icon: "plus", run: () => quickAdd() },
    { label: "New workspace", icon: "grid", run: () => newWorkspaceDialog() },
    { label: "New board", icon: "columns", run: () => location.href = "workspace.html?new=board" },
    { label: "Settings", icon: "settings", run: () => location.href = "settings.html" },
    { label: "My profile", icon: "user", run: () => location.href = `profile.html?u=${State.user.id}` },
    { label: "Toggle theme", icon: "sun", run: () => { const t = Settings.get("theme") === "light" ? "dark" : "light"; Settings.set("theme", t); } },
    { label: "Keyboard shortcuts", icon: "command", run: showShortcuts },
    { label: "Sign out", icon: "log-out", run: async () => { await Auth.logout(); location.href = "index.html"; } }
  ];
  const input = el("input", { class: "input", placeholder: "Type a command…", style: { marginBottom: "10px" } });
  const listEl = el("div", { class: "cmd-list" });
  const m = openModal({ title: "Command Palette", size: "sm", body: el("div", {}, input, listEl) });
  let filtered = commands, sel = 0;
  const render = () => {
    listEl.innerHTML = filtered.map((c, i) => `<div class="cmd-item ${i === sel ? "active" : ""}" data-i="${i}">${icon(c.icon)}<span>${escapeHtml(c.label)}</span></div>`).join("") || `<div class="dim" style="padding:12px">No matches</div>`;
    $$(".cmd-item", listEl).forEach(it => it.onclick = () => { m.close(); filtered[+it.dataset.i].run(); });
  };
  render();
  input.addEventListener("input", () => { const q = input.value.toLowerCase(); filtered = commands.filter(c => c.label.toLowerCase().includes(q)); sel = 0; render(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { sel = Math.min(filtered.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter") { m.close(); filtered[sel]?.run(); }
  });
  setTimeout(() => input.focus(), 60);
}

/* ---------- Keyboard shortcuts ---------- */
let _gPending = false;
function bindShortcuts() {
  document.addEventListener("keydown", (e) => {
    const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); commandPalette(); return; }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); $("#globalSearch")?.focus(); return; }
    if (e.key === "?") { showShortcuts(); return; }
    if (e.key.toLowerCase() === "n") { quickAdd(); return; }
    if (e.key.toLowerCase() === "g") { _gPending = true; setTimeout(() => _gPending = false, 800); return; }
    if (_gPending) {
      const map = { d: "dashboard.html", b: "workspace.html", c: "chat.html", k: "calendar.html", f: "files.html", w: "docs.html" };
      if (map[e.key.toLowerCase()]) { location.href = map[e.key.toLowerCase()]; }
      _gPending = false;
    }
  });
}
export function showShortcuts() {
  openModal({
    title: "Keyboard Shortcuts", size: "sm", icon: "command",
    body: `<div class="shortcut-list">${SHORTCUTS.map(s => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="muted">${escapeHtml(s.desc)}</span><span class="kbd">${escapeHtml(s.keys)}</span></div>`).join("")}</div>`
  });
}

/* ---------- Member badge refresh (chat unread etc.) ---------- */
function renderMemberBits() {
  const sw = $(".ws-switch-meta .s");
  if (sw) sw.textContent = `${State.members.length || 1} member${State.members.length === 1 ? "" : "s"}`;
}

/* ---------- Page helpers ---------- */
export function pageRoot() { return $("#pageRoot"); }
export function setPageTitle(title, crumb) {
  const h = $(".page-title h1"); if (h) h.textContent = title;
  const c = $(".page-title .crumb"); if (c && crumb != null) c.textContent = crumb;
  document.title = (title ? title + " · " : "") + APP.name;
}

export { APP, DB, Auth, backendMode };
