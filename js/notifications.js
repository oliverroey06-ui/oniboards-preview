/* ============================================================
   OniSteel Studios Board — Notifications & Activity Feed
   ============================================================ */
import { DB, Auth, uid } from "./store.js";
import { NOTIF_TYPES, ACTIVITY_VERBS } from "./constants.js";
import { icon } from "./icons.js";
import { escapeHtml, timeAgo, toast } from "./ui.js";

/* ---------- Create notifications ---------- */
export async function notify(userId, { type, title, body = "", link = "", actorId = "", meta = {} }) {
  if (!userId) return;
  const me = Auth.current();
  if (me && userId === me.uid && type !== "deadline" && type !== "overdue") {
    // don't notify self for own actions (except reminders)
    if (actorId === me.uid) return;
  }
  await DB.add("notifications", {
    id: uid("ntf"), userId, type, title, body, link, actorId, meta,
    read: false, createdAt: Date.now()
  });
}
export async function notifyMany(userIds = [], payload) {
  const unique = [...new Set(userIds.filter(Boolean))];
  await Promise.all(unique.map(u => notify(u, payload)));
}

/* ---------- Subscribe ---------- */
export function watchNotifications(userId, cb) {
  return DB.watch("notifications",
    { where: [["userId", "==", userId]], orderBy: ["createdAt", "desc"], limit: 60 }, cb);
}
export async function markRead(notifId) { await DB.update("notifications", notifId, { read: true }); }
export async function markAllRead(userId) {
  const list = await DB.list("notifications", { where: [["userId", "==", userId], ["read", "==", false]] });
  await DB.batch(list.map(n => ({ type: "update", collection: "notifications", id: n.id, data: { read: true } })));
}
export async function clearNotification(notifId) { await DB.remove("notifications", notifId); }

/* ---------- Browser notifications ---------- */
export function requestBrowserNotify() {
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
}
export function browserNotify(title, body, link) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "assets/images/favicon.svg" });
    if (link) n.onclick = () => { window.focus(); location.href = link; };
  } catch {}
}

/* ---------- Render a notification row ---------- */
export function notifRow(n, actor) {
  const meta = NOTIF_TYPES[n.type] || { icon: "bell", label: n.type };
  return `
    <div class="notif-row ${n.read ? "" : "unread"}" data-id="${n.id}" data-link="${escapeHtml(n.link || "")}">
      <div class="nr-ic type-${n.type}">${icon(meta.icon)}</div>
      <div class="grow">
        <div class="nr-title">${escapeHtml(n.title)}</div>
        ${n.body ? `<div class="nr-body">${escapeHtml(n.body)}</div>` : ""}
        <div class="nr-time">${timeAgo(n.createdAt)}</div>
      </div>
      ${n.read ? "" : `<span class="nr-dot"></span>`}
    </div>`;
}

/* ---------- Activity feed ---------- */
export async function logActivity(workspaceId, { verb, actorId, target = "", targetType = "", boardId = "", link = "", meta = {} }) {
  await DB.add("activity", {
    id: uid("act"), workspaceId, verb, actorId, target, targetType, boardId, link, meta,
    createdAt: Date.now()
  });
}
export function watchActivity(workspaceId, cb, limit = 40) {
  return DB.watch("activity",
    { where: [["workspaceId", "==", workspaceId]], orderBy: ["createdAt", "desc"], limit }, cb);
}
export function activityText(a, actor) {
  const verb = ACTIVITY_VERBS[a.verb] || a.verb;
  const who = actor ? (actor.displayName || actor.username) : "Someone";
  return `<strong>${escapeHtml(who)}</strong> ${escapeHtml(verb)} ${a.target ? `<span class="c-steel">${escapeHtml(a.target)}</span>` : ""}`;
}
