/* ============================================================
   OniSteel Studios Board — Analytics
   Completion, burndown, velocity, productivity, hours,
   user performance, activity heatmap.
   ============================================================ */
import { DB } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { PRIORITIES, prioById } from "./constants.js";
import { icon } from "./icons.js";
import { $, $$, el, escapeHtml, avatarHTML, fmtHours } from "./ui.js";
import { donut, bars, line, burndown, hbars, heatmap, gauge, legend, chartColor } from "./charts.js";
import { cachedUser } from "./users.js";

let tasks = [], boards = [], timeEntries = [], activity = [];
let boardFilter = "all";
const subs = [];

export async function initAnalytics() {
  setPageTitle("Analytics", State.workspace?.name);
  boards = (await DB.list("boards", { where: [["workspaceId", "==", State.workspace.id]] })).filter(b => !b.archived);
  timeEntries = await DB.list("timeEntries", { where: [["workspaceId", "==", State.workspace.id]] });
  activity = await DB.list("activity", { where: [["workspaceId", "==", State.workspace.id]] });

  const root = $("#pageRoot");
  root.innerHTML = `
    <div class="page-head">
      <div><div class="ph-title">Analytics</div><div class="ph-sub">Team performance & project health</div></div>
      <div class="ph-actions">
        <select class="select" id="anBoard" style="width:auto"><option value="all">All boards</option>${boards.map(b=>`<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("")}</select>
      </div>
    </div>
    <div id="anBody"></div>`;
  $("#anBoard").onchange = (e) => { boardFilter = e.target.value; render(); };

  subs.push(DB.watch("tasks", { where: [["workspaceId", "==", State.workspace.id]] }, (l) => { tasks = l.filter(t => !t.archived); render(); }));
  window.addEventListener("beforeunload", () => subs.forEach(u => u && u()));
}

function ft() { return boardFilter === "all" ? tasks : tasks.filter(t => t.boardId === boardFilter); }

function render() {
  const t = ft();
  const total = t.length;
  const done = t.filter(x => x.completion >= 100).length;
  const pts = t.reduce((s, x) => s + (x.storyPoints || 0), 0);
  const donePts = t.filter(x => x.completion >= 100).reduce((s, x) => s + (x.storyPoints || 0), 0);
  const hours = t.reduce((s, x) => s + (x.loggedHours || 0), 0);
  const velocity = Math.round(donePts / 4); // pts/week over ~4wk

  $("#anBody").innerHTML = `
    <div class="metric-row stagger">
      ${metric("Tasks Completed", `${done}/${total}`, "check-circle", "#3FB98A")}
      ${metric("Velocity", velocity + " pts/wk", "trending-up", "#4D6B91")}
      ${metric("Story Points", `${donePts}/${pts}`, "target", "#8A6BD1")}
      ${metric("Hours Logged", fmtHours(hours), "clock", "#E6A23C")}
    </div>

    <div class="analytics-grid">
      <div class="card card-pad">
        <div class="row between mb-16"><h3 class="panel-h">Sprint Burndown</h3><span class="badge steel">${pts} pts total</span></div>
        <div id="burndownChart"></div>
        <div class="row gap-16 center mt-12" style="justify-content:center">
          <span class="cl-item"><span class="cl-dot" style="background:#4D6B91"></span>Actual</span>
          <span class="cl-item"><span class="cl-dot" style="background:#6B7280"></span>Ideal</span>
        </div>
      </div>
      <div class="card card-pad">
        <h3 class="panel-h mb-16">Completion Trend — 14 days</h3>
        <div id="completionTrend"></div>
      </div>
      <div class="card card-pad">
        <h3 class="panel-h mb-16">Tasks by Priority</h3>
        <div id="priorityChart"></div>
      </div>
      <div class="card card-pad">
        <h3 class="panel-h mb-16">Status Distribution</h3>
        <div id="statusChart" class="center-all col"></div>
      </div>
      <div class="card card-pad">
        <div class="row between mb-16"><h3 class="panel-h">User Performance</h3><span class="dim small">tasks completed</span></div>
        <div id="userPerf"></div>
      </div>
      <div class="card card-pad">
        <div class="row between mb-16"><h3 class="panel-h">Hours by Teammate</h3></div>
        <div id="hoursChart"></div>
      </div>
      <div class="card card-pad" style="grid-column:1/-1">
        <div class="row between mb-16"><h3 class="panel-h">Team Activity Heatmap</h3><span class="dim small">last 12 weeks</span></div>
        <div id="heatChart" style="overflow-x:auto"></div>
      </div>
    </div>`;

  renderBurndown(t, pts);
  renderCompletionTrend(t);
  renderPriority(t);
  renderStatus(t, done);
  renderUserPerf();
  renderHours();
  renderHeatmap();
}

function metric(label, val, ic, color) {
  return `<div class="stat"><div class="st-ic" style="background:${color}22;color:${color}">${icon(ic)}</div><div class="st-val" style="font-size:24px">${escapeHtml(String(val))}</div><div class="st-label">${label}</div></div>`;
}

function renderBurndown(t, totalPts) {
  // Simulate a 10-day sprint burndown from completion history
  const days = 10;
  const ideal = Array.from({ length: days + 1 }, (_, i) => Math.round(totalPts * (1 - i / days)));
  // actual: reduce remaining as tasks complete; approximate using completion
  const remaining = totalPts - t.filter(x => x.completion >= 100).reduce((s, x) => s + (x.storyPoints || 0), 0);
  const actual = [];
  for (let i = 0; i <= days; i++) {
    const frac = i / days;
    const val = Math.round(totalPts - (totalPts - remaining) * Math.min(1, frac * 1.15));
    actual.push(Math.max(remaining, val));
  }
  const labels = Array.from({ length: days + 1 }, (_, i) => i % 2 === 0 ? `D${i}` : "");
  $("#burndownChart").innerHTML = totalPts ? burndown(actual, ideal, { labels }) : emptyChart("No story points assigned yet.");
}
function renderCompletionTrend(t) {
  const days = 14, series = [], labels = [];
  let cumulative = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const next = d.getTime() + 86400000;
    const dayDone = t.filter(x => x.completion >= 100 && (x.updatedAt || x.createdAt) >= d.getTime() && (x.updatedAt || x.createdAt) < next).length;
    cumulative += dayDone;
    series.push(cumulative || t.filter(x => x.completion >= 100 && (x.createdAt) < next).length);
    labels.push(i % 3 === 0 ? `${d.getMonth()+1}/${d.getDate()}` : "");
  }
  $("#completionTrend").innerHTML = line(series, { height: 170, labels, color: "#3FB98A" });
}
function renderPriority(t) {
  const data = PRIORITIES.filter(p => p.id !== "none").map(p => ({ label: p.name, short: p.name.slice(0, 4), value: t.filter(x => x.priority === p.id).length, color: p.color }));
  $("#priorityChart").innerHTML = bars(data.map(d => ({ ...d })), { height: 160, color: "#8A6BD1" });
}
function renderStatus(t, done) {
  const inProgress = t.filter(x => x.completion > 0 && x.completion < 100).length;
  const todo = t.filter(x => x.completion === 0).length;
  const segs = [
    { label: "Completed", value: done, color: "#3FB98A" },
    { label: "In Progress", value: inProgress, color: "#E6A23C" },
    { label: "To Do", value: todo, color: "#4D6B91" }
  ].filter(s => s.value);
  const total = segs.reduce((s, x) => s + x.value, 0);
  $("#statusChart").innerHTML = (total ? donut(segs, { centerTop: total ? Math.round(done/total*100) + "%" : "0%", centerSub: "done" }) : emptyChart("No tasks.")) + legend(segs);
}
function renderUserPerf() {
  const data = State.members.map((m, i) => {
    const u = m.user;
    const completed = tasks.filter(t => (t.assignees || []).includes(m.userId) && t.completion >= 100).length;
    return { label: u.displayName, value: completed, display: completed, color: chartColor(i), avatar: avatarHTML(u, "xs") };
  }).sort((a, b) => b.value - a.value).slice(0, 8);
  $("#userPerf").innerHTML = data.some(d => d.value) ? hbars(data) : emptyChart("No completed tasks yet.");
}
function renderHours() {
  const byUser = {};
  timeEntries.forEach(e => { byUser[e.userId] = (byUser[e.userId] || 0) + e.minutes; });
  // also add loggedHours from user stats as fallback
  const data = State.members.map((m, i) => {
    let mins = byUser[m.userId] || 0;
    if (!mins) mins = Math.round((m.user.stats?.hoursLogged || 0) * 60);
    return { label: m.user.displayName, value: Math.round(mins / 60 * 10) / 10, display: fmtHours(mins / 60), color: chartColor(i + 3), avatar: avatarHTML(m.user, "xs") };
  }).sort((a, b) => b.value - a.value).slice(0, 8);
  $("#hoursChart").innerHTML = data.some(d => d.value) ? hbars(data) : emptyChart("No time logged yet.");
}
function renderHeatmap() {
  const counts = {};
  activity.forEach(a => { const d = new Date(a.createdAt); const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; counts[k] = (counts[k] || 0) + 1; });
  tasks.forEach(t => { const d = new Date(t.createdAt); const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; counts[k] = (counts[k] || 0) + 1; });
  $("#heatChart").innerHTML = heatmap(counts, { weeks: 12 });
}
function emptyChart(msg) { return `<div class="dim small center" style="padding:30px">${escapeHtml(msg)}</div>`; }
