/* ============================================================
   OniSteel Studios Board — Workspace Hub (Boards)
   Board grid, templates, create/duplicate/archive, workspace
   settings, export / import / backup.
   ============================================================ */
import { DB, Auth, uid, backendMode } from "./store.js";
import { State, setPageTitle, newWorkspaceDialog } from "./app.js";
import { DEFAULT_COLUMNS, BOARD_TEMPLATES, BOARD_ICONS, WS_COLORS } from "./constants.js";
import { icon } from "./icons.js";
import {
  $, $$, el, escapeHtml, avatarHTML, toast, openModal, confirmDialog, promptDialog,
  menuFromEvent, fmtDate, pickFile
} from "./ui.js";
import { avatarStack } from "./users.js";
import { logActivity } from "./notifications.js";

let boards = [], allTasks = [];
const subs = [];

export async function initWorkspacePage() {
  const ws = State.workspace;
  setPageTitle(ws.name, "Workspace");
  const root = $("#pageRoot");

  const params = new URLSearchParams(location.search);
  if (params.get("tab") === "settings") setTimeout(openWorkspaceSettings, 200);
  if (params.get("new") === "board") setTimeout(newBoardDialog, 200);

  root.innerHTML = `
    <div class="ws-hero card" style="--c:${ws.color}">
      <div class="ws-hero-bg"></div>
      <div class="ws-hero-content">
        <div class="ws-hero-badge" style="background:linear-gradient(135deg, ${ws.color}, ${shade(ws.color,-30)})">${escapeHtml(ws.name[0] || "W")}</div>
        <div class="grow">
          <div class="row gap-8"><h1 class="ws-name">${escapeHtml(ws.name)}</h1><span class="badge steel">${escapeHtml(cap(ws._role || "member"))}</span></div>
          <div class="muted">${escapeHtml(ws.description || "Game development workspace")}</div>
          <div class="row gap-16 mt-12">
            <div class="ws-stat"><b id="wsBoardCount">0</b><span>boards</span></div>
            <div class="ws-stat"><b>${State.members.length}</b><span>members</span></div>
            <div class="ws-stat"><b id="wsTaskCount">0</b><span>tasks</span></div>
          </div>
        </div>
        <div class="ws-hero-actions">
          <div class="row"><div class="avatar-stack" id="wsMembers"></div><a href="members.html" class="btn ghost sm" style="margin-left:8px">Manage</a></div>
          <div class="row gap-8 mt-12">
            <button class="btn ghost sm" id="wsSettings">${icon("settings")} Settings</button>
            <button class="btn primary sm" id="wsNewBoard">${icon("plus")} New board</button>
          </div>
        </div>
      </div>
    </div>

    <div class="row between mb-16 mt-24"><h2 class="panel-h" style="font-size:16px">Boards</h2>
      <div class="segment" id="boardSort"><button data-s="recent" class="active">Recent</button><button data-s="name">A–Z</button><button data-s="fav">Favorites</button></div>
    </div>
    <div id="boardGrid" class="grid grid-auto"></div>

    <h2 class="panel-h mt-24 mb-16" style="font-size:16px">Quick-create from template</h2>
    <div class="template-grid" id="templateGrid"></div>`;

  $("#wsNewBoard").onclick = newBoardDialog;
  $("#wsSettings").onclick = openWorkspaceSettings;
  $("#wsMembers").innerHTML = avatarStack(State.members.map(m => m.user), 6);
  $$("#boardSort button").forEach(b => b.onclick = () => { $$("#boardSort button").forEach(x => x.classList.toggle("active", x === b)); sortMode = b.dataset.s; renderBoards(); });

  renderTemplates();

  subs.push(DB.watch("boards", { where: [["workspaceId", "==", ws.id]] }, (l) => { boards = l.filter(b => !b.archived); $("#wsBoardCount").textContent = boards.length; renderBoards(); }));
  subs.push(DB.watch("tasks", { where: [["workspaceId", "==", ws.id]] }, (l) => { allTasks = l.filter(t => !t.archived); $("#wsTaskCount").textContent = allTasks.length; renderBoards(); }));
  window.addEventListener("beforeunload", () => subs.forEach(u => u && u()));
}

let sortMode = "recent";
function renderBoards() {
  const grid = $("#boardGrid"); if (!grid) return;
  let list = [...boards];
  if (sortMode === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortMode === "fav") list = list.filter(b => b.favorite);
  else list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em-ic">${icon("board")}</div><h3>No boards yet</h3><p>Create your first board or pick a template below.</p><button class="btn primary" onclick="document.getElementById('wsNewBoard').click()">${icon("plus")} New board</button></div>`;
    return;
  }
  grid.innerHTML = list.map(b => {
    const bt = allTasks.filter(t => t.boardId === b.id);
    const done = bt.filter(t => t.completion >= 100).length;
    const pct = bt.length ? Math.round(done / bt.length * 100) : 0;
    const ic = BOARD_ICONS[b.name] || "board";
    const assignees = [...new Set(bt.flatMap(t => t.assignees || []))].map(id => State.members.find(m => m.userId === id)?.user).filter(Boolean);
    return `<div class="board-card hoverable" data-board="${b.id}">
      <div class="bc-top">
        <div class="bc-icon" style="background:linear-gradient(135deg, ${State.workspace.color}, ${shade(State.workspace.color,-30)})">${icon(ic)}</div>
        <button class="iconbtn sm bc-fav ${b.favorite?"active":""}" data-fav="${b.id}">${icon("star")}</button>
        <button class="iconbtn sm bc-menu" data-menu="${b.id}">${icon("more-vertical")}</button>
      </div>
      <div class="bc-name">${escapeHtml(b.name)}</div>
      <div class="bc-desc dim small clamp-2">${escapeHtml(b.description || "No description")}</div>
      <div class="bc-cols">${(b.columns||[]).slice(0,5).map(c=>`<span class="bc-col-dot" style="background:${c.color}" title="${escapeHtml(c.name)}"></span>`).join("")}${(b.columns||[]).length>5?`<span class="dim tiny">+${b.columns.length-5}</span>`:""}</div>
      <div class="bc-foot">
        <div class="grow"><div class="row between" style="margin-bottom:4px"><span class="dim tiny">${done}/${bt.length} tasks</span><span class="tiny strong">${pct}%</span></div><div class="progress thin"><i style="width:${pct}%"></i></div></div>
      </div>
      ${assignees.length?`<div class="bc-members">${avatarStack(assignees,4)}</div>`:""}
    </div>`;
  }).join("");

  $$(".board-card", grid).forEach(c => c.onclick = (e) => { if (e.target.closest("button")) return; location.href = `board.html?board=${c.dataset.board}`; });
  $$("[data-fav]", grid).forEach(b => b.onclick = (e) => { e.stopPropagation(); const board = boards.find(x => x.id === b.dataset.fav); DB.update("boards", b.dataset.fav, { favorite: !board.favorite }); });
  $$("[data-menu]", grid).forEach(b => b.onclick = (e) => { e.stopPropagation(); boardCardMenu(e, b.dataset.menu); });
}

function boardCardMenu(e, boardId) {
  const b = boards.find(x => x.id === boardId);
  menuFromEvent(e, [
    { label: "Open", icon: "external-link", onClick: () => location.href = `board.html?board=${boardId}` },
    { label: "Rename", icon: "edit-3", onClick: async () => { const n = await promptDialog({ title: "Rename board", value: b.name }); if (n) DB.update("boards", boardId, { name: n }); } },
    { label: "Duplicate", icon: "copy", onClick: () => duplicateBoard(b) },
    { label: b.favorite ? "Unfavorite" : "Favorite", icon: "star", onClick: () => DB.update("boards", boardId, { favorite: !b.favorite }) },
    "sep",
    { label: "Archive", icon: "archive", onClick: () => { DB.update("boards", boardId, { archived: true }); toast("Board archived", "success"); } },
    { label: "Delete", icon: "trash-2", danger: true, onClick: () => deleteBoard(b) }
  ]);
}
async function duplicateBoard(b) {
  const id = uid("brd");
  await DB.set("boards", id, { ...b, id, name: b.name + " (copy)", favorite: false, createdAt: Date.now(), columns: b.columns.map(c => ({ ...c, id: uid("col") })) });
  toast("Board duplicated", "success");
}
async function deleteBoard(b) {
  if (!await confirmDialog({ title: "Delete board?", message: `"${b.name}" and its tasks will be deleted.`, danger: true, confirmText: "Delete" })) return;
  const bt = await DB.list("tasks", { where: [["boardId", "==", b.id]] });
  await DB.batch([{ type: "remove", collection: "boards", id: b.id }, ...bt.map(t => ({ type: "remove", collection: "tasks", id: t.id }))]);
  toast("Board deleted", "success");
}

/* ---------- Templates ---------- */
function renderTemplates() {
  const grid = $("#templateGrid");
  grid.innerHTML = BOARD_TEMPLATES.map(name => `
    <button class="template-card" data-tpl="${escapeHtml(name)}">
      <span class="tpl-ic">${icon(BOARD_ICONS[name] || "board")}</span>
      <span>${escapeHtml(name)}</span>
    </button>`).join("");
  $$(".template-card", grid).forEach(b => b.onclick = () => createBoard(b.dataset.tpl));
}

async function newBoardDialog() {
  const body = el("div", {});
  body.innerHTML = `
    <div class="field"><label>Board name</label><input class="input" id="nbName" placeholder="e.g. Programming" autofocus></div>
    <div class="field"><label>Description (optional)</label><input class="input" id="nbDesc" placeholder="What is this board for?"></div>
    <div class="field"><label>Start from template</label>
      <div class="tpl-select" id="nbTpl">
        <button class="tpl-opt on" data-cols="default">Default (9 columns)</button>
        ${BOARD_TEMPLATES.map(t=>`<button class="tpl-opt" data-tpl="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}
      </div>
    </div>`;
  const foot = el("div", {});
  const m = openModal({ title: "New Board", icon: "columns", body, footer: foot });
  let chosenTpl = null;
  $$(".tpl-opt", body).forEach(b => b.onclick = () => { $$(".tpl-opt", body).forEach(x => x.classList.remove("on")); b.classList.add("on"); chosenTpl = b.dataset.tpl || null; if (b.dataset.tpl && !$("#nbName", body).value) $("#nbName", body).value = b.dataset.tpl; });
  foot.append(
    el("button", { class: "btn ghost", onClick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onClick: async () => { const name = $("#nbName", body).value.trim(); if (!name) { $("#nbName", body).focus(); return; } await createBoard(name, $("#nbDesc", body).value.trim()); m.close(); } }, "Create board")
  );
  setTimeout(() => $("#nbName", body).focus(), 60);
}

export async function createBoard(name, description = "") {
  const id = uid("brd");
  const columns = DEFAULT_COLUMNS.map((c, i) => ({ id: uid("col"), name: c.name, color: c.color, order: i }));
  await DB.set("boards", id, { id, workspaceId: State.workspace.id, name, description: description || `${name} tasks`, columns, ownerId: Auth.current().id, createdAt: Date.now(), favorite: false, archived: false });
  await logActivity(State.workspace.id, { verb: "created_board", actorId: Auth.current().id, target: name });
  toast("Board created", "success");
  location.href = `board.html?board=${id}`;
}

/* ---------- Workspace settings ---------- */
function openWorkspaceSettings() {
  const ws = State.workspace;
  const canManage = (ws._role === "owner" || ws._role === "studio_director" || ws._role === "project_manager");
  const body = el("div", {});
  body.innerHTML = `
    <div class="field"><label>Workspace name</label><input class="input" id="wsSetName" value="${escapeHtml(ws.name)}" ${canManage?"":"disabled"}></div>
    <div class="field"><label>Description</label><textarea class="textarea" id="wsSetDesc" ${canManage?"":"disabled"}>${escapeHtml(ws.description||"")}</textarea></div>
    <div class="field"><label>Accent color</label><div class="color-row" id="wsColors">${WS_COLORS.map(c=>`<button class="swatch ${c===ws.color?"on":""}" data-c="${c}" style="background:${c}"></button>`).join("")}</div></div>
    <div class="hr"></div>
    <div class="field"><label>Data & Backup</label>
      <div class="row gap-8 wrap">
        <button class="btn ghost sm" id="wsExportJson">${icon("download")} Export JSON</button>
        <button class="btn ghost sm" id="wsExportCsv">${icon("file-text")} Export CSV</button>
        <button class="btn ghost sm" id="wsImport">${icon("upload")} Import JSON</button>
      </div>
      <div class="hint mt-8">Backend: <strong>${backendMode()==="firebase"?"Firebase (cloud sync)":"Demo (local device)"}</strong>. Exports include boards, tasks, docs & files metadata.</div>
    </div>
    ${canManage?`<div class="hr"></div><div class="danger-zone"><div class="dz-title">${icon("alert-triangle")} Danger zone</div><button class="btn danger sm" id="wsDelete">Delete workspace</button></div>`:""}`;
  const foot = el("div", {});
  const m = openModal({ title: "Workspace Settings", icon: "settings", size: "md", body, footer: foot });
  let chosenColor = ws.color;
  $$(".swatch", body).forEach(s => s.onclick = () => { $$(".swatch", body).forEach(x => x.classList.remove("on")); s.classList.add("on"); chosenColor = s.dataset.c; });
  $("#wsExportJson", body).onclick = () => exportWorkspace("json");
  $("#wsExportCsv", body).onclick = () => exportWorkspace("csv");
  $("#wsImport", body).onclick = () => importWorkspace();
  const del = $("#wsDelete", body);
  if (del) del.onclick = async () => { if (await confirmDialog({ title: "Delete workspace?", message: `"${ws.name}" and ALL its boards, tasks and data will be permanently deleted. This cannot be undone.`, danger: true, confirmText: "Delete everything" })) await deleteWorkspace(); };
  foot.append(
    el("button", { class: "btn ghost", onClick: () => m.close() }, "Close"),
    canManage ? el("button", { class: "btn primary", onClick: async () => { await DB.update("workspaces", ws.id, { name: $("#wsSetName", body).value.trim() || ws.name, description: $("#wsSetDesc", body).value.trim(), color: chosenColor }); toast("Saved", "success"); m.close(); setTimeout(() => location.reload(), 400); } }, "Save changes") : null
  );
}

async function exportWorkspace(fmt) {
  const wsId = State.workspace.id;
  const [bd, tk, dc, nt, fl] = await Promise.all([
    DB.list("boards", { where: [["workspaceId", "==", wsId]] }),
    DB.list("tasks", { where: [["workspaceId", "==", wsId]] }),
    DB.list("docs", { where: [["workspaceId", "==", wsId]] }),
    DB.list("notes", { where: [["ownerId", "==", Auth.current().id]] }),
    DB.list("files", { where: [["workspaceId", "==", wsId]] })
  ]);
  if (fmt === "csv") {
    const rows = [["Board", "Task", "Status", "Priority", "Assignees", "Due", "Completion", "Points", "Est Hrs", "Logged Hrs"]];
    tk.forEach(t => {
      const b = bd.find(x => x.id === t.boardId);
      const col = b?.columns.find(c => c.id === t.columnId);
      rows.push([b?.name || "", t.title, col?.name || "", t.priority, (t.assignees || []).length, t.dueDate ? fmtDate(t.dueDate) : "", t.completion + "%", t.storyPoints || 0, t.estimatedHours || 0, t.loggedHours || 0]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    download(`${State.workspace.name.replace(/\s+/g,"_")}_export.csv`, csv, "text/csv");
  } else {
    const data = { workspace: State.workspace, boards: bd, tasks: tk, docs: dc, notes: nt, files: fl.map(f => ({ ...f, url: f.url ? "[binary omitted]" : "" })), exportedAt: Date.now(), version: "1.0.0" };
    download(`${State.workspace.name.replace(/\s+/g,"_")}_backup.json`, JSON.stringify(data, null, 2), "application/json");
  }
  toast("Export ready — downloading", "success");
}
async function importWorkspace() {
  const file = await pickFile({ accept: ".json" });
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.boards) throw new Error("Invalid backup");
    if (!await confirmDialog({ title: "Import data?", message: `This will add ${data.boards.length} board(s) and ${(data.tasks||[]).length} task(s) to this workspace.`, confirmText: "Import" })) return;
    const wsId = State.workspace.id;
    const idMap = {};
    const ops = [];
    (data.boards || []).forEach(b => { const nid = uid("brd"); idMap[b.id] = nid; ops.push({ type: "set", collection: "boards", id: nid, data: { ...b, id: nid, workspaceId: wsId, createdAt: Date.now() } }); });
    (data.tasks || []).forEach(t => { const nid = uid("tsk"); ops.push({ type: "set", collection: "tasks", id: nid, data: { ...t, id: nid, workspaceId: wsId, boardId: idMap[t.boardId] || t.boardId, createdAt: Date.now() } }); });
    (data.docs || []).forEach(d => { const nid = uid("doc"); ops.push({ type: "set", collection: "docs", id: nid, data: { ...d, id: nid, workspaceId: wsId } }); });
    for (let i = 0; i < ops.length; i += 60) await DB.batch(ops.slice(i, i + 60));
    toast("Import complete", "success");
    location.reload();
  } catch (e) { toast("Import failed: " + e.message, "error"); }
}
async function deleteWorkspace() {
  const wsId = State.workspace.id;
  const cols = ["boards", "tasks", "channels", "messages", "docs", "files", "activity", "members", "comments"];
  for (const col of cols) {
    const items = await DB.list(col, { where: [["workspaceId", "==", wsId]] });
    if (items.length) for (let i = 0; i < items.length; i += 60) await DB.batch(items.slice(i, i + 60).map(x => ({ type: "remove", collection: col, id: x.id })));
  }
  await DB.remove("workspaces", wsId);
  localStorage.removeItem("onisteel:ws");
  toast("Workspace deleted", "success");
  location.href = "dashboard.html";
}

/* ---------- helpers ---------- */
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
}
function shade(hex, amt) { try { const n = parseInt(hex.slice(1), 16); let r = clamp((n>>16)+amt), g = clamp((n>>8&255)+amt), b = clamp((n&255)+amt); return "#"+((r<<16)|(g<<8)|b).toString(16).padStart(6,"0"); } catch { return hex; } }
function clamp(v) { return Math.max(0, Math.min(255, v)); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " "); }
