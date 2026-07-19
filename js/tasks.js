/* ============================================================
   OniSteel Studios Board — Task Cards & Task Detail Modal
   Every card feature: description, checklist, subtasks, deps,
   attachments, links, comments, activity, time tracking,
   priority, labels, assignees, dates, story points, etc.
   ============================================================ */
import { DB, Auth, uid } from "./store.js";
import { State } from "./app.js";
import { PRIORITIES, DIFFICULTIES, LABELS, prioById, labelById } from "./constants.js";
import { icon } from "./icons.js";
import {
  $, $$, el, escapeHtml, avatarHTML, toast, openModal, confirmDialog, showMenu, popover,
  fmtDate, fmtDateTime, timeAgo, timeUntil, fmtHours, renderMarkdown, pickFile, closeMenu, hexToRgba
} from "./ui.js";
import { getUser, cachedUser } from "./users.js";
import { createRichEditor } from "./editor.js";
import { notify, notifyMany, logActivity } from "./notifications.js";

/* ============================================================
   CARD RENDERING (used by board + calendar + dashboard)
   ============================================================ */
export function taskCardHTML(t, { compact = false } = {}) {
  const p = prioById(t.priority);
  const labels = (t.labels || []).map(id => labelById(id)).filter(Boolean);
  const assignees = (t.assignees || []).map(id => cachedUser(id)).filter(Boolean);
  const checkDone = (t.checklist || []).filter(c => c.done).length;
  const checkTotal = (t.checklist || []).length;
  const comments = t._commentCount || 0;
  const cover = (t.attachments || []).find(a => a.kind === "image");
  const due = t.dueDate ? timeUntil(t.dueDate) : null;
  const done = t.completion >= 100;

  return `
  <div class="task-card ${done ? "is-done" : ""} ${t.pinned ? "is-pinned" : ""}" data-task="${t.id}" data-col="${t.columnId}" draggable="false"
       style="--p:${p.color}">
    ${cover ? `<div class="tc-cover"><img src="${escapeHtml(cover.url)}" alt="" loading="lazy"></div>` : ""}
    ${labels.length ? `<div class="tc-labels">${labels.map(l => `<span class="tc-label" style="background:${l.color}" title="${escapeHtml(l.name)}"></span>`).join("")}</div>` : ""}
    <div class="tc-title">${t.milestone ? `<span class="tc-milestone" title="Milestone">${icon("flag")}</span>` : ""}${escapeHtml(t.title)}</div>
    ${t.completion > 0 && !done ? `<div class="progress thin" style="margin:8px 0 4px"><i style="width:${t.completion}%"></i></div>` : ""}
    <div class="tc-meta">
      ${t.priority && t.priority !== "none" ? `<span class="prio ${t.priority}" title="${p.name} priority"></span>` : ""}
      ${due ? `<span class="tc-chip ${due.overdue ? "overdue" : ""}" title="Due ${fmtDate(t.dueDate)}">${icon("clock")}${escapeHtml(due.text.replace("in ", ""))}</span>` : ""}
      ${checkTotal ? `<span class="tc-chip ${checkDone === checkTotal ? "done" : ""}">${icon("check-square")}${checkDone}/${checkTotal}</span>` : ""}
      ${comments ? `<span class="tc-chip">${icon("message-square")}${comments}</span>` : ""}
      ${(t.attachments || []).length ? `<span class="tc-chip">${icon("paperclip")}${t.attachments.length}</span>` : ""}
      ${t.storyPoints ? `<span class="tc-chip sp" title="Story points">${t.storyPoints}</span>` : ""}
      <span class="grow"></span>
      ${assignees.length ? `<div class="avatar-stack">${assignees.slice(0, 3).map(u => avatarHTML(u, "xs")).join("")}${assignees.length > 3 ? `<div class="avatar xs more">+${assignees.length - 3}</div>` : ""}</div>` : ""}
    </div>
  </div>`;
}

/* ============================================================
   QUICK ADD
   ============================================================ */
export async function openQuickTask(defaults = {}) {
  // resolve target board + column
  let boards = await DB.list("boards", { where: [["workspaceId", "==", State.workspace.id]] });
  boards = boards.filter(b => !b.archived);
  if (!boards.length) { toast("Create a board first.", "warning"); location.href = "workspace.html"; return; }
  let boardId = defaults.boardId || new URLSearchParams(location.search).get("board") || boards[0].id;
  let board = boards.find(b => b.id === boardId) || boards[0];
  boardId = board.id;

  const body = el("div", {});
  body.innerHTML = `
    <div class="field"><label>Task title</label><input class="input" id="qtTitle" placeholder="What needs doing?" autofocus></div>
    <div class="row gap-10">
      <div class="field grow"><label>Board</label><select class="select" id="qtBoard">${boards.map(b => `<option value="${b.id}" ${b.id === boardId ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("")}</select></div>
      <div class="field grow"><label>Column</label><select class="select" id="qtCol"></select></div>
    </div>
    <div class="row gap-10">
      <div class="field grow"><label>Priority</label><select class="select" id="qtPrio">${PRIORITIES.map(p => `<option value="${p.id}" ${p.id === "medium" ? "selected" : ""}>${p.name}</option>`).join("")}</select></div>
      <div class="field grow"><label>Due date</label><input class="input" id="qtDue" type="date"></div>
    </div>
    <div class="field"><label>Assign to</label><div id="qtAssign" class="assign-picker"></div></div>`;

  const foot = el("div", {});
  const m = openModal({ title: "New Task", icon: "plus-circle", size: "md", body, footer: foot });

  const colSel = $("#qtCol", body);
  const fillCols = (b) => { colSel.innerHTML = (b.columns || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join(""); if (defaults.columnId) colSel.value = defaults.columnId; };
  fillCols(board);
  $("#qtBoard", body).onchange = (e) => { board = boards.find(b => b.id === e.target.value); boardId = board.id; fillCols(board); };

  // assignee multi-picker
  const chosen = new Set(defaults.assignees || []);
  const renderAssign = () => {
    const ap = $("#qtAssign", body);
    ap.innerHTML = State.members.map(mem => `
      <button type="button" class="assign-opt ${chosen.has(mem.userId) ? "on" : ""}" data-u="${mem.userId}">
        ${avatarHTML(mem.user, "xs")}<span>${escapeHtml(mem.user.displayName)}</span>
      </button>`).join("");
    $$(".assign-opt", ap).forEach(b => b.onclick = () => { const u = b.dataset.u; chosen.has(u) ? chosen.delete(u) : chosen.add(u); renderAssign(); });
  };
  renderAssign();

  foot.append(
    el("button", { class: "btn ghost", onClick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onClick: async () => {
      const title = $("#qtTitle", body).value.trim();
      if (!title) { $("#qtTitle", body).focus(); return; }
      const dueVal = $("#qtDue", body).value;
      const id = await createTask({
        boardId, columnId: colSel.value, title,
        priority: $("#qtPrio", body).value,
        dueDate: dueVal ? new Date(dueVal + "T17:00").getTime() : null,
        assignees: [...chosen]
      });
      m.close();
      toast("Task created", "success");
      openTask(id);
    } }, "Create task")
  );
  setTimeout(() => $("#qtTitle", body)?.focus(), 60);
}

export async function createTask(data) {
  const me = Auth.current();
  const board = await DB.getDoc("boards", data.boardId);
  const colTasks = await DB.list("tasks", { where: [["columnId", "==", data.columnId]] });
  const id = uid("tsk");
  const task = {
    id, workspaceId: State.workspace.id, boardId: data.boardId, columnId: data.columnId,
    title: data.title, description: data.description || "",
    priority: data.priority || "medium", difficulty: data.difficulty || "medium",
    estimatedHours: data.estimatedHours || 0, loggedHours: 0, completion: 0,
    labels: data.labels || [], tags: data.tags || [], color: data.color || "",
    assignees: data.assignees || [], watchers: data.assignees || [], storyPoints: data.storyPoints || 0,
    order: colTasks.length, startDate: data.startDate || null, dueDate: data.dueDate || null,
    checklist: [], subtasks: [], dependencies: [], attachments: [], links: [],
    milestone: false, pinned: false, archived: false, favorite: false,
    createdBy: me.id, createdAt: Date.now()
  };
  await DB.set("tasks", id, task);
  await logActivity(State.workspace.id, { verb: "created_task", actorId: me.id, target: data.title, targetType: "task", boardId: data.boardId, link: `board.html?board=${data.boardId}&task=${id}` });
  if (task.assignees.length) {
    await notifyMany(task.assignees.filter(a => a !== me.id), {
      type: "task_assigned", title: "You were assigned a task", body: task.title, actorId: me.id,
      link: `board.html?board=${data.boardId}&task=${id}`
    });
  }
  return id;
}

/* ============================================================
   TASK DETAIL MODAL
   ============================================================ */
let _activeTask = null;
export async function openTask(taskId) {
  const modal = openModal({ title: "", size: "xl", body: `<div class="task-loading">${Array.from({length:3}).map(()=>'<div class="skeleton sk-line"></div>').join("")}</div>` });
  modal.modal.classList.add("task-modal");
  modal.head.style.display = "none";

  let task = await DB.getDoc("tasks", taskId);
  if (!task) { modal.body.innerHTML = `<div class="empty"><h3>Task not found</h3></div>`; return; }
  _activeTask = taskId;
  let editing = false;

  const commentBox = { html: "" };
  const rerender = () => { if (!editing && _activeTask === taskId) renderTaskBody(modal, task, { setEditing: (v) => editing = v }); };
  renderTaskBody(modal, task, { setEditing: (v) => editing = v });

  const unsubTask = DB.watchDoc("tasks", taskId, (t) => { if (t) { task = t; rerender(); } });
  const unsubComments = DB.watch("comments", { where: [["taskId", "==", taskId]], orderBy: ["createdAt", "asc"] }, (comments) => {
    const list = $("#taskComments", modal.body);
    if (list) renderComments(list, comments, taskId);
    const cc = $("#commentCount", modal.body); if (cc) cc.textContent = comments.length;
  });
  const origClose = modal.close;
  modal.close = () => { _activeTask = null; unsubTask && unsubTask(); unsubComments && unsubComments(); origClose(); };
  // rewire close buttons after custom close
  return modal;
}

function upd(taskId, patch) { return DB.update("tasks", taskId, patch); }

function renderTaskBody(modal, t, { setEditing }) {
  const me = Auth.current();
  const p = prioById(t.priority);
  const board = State._boardCache?.[t.boardId];
  const columns = board?.columns || [];
  const col = columns.find(c => c.id === t.columnId);
  const assignees = (t.assignees || []).map(id => cachedUser(id)).filter(Boolean);
  const watchers = (t.watchers || []).map(id => cachedUser(id)).filter(Boolean);
  const labels = (t.labels || []).map(id => labelById(id)).filter(Boolean);
  const checkDone = (t.checklist || []).filter(c => c.done).length;
  const checkTotal = (t.checklist || []).length;
  const isWatching = (t.watchers || []).includes(me.id);
  const isFav = t.favorite;

  modal.body.classList.add("task-body");
  modal.body.innerHTML = `
  <div class="task-top" style="--p:${p.color}">
    <div class="tt-crumb">${icon("board")} <span>${escapeHtml(board?.name || "Board")}</span> ${icon("chevron-right")} <span class="c-steel">${escapeHtml(col?.name || "Column")}</span></div>
    <div class="tt-actions">
      <button class="iconbtn ${isFav ? "active" : ""}" id="taFav" data-tip="Favorite">${icon("star")}</button>
      <button class="iconbtn ${isWatching ? "active" : ""}" id="taWatch" data-tip="${isWatching ? "Unwatch" : "Watch"}">${icon("eye")}</button>
      <button class="iconbtn" id="taMore" data-tip="More">${icon("more-horizontal")}</button>
      <button class="iconbtn" id="taClose" data-tip="Close">${icon("x")}</button>
    </div>
  </div>
  <div class="task-grid">
    <div class="task-main">
      <input class="task-title-input" id="taTitle" value="${escapeHtml(t.title)}" placeholder="Task title">
      <div class="task-section">
        <div class="ts-head">${icon("file-text")} <span>Description</span></div>
        <div id="taDescMount"></div>
      </div>

      <div class="task-section">
        <div class="ts-head between">
          <div class="row gap-8">${icon("check-square")} <span>Checklist</span> ${checkTotal ? `<span class="badge">${checkDone}/${checkTotal}</span>` : ""}</div>
          <button class="btn subtle sm" id="taAddCheck">${icon("plus")} Item</button>
        </div>
        ${checkTotal ? `<div class="progress" style="margin:2px 0 10px"><i style="width:${Math.round(checkDone/checkTotal*100)}%"></i></div>` : ""}
        <div id="taChecklist" class="checklist"></div>
      </div>

      <div class="task-section">
        <div class="ts-head between">
          <div class="row gap-8">${icon("git-branch")} <span>Subtasks</span></div>
          <button class="btn subtle sm" id="taAddSub">${icon("plus")} Subtask</button>
        </div>
        <div id="taSubtasks" class="subtasks"></div>
      </div>

      <div class="task-section">
        <div class="ts-head between">
          <div class="row gap-8">${icon("paperclip")} <span>Attachments</span></div>
          <div class="row gap-6">
            <button class="btn subtle sm" id="taAddLink">${icon("link")} Link</button>
            <button class="btn subtle sm" id="taAddFile">${icon("upload")} Upload</button>
          </div>
        </div>
        <div id="taAttachments" class="attachments"></div>
      </div>

      <div class="task-section">
        <div class="ts-tabs">
          <button class="ts-tab active" data-tab="comments">Comments <span id="commentCount">0</span></button>
          <button class="ts-tab" data-tab="activity">Activity</button>
        </div>
        <div id="taTabComments">
          <div class="comment-composer">
            ${avatarHTML(me, "sm")}
            <div class="grow" id="taCommentEditor"></div>
          </div>
          <div id="taComments" class="comment-list"></div>
        </div>
        <div id="taTabActivity" class="hidden"><div id="taActivity" class="activity-mini"></div></div>
      </div>
    </div>

    <aside class="task-side">
      <button class="btn primary block" id="taStatusBtn">${icon("columns")} <span>${escapeHtml(col?.name || "Set status")}</span></button>

      <div class="side-prop">
        <div class="sp-label">Assignees</div>
        <div class="sp-val" id="taAssignees">
          ${assignees.length ? assignees.map(u => `<span class="mini-chip">${avatarHTML(u, "xs")}${escapeHtml(u.displayName)}</span>`).join("") : `<span class="dim">Unassigned</span>`}
          <button class="mini-add" id="taAddAssignee">${icon("plus")}</button>
        </div>
      </div>

      <div class="side-prop">
        <div class="sp-label">Priority</div>
        <button class="sp-select" id="taPrio"><span class="prio ${t.priority}">${p.name}</span>${icon("chevron-down")}</button>
      </div>
      <div class="side-prop">
        <div class="sp-label">Difficulty</div>
        <button class="sp-select" id="taDiff"><span>${escapeHtml((DIFFICULTIES.find(d=>d.id===t.difficulty)||{}).name || "Medium")}</span>${icon("chevron-down")}</button>
      </div>

      <div class="side-prop">
        <div class="sp-label">Labels</div>
        <div class="sp-val" id="taLabels">
          ${labels.map(l => `<span class="chip" style="background:${hexToRgba(l.color,.16)};border-color:${hexToRgba(l.color,.4)};color:${l.color}"><span class="tag-dot" style="background:${l.color}"></span>${escapeHtml(l.name)}</span>`).join("")}
          <button class="mini-add" id="taAddLabel">${icon("plus")}</button>
        </div>
      </div>

      <div class="side-prop">
        <div class="sp-label">Dates</div>
        <div class="sp-dates">
          <label class="date-field">${icon("play")}<input type="date" id="taStart" value="${t.startDate ? toDateInput(t.startDate) : ""}"></label>
          <label class="date-field ${t.dueDate && t.dueDate < Date.now() && t.completion<100 ? "overdue" : ""}">${icon("flag")}<input type="date" id="taDue" value="${t.dueDate ? toDateInput(t.dueDate) : ""}"></label>
        </div>
        ${t.dueDate ? `<div class="due-countdown ${timeUntil(t.dueDate).overdue?"overdue":""}">${icon("clock")} ${escapeHtml(timeUntil(t.dueDate).text)}</div>` : ""}
      </div>

      <div class="side-prop">
        <div class="sp-label">Progress — ${t.completion}%</div>
        <input type="range" class="range" id="taCompletion" min="0" max="100" step="5" value="${t.completion}">
      </div>

      <div class="side-prop grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><div class="sp-label">Est. hours</div><input class="input sm" id="taEst" type="number" min="0" step="0.5" value="${t.estimatedHours||0}"></div>
        <div><div class="sp-label">Logged</div><input class="input sm" id="taLogged" type="number" min="0" step="0.5" value="${t.loggedHours||0}"></div>
      </div>
      <div class="side-prop">
        <div class="sp-label">Story points</div>
        <div class="sp-points" id="taPoints">${[1,2,3,5,8,13,21].map(v=>`<button class="pt ${t.storyPoints===v?"on":""}" data-v="${v}">${v}</button>`).join("")}</div>
      </div>

      <div class="side-prop time-tracker" id="taTimer">
        <div class="sp-label">Time tracker</div>
        <div class="tt-body" id="taTimerBody"></div>
      </div>

      <div class="side-prop">
        <div class="sp-label">Dependencies</div>
        <div id="taDeps" class="deps-list"></div>
        <button class="btn subtle sm block" id="taAddDep">${icon("git-merge")} Add dependency</button>
      </div>

      <label class="side-toggle"><span>${icon("flag")} Milestone</span><span class="switch"><input type="checkbox" id="taMilestone" ${t.milestone?"checked":""}><span class="track"></span></span></label>

      <div class="side-meta">
        <div>Created ${fmtDate(t.createdAt)}</div>
        <div>by ${escapeHtml((cachedUser(t.createdBy)||{}).displayName || "—")}</div>
      </div>
    </aside>
  </div>`;

  // ---- Description RTE ----
  const descEditor = createRichEditor({ value: t.description, placeholder: "Add a detailed description… (rich text, images, links)", onImage: (f) => uploadTaskFile(t, f) });
  $("#taDescMount", modal.body).appendChild(descEditor.el);
  descEditor.area.addEventListener("focus", () => setEditing(true));
  descEditor.area.addEventListener("blur", () => { setEditing(false); if (descEditor.getHTML() !== t.description) upd(t.id, { description: descEditor.getHTML() }); });

  // ---- Title ----
  const titleInput = $("#taTitle", modal.body);
  titleInput.addEventListener("focus", () => setEditing(true));
  titleInput.addEventListener("blur", () => { setEditing(false); const v = titleInput.value.trim(); if (v && v !== t.title) upd(t.id, { title: v }); });
  titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") titleInput.blur(); });

  // ---- Header actions ----
  $("#taClose", modal.body).onclick = () => modal.close();
  $("#taFav", modal.body).onclick = () => upd(t.id, { favorite: !t.favorite });
  $("#taWatch", modal.body).onclick = () => { const w = new Set(t.watchers || []); w.has(me.id) ? w.delete(me.id) : w.add(me.id); upd(t.id, { watchers: [...w] }); };
  $("#taMore", modal.body).onclick = (e) => taskActionsMenu(e, t, modal);

  // ---- Status / column ----
  $("#taStatusBtn", modal.body).onclick = (e) => {
    showMenu(e.clientX, e.clientY, columns.map(c => ({
      label: c.name, checked: c.id === t.columnId, onClick: () => moveTaskToColumn(t, c.id)
    })));
  };

  // ---- Checklist ----
  renderChecklist(modal.body, t);
  $("#taAddCheck", modal.body).onclick = async () => {
    const cl = [...(t.checklist || []), { id: uid("chk"), text: "New item", done: false }];
    await upd(t.id, { checklist: cl });
  };

  // ---- Subtasks ----
  renderSubtasks(modal.body, t);
  $("#taAddSub", modal.body).onclick = async () => {
    const st = [...(t.subtasks || []), { id: uid("sub"), text: "New subtask", done: false }];
    await upd(t.id, { subtasks: st });
  };

  // ---- Attachments ----
  renderAttachments(modal.body, t);
  $("#taAddFile", modal.body).onclick = async () => {
    const file = await pickFile({});
    if (!file) return;
    toast("Uploading…", "info", 1500);
    const att = await uploadTaskFile(t, file, true);
    await upd(t.id, { attachments: [...(t.attachments || []), att] });
  };
  $("#taAddLink", modal.body).onclick = async () => {
    const url = prompt("Paste a URL"); if (!url) return;
    const att = { id: uid("att"), kind: "link", url, name: url.replace(/^https?:\/\//, "").slice(0, 40) };
    await upd(t.id, { attachments: [...(t.attachments || []), att] });
  };

  // ---- Comments editor ----
  const cEditor = createRichEditor({ compact: true, placeholder: "Write a comment…  @mention teammates" });
  $("#taCommentEditor", modal.body).appendChild(cEditor.el);
  const postBtn = el("button", { class: "btn primary sm", style: { marginTop: "8px" }, onClick: () => postComment(t, cEditor) }, "Comment");
  $("#taCommentEditor", modal.body).appendChild(postBtn);

  // tab switch
  $$(".ts-tab", modal.body).forEach(tab => tab.onclick = () => {
    $$(".ts-tab", modal.body).forEach(x => x.classList.remove("active"));
    tab.classList.add("active");
    $("#taTabComments", modal.body).classList.toggle("hidden", tab.dataset.tab !== "comments");
    $("#taTabActivity", modal.body).classList.toggle("hidden", tab.dataset.tab !== "activity");
    if (tab.dataset.tab === "activity") loadTaskActivity(modal.body, t);
  });

  // ---- Assignees / labels pickers ----
  $("#taAddAssignee", modal.body).onclick = (e) => assigneePicker(e.currentTarget, t);
  $("#taAssignees", modal.body).querySelectorAll(".mini-chip").forEach((chip, i) => {
    chip.oncontextmenu = (e) => { e.preventDefault(); const uid = t.assignees[i]; upd(t.id, { assignees: t.assignees.filter(a => a !== uid) }); };
  });
  $("#taAddLabel", modal.body).onclick = (e) => labelPicker(e.currentTarget, t);
  $$("#taLabels .chip", modal.body).forEach((chip, i) => chip.onclick = () => { const id = t.labels[i]; upd(t.id, { labels: t.labels.filter(l => l !== id) }); });

  // ---- Priority / difficulty ----
  $("#taPrio", modal.body).onclick = (e) => showMenu(e.currentTarget.getBoundingClientRect().left, e.currentTarget.getBoundingClientRect().bottom + 4,
    PRIORITIES.map(pr => ({ label: pr.name, checked: pr.id === t.priority, onClick: () => upd(t.id, { priority: pr.id }) })));
  $("#taDiff", modal.body).onclick = (e) => showMenu(e.currentTarget.getBoundingClientRect().left, e.currentTarget.getBoundingClientRect().bottom + 4,
    DIFFICULTIES.map(d => ({ label: d.name, checked: d.id === t.difficulty, onClick: () => upd(t.id, { difficulty: d.id }) })));

  // ---- Dates ----
  $("#taStart", modal.body).onchange = (e) => upd(t.id, { startDate: e.target.value ? new Date(e.target.value + "T09:00").getTime() : null });
  $("#taDue", modal.body).onchange = (e) => { const v = e.target.value ? new Date(e.target.value + "T17:00").getTime() : null; upd(t.id, { dueDate: v }); if (v) checkDeadlineNotify(t, v); };

  // ---- Completion ----
  const comp = $("#taCompletion", modal.body);
  comp.oninput = (e) => { $(".sp-label", comp.closest(".side-prop")).textContent = `Progress — ${e.target.value}%`; };
  comp.onchange = (e) => { const v = +e.target.value; const patch = { completion: v }; upd(t.id, patch); if (v >= 100) markComplete(t); };

  // ---- Hours ----
  $("#taEst", modal.body).onchange = (e) => upd(t.id, { estimatedHours: +e.target.value || 0 });
  $("#taLogged", modal.body).onchange = (e) => upd(t.id, { loggedHours: +e.target.value || 0 });

  // ---- Points ----
  $$("#taPoints .pt", modal.body).forEach(b => b.onclick = () => upd(t.id, { storyPoints: t.storyPoints === +b.dataset.v ? 0 : +b.dataset.v }));

  // ---- Milestone ----
  $("#taMilestone", modal.body).onchange = (e) => upd(t.id, { milestone: e.target.checked });

  // ---- Dependencies ----
  renderDeps(modal.body, t);
  $("#taAddDep", modal.body).onclick = (e) => depPicker(e.currentTarget, t);

  // ---- Timer ----
  renderTimer(modal.body, t);
}

/* ---------- Sub-renderers ---------- */
function renderChecklist(root, t) {
  const list = $("#taChecklist", root);
  list.innerHTML = (t.checklist || []).map(c => `
    <div class="check-item ${c.done ? "done" : ""}" data-id="${c.id}">
      <span class="check ${c.done ? "checked" : ""}" data-toggle>${icon("check")}</span>
      <input class="check-text" value="${escapeHtml(c.text)}">
      <button class="iconbtn sm" data-del>${icon("x")}</button>
    </div>`).join("") || `<div class="dim small">No checklist items yet.</div>`;
  $$(".check-item", list).forEach(item => {
    const id = item.dataset.id;
    item.querySelector("[data-toggle]").onclick = () => { const cl = t.checklist.map(c => c.id === id ? { ...c, done: !c.done } : c); upd(t.id, { checklist: cl }); };
    item.querySelector(".check-text").onchange = (e) => { const cl = t.checklist.map(c => c.id === id ? { ...c, text: e.target.value } : c); upd(t.id, { checklist: cl }); };
    item.querySelector("[data-del]").onclick = () => upd(t.id, { checklist: t.checklist.filter(c => c.id !== id) });
  });
}
function renderSubtasks(root, t) {
  const list = $("#taSubtasks", root);
  list.innerHTML = (t.subtasks || []).map(s => `
    <div class="check-item ${s.done ? "done" : ""}" data-id="${s.id}">
      <span class="check ${s.done ? "checked" : ""}" data-toggle>${icon("check")}</span>
      <input class="check-text" value="${escapeHtml(s.text)}">
      <button class="iconbtn sm" data-del>${icon("x")}</button>
    </div>`).join("") || `<div class="dim small">Break this task into smaller pieces.</div>`;
  $$(".check-item", list).forEach(item => {
    const id = item.dataset.id;
    item.querySelector("[data-toggle]").onclick = () => upd(t.id, { subtasks: t.subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s) });
    item.querySelector(".check-text").onchange = (e) => upd(t.id, { subtasks: t.subtasks.map(s => s.id === id ? { ...s, text: e.target.value } : s) });
    item.querySelector("[data-del]").onclick = () => upd(t.id, { subtasks: t.subtasks.filter(s => s.id !== id) });
  });
}
function renderAttachments(root, t) {
  const list = $("#taAttachments", root);
  const atts = t.attachments || [];
  if (!atts.length) { list.innerHTML = `<div class="dim small">No attachments. Add images, videos, files or links.</div>`; return; }
  list.innerHTML = atts.map(a => {
    if (a.kind === "image") return `<div class="att att-img" data-id="${a.id}"><img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.name||"")}"><button class="att-x" data-del>${icon("x")}</button></div>`;
    if (a.kind === "video") return `<div class="att att-vid" data-id="${a.id}"><video src="${escapeHtml(a.url)}" controls></video><button class="att-x" data-del>${icon("x")}</button></div>`;
    if (a.kind === "link") return `<a class="att att-link" href="${escapeHtml(a.url)}" target="_blank" rel="noopener" data-id="${a.id}">${icon("link")}<span class="truncate">${escapeHtml(a.name||a.url)}</span><button class="att-x" data-del>${icon("x")}</button></a>`;
    return `<div class="att att-file" data-id="${a.id}">${icon("file")}<span class="truncate">${escapeHtml(a.name||"file")}</span><button class="att-x" data-del>${icon("x")}</button></div>`;
  }).join("");
  $$(".att", list).forEach(a => {
    const del = a.querySelector("[data-del]");
    if (del) del.onclick = (e) => { e.preventDefault(); e.stopPropagation(); upd(t.id, { attachments: atts.filter(x => x.id !== a.dataset.id) }); };
  });
}
function renderDeps(root, t) {
  const list = $("#taDeps", root);
  const deps = t.dependencies || [];
  if (!deps.length) { list.innerHTML = `<div class="dim small">No dependencies.</div>`; return; }
  Promise.all(deps.map(id => DB.getDoc("tasks", id))).then(tasks => {
    list.innerHTML = tasks.filter(Boolean).map(d => `<div class="dep-item" data-id="${d.id}"><span class="prio ${d.priority}"></span><span class="grow truncate" data-open>${escapeHtml(d.title)}</span><button class="iconbtn sm" data-del>${icon("x")}</button></div>`).join("");
    $$(".dep-item", list).forEach(item => {
      item.querySelector("[data-open]").onclick = () => openTask(item.dataset.id);
      item.querySelector("[data-del]").onclick = () => upd(t.id, { dependencies: deps.filter(x => x !== item.dataset.id) });
    });
  });
}

/* ---------- Comments ---------- */
async function postComment(t, editor) {
  const body = editor.getHTML();
  if (!editor.getText().trim()) return;
  const me = Auth.current();
  await DB.add("comments", { id: uid("cmt"), taskId: t.id, workspaceId: State.workspace.id, authorId: me.id, body, createdAt: Date.now() });
  editor.clear();
  // notify watchers + assignees + mentions
  const recipients = new Set([...(t.watchers || []), ...(t.assignees || [])]);
  recipients.delete(me.id);
  await notifyMany([...recipients], { type: "comment", title: `${me.displayName} commented`, body: editor.getText().slice(0, 80), actorId: me.id, link: `board.html?board=${t.boardId}&task=${t.id}` });
  // mentions
  const mentions = (editor.getText().match(/@(\w+)/g) || []).map(m => m.slice(1).toLowerCase());
  if (mentions.length) {
    const mentioned = State.members.filter(mem => mentions.includes((mem.user.username || "").toLowerCase()));
    await notifyMany(mentioned.map(m => m.userId), { type: "mention", title: `${me.displayName} mentioned you`, body: editor.getText().slice(0, 80), actorId: me.id, link: `board.html?board=${t.boardId}&task=${t.id}` });
  }
  DB.getDoc("users", me.id).then(u => DB.update("users", me.id, { stats: { ...(u.stats || {}), comments: (u.stats?.comments || 0) + 1 } }));
}
function renderComments(list, comments, taskId) {
  const me = Auth.current();
  if (!comments.length) { list.innerHTML = `<div class="dim small" style="padding:10px 0">No comments yet. Start the conversation.</div>`; return; }
  list.innerHTML = comments.map(c => {
    const u = cachedUser(c.authorId) || {};
    return `<div class="comment" data-id="${c.id}">
      ${avatarHTML(u, "sm")}
      <div class="grow">
        <div class="cm-head"><strong>${escapeHtml(u.displayName || "User")}</strong><span class="dim tiny">${timeAgo(c.createdAt)}</span>
          ${c.authorId === me.id ? `<button class="iconbtn sm cm-del" data-tip="Delete">${icon("trash-2")}</button>` : ""}</div>
        <div class="cm-body rich">${c.body}</div>
      </div>
    </div>`;
  }).join("");
  $$(".cm-del", list).forEach((b, i) => b.onclick = () => { const c = comments.filter(c => c.authorId === me.id)[i] || comments[i]; DB.remove("comments", b.closest(".comment").dataset.id); });
}
async function loadTaskActivity(root, t) {
  const acts = await DB.list("activity", { where: [["boardId", "==", t.boardId]], orderBy: ["createdAt", "desc"], limit: 20 });
  const mine = acts.filter(a => (a.meta && a.meta.taskId === t.id) || a.target === t.title);
  const box = $("#taActivity", root);
  box.innerHTML = (mine.length ? mine : acts.slice(0, 8)).map(a => {
    const u = cachedUser(a.actorId) || {};
    return `<div class="act-row">${avatarHTML(u, "xs")}<div class="grow"><span><strong>${escapeHtml(u.displayName||"Someone")}</strong> ${escapeHtml(a.verb.replace("_"," "))} <span class="c-steel">${escapeHtml(a.target||"")}</span></span><div class="dim tiny">${timeAgo(a.createdAt)}</div></div></div>`;
  }).join("") || `<div class="dim small">No activity yet.</div>`;
}

/* ---------- Pickers ---------- */
function assigneePicker(anchor, t) {
  const content = el("div", { class: "pick-list" });
  const set = new Set(t.assignees || []);
  content.innerHTML = State.members.map(m => `<div class="pick-item ${set.has(m.userId)?"on":""}" data-u="${m.userId}">${avatarHTML(m.user,"xs")}<span class="grow">${escapeHtml(m.user.displayName)}</span>${set.has(m.userId)?icon("check"):""}</div>`).join("");
  popover(anchor, content);
  $$(".pick-item", content).forEach(it => it.onclick = () => {
    const u = it.dataset.u; set.has(u) ? set.delete(u) : set.add(u);
    const arr = [...set]; upd(t.id, { assignees: arr });
    if (!t.assignees?.includes(u) && set.has(u)) notify(u, { type: "task_assigned", title: "You were assigned a task", body: t.title, actorId: Auth.current().id, link: `board.html?board=${t.boardId}&task=${t.id}` });
    closeMenu();
  });
}
function labelPicker(anchor, t) {
  const content = el("div", { class: "pick-list" });
  const set = new Set(t.labels || []);
  content.innerHTML = LABELS.map(l => `<div class="pick-item ${set.has(l.id)?"on":""}" data-l="${l.id}"><span class="tag-dot" style="background:${l.color}"></span><span class="grow">${escapeHtml(l.name)}</span>${set.has(l.id)?icon("check"):""}</div>`).join("");
  popover(anchor, content);
  $$(".pick-item", content).forEach(it => it.onclick = () => { const l = it.dataset.l; set.has(l)?set.delete(l):set.add(l); upd(t.id, { labels: [...set] }); closeMenu(); });
}
async function depPicker(anchor, t) {
  const tasks = (await DB.list("tasks", { where: [["boardId", "==", t.boardId]] })).filter(x => x.id !== t.id && !x.archived);
  const content = el("div", { class: "pick-list", style: { maxHeight: "300px", overflow: "auto", width: "260px" } });
  const set = new Set(t.dependencies || []);
  content.innerHTML = tasks.map(x => `<div class="pick-item ${set.has(x.id)?"on":""}" data-t="${x.id}"><span class="prio ${x.priority}"></span><span class="grow truncate">${escapeHtml(x.title)}</span>${set.has(x.id)?icon("check"):""}</div>`).join("") || `<div class="dim small" style="padding:8px">No other tasks.</div>`;
  popover(anchor, content);
  $$(".pick-item", content).forEach(it => it.onclick = () => { const id = it.dataset.t; set.has(id)?set.delete(id):set.add(id); upd(t.id, { dependencies: [...set] }); closeMenu(); });
}

/* ---------- Time tracker ---------- */
const TIMER_KEY = "onisteel:timer";
function activeTimer() { try { return JSON.parse(localStorage.getItem(TIMER_KEY)); } catch { return null; } }
function renderTimer(root, t) {
  const box = $("#taTimerBody", root);
  const timer = activeTimer();
  const running = timer && timer.taskId === t.id;
  const render = () => {
    const tm = activeTimer();
    const on = tm && tm.taskId === t.id;
    const elapsed = on ? Math.floor((Date.now() - tm.start) / 1000) : 0;
    box.innerHTML = `
      <div class="tt-display ${on?"running":""}">${fmtClock(elapsed)}</div>
      <div class="tt-controls">
        ${on
          ? `<button class="btn danger sm" id="ttStop">${icon("square")} Stop</button>`
          : `<button class="btn primary sm" id="ttStart">${icon("play")} Start</button>`}
        <button class="btn ghost sm" id="ttManual">${icon("plus")} Manual</button>
      </div>
      <div class="tt-total dim small">Logged: ${fmtHours(t.loggedHours||0)} / ${fmtHours(t.estimatedHours||0)} est.</div>`;
    if (on) { $("#ttStop", box).onclick = () => stopTimer(t); }
    else { $("#ttStart", box).onclick = () => startTimer(t); }
    $("#ttManual", box).onclick = () => manualTime(t);
  };
  render();
  if (running) { clearInterval(box._int); box._int = setInterval(render, 1000); }
  else clearInterval(box._int);
}
function startTimer(t) {
  const existing = activeTimer();
  if (existing) { toast("Another timer is running — stopping it first.", "warning"); }
  localStorage.setItem(TIMER_KEY, JSON.stringify({ taskId: t.id, start: Date.now(), title: t.title }));
  toast("Timer started", "success");
  if (_activeTask === t.id) DB.getDoc("tasks", t.id).then(tt => renderTimer(document, tt));
  window.dispatchEvent(new Event("timer-change"));
}
async function stopTimer(t) {
  const tm = activeTimer(); if (!tm) return;
  const mins = Math.max(1, Math.round((Date.now() - tm.start) / 60000));
  localStorage.removeItem(TIMER_KEY);
  const me = Auth.current();
  await DB.add("timeEntries", { id: uid("time"), taskId: t.id, workspaceId: State.workspace.id, userId: me.id, minutes: mins, note: "", manual: false, at: Date.now() });
  const fresh = await DB.getDoc("tasks", t.id);
  await upd(t.id, { loggedHours: Math.round(((fresh.loggedHours || 0) + mins / 60) * 10) / 10 });
  DB.getDoc("users", me.id).then(u => DB.update("users", me.id, { stats: { ...(u.stats || {}), hoursLogged: Math.round(((u.stats?.hoursLogged || 0) + mins / 60) * 10) / 10 } }));
  toast(`Logged ${fmtClock(mins*60)}`, "success");
  window.dispatchEvent(new Event("timer-change"));
}
async function manualTime(t) {
  const val = prompt("Log time (minutes)", "30");
  const mins = parseInt(val); if (!mins || mins <= 0) return;
  const me = Auth.current();
  await DB.add("timeEntries", { id: uid("time"), taskId: t.id, workspaceId: State.workspace.id, userId: me.id, minutes: mins, note: "manual", manual: true, at: Date.now() });
  const fresh = await DB.getDoc("tasks", t.id);
  await upd(t.id, { loggedHours: Math.round(((fresh.loggedHours || 0) + mins / 60) * 10) / 10 });
  toast(`Logged ${mins} min`, "success");
}
function fmtClock(sec) { const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), s = sec%60; return `${h?String(h).padStart(2,"0")+":":""}${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; }

/* ---------- Actions ---------- */
function taskActionsMenu(e, t, modal) {
  showMenu(e.clientX, e.clientY, [
    { label: t.pinned ? "Unpin" : "Pin to top", icon: "pin", onClick: () => upd(t.id, { pinned: !t.pinned }) },
    { label: "Duplicate", icon: "copy", onClick: async () => { const id = await duplicateTask(t); toast("Duplicated", "success"); modal.close(); openTask(id); } },
    { label: "Move to board…", icon: "move", onClick: () => moveToBoard(t, modal) },
    { label: "Copy link", icon: "link", onClick: () => { navigator.clipboard.writeText(location.origin + location.pathname.replace(/[^/]*$/, "") + `board.html?board=${t.boardId}&task=${t.id}`); toast("Link copied", "success"); } },
    "sep",
    { label: t.archived ? "Unarchive" : "Archive", icon: "archive", onClick: () => { upd(t.id, { archived: !t.archived }); toast(t.archived ? "Unarchived" : "Archived", "success"); if (!t.archived) modal.close(); } },
    { label: "Delete", icon: "trash-2", danger: true, onClick: async () => { if (await confirmDialog({ title: "Delete task?", message: `"${t.title}" will be permanently deleted.`, danger: true, confirmText: "Delete" })) { await deleteTask(t); modal.close(); toast("Task deleted", "success"); } } }
  ]);
}
export async function duplicateTask(t) {
  const copy = { ...t, id: uid("tsk"), title: t.title + " (copy)", createdAt: Date.now(), createdBy: Auth.current().id, pinned: false };
  delete copy.updatedAt;
  await DB.set("tasks", copy.id, copy);
  return copy.id;
}
export async function deleteTask(t) {
  const comments = await DB.list("comments", { where: [["taskId", "==", t.id]] });
  await DB.batch([{ type: "remove", collection: "tasks", id: t.id }, ...comments.map(c => ({ type: "remove", collection: "comments", id: c.id }))]);
}
async function moveToBoard(t, modal) {
  const boards = (await DB.list("boards", { where: [["workspaceId", "==", State.workspace.id]] })).filter(b => !b.archived);
  showMenu(innerWidth/2, innerHeight/2, boards.map(b => ({ label: b.name, checked: b.id === t.boardId, onClick: async () => {
    await upd(t.id, { boardId: b.id, columnId: b.columns[0].id }); toast(`Moved to ${b.name}`, "success"); modal.close();
  } })));
}
async function moveTaskToColumn(t, columnId) {
  const board = State._boardCache?.[t.boardId] || await DB.getDoc("boards", t.boardId);
  const col = board.columns.find(c => c.id === columnId);
  const patch = { columnId };
  if (["Completed", "Released"].includes(col?.name)) { patch.completion = 100; }
  await upd(t.id, patch);
  const me = Auth.current();
  await logActivity(State.workspace.id, { verb: "moved", actorId: me.id, target: t.title, boardId: t.boardId, meta: { taskId: t.id, to: col?.name } });
  if (["Completed", "Released"].includes(col?.name)) markComplete(t);
}
async function markComplete(t) {
  const me = Auth.current();
  await notifyMany((t.watchers || []).filter(w => w !== me.id), { type: "task_completed", title: "Task completed", body: t.title, actorId: me.id, link: `board.html?board=${t.boardId}&task=${t.id}` });
  const u = await DB.getDoc("users", me.id);
  DB.update("users", me.id, { stats: { ...(u.stats || {}), tasksCompleted: (u.stats?.tasksCompleted || 0) + 1 } });
}
function checkDeadlineNotify(t, due) {
  const soon = due - Date.now() < 2 * 86400000 && due > Date.now();
  if (soon) notifyMany(t.assignees || [], { type: "deadline", title: "Deadline approaching", body: `${t.title} is due ${fmtDate(due)}`, link: `board.html?board=${t.boardId}&task=${t.id}` });
}

/* ---------- Upload helper ---------- */
async function uploadTaskFile(t, file, returnAtt) {
  const path = `workspaces/${State.workspace.id}/tasks/${t.id}/${Date.now()}_${file.name}`;
  const res = await DB.uploadFile(path, file);
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
  const att = { id: uid("att"), kind, url: res.url, name: file.name, size: file.size, type: file.type };
  // also register in files collection
  DB.add("files", { id: uid("fil"), workspaceId: State.workspace.id, name: file.name, size: file.size, url: res.url, folder: "/tasks", category: "Documents", uploadedBy: Auth.current().id, taskId: t.id, createdAt: Date.now(), versions: [], tags: [] }).catch(()=>{});
  return returnAtt ? att : res.url;
}

function toDateInput(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/* expose for other modules */
export { moveTaskToColumn };
