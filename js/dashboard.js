/* ============================================================
   OniSteel Studios Board — Dashboard
   ============================================================ */
import { DB, Auth } from "./store.js";
import { State, setPageTitle, quickAdd } from "./app.js";
import { prioById } from "./constants.js";
import { icon } from "./icons.js";
import { $, $$, el, escapeHtml, avatarHTML, fmtDate, fmtTime, timeAgo, timeUntil } from "./ui.js";
import { donut, bars, line, hbars, legend, chartColor, sparkline } from "./charts.js";
import { openTask } from "./tasks.js";
import { cachedUser } from "./users.js";
import { activityText } from "./notifications.js";

let tasks = [], boards = [], activity = [], files = [], messages = [], notifs = [];
const subs = [];

export async function initDashboard() {
  const me = Auth.current();
  setPageTitle("Dashboard", `Welcome back, ${(me.displayName || "").split(" ")[0]}`);
  const root = $("#pageRoot");
  root.innerHTML = `<div class="dash-loading">${Array.from({length:4}).map(()=>'<div class="skeleton sk-card" style="height:96px"></div>').join("")}</div>`;

  boards = (await DB.list("boards", { where: [["workspaceId", "==", State.workspace.id]] })).filter(b => !b.archived);

  subs.push(DB.watch("tasks", { where: [["workspaceId", "==", State.workspace.id]] }, (l) => { tasks = l.filter(t => !t.archived); render(); }));
  subs.push(DB.watch("activity", { where: [["workspaceId", "==", State.workspace.id]], orderBy: ["createdAt", "desc"], limit: 12 }, (l) => { activity = l; renderActivity(); }));
  subs.push(DB.watch("files", { where: [["workspaceId", "==", State.workspace.id]], orderBy: ["createdAt", "desc"], limit: 6 }, (l) => { files = l; renderFiles(); }));
  subs.push(DB.watch("notifications", { where: [["userId", "==", me.id]], orderBy: ["createdAt", "desc"], limit: 6 }, (l) => { notifs = l; renderNotifs(); }));
  window.addEventListener("beforeunload", () => subs.forEach(u => u && u()));
  loadRecentChat();
}

function render() {
  const me = Auth.current();
  const root = $("#pageRoot");
  const total = tasks.length;
  const done = tasks.filter(t => t.completion >= 100).length;
  const inProgress = tasks.filter(t => t.completion > 0 && t.completion < 100).length;
  const overdue = tasks.filter(t => t.dueDate && t.dueDate < Date.now() && t.completion < 100).length;
  const myTasks = tasks.filter(t => (t.assignees || []).includes(me.id) && t.completion < 100);
  const completionRate = total ? Math.round(done / total * 100) : 0;

  root.innerHTML = `
    <div class="dash-hero">
      <div>
        <div class="dash-greet">${greeting()}, <span class="c-steel">${escapeHtml((me.displayName||"").split(" ")[0])}</span></div>
        <div class="muted">Here's what's happening in <strong>${escapeHtml(State.workspace.name)}</strong> today.</div>
      </div>
      <div class="dash-quick">
        <button class="btn primary" id="qaTask">${icon("plus")} New task</button>
        <button class="btn ghost" id="qaBoard">${icon("board")} <span class="hide-sm">Board</span></button>
        <button class="btn ghost" id="qaChat">${icon("chat")} <span class="hide-sm">Chat</span></button>
      </div>
    </div>

    <div class="grid grid-4 stagger" style="margin-bottom:20px">
      ${statTile("Total Tasks", total, "check-square", "#4D6B91", `${done} done`)}
      ${statTile("In Progress", inProgress, "activity", "#E6A23C", `${myTasks.length} assigned to you`)}
      ${statTile("Completed", done, "check-circle", "#3FB98A", `${completionRate}% completion`)}
      ${statTile("Overdue", overdue, "alert-triangle", "#C12A2A", overdue ? "Needs attention" : "All on track")}
    </div>

    <div class="dash-grid">
      <div class="dash-col-main">
        <div class="card card-pad">
          <div class="row between mb-16"><h3 class="panel-h">Productivity — last 7 days</h3><span class="badge steel">${last7Completed()} completed</span></div>
          <div id="prodChart"></div>
        </div>

        <div class="card card-pad">
          <div class="row between mb-12"><h3 class="panel-h">My Assigned Tasks</h3><a href="workspace.html" class="btn link sm">View boards</a></div>
          <div id="myTasks"></div>
        </div>

        <div class="grid grid-2">
          <div class="card card-pad">
            <h3 class="panel-h mb-12">Progress by Board</h3>
            <div id="boardProgress"></div>
          </div>
          <div class="card card-pad">
            <h3 class="panel-h mb-12">Task Distribution</h3>
            <div id="distChart" class="center-all col"></div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="row between mb-12"><h3 class="panel-h">Recent Chat</h3><a href="chat.html" class="btn link sm">Open chat</a></div>
          <div id="recentChat"></div>
        </div>
      </div>

      <div class="dash-col-side">
        <div class="card card-pad">
          <div class="row between mb-12"><h3 class="panel-h">Upcoming Deadlines</h3></div>
          <div id="deadlines"></div>
        </div>
        <div class="card card-pad">
          <div class="row between mb-12"><h3 class="panel-h">Notifications</h3><a href="#" id="dashNotifAll" class="btn link sm">All</a></div>
          <div id="dashNotifs"></div>
        </div>
        <div class="card card-pad">
          <h3 class="panel-h mb-12">This Month</h3>
          <div id="miniCal"></div>
        </div>
        <div class="card card-pad">
          <div class="row between mb-12"><h3 class="panel-h">Recent Files</h3><a href="files.html" class="btn link sm">All files</a></div>
          <div id="recentFiles"></div>
        </div>
        <div class="card card-pad">
          <div class="row between mb-12"><h3 class="panel-h">Activity</h3></div>
          <div id="recentActivity"></div>
        </div>
      </div>
    </div>`;

  $("#qaTask").onclick = () => quickAdd();
  $("#qaBoard").onclick = () => location.href = "workspace.html";
  $("#qaChat").onclick = () => location.href = "chat.html";
  $("#dashNotifAll").onclick = (e) => { e.preventDefault(); $("#notifBtn")?.click(); };

  renderProductivity();
  renderMyTasks(myTasks);
  renderBoardProgress();
  renderDistribution(done, inProgress, tasks.filter(t=>t.completion===0).length, overdue);
  renderDeadlines();
  renderMiniCal();
  renderActivity(); renderFiles(); renderNotifs(); renderRecentChat();
}

function statTile(label, val, ic, color, delta) {
  return `<div class="stat hoverable">
    <div class="st-ic" style="background:${color}22;color:${color}">${icon(ic)}</div>
    <div class="st-val">${val}</div>
    <div class="st-label">${label}</div>
    <div class="st-delta ${delta.includes("track")||delta.includes("done")||delta.includes("completion")?"up":""}">${escapeHtml(delta)}</div>
  </div>`;
}
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

function last7Completed() {
  const cut = Date.now() - 7 * 86400000;
  return tasks.filter(t => t.completion >= 100 && (t.updatedAt || t.createdAt) > cut).length;
}
function renderProductivity() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const next = d.getTime() + 86400000;
    const count = tasks.filter(t => t.completion >= 100 && (t.updatedAt || t.createdAt) >= d.getTime() && (t.updatedAt || t.createdAt) < next).length
      + Math.max(0, Math.round(Math.sin(i) * 0)); // deterministic base
    days.push({ label: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()], value: count });
  }
  // if all zero (fresh), show created-per-day instead so chart isn't empty
  if (days.every(d => d.value === 0)) {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      const next = d.getTime() + 86400000;
      days[6 - i].value = tasks.filter(t => t.createdAt >= d.getTime() && t.createdAt < next).length;
    }
  }
  $("#prodChart").innerHTML = bars(days, { height: 150, color: "#4D6B91" });
}
function renderMyTasks(myTasks) {
  const box = $("#myTasks");
  if (!myTasks.length) { box.innerHTML = `<div class="empty" style="padding:20px"><p>No open tasks assigned to you. Nice work! 🎉</p></div>`; return; }
  box.innerHTML = myTasks.slice(0, 6).map(t => {
    const b = boards.find(x => x.id === t.boardId);
    const p = prioById(t.priority);
    const due = t.dueDate ? timeUntil(t.dueDate) : null;
    return `<div class="dash-task" data-task="${t.id}" style="--p:${p.color}">
      <span class="prio ${t.priority}"></span>
      <div class="grow"><div class="dt-title truncate">${escapeHtml(t.title)}</div><div class="dim tiny">${escapeHtml(b?.name||"")}</div></div>
      ${due ? `<span class="badge ${due.overdue?"crimson":""}">${escapeHtml(due.text)}</span>` : ""}
      <div class="ring" style="--_v:${t.completion};--_s:34px"><span>${t.completion}</span></div>
    </div>`;
  }).join("");
  $$(".dash-task", box).forEach(x => x.onclick = () => openTask(x.dataset.task));
}
function renderBoardProgress() {
  const box = $("#boardProgress");
  const data = boards.map((b, i) => {
    const bt = tasks.filter(t => t.boardId === b.id);
    const done = bt.filter(t => t.completion >= 100).length;
    return { label: b.name, value: bt.length ? Math.round(done / bt.length * 100) : 0, display: `${done}/${bt.length}`, color: chartColor(i) };
  }).sort((a, b) => b.value - a.value).slice(0, 6);
  box.innerHTML = data.length ? hbars(data) : `<div class="dim small">No boards yet.</div>`;
}
function renderDistribution(done, inProgress, todo, overdue) {
  const segs = [
    { label: "Completed", value: done, color: "#3FB98A" },
    { label: "In Progress", value: inProgress, color: "#E6A23C" },
    { label: "To Do", value: Math.max(0, todo - overdue), color: "#4D6B91" },
    { label: "Overdue", value: overdue, color: "#C12A2A" }
  ].filter(s => s.value > 0);
  const total = segs.reduce((s, x) => s + x.value, 0);
  $("#distChart").innerHTML = (total ? donut(segs, { centerTop: String(total), centerSub: "tasks" }) : `<div class="dim small">No tasks yet.</div>`) + legend(segs);
}
function renderDeadlines() {
  const box = $("#deadlines");
  const upcoming = tasks.filter(t => t.dueDate && t.completion < 100).sort((a, b) => a.dueDate - b.dueDate).slice(0, 6);
  if (!upcoming.length) { box.innerHTML = `<div class="dim small">No upcoming deadlines.</div>`; return; }
  box.innerHTML = upcoming.map(t => {
    const due = timeUntil(t.dueDate);
    return `<div class="deadline-row ${due.overdue ? "overdue" : ""}" data-task="${t.id}">
      <div class="dl-date"><span class="dl-day">${new Date(t.dueDate).getDate()}</span><span class="dl-mon">${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][new Date(t.dueDate).getMonth()]}</span></div>
      <div class="grow"><div class="truncate" style="font-weight:600;font-size:13px">${escapeHtml(t.title)}</div><div class="dim tiny">${escapeHtml(due.text)}</div></div>
    </div>`;
  }).join("");
  $$(".deadline-row", box).forEach(x => x.onclick = () => openTask(x.dataset.task));
}
function renderMiniCal() {
  const box = $("#miniCal"); if (!box) return;
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const dueDays = new Set(tasks.filter(t => t.dueDate).map(t => new Date(t.dueDate).toDateString()));
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const inM = d.getMonth() === now.getMonth();
    const isToday = d.toDateString() === now.toDateString();
    const has = dueDays.has(d.toDateString());
    cells += `<div class="mc-cell ${inM ? "" : "out"} ${isToday ? "today" : ""}">${d.getDate()}${has ? '<span class="mc-dot"></span>' : ""}</div>`;
  }
  box.innerHTML = `<div class="mini-cal"><div class="mc-dow">${["S","M","T","W","T","F","S"].map(x=>`<span>${x}</span>`).join("")}</div><div class="mc-grid">${cells}</div></div>`;
}
function renderActivity() {
  const box = $("#recentActivity"); if (!box) return;
  if (!activity.length) { box.innerHTML = `<div class="dim small">No recent activity.</div>`; return; }
  box.innerHTML = activity.slice(0, 8).map(a => {
    const u = cachedUser(a.actorId);
    return `<div class="act-item">${avatarHTML(u, "xs")}<div class="grow"><div class="small">${activityText(a, u)}</div><div class="dim tiny">${timeAgo(a.createdAt)}</div></div></div>`;
  }).join("");
}
function renderFiles() {
  const box = $("#recentFiles"); if (!box) return;
  if (!files.length) { box.innerHTML = `<div class="dim small">No files yet.</div>`; return; }
  import("./constants.js").then(({ fileKind }) => {
    box.innerHTML = files.map(f => {
      const k = fileKind(f.name);
      return `<a class="file-row-mini" href="files.html?file=${f.id}"><span class="frm-ic" style="background:${k.color}22;color:${k.color}">${icon(k.icon)}</span><div class="grow"><div class="truncate small" style="font-weight:600">${escapeHtml(f.name)}</div><div class="dim tiny">${timeAgo(f.createdAt)}</div></div></a>`;
    }).join("");
  });
}
function renderNotifs() {
  const box = $("#dashNotifs"); if (!box) return;
  if (!notifs.length) { box.innerHTML = `<div class="dim small">You're all caught up.</div>`; return; }
  import("./constants.js").then(({ NOTIF_TYPES }) => {
    box.innerHTML = notifs.map(n => {
      const meta = NOTIF_TYPES[n.type] || { icon: "bell" };
      return `<div class="dash-notif ${n.read?"":"unread"}"><span class="dn-ic">${icon(meta.icon)}</span><div class="grow"><div class="small" style="font-weight:600">${escapeHtml(n.title)}</div>${n.body?`<div class="dim tiny truncate">${escapeHtml(n.body)}</div>`:""}</div><span class="dim tiny">${timeAgo(n.createdAt)}</span></div>`;
    }).join("");
  });
}
async function loadRecentChat() {
  const chans = await DB.list("channels", { where: [["workspaceId", "==", State.workspace.id]] });
  const gen = chans.find(c => c.name === "general") || chans[0];
  if (!gen) return;
  messages = (await DB.list("messages", { where: [["channelId", "==", gen.id]], orderBy: ["createdAt", "desc"], limit: 5 })).reverse();
  renderRecentChat();
}
function renderRecentChat() {
  const box = $("#recentChat"); if (!box) return;
  if (!messages.length) { box.innerHTML = `<div class="dim small">No messages yet.</div>`; return; }
  box.innerHTML = messages.map(m => {
    const u = cachedUser(m.authorId) || {};
    const preview = m.type === "text" ? m.text : `[${m.type}]`;
    return `<div class="chat-mini">${avatarHTML(u, "xs")}<div class="grow"><span class="small"><strong>${escapeHtml(u.displayName || "User")}</strong> <span class="muted">${escapeHtml((preview||"").slice(0, 80))}</span></span></div><span class="dim tiny">${timeAgo(m.createdAt)}</span></div>`;
  }).join("");
}
