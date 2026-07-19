/* ============================================================
   OniSteel Studios Board — Kanban Board Controller
   Columns, cards, drag & drop, filters, list view.
   ============================================================ */
import { DB, Auth, uid } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { DEFAULT_COLUMNS, PRIORITIES, LABELS, prioById, labelById } from "./constants.js";
import { icon } from "./icons.js";
import {
  $, $$, el, escapeHtml, toast, showMenu, menuFromEvent, promptDialog, confirmDialog,
  avatarHTML, debounce, fmtDate, popover, closeMenu
} from "./ui.js";
import { taskCardHTML, openTask, openQuickTask, createTask, moveTaskToColumn } from "./tasks.js";
import { logActivity } from "./notifications.js";

let board = null;
let tasks = [];
let unsubTasks = null, unsubBoard = null, unsubComments = null;
const filters = { q: "", assignees: new Set(), labels: new Set(), priorities: new Set(), mine: false };
let view = "board";

export async function initBoardPage() {
  const params = new URLSearchParams(location.search);
  const boardId = params.get("board");
  if (!boardId) { location.href = "workspace.html"; return; }

  const root = $("#pageRoot");
  root.innerHTML = `<div class="board-loading">${Array.from({length:4}).map(()=>`<div class="skeleton" style="width:280px;height:70vh;border-radius:16px"></div>`).join("")}</div>`;
  root.closest(".content-pad")?.classList.add("board-pad");

  board = await DB.getDoc("boards", boardId);
  if (!board) { root.innerHTML = `<div class="empty"><div class="em-ic">${icon("board")}</div><h3>Board not found</h3><a class="btn primary" href="workspace.html">Back to boards</a></div>`; return; }
  State._boardCache = State._boardCache || {}; State._boardCache[boardId] = board;
  setPageTitle(board.name, board.description || State.workspace?.name);

  renderBoardChrome(root);

  unsubBoard = DB.watchDoc("boards", boardId, (b) => { if (b) { board = b; State._boardCache[boardId] = b; renderColumns(); } });
  unsubTasks = DB.watch("tasks", { where: [["boardId", "==", boardId]] }, async (list) => {
    tasks = list.filter(t => !t.archived);
    // attach comment counts (cheap: one query for all comments of board's tasks)
    await attachCommentCounts();
    renderColumns();
  });

  // open task from URL
  const taskParam = params.get("task");
  if (taskParam) setTimeout(() => openTask(taskParam), 400);

  window.addEventListener("beforeunload", cleanup);
}
function cleanup() { unsubTasks && unsubTasks(); unsubBoard && unsubBoard(); unsubComments && unsubComments(); }

async function attachCommentCounts() {
  try {
    const comments = await DB.list("comments", { where: [["workspaceId", "==", State.workspace.id]] });
    const counts = {};
    comments.forEach(c => counts[c.taskId] = (counts[c.taskId] || 0) + 1);
    tasks.forEach(t => t._commentCount = counts[t.id] || 0);
  } catch {}
}

/* ---------- Chrome (toolbar) ---------- */
function renderBoardChrome(root) {
  root.innerHTML = `
    <div class="board-toolbar">
      <div class="row gap-10 grow" style="min-width:0">
        <div class="board-badge" style="background:linear-gradient(135deg, ${State.workspace?.color||"#4D6B91"}, #33475F)">${icon("board")}</div>
        <div style="min-width:0">
          <div class="row gap-8"><h2 class="board-name" id="boardName">${escapeHtml(board.name)}</h2><button class="iconbtn sm" id="boardMenuBtn">${icon("more-horizontal")}</button></div>
          <div class="dim small truncate">${escapeHtml(board.description||"")}</div>
        </div>
      </div>
      <div class="row gap-8 board-tools">
        <div class="searchbox board-search"><span class="s-ic">${icon("search")}</span><input id="boardSearch" placeholder="Filter cards…"></div>
        <button class="btn ghost sm" id="filterBtn">${icon("filter")}<span class="hide-sm">Filter</span><span id="filterCount"></span></button>
        <div class="segment" id="viewSeg">
          <button data-v="board" class="active">${icon("board")}</button>
          <button data-v="list">${icon("list")}</button>
        </div>
        <button class="btn primary sm" id="addCardTop">${icon("plus")}<span class="hide-sm">Add task</span></button>
      </div>
    </div>
    <div id="boardCanvas"></div>`;

  $("#boardSearch", root).addEventListener("input", debounce((e) => { filters.q = e.target.value.toLowerCase(); renderColumns(); }, 160));
  $("#addCardTop", root).onclick = () => openQuickTask({ boardId: board.id, columnId: board.columns[0]?.id });
  $("#filterBtn", root).onclick = (e) => openFilterMenu(e.currentTarget);
  $("#boardMenuBtn", root).onclick = (e) => boardMenu(e);
  $("#boardName", root).ondblclick = renameBoard;
  $$("#viewSeg button", root).forEach(b => b.onclick = () => { view = b.dataset.v; $$("#viewSeg button", root).forEach(x => x.classList.toggle("active", x === b)); renderColumns(); });
}

function filteredTasks() {
  const me = Auth.current();
  return tasks.filter(t => {
    if (filters.q && !(t.title.toLowerCase().includes(filters.q) || (t.description||"").toLowerCase().includes(filters.q))) return false;
    if (filters.mine && !(t.assignees||[]).includes(me.id)) return false;
    if (filters.assignees.size && !(t.assignees||[]).some(a => filters.assignees.has(a))) return false;
    if (filters.labels.size && !(t.labels||[]).some(l => filters.labels.has(l))) return false;
    if (filters.priorities.size && !filters.priorities.has(t.priority)) return false;
    return true;
  });
}

/* ---------- Columns ---------- */
function renderColumns() {
  const canvas = $("#boardCanvas");
  if (!canvas) return;
  const ft = filteredTasks();
  if (view === "list") return renderListView(canvas, ft);

  const cols = [...(board.columns || [])].sort((a, b) => a.order - b.order);
  canvas.className = "board-canvas";
  canvas.innerHTML = cols.map(c => {
    const colTasks = ft.filter(t => t.columnId === c.id).sort((a, b) => (b.pinned?1:0)-(a.pinned?1:0) || a.order - b.order);
    const totalPts = colTasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
    return `
    <div class="board-col" data-col="${c.id}">
      <div class="col-head" style="--c:${c.color}">
        <span class="col-dot" style="background:${c.color}"></span>
        <span class="col-name" title="Double-click to rename">${escapeHtml(c.name)}</span>
        <span class="col-count">${colTasks.length}</span>
        ${totalPts ? `<span class="col-pts" title="Story points">${totalPts}pt</span>` : ""}
        <span class="grow"></span>
        <button class="iconbtn sm col-add" data-col="${c.id}" data-tip="Add card">${icon("plus")}</button>
        <button class="iconbtn sm col-menu" data-col="${c.id}">${icon("more-vertical")}</button>
      </div>
      <div class="col-body" data-col="${c.id}">
        ${colTasks.map(t => taskCardHTML(t)).join("")}
        <div class="col-drop-hint"></div>
      </div>
      <button class="col-addcard" data-col="${c.id}">${icon("plus")} Add a card</button>
    </div>`;
  }).join("") + `
    <div class="board-col add-col">
      <button class="add-col-btn" id="addColBtn">${icon("plus")} Add column</button>
    </div>`;

  wireColumnEvents(canvas);
  wireDnD(canvas);
}

function wireColumnEvents(canvas) {
  $$(".task-card", canvas).forEach(card => {
    card.addEventListener("click", (e) => { if (e.target.closest("button")) return; openTask(card.dataset.task); });
    card.addEventListener("contextmenu", (e) => cardContextMenu(e, card.dataset.task));
  });
  $$(".col-add, .col-addcard", canvas).forEach(b => b.onclick = (e) => { e.stopPropagation(); openQuickTask({ boardId: board.id, columnId: b.dataset.col }); });
  $$(".col-menu", canvas).forEach(b => b.onclick = (e) => { e.stopPropagation(); columnMenu(e, b.dataset.col); });
  $$(".col-name", canvas).forEach(n => n.ondblclick = () => renameColumn(n.closest(".board-col").dataset.col));
  const addCol = $("#addColBtn", canvas);
  if (addCol) addCol.onclick = addColumn;
}

/* ---------- Drag & Drop (pointer-based — works on mouse AND touch) ---------- */
let dragId = null;
function wireDnD(canvas) {
  $$(".task-card", canvas).forEach(card => {
    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const startX = e.clientX, startY = e.clientY;
      const taskId = card.dataset.task;
      let started = false, ghost = null, placeholder = null, offX = 0, offY = 0, autoScroll = null;

      const startDrag = (ev) => {
        started = true;
        const r = card.getBoundingClientRect();
        offX = ev.clientX - r.left; offY = ev.clientY - r.top;
        ghost = card.cloneNode(true);
        ghost.classList.add("drag-ghost");
        Object.assign(ghost.style, { position: "fixed", width: r.width + "px", left: r.left + "px", top: r.top + "px", pointerEvents: "none", zIndex: 900, margin: 0 });
        document.body.appendChild(ghost);
        placeholder = document.createElement("div");
        placeholder.className = "card-placeholder";
        placeholder.style.height = r.height + "px";
        card.after(placeholder);
        card.style.display = "none";
        document.body.classList.add("dragging-active");
        dragId = taskId;
      };
      const onMove = (ev) => {
        if (!started) { if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return; startDrag(ev); }
        ev.preventDefault();
        ghost.style.left = (ev.clientX - offX) + "px";
        ghost.style.top = (ev.clientY - offY) + "px";
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        let body = under && under.closest(".col-body");
        // Treat the whole column (header, padding, add-card) as a drop zone,
        // then fall back to column-by-x so short/empty columns still accept drops.
        if (!body) { const col = under && under.closest(".board-col"); if (col) body = col.querySelector(".col-body"); }
        if (!body) {
          const col = $$(".board-col").find(c => { const r = c.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom + 30; });
          if (col) body = col.querySelector(".col-body");
        }
        $$(".col-body").forEach(b => b.classList.toggle("drag-over", b === body));
        if (body) {
          const after = getDragAfter(body, ev.clientY);
          const hint = body.querySelector(".col-drop-hint");
          if (after == null) body.insertBefore(placeholder, hint);
          else body.insertBefore(placeholder, after);
        }
        // edge auto-scroll for the horizontal board
        const cv = $("#boardCanvas");
        if (cv) { const cr = cv.getBoundingClientRect(); if (ev.clientX > cr.right - 60) cv.scrollLeft += 14; else if (ev.clientX < cr.left + 60) cv.scrollLeft -= 14; }
      };
      const onUp = async () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        clearInterval(autoScroll);
        if (!started) return;
        document.body.classList.remove("dragging-active");
        $$(".col-body").forEach(b => b.classList.remove("drag-over"));
        const body = placeholder.parentElement;
        placeholder.replaceWith(card);
        card.style.display = "";
        ghost.remove();
        if (body && body.classList.contains("col-body")) await persistOrder(body.dataset.col, body);
        dragId = null;
      };
      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onUp);
    });
  });
}
function getDragAfter(container, y) {
  const cards = [...container.querySelectorAll(".task-card")].filter(c => c.style.display !== "none");
  return cards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element || null;
}

async function persistOrder(colId, body) {
  const ids = [...body.querySelectorAll(".task-card")].map(c => c.dataset.task);
  const ops = [];
  const movedTask = tasks.find(t => t.id === dragId);
  const fromCol = movedTask?.columnId;
  ids.forEach((id, i) => {
    const patch = { order: i };
    if (id === dragId && colId !== fromCol) patch.columnId = colId;
    ops.push({ type: "update", collection: "tasks", id, data: patch });
  });
  await DB.batch(ops);
  if (colId !== fromCol && movedTask) {
    const col = board.columns.find(c => c.id === colId);
    const me = Auth.current();
    logActivity(State.workspace.id, { verb: "moved", actorId: me.id, target: movedTask.title, boardId: board.id, meta: { taskId: movedTask.id, to: col?.name } });
    if (["Completed", "Released"].includes(col?.name)) {
      DB.update("tasks", dragId, { completion: 100 });
    }
  }
}

/* ---------- Card / column context menus ---------- */
function cardContextMenu(e, taskId) {
  const t = tasks.find(x => x.id === taskId); if (!t) return;
  menuFromEvent(e, [
    { label: "Open", icon: "maximize", onClick: () => openTask(taskId) },
    { label: t.pinned ? "Unpin" : "Pin", icon: "pin", onClick: () => DB.update("tasks", taskId, { pinned: !t.pinned }) },
    { label: "Move to…", icon: "move", onClick: () => showMenu(e.clientX, e.clientY, board.columns.map(c => ({ label: c.name, checked: c.id === t.columnId, onClick: () => moveTaskToColumn(t, c.id) }))) },
    { label: "Set priority", icon: "flag", onClick: () => showMenu(e.clientX, e.clientY, PRIORITIES.map(p => ({ label: p.name, checked: p.id === t.priority, onClick: () => DB.update("tasks", taskId, { priority: p.id }) }))) },
    "sep",
    { label: "Archive", icon: "archive", onClick: () => DB.update("tasks", taskId, { archived: true }) },
    { label: "Delete", icon: "trash-2", danger: true, onClick: async () => { if (await confirmDialog({ title: "Delete task?", message: t.title, danger: true, confirmText: "Delete" })) DB.remove("tasks", taskId); } }
  ]);
}
function columnMenu(e, colId) {
  const col = board.columns.find(c => c.id === colId);
  showMenu(e.clientX, e.clientY, [
    { label: "Add card", icon: "plus", onClick: () => openQuickTask({ boardId: board.id, columnId: colId }) },
    { label: "Rename", icon: "edit-3", onClick: () => renameColumn(colId) },
    { label: "Change color", icon: "palette", onClick: (ev) => colorPicker(e, colId) },
    { label: "Move left", icon: "chevron-left", onClick: () => moveColumn(colId, -1) },
    { label: "Move right", icon: "chevron-right", onClick: () => moveColumn(colId, 1) },
    "sep",
    { label: "Clear column", icon: "trash", onClick: () => clearColumn(colId) },
    { label: "Delete column", icon: "trash-2", danger: true, onClick: () => deleteColumn(colId) }
  ]);
}

/* ---------- Column ops ---------- */
async function addColumn() {
  const name = await promptDialog({ title: "New Column", label: "Column name", placeholder: "e.g. Polish", confirmText: "Add" });
  if (!name) return;
  const columns = [...board.columns, { id: uid("col"), name, color: "#4D6B91", order: board.columns.length }];
  await DB.update("boards", board.id, { columns });
}
async function renameColumn(colId) {
  const col = board.columns.find(c => c.id === colId);
  const name = await promptDialog({ title: "Rename Column", value: col.name, confirmText: "Save" });
  if (!name) return;
  await DB.update("boards", board.id, { columns: board.columns.map(c => c.id === colId ? { ...c, name } : c) });
}
function colorPicker(e, colId) {
  const colors = ["#8A6BD1","#6B7280","#4D6B91","#E6A23C","#4D8F91","#5B8BB0","#C12A2A","#3FB98A","#8AB06B","#D16B9E"];
  const content = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "6px", padding: "8px" } });
  colors.forEach(col => { const b = el("button", { class: "swatch", style: { background: col, width: "28px", height: "28px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.2)", cursor: "pointer" } }); b.onclick = () => { DB.update("boards", board.id, { columns: board.columns.map(c => c.id === colId ? { ...c, color: col } : c) }); closeMenu(); }; content.appendChild(b); });
  showMenu(e.clientX, e.clientY, [{ label: "Column color", header: true }]);
  setTimeout(() => { const m = document.querySelector(".menu.show"); if (m) m.appendChild(content); }, 0);
}
async function moveColumn(colId, dir) {
  const cols = [...board.columns].sort((a, b) => a.order - b.order);
  const i = cols.findIndex(c => c.id === colId);
  const j = i + dir;
  if (j < 0 || j >= cols.length) return;
  [cols[i].order, cols[j].order] = [cols[j].order, cols[i].order];
  await DB.update("boards", board.id, { columns: cols });
}
async function clearColumn(colId) {
  const colTasks = tasks.filter(t => t.columnId === colId);
  if (!colTasks.length) return;
  if (!await confirmDialog({ title: "Clear column?", message: `Archive ${colTasks.length} task(s) in this column?`, confirmText: "Archive all" })) return;
  await DB.batch(colTasks.map(t => ({ type: "update", collection: "tasks", id: t.id, data: { archived: true } })));
  toast("Column cleared", "success");
}
async function deleteColumn(colId) {
  const colTasks = tasks.filter(t => t.columnId === colId);
  if (board.columns.length <= 1) { toast("A board needs at least one column.", "warning"); return; }
  if (!await confirmDialog({ title: "Delete column?", message: colTasks.length ? `${colTasks.length} task(s) will move to the first column.` : "This column will be removed.", danger: true, confirmText: "Delete" })) return;
  const remaining = board.columns.filter(c => c.id !== colId);
  const firstCol = remaining[0];
  await DB.batch([
    { type: "update", collection: "boards", id: board.id, data: { columns: remaining } },
    ...colTasks.map(t => ({ type: "update", collection: "tasks", id: t.id, data: { columnId: firstCol.id } }))
  ]);
}

/* ---------- Board menu ---------- */
function boardMenu(e) {
  menuFromEvent(e, [
    { label: board.favorite ? "Unfavorite" : "Favorite", icon: "star", onClick: () => DB.update("boards", board.id, { favorite: !board.favorite }) },
    { label: "Rename board", icon: "edit-3", onClick: renameBoard },
    { label: "Edit description", icon: "file-text", onClick: editBoardDesc },
    { label: "Add column", icon: "plus", onClick: addColumn },
    "sep",
    { label: "Archive board", icon: "archive", onClick: async () => { await DB.update("boards", board.id, { archived: true }); toast("Board archived", "success"); location.href = "workspace.html"; } },
    { label: "Delete board", icon: "trash-2", danger: true, onClick: deleteBoard }
  ]);
}
async function renameBoard() {
  const name = await promptDialog({ title: "Rename Board", value: board.name, confirmText: "Save" });
  if (name) { await DB.update("boards", board.id, { name }); setPageTitle(name); $("#boardName").textContent = name; }
}
async function editBoardDesc() {
  const d = await promptDialog({ title: "Board description", value: board.description || "", multiline: true, confirmText: "Save" });
  if (d != null) DB.update("boards", board.id, { description: d });
}
async function deleteBoard() {
  if (!await confirmDialog({ title: "Delete board?", message: `"${board.name}" and all its tasks will be permanently deleted.`, danger: true, confirmText: "Delete board" })) return;
  const boardTasks = await DB.list("tasks", { where: [["boardId", "==", board.id]] });
  await DB.batch([{ type: "remove", collection: "boards", id: board.id }, ...boardTasks.map(t => ({ type: "remove", collection: "tasks", id: t.id }))]);
  toast("Board deleted", "success");
  location.href = "workspace.html";
}

/* ---------- Filters ---------- */
function openFilterMenu(anchor) {
  const content = el("div", { class: "filter-pop", style: { padding: "12px", width: "260px" } });
  content.innerHTML = `
    <div class="menu-label">Filters</div>
    <label class="filt-row"><input type="checkbox" id="fMine" ${filters.mine?"checked":""}> Assigned to me</label>
    <div class="menu-label">Priority</div>
    <div id="fPrio" class="filt-chips">${PRIORITIES.map(p => `<button class="filt-chip ${filters.priorities.has(p.id)?"on":""}" data-p="${p.id}" style="--c:${p.color}">${p.name}</button>`).join("")}</div>
    <div class="menu-label">Labels</div>
    <div id="fLabels" class="filt-chips">${LABELS.slice(0,8).map(l => `<button class="filt-chip ${filters.labels.has(l.id)?"on":""}" data-l="${l.id}" style="--c:${l.color}">${l.name}</button>`).join("")}</div>
    <div class="menu-label">Assignees</div>
    <div id="fAssign" class="filt-chips">${State.members.map(m => `<button class="filt-chip ${filters.assignees.has(m.userId)?"on":""}" data-u="${m.userId}">${escapeHtml(m.user.displayName.split(" ")[0])}</button>`).join("")}</div>
    <button class="btn ghost sm block mt-8" id="fClear">Clear all</button>`;
  popover(anchor, content, { align: "right" });
  $("#fMine", content).onchange = (e) => { filters.mine = e.target.checked; renderColumns(); updateFilterCount(); };
  $$("#fPrio .filt-chip", content).forEach(b => b.onclick = () => { toggleSet(filters.priorities, b.dataset.p); b.classList.toggle("on"); renderColumns(); updateFilterCount(); });
  $$("#fLabels .filt-chip", content).forEach(b => b.onclick = () => { toggleSet(filters.labels, b.dataset.l); b.classList.toggle("on"); renderColumns(); updateFilterCount(); });
  $$("#fAssign .filt-chip", content).forEach(b => b.onclick = () => { toggleSet(filters.assignees, b.dataset.u); b.classList.toggle("on"); renderColumns(); updateFilterCount(); });
  $("#fClear", content).onclick = () => { filters.mine = false; filters.priorities.clear(); filters.labels.clear(); filters.assignees.clear(); renderColumns(); updateFilterCount(); closeMenu(); };
}
function toggleSet(set, v) { set.has(v) ? set.delete(v) : set.add(v); }
function updateFilterCount() {
  const n = filters.priorities.size + filters.labels.size + filters.assignees.size + (filters.mine ? 1 : 0);
  const badge = $("#filterCount");
  if (badge) badge.innerHTML = n ? `<span class="badge-count" style="margin-left:6px">${n}</span>` : "";
}

/* ---------- List view ---------- */
function renderListView(canvas, ft) {
  canvas.className = "board-list";
  const cols = [...board.columns].sort((a, b) => a.order - b.order);
  canvas.innerHTML = `
    <table class="list-table">
      <thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Assignees</th><th>Due</th><th>Points</th><th>Progress</th></tr></thead>
      <tbody>
        ${ft.sort((a,b)=>{
          const ca = cols.findIndex(c=>c.id===a.columnId), cb = cols.findIndex(c=>c.id===b.columnId);
          return ca-cb || a.order-b.order;
        }).map(t => {
          const col = cols.find(c => c.id === t.columnId);
          const p = prioById(t.priority);
          const assignees = (t.assignees||[]).map(id => State.members.find(m=>m.userId===id)?.user).filter(Boolean);
          return `<tr data-task="${t.id}">
            <td class="lt-title">${t.milestone?icon("flag"):""}<span>${escapeHtml(t.title)}</span></td>
            <td><span class="chip" style="--c:${col?.color}"><span class="tag-dot" style="background:${col?.color}"></span>${escapeHtml(col?.name||"")}</span></td>
            <td><span class="prio ${t.priority}">${p.name}</span></td>
            <td>${assignees.length?`<div class="avatar-stack">${assignees.slice(0,3).map(u=>avatarHTML(u,"xs")).join("")}</div>`:'<span class="dim">—</span>'}</td>
            <td class="dim small">${t.dueDate?fmtDate(t.dueDate):"—"}</td>
            <td>${t.storyPoints?`<span class="badge">${t.storyPoints}</span>`:"—"}</td>
            <td style="min-width:90px"><div class="progress thin"><i style="width:${t.completion}%"></i></div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    ${ft.length===0?`<div class="empty"><div class="em-ic">${icon("check-square")}</div><h3>No tasks match</h3></div>`:""}`;
  $$("tr[data-task]", canvas).forEach(tr => tr.onclick = () => openTask(tr.dataset.task));
}
