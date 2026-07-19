/* ============================================================
   OniSteel Studios Board — Members, Roles & Permissions
   ============================================================ */
import { DB, Auth, uid } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { ROLES, roleById, CAPS, can } from "./constants.js";
import { icon } from "./icons.js";
import { $, $$, el, escapeHtml, avatarHTML, toast, openModal, confirmDialog, showMenu, copyToClipboard } from "./ui.js";
import { addMember, setMemberRole, removeMember, presenceLabel, presenceClass, watchMembers } from "./users.js";
import { notify } from "./notifications.js";

let tasks = [];
const subs = [];

export async function initMembersPage() {
  setPageTitle("Members", State.workspace?.name);
  tasks = await DB.list("tasks", { where: [["workspaceId", "==", State.workspace.id]] });
  const root = $("#pageRoot");
  const myRole = State.workspace._role;
  const canManage = can(myRole, CAPS.MANAGE_MEMBERS);

  root.innerHTML = `
    <div class="page-head">
      <div><div class="ph-title">Team Members</div><div class="ph-sub">${State.members.length} people in ${escapeHtml(State.workspace.name)}</div></div>
      <div class="ph-actions">
        <button class="btn ghost" id="rolesBtn">${icon("shield")} Roles & permissions</button>
        ${canManage ? `<button class="btn primary" id="inviteBtn">${icon("user-plus")} Invite</button>` : ""}
      </div>
    </div>
    <div class="tabs" id="memberTabs">
      <button class="tab active" data-t="all">All <span class="tab-count">${State.members.length}</span></button>
      <button class="tab" data-t="online">Online</button>
      <button class="tab" data-t="leadership">Leadership</button>
    </div>
    <div id="memberList" class="member-grid"></div>`;

  if (canManage) $("#inviteBtn").onclick = openInvite;
  $("#rolesBtn").onclick = openRolesReference;
  let tab = "all";
  $$("#memberTabs .tab").forEach(t => t.onclick = () => { $$("#memberTabs .tab").forEach(x => x.classList.remove("active")); t.classList.add("active"); tab = t.dataset.t; render(tab, canManage); });

  subs.push(watchMembers(State.workspace.id, (m) => { State.members = m; render(tab, canManage); }));
  window.addEventListener("beforeunload", () => subs.forEach(u => u && u()));
  render("all", canManage);
}

function render(tab, canManage) {
  const list = $("#memberList"); if (!list) return;
  const me = Auth.current();
  let members = [...State.members];
  if (tab === "online") members = members.filter(m => m.user.online);
  else if (tab === "leadership") members = members.filter(m => roleById(m.role).tier >= 75);
  members.sort((a, b) => roleById(b.role).tier - roleById(a.role).tier);

  list.innerHTML = members.map(m => {
    const u = m.user;
    const r = roleById(m.role);
    const assigned = tasks.filter(t => (t.assignees || []).includes(m.userId)).length;
    const completed = tasks.filter(t => (t.assignees || []).includes(m.userId) && t.completion >= 100).length;
    return `<div class="member-card">
      <div class="mc-banner" style="background:linear-gradient(120deg, ${r.color}44, ${r.color}11)"></div>
      <div class="mc-body">
        <div class="mc-avatar">${avatarHTML(u, "xl")}</div>
        <div class="mc-name">${escapeHtml(u.displayName)} ${m.userId === me.id ? '<span class="badge">You</span>' : ""}</div>
        <div class="dim small">@${escapeHtml(u.username || "user")}</div>
        <button class="role-chip" data-role="${m.userId}" style="--rc:${r.color}" ${canManage && m.userId !== me.id ? "" : "disabled"}>${escapeHtml(r.name)}${canManage && m.userId !== me.id ? icon("chevron-down") : ""}</button>
        <div class="mc-presence"><span class="presence-dot ${presenceClass(u)}"></span>${presenceLabel(u)}</div>
        ${u.bio ? `<div class="mc-bio clamp-2">${escapeHtml(u.bio)}</div>` : ""}
        <div class="mc-stats"><div><b>${assigned}</b><span>assigned</span></div><div><b>${completed}</b><span>done</span></div><div><b>${u.stats?.hoursLogged || 0}</b><span>hrs</span></div></div>
        <div class="mc-actions">
          <a class="btn ghost sm" href="profile.html?u=${m.userId}">${icon("user")} Profile</a>
          ${canManage && m.userId !== me.id ? `<button class="iconbtn sm" data-remove="${m.userId}" data-tip="Remove">${icon("x")}</button>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  $$("[data-role]", list).forEach(b => { if (!b.disabled) b.onclick = (e) => roleMenu(e, b.dataset.role); });
  $$("[data-remove]", list).forEach(b => b.onclick = async () => {
    const m = State.members.find(x => x.userId === b.dataset.remove);
    if (await confirmDialog({ title: "Remove member?", message: `Remove ${m.user.displayName} from this workspace?`, danger: true, confirmText: "Remove" })) { await removeMember(State.workspace.id, b.dataset.remove); toast("Member removed", "success"); }
  });
}

function roleMenu(e, userId) {
  const cats = {};
  ROLES.forEach(r => { (cats[r.cat] = cats[r.cat] || []).push(r); });
  const items = [];
  Object.entries(cats).forEach(([cat, roles]) => {
    items.push({ label: cat.replace(/_/g, " "), header: true });
    roles.forEach(r => items.push({ label: r.name, onClick: async () => { await setMemberRole(State.workspace.id, userId, r.id); toast(`Role updated to ${r.name}`, "success"); notify(userId, { type: "update", title: "Your role changed", body: `You are now ${r.name} in ${State.workspace.name}`, actorId: Auth.current().id }); } }));
  });
  showMenu(e.clientX, e.clientY, items);
}

/* ---------- Invite ---------- */
async function openInvite() {
  // Non-members among all demo users (so you can add teammates), plus email invite
  const allUsers = await DB.list("users", {});
  const memberIds = new Set(State.members.map(m => m.userId));
  const candidates = allUsers.filter(u => !memberIds.has(u.id));
  const link = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}index.html?invite=${State.workspace.id}`;

  const body = el("div", {});
  body.innerHTML = `
    <div class="field"><label>Invite by email</label>
      <div class="row gap-8"><input class="input grow" id="invEmail" placeholder="teammate@studio.com"><select class="select" id="invRole" style="width:auto">${ROLES.filter(r=>r.tier<=80).map(r=>`<option value="${r.id}" ${r.id==="programmer"?"selected":""}>${r.name}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>Or share invite link</label>
      <div class="input-group"><input class="input" id="invLink" value="${escapeHtml(link)}" readonly><button class="btn subtle sm in-suffix" id="invCopy">${icon("copy")} Copy</button></div>
    </div>
    ${candidates.length ? `<div class="hr"></div><div class="field"><label>Add existing teammates</label><div class="invite-people" id="invPeople">${candidates.slice(0,12).map(u=>`<button class="invite-person" data-u="${u.id}">${avatarHTML(u,"sm")}<div class="grow" style="text-align:left"><div class="small strong">${escapeHtml(u.displayName)}</div><div class="dim tiny">${escapeHtml(roleById(u.role).name)}</div></div>${icon("plus")}</button>`).join("")}</div></div>` : ""}`;
  const m = openModal({ title: "Invite to workspace", icon: "user-plus", size: "md", body });
  $("#invCopy", body).onclick = () => copyToClipboard(link);
  $("#invPeople", body) && $$(".invite-person", body).forEach(b => b.onclick = async () => {
    const u = candidates.find(x => x.id === b.dataset.u);
    await addMember(State.workspace.id, u.id, u.role || "programmer");
    notify(u.id, { type: "invite", title: "Workspace invitation", body: `You've been added to ${State.workspace.name}`, actorId: Auth.current().id, link: "dashboard.html" });
    toast(`${u.displayName} added`, "success");
    b.remove();
  });
  const emailBtn = el("div", {});
  // add invite-by-email action
  const foot = el("div", { class: "modal-foot" });
  foot.innerHTML = `<button class="btn ghost" id="invClose">Close</button><button class="btn primary" id="invSend">${icon("send")} Send invite</button>`;
  m.modal.appendChild(foot);
  $("#invClose", foot).onclick = () => m.close();
  $("#invSend", foot).onclick = async () => {
    const email = $("#invEmail", body).value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast("Enter a valid email", "warning"); return; }
    const role = $("#invRole", body).value;
    // record a pending invite
    await DB.set("invites", uid("inv"), { workspaceId: State.workspace.id, email, role, invitedBy: Auth.current().id, createdAt: Date.now(), status: "pending" });
    toast(`Invitation recorded for ${email}. Share the link so they can join.`, "success", 5000);
    $("#invEmail", body).value = "";
  };
}

/* ---------- Roles reference ---------- */
function openRolesReference() {
  const capNames = { MANAGE_WORKSPACE: "Manage workspace", MANAGE_MEMBERS: "Manage members", MANAGE_BOARDS: "Manage boards", CREATE_TASK: "Create tasks", DELETE_TASK: "Delete tasks", UPLOAD: "Upload files", COMMENT: "Comment", CHAT: "Chat", VIEW: "View" };
  const tiers = [
    { name: "Leadership", roles: ROLES.filter(r => r.tier >= 75) },
    { name: "Team", roles: ROLES.filter(r => r.tier >= 40 && r.tier < 75) },
    { name: "External", roles: ROLES.filter(r => r.tier < 40) }
  ];
  const body = el("div", {});
  body.innerHTML = `
    <p class="muted small mb-16">Roles determine what each member can do. Higher tiers inherit all lower-tier permissions.</p>
    ${tiers.map(t => `
      <div class="role-group">
        <div class="rg-title">${escapeHtml(t.name)}</div>
        <div class="rg-roles">${t.roles.map(r => `<span class="role-badge" style="--rc:${r.color}">${escapeHtml(r.name)}</span>`).join("")}</div>
      </div>`).join("")}
    <div class="hr"></div>
    <div class="perm-table">
      <div class="pt-head"><span>Capability</span><span>Min. role tier</span></div>
      ${Object.entries(capNames).map(([k, label]) => {
        const tier = CAPS[k];
        const minRole = [...ROLES].reverse().find(r => r.tier >= tier);
        return `<div class="pt-row"><span>${escapeHtml(label)}</span><span class="badge steel">${escapeHtml(minRole ? minRole.name + "+" : "Any")}</span></div>`;
      }).join("")}
    </div>`;
  openModal({ title: "Roles & Permissions", icon: "shield", size: "md", body });
}
