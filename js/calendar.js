/* ============================================================
   OniSteel Studios Board — Calendar
   Month · Week · Day · Agenda · Timeline (Gantt) views.
   Drag tasks to reschedule. Milestones highlighted.
   ============================================================ */
import { DB, Auth } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { prioById } from "./constants.js";
import { icon } from "./icons.js";
import { $, $$, el, escapeHtml, avatarHTML, toast, fmtDate, fmtTime, menuFromEvent } from "./ui.js";
import { openTask, openQuickTask } from "./tasks.js";
import { cachedUser } from "./users.js";

let tasks = [], boards = [], unsub = null;
let view = "month";
let cursor = new Date(); cursor.setHours(0,0,0,0);
const filter = { board: "all", mine: false };

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export async function initCalendarPage() {
  setPageTitle("Calendar", State.workspace?.name);
  boards = (await DB.list("boards", { where: [["workspaceId", "==", State.workspace.id]] })).filter(b => !b.archived);
  const root = $("#pageRoot");
  root.innerHTML = `
    <div class="cal-toolbar">
      <div class="row gap-8">
        <button class="btn ghost sm" id="calToday">Today</button>
        <button class="iconbtn" id="calPrev">${icon("chevron-left")}</button>
        <button class="iconbtn" id="calNext">${icon("chevron-right")}</button>
        <h2 class="cal-title" id="calTitle"></h2>
      </div>
      <div class="row gap-8 wrap">
        <select class="select cal-filter" id="calBoard" style="width:auto"><option value="all">All boards</option>${boards.map(b=>`<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("")}</select>
        <label class="chip" style="cursor:pointer"><input type="checkbox" id="calMine" style="margin-right:6px">My tasks</label>
        <div class="segment" id="calViews">
          <button data-v="month" class="active">Month</button>
          <button data-v="week">Week</button>
          <button data-v="day">Day</button>
          <button data-v="agenda">Agenda</button>
          <button data-v="timeline">Timeline</button>
        </div>
        <button class="btn primary sm" id="calAdd">${icon("plus")}<span class="hide-sm">Task</span></button>
      </div>
    </div>
    <div id="calBody" class="cal-body"></div>`;

  $("#calToday").onclick = () => { cursor = new Date(); cursor.setHours(0,0,0,0); render(); };
  $("#calPrev").onclick = () => { shift(-1); };
  $("#calNext").onclick = () => { shift(1); };
  $("#calAdd").onclick = () => openQuickTask({});
  $("#calBoard").onchange = (e) => { filter.board = e.target.value; render(); };
  $("#calMine").onchange = (e) => { filter.mine = e.target.checked; render(); };
  $$("#calViews button").forEach(b => b.onclick = () => { view = b.dataset.v; $$("#calViews button").forEach(x => x.classList.toggle("active", x === b)); render(); });

  unsub = DB.watch("tasks", { where: [["workspaceId", "==", State.workspace.id]] }, (list) => { tasks = list.filter(t => !t.archived); render(); });
  window.addEventListener("beforeunload", () => unsub && unsub());
}

function shift(dir) {
  if (view === "month") cursor.setMonth(cursor.getMonth() + dir);
  else if (view === "week" || view === "timeline") cursor.setDate(cursor.getDate() + 7 * dir);
  else if (view === "day") cursor.setDate(cursor.getDate() + dir);
  else if (view === "agenda") cursor.setDate(cursor.getDate() + 14 * dir);
  render();
}
function visibleTasks() {
  const me = Auth.current();
  return tasks.filter(t => {
    if (filter.board !== "all" && t.boardId !== filter.board) return false;
    if (filter.mine && !(t.assignees || []).includes(me.id)) return false;
    return t.dueDate || t.startDate;
  });
}
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

function render() {
  const title = $("#calTitle"), body = $("#calBody");
  if (view === "month") { title.textContent = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`; renderMonth(body); }
  else if (view === "week") { const s = startOfWeek(cursor); const e = new Date(s); e.setDate(e.getDate()+6); title.textContent = `${fmtDate(s.getTime())} – ${fmtDate(e.getTime())}`; renderWeek(body); }
  else if (view === "day") { title.textContent = cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }); renderDay(body); }
  else if (view === "agenda") { title.textContent = "Agenda"; renderAgenda(body); }
  else if (view === "timeline") { const s = startOfWeek(cursor); title.textContent = `Timeline · ${fmtDate(s.getTime())}`; renderTimeline(body); }
}
function startOfWeek(d) { const s = new Date(d); s.setDate(s.getDate() - s.getDay()); s.setHours(0,0,0,0); return s; }

/* ---------- Month ---------- */
function renderMonth(body) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const today = new Date();
  const vt = visibleTasks();
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const inMonth = d.getMonth() === cursor.getMonth();
    const isToday = sameDay(d, today);
    const dayTasks = vt.filter(t => t.dueDate && sameDay(new Date(t.dueDate), d));
    cells += `
      <div class="cal-cell ${inMonth ? "" : "dim-month"} ${isToday ? "today" : ""}" data-date="${ymd(d)}">
        <div class="cc-head"><span class="cc-num">${d.getDate()}</span>${isToday ? '<span class="cc-today">Today</span>' : ""}</div>
        <div class="cc-tasks">
          ${dayTasks.slice(0, 4).map(t => calPill(t)).join("")}
          ${dayTasks.length > 4 ? `<div class="cc-more" data-more="${ymd(d)}">+${dayTasks.length - 4} more</div>` : ""}
        </div>
      </div>`;
  }
  body.innerHTML = `
    <div class="cal-month">
      <div class="cal-dow">${DOW.map(d => `<div>${d}</div>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
    </div>`;
  wireCells(body);
}

/* ---------- Week ---------- */
function renderWeek(body) {
  const s = startOfWeek(cursor); const today = new Date();
  const vt = visibleTasks();
  let cols = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(s); d.setDate(s.getDate() + i);
    const isToday = sameDay(d, today);
    const dayTasks = vt.filter(t => t.dueDate && sameDay(new Date(t.dueDate), d)).sort((a,b)=>a.dueDate-b.dueDate);
    cols += `
      <div class="week-col ${isToday ? "today" : ""}" data-date="${ymd(d)}">
        <div class="wc-head"><span class="wc-dow">${DOW[d.getDay()]}</span><span class="wc-num ${isToday?"today":""}">${d.getDate()}</span></div>
        <div class="wc-tasks cc-tasks" data-date="${ymd(d)}">${dayTasks.map(t => calPill(t, true)).join("") || '<div class="wc-empty">—</div>'}</div>
      </div>`;
  }
  body.innerHTML = `<div class="cal-week">${cols}</div>`;
  wireCells(body);
}

/* ---------- Day ---------- */
function renderDay(body) {
  const vt = visibleTasks().filter(t => t.dueDate && sameDay(new Date(t.dueDate), cursor)).sort((a,b)=>a.dueDate-b.dueDate);
  const hours = [];
  for (let h = 6; h <= 22; h++) {
    const hourTasks = vt.filter(t => new Date(t.dueDate).getHours() === h);
    hours.push(`<div class="day-hour"><div class="dh-label">${h % 12 || 12}${h < 12 ? "am" : "pm"}</div><div class="dh-slot cc-tasks" data-date="${ymd(cursor)}">${hourTasks.map(t => calPill(t, true)).join("")}</div></div>`);
  }
  body.innerHTML = `<div class="cal-day">
    ${vt.length ? "" : `<div class="empty" style="padding:24px"><p>Nothing scheduled for this day.</p></div>`}
    <div class="day-hours">${hours.join("")}</div>
  </div>`;
  wireCells(body);
}

/* ---------- Agenda ---------- */
function renderAgenda(body) {
  const vt = visibleTasks().filter(t => t.dueDate).sort((a, b) => a.dueDate - b.dueDate);
  const upcoming = vt.filter(t => t.dueDate >= Date.now() - 86400000);
  const groups = {};
  upcoming.forEach(t => { const k = fmtDate(t.dueDate); (groups[k] = groups[k] || []).push(t); });
  body.innerHTML = `<div class="cal-agenda">${Object.keys(groups).length ? Object.entries(groups).map(([day, list]) => `
    <div class="agenda-group">
      <div class="agenda-day">${day}</div>
      ${list.map(t => {
        const b = boards.find(x => x.id === t.boardId);
        const p = prioById(t.priority);
        const assignees = (t.assignees||[]).map(id=>cachedUser(id)).filter(Boolean);
        const overdue = t.dueDate < Date.now() && t.completion < 100;
        return `<div class="agenda-item" data-task="${t.id}" style="--p:${p.color}">
          <div class="ai-time">${fmtTime(t.dueDate)}</div>
          <div class="grow"><div class="ai-title">${t.milestone?icon("flag"):""}${escapeHtml(t.title)} ${overdue?'<span class="badge crimson">Overdue</span>':""}</div>
          <div class="dim small">${escapeHtml(b?.name || "")}</div></div>
          <span class="prio ${t.priority}"></span>
          ${assignees.length?`<div class="avatar-stack">${assignees.slice(0,3).map(u=>avatarHTML(u,"xs")).join("")}</div>`:""}
        </div>`;
      }).join("")}
    </div>`).join("") : `<div class="empty"><div class="em-ic">${icon("calendar")}</div><h3>No upcoming deadlines</h3></div>`}</div>`;
  $$(".agenda-item", body).forEach(it => it.onclick = () => openTask(it.dataset.task));
}

/* ---------- Timeline (Gantt) ---------- */
function renderTimeline(body) {
  const s = startOfWeek(cursor);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; });
  const vt = visibleTasks().filter(t => t.startDate || t.dueDate);
  const rows = vt.map(t => {
    const start = t.startDate ? new Date(t.startDate) : new Date(t.dueDate);
    const end = t.dueDate ? new Date(t.dueDate) : new Date(t.startDate);
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    const startIdx = Math.round((start - s) / 86400000);
    const endIdx = Math.round((end - s) / 86400000);
    if (endIdx < 0 || startIdx > 13) return "";
    const from = Math.max(0, startIdx), to = Math.min(13, endIdx);
    const p = prioById(t.priority);
    return `<div class="tl-row">
      <div class="tl-label truncate" data-task="${t.id}">${t.milestone?icon("flag"):""}${escapeHtml(t.title)}</div>
      <div class="tl-track">
        <div class="tl-bar" data-task="${t.id}" style="left:${from/14*100}%;width:${(to-from+1)/14*100}%;background:linear-gradient(90deg, ${p.color}, ${p.color}aa)">
          <span class="tl-bar-label">${t.completion}%</span>
        </div>
      </div>
    </div>`;
  }).join("");
  body.innerHTML = `
    <div class="cal-timeline">
      <div class="tl-head"><div class="tl-label-head">Task</div><div class="tl-days">${days.map(d => `<div class="tl-day ${sameDay(d,new Date())?"today":""}"><span>${DOW[d.getDay()]}</span><b>${d.getDate()}</b></div>`).join("")}</div></div>
      <div class="tl-body">${rows || `<div class="empty" style="padding:24px"><p>No tasks with dates in this range.</p></div>`}</div>
    </div>`;
  $$("[data-task]", body).forEach(x => x.onclick = () => openTask(x.dataset.task));
}

/* ---------- Pills + drag ---------- */
function calPill(t, showTime) {
  const p = prioById(t.priority);
  const overdue = t.dueDate < Date.now() && t.completion < 100;
  return `<div class="cal-pill ${t.milestone ? "milestone" : ""} ${overdue ? "overdue" : ""} ${t.completion>=100?"done":""}" data-task="${t.id}" draggable="true" style="--p:${p.color}">
    ${t.milestone ? `<span class="pill-flag">${icon("flag")}</span>` : `<span class="pill-dot"></span>`}
    ${showTime && t.dueDate ? `<span class="pill-time">${fmtTime(t.dueDate)}</span>` : ""}
    <span class="pill-title truncate">${escapeHtml(t.title)}</span>
  </div>`;
}
let dragTask = null;
function wireCells(body) {
  $$(".cal-pill", body).forEach(pill => {
    pill.onclick = (e) => { e.stopPropagation(); openTask(pill.dataset.task); };
    pill.oncontextmenu = (e) => { const t = tasks.find(x => x.id === pill.dataset.task); menuFromEvent(e, [
      { label: "Open", icon: "maximize", onClick: () => openTask(t.id) },
      { label: "Clear due date", icon: "x", onClick: () => DB.update("tasks", t.id, { dueDate: null }) }
    ]); };
    pill.addEventListener("dragstart", () => { dragTask = pill.dataset.task; pill.classList.add("dragging"); });
    pill.addEventListener("dragend", () => { pill.classList.remove("dragging"); dragTask = null; });
  });
  $$("[data-date]", body).forEach(cell => {
    cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("drop-hot"); });
    cell.addEventListener("dragleave", () => cell.classList.remove("drop-hot"));
    cell.addEventListener("drop", async (e) => {
      e.preventDefault(); cell.classList.remove("drop-hot");
      if (!dragTask) return;
      const [y, m, d] = cell.dataset.date.split("-").map(Number);
      const t = tasks.find(x => x.id === dragTask);
      const old = t.dueDate ? new Date(t.dueDate) : new Date();
      const newDate = new Date(y, m - 1, d, old.getHours() || 17, old.getMinutes() || 0);
      await DB.update("tasks", dragTask, { dueDate: newDate.getTime() });
      toast(`Rescheduled to ${fmtDate(newDate.getTime())}`, "success");
    });
  });
  $$(".cc-more", body).forEach(more => more.onclick = () => { view = "day"; cursor = new Date(more.dataset.more); $$("#calViews button").forEach(x => x.classList.toggle("active", x.dataset.v === "day")); render(); });
  $$(".cal-cell[data-date]", body).forEach(cell => cell.ondblclick = (e) => { if (e.target.closest(".cal-pill")) return; const [y,m,d]=cell.dataset.date.split("-").map(Number); openQuickTask({ dueDate: new Date(y,m-1,d,17,0).getTime() }); });
}
