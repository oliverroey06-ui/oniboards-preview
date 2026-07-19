/* ============================================================
   OniSteel Studios Board — User Profiles
   ============================================================ */
import { DB, Auth } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { roleById, ACHIEVEMENTS, SKILL_TAGS } from "./constants.js";
import { icon } from "./icons.js";
import { $, $$, el, escapeHtml, avatarHTML, toast, openModal, fmtDate, timeAgo, pickFile, readAsDataURL } from "./ui.js";
import { getUser, presenceLabel, presenceClass } from "./users.js";
import { compressImage } from "./store.js";
import { activityText } from "./notifications.js";

export async function initProfilePage() {
  const params = new URLSearchParams(location.search);
  const userId = params.get("u") || Auth.current().id;
  const me = Auth.current();
  const isMe = userId === me.id;

  const user = await getUser(userId);
  if (!user) { $("#pageRoot").innerHTML = `<div class="empty"><h3>User not found</h3></div>`; return; }
  setPageTitle(user.displayName, "Profile");

  const tasks = await DB.list("tasks", { where: [["workspaceId", "==", State.workspace.id]] });
  const assigned = tasks.filter(t => (t.assignees || []).includes(userId));
  const completed = assigned.filter(t => t.completion >= 100);
  const activity = await DB.list("activity", { where: [["workspaceId", "==", State.workspace.id], ["actorId", "==", userId]], orderBy: ["createdAt", "desc"], limit: 10 });
  const r = roleById(user.role);
  const stats = user.stats || {};

  const root = $("#pageRoot");
  root.innerHTML = `
    <div class="profile-hero card">
      <div class="ph-banner" id="phBanner" style="${user.banner ? `background-image:url('${escapeHtml(user.banner)}')` : `background:linear-gradient(120deg, ${r.color}55, #1a1a1c)`}">
        ${isMe ? `<button class="btn subtle sm ph-banner-edit" id="editBanner">${icon("camera")} Banner</button>` : ""}
      </div>
      <div class="ph-main">
        <div class="ph-avatar">${avatarHTML(user, "xxl")}${isMe ? `<button class="ph-avatar-edit" id="editAvatar">${icon("camera")}</button>` : ""}</div>
        <div class="ph-info">
          <div class="row gap-8 wrap"><h1 class="ph-dname">${escapeHtml(user.displayName)}</h1><span class="role-badge" style="--rc:${r.color}">${escapeHtml(r.name)}</span></div>
          <div class="dim">@${escapeHtml(user.username || "user")} · <span class="presence-inline"><span class="presence-dot ${presenceClass(user)}"></span>${presenceLabel(user)}</span></div>
          ${user.bio ? `<p class="ph-bio">${escapeHtml(user.bio)}</p>` : (isMe ? `<p class="dim small">Add a bio to tell your team about yourself.</p>` : "")}
        </div>
        <div class="ph-actions">
          ${isMe ? `<button class="btn primary" id="editProfile">${icon("edit-3")} Edit profile</button>` : `<button class="btn primary" id="msgUser">${icon("message-square")} Message</button>`}
        </div>
      </div>
    </div>

    <div class="profile-grid">
      <div class="col gap-16">
        <div class="card card-pad">
          <h3 class="panel-h mb-16">Statistics</h3>
          <div class="stat-row">
            ${miniStat("check-square", assigned.length, "Assigned")}
            ${miniStat("check-circle", completed.length, "Completed")}
            ${miniStat("clock", (stats.hoursLogged||0), "Hours")}
            ${miniStat("message-square", (stats.comments||0), "Comments")}
            ${miniStat("flame", (stats.streak||0), "Day streak")}
          </div>
        </div>
        <div class="card card-pad">
          <h3 class="panel-h mb-12">Skills</h3>
          <div class="skill-chips">${(user.skills||[]).length ? user.skills.map(s=>`<span class="chip">${escapeHtml(s)}</span>`).join("") : `<span class="dim small">No skills listed${isMe?" — edit your profile to add some.":"."}</span>`}</div>
        </div>
        <div class="card card-pad">
          <h3 class="panel-h mb-12">Recent Activity</h3>
          <div class="col gap-8">${activity.length ? activity.map(a=>`<div class="act-item">${avatarHTML(user,"xs")}<div class="grow"><div class="small">${activityText(a, user)}</div><div class="dim tiny">${timeAgo(a.createdAt)}</div></div></div>`).join("") : `<div class="dim small">No activity yet.</div>`}</div>
        </div>
      </div>
      <div class="col gap-16">
        <div class="card card-pad">
          <h3 class="panel-h mb-16">Achievements</h3>
          <div class="achievements">${ACHIEVEMENTS.map(a => {
            const val = achieveValue(a, stats, completed.length);
            const unlocked = val >= a.tiers;
            return `<div class="achievement ${unlocked?"unlocked":""}" title="${escapeHtml(a.desc)}">
              <div class="ach-ic">${icon(a.icon)}</div>
              <div class="ach-name">${escapeHtml(a.name)}</div>
              <div class="ach-prog">${Math.min(val, a.tiers)}/${a.tiers}</div>
            </div>`;
          }).join("")}</div>
        </div>
        <div class="card card-pad">
          <div class="row between mb-12"><h3 class="panel-h">Assigned Tasks</h3><span class="badge">${assigned.filter(t=>t.completion<100).length} open</span></div>
          <div class="col gap-6">${assigned.filter(t=>t.completion<100).slice(0,6).map(t=>`<a class="prof-task" href="board.html?board=${t.boardId}&task=${t.id}"><span class="prio ${t.priority}"></span><span class="grow truncate">${escapeHtml(t.title)}</span><span class="dim tiny">${t.completion}%</span></a>`).join("") || `<div class="dim small">No open tasks.</div>`}</div>
        </div>
        <div class="card card-pad">
          <div class="dim small">Member since ${fmtDate(user.createdAt)}</div>
        </div>
      </div>
    </div>`;

  if (isMe) {
    $("#editProfile").onclick = () => editProfile(user);
    $("#editAvatar").onclick = () => changeImage("photoURL");
    $("#editBanner").onclick = () => changeImage("banner");
  } else {
    $("#msgUser").onclick = () => location.href = `chat.html`;
  }
}

function miniStat(ic, val, label) {
  return `<div class="mini-stat"><div class="ms-ic">${icon(ic)}</div><div class="ms-val">${val}</div><div class="ms-label">${label}</div></div>`;
}
function achieveValue(a, stats, completed) {
  switch (a.id) {
    case "first_task": case "task_10": case "task_50": return stats.tasksCompleted || completed || 0;
    case "streak_7": return stats.streak || 0;
    case "hours_100": return Math.floor(stats.hoursLogged || 0);
    case "collaborator": return stats.comments || 0;
    case "shipper": return stats.tasksCompleted > 0 ? 1 : 0;
    case "documenter": return 0;
    default: return 0;
  }
}

async function changeImage(field) {
  const file = await pickFile({ accept: "image/*" });
  if (!file) return;
  toast("Processing image…", "info", 1200);
  let dataUrl = await readAsDataURL(file);
  dataUrl = await compressImage(dataUrl, field === "banner" ? 1400 : 400, 0.85);
  await Auth.updateProfile({ [field]: dataUrl });
  toast(field === "banner" ? "Banner updated" : "Avatar updated", "success");
  location.reload();
}

function editProfile(user) {
  const body = el("div", {});
  body.innerHTML = `
    <div class="field"><label>Display name</label><input class="input" id="epName" value="${escapeHtml(user.displayName)}"></div>
    <div class="field"><label>Username</label><input class="input" id="epUser" value="${escapeHtml(user.username||"")}"></div>
    <div class="field"><label>Bio</label><textarea class="textarea" id="epBio" placeholder="Tell your team about yourself…">${escapeHtml(user.bio||"")}</textarea></div>
    <div class="field"><label>Skills</label><div class="skill-picker" id="epSkills">${SKILL_TAGS.map(s=>`<button type="button" class="skill-opt ${(user.skills||[]).includes(s)?"on":""}" data-s="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}</div></div>`;
  const foot = el("div", {});
  const m = openModal({ title: "Edit Profile", icon: "edit-3", size: "md", body, footer: foot });
  const skills = new Set(user.skills || []);
  $$(".skill-opt", body).forEach(b => b.onclick = () => { const s = b.dataset.s; skills.has(s) ? skills.delete(s) : skills.add(s); b.classList.toggle("on"); });
  foot.append(
    el("button", { class: "btn ghost", onClick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onClick: async () => {
      await Auth.updateProfile({ displayName: $("#epName", body).value.trim() || user.displayName, username: $("#epUser", body).value.trim().toLowerCase().replace(/\s+/g, ""), bio: $("#epBio", body).value.trim(), skills: [...skills] });
      toast("Profile updated", "success"); m.close(); setTimeout(() => location.reload(), 300);
    } }, "Save changes")
  );
}
