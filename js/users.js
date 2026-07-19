/* ============================================================
   OniSteel Studios Board — Users, Presence & Permissions
   ============================================================ */
import { DB } from "./store.js";
import { ROLES, roleById, can, CAPS } from "./constants.js";
import { avatarHTML, escapeHtml, timeAgo } from "./ui.js";

/* Simple in-memory profile cache to avoid refetching users. */
const _cache = new Map();
const _userSubs = new Map();

export async function getUser(userId) {
  if (!userId) return null;
  if (_cache.has(userId)) return _cache.get(userId);
  const u = await DB.getDoc("users", userId);
  if (u) _cache.set(userId, u);
  return u;
}
export function primeUser(u) { if (u && u.id) _cache.set(u.id, u); }
export function cachedUser(userId) { return _cache.get(userId) || null; }

/** Live-subscribe to all users; keeps the cache warm. */
export function watchAllUsers(cb) {
  return DB.watch("users", {}, (users) => {
    users.forEach(u => _cache.set(u.id, u));
    cb && cb(users);
  });
}

/* ---------- Membership ---------- */
export function watchMembers(workspaceId, cb) {
  return DB.watch("members", { where: [["workspaceId", "==", workspaceId]] }, async (members) => {
    // resolve profiles
    const resolved = await Promise.all(members.map(async (m) => ({ ...m, user: await getUser(m.userId) })));
    cb(resolved.filter(m => m.user));
  });
}
export async function listMembers(workspaceId) {
  const members = await DB.list("members", { where: [["workspaceId", "==", workspaceId]] });
  return Promise.all(members.map(async (m) => ({ ...m, user: await getUser(m.userId) })));
}
export async function addMember(workspaceId, userId, role = "programmer") {
  const id = `${workspaceId}__${userId}`;
  await DB.set("members", id, { id, workspaceId, userId, role, joinedAt: Date.now() });
  return id;
}
export async function setMemberRole(workspaceId, userId, role) {
  await DB.update("members", `${workspaceId}__${userId}`, { role });
}
export async function removeMember(workspaceId, userId) {
  await DB.remove("members", `${workspaceId}__${userId}`);
}
export async function getMembership(workspaceId, userId) {
  return DB.getDoc("members", `${workspaceId}__${userId}`);
}

/* ---------- Permissions ---------- */
export function roleLabel(roleId) { return roleById(roleId).name; }
export function roleColor(roleId) { return roleById(roleId).color; }
export function canDo(roleId, capName) { return can(roleId, CAPS[capName] ?? 100); }

export function roleBadge(roleId) {
  const r = roleById(roleId);
  return `<span class="chip" style="border-color:${r.color}55;color:${r.color};background:${r.color}18">${escapeHtml(r.name)}</span>`;
}

/* ---------- Presence ---------- */
export function presenceLabel(user) {
  if (!user) return "";
  if (user.online) return "Online";
  if (user.lastSeen) return "Last seen " + timeAgo(user.lastSeen);
  return "Offline";
}
export function presenceClass(user) {
  if (!user) return "";
  if (user.online) return "online";
  return user.status === "away" ? "away" : user.status === "busy" ? "busy" : "";
}

/* ---------- Rendering helpers ---------- */
export function userChip(user, { size = "sm", showRole = false } = {}) {
  if (!user) return `<span class="chip">Unknown</span>`;
  return `<span class="user-chip row gap-6">${avatarHTML(user, size)}<span class="truncate">${escapeHtml(user.displayName || user.username)}</span>${showRole ? roleBadge(user.role) : ""}</span>`;
}
export function avatarStack(users = [], max = 4) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return `<div class="avatar-stack">${shown.map(u => avatarHTML(u, "sm")).join("")}${extra > 0 ? `<div class="avatar sm more">+${extra}</div>` : ""}</div>`;
}

export { ROLES };
