/* ============================================================
   OniSteel Studios Board — Settings
   Account · Appearance · Notifications · Accessibility ·
   Language · Storage · Permissions
   ============================================================ */
import { DB, Auth, backendMode, friendlyAuthError } from "./store.js";
import { State, Settings, setPageTitle, applyTheme } from "./app.js";
import { LANGUAGES, WS_COLORS } from "./constants.js";
import { icon } from "./icons.js";
import { $, $$, el, escapeHtml, toast, openModal, confirmDialog, avatarHTML, promptDialog } from "./ui.js";
import { requestBrowserNotify } from "./notifications.js";

const TABS = [
  { id: "account", label: "Account", icon: "user" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "accessibility", label: "Accessibility", icon: "eye" },
  { id: "language", label: "Language", icon: "globe" },
  { id: "storage", label: "Storage & Data", icon: "database" }
];

export async function initSettingsPage() {
  setPageTitle("Settings", "Preferences");
  const root = $("#pageRoot");
  root.innerHTML = `
    <div class="settings-shell">
      <div class="settings-nav" id="settingsNav">
        ${TABS.map((t, i) => `<button class="set-nav-item ${i === 0 ? "active" : ""}" data-t="${t.id}">${icon(t.icon)}<span>${t.label}</span></button>`).join("")}
      </div>
      <div class="settings-body" id="settingsBody"></div>
    </div>`;
  $$(".set-nav-item").forEach(b => b.onclick = () => { $$(".set-nav-item").forEach(x => x.classList.remove("active")); b.classList.add("active"); renderTab(b.dataset.t); });
  const initial = new URLSearchParams(location.search).get("tab") || "account";
  const btn = $(`.set-nav-item[data-t="${initial}"]`); if (btn) { $$(".set-nav-item").forEach(x => x.classList.remove("active")); btn.classList.add("active"); }
  renderTab(initial);
}

function renderTab(tab) {
  const body = $("#settingsBody");
  ({ account: accountTab, appearance: appearanceTab, notifications: notifTab, accessibility: a11yTab, language: langTab, storage: storageTab }[tab] || accountTab)(body);
}

/* ---------- Account ---------- */
function accountTab(body) {
  const u = State.user;
  body.innerHTML = `
    <div class="set-section">
      <h2>Account</h2>
      <div class="set-profile-row">
        ${avatarHTML(u, "xl")}
        <div class="grow">
          <div class="strong">${escapeHtml(u.displayName)}</div>
          <div class="dim small">${escapeHtml(u.email)}</div>
          <div class="row gap-8 mt-8"><span class="badge ${u.emailVerified ? "success" : "warning"}">${u.emailVerified ? "Verified" : "Unverified"}</span>${!u.emailVerified ? `<button class="btn link sm" id="verifyBtn">Verify email</button>` : ""}</div>
        </div>
        <a class="btn ghost sm" href="profile.html?u=${u.id}">${icon("user")} View profile</a>
      </div>
      <div class="set-field"><label>Display name</label><input class="input" id="acName" value="${escapeHtml(u.displayName)}"></div>
      <div class="set-field"><label>Username</label><input class="input" id="acUser" value="${escapeHtml(u.username || "")}"></div>
      <div class="set-field"><label>Email</label><input class="input" value="${escapeHtml(u.email)}" disabled><div class="hint">Email can't be changed in this build.</div></div>
      <button class="btn primary" id="acSave">Save changes</button>
    </div>
    <div class="set-section">
      <h2>Security</h2>
      <div class="set-field"><label>Password</label><button class="btn ghost" id="changePw">${icon("key")} Change password</button></div>
    </div>
    <div class="set-section danger-zone">
      <div class="dz-title">${icon("alert-triangle")} Danger zone</div>
      <p class="dim small mb-12">Permanently delete your account and remove your data.</p>
      <button class="btn danger" id="deleteAcc">Delete my account</button>
    </div>`;
  const vb = $("#verifyBtn"); if (vb) vb.onclick = async () => { await Auth.sendVerification(); toast(backendMode() === "firebase" ? "Verification email sent" : "Email verified (demo)", "success"); setTimeout(() => location.reload(), 800); };
  $("#acSave").onclick = async () => { await Auth.updateProfile({ displayName: $("#acName").value.trim(), username: $("#acUser").value.trim().toLowerCase().replace(/\s+/g, "") }); toast("Saved", "success"); };
  $("#changePw").onclick = changePassword;
  $("#deleteAcc").onclick = async () => {
    if (await confirmDialog({ title: "Delete account?", message: "This permanently deletes your account and sign-in. This cannot be undone.", danger: true, confirmText: "Delete account" })) {
      try { await Auth.deleteAccount(); location.href = "index.html"; } catch (e) { toast(friendlyAuthError(e), "error"); }
    }
  };
}
function changePassword() {
  const body = el("div", {});
  body.innerHTML = `
    <div class="field"><label>Current password</label><input class="input" id="cpCur" type="password"></div>
    <div class="field"><label>New password</label><input class="input" id="cpNew" type="password"></div>
    <div class="field"><label>Confirm new password</label><input class="input" id="cpConf" type="password"></div>
    <div class="field-error" id="cpErr"></div>`;
  const foot = el("div", {});
  const m = openModal({ title: "Change password", icon: "key", size: "sm", body, footer: foot });
  foot.append(el("button", { class: "btn ghost", onClick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onClick: async () => {
      const cur = $("#cpCur", body).value, np = $("#cpNew", body).value, cf = $("#cpConf", body).value;
      if (np.length < 6) return $("#cpErr", body).textContent = "New password must be 6+ characters.";
      if (np !== cf) return $("#cpErr", body).textContent = "Passwords don't match.";
      try { await Auth.changePassword(cur, np); toast("Password changed", "success"); m.close(); } catch (e) { $("#cpErr", body).textContent = friendlyAuthError(e); }
    } }, "Update password"));
}

/* ---------- Appearance ---------- */
function appearanceTab(body) {
  const s = Settings.all();
  body.innerHTML = `
    <div class="set-section">
      <h2>Appearance</h2>
      <div class="set-field"><label>Theme</label>
        <div class="theme-picker">
          <button class="theme-opt ${s.theme !== "light" ? "on" : ""}" data-theme="dark"><div class="tp-preview dark"></div>Dark</button>
          <button class="theme-opt ${s.theme === "light" ? "on" : ""}" data-theme="light"><div class="tp-preview light"></div>Light</button>
        </div>
      </div>
      <div class="set-field"><label>Accent color</label><div class="color-row" id="accentRow">${["#4D6B91","#C12A2A","#8A6BD1","#3FB98A","#E6A23C","#4D8F91","#D16B9E"].map(c=>`<button class="swatch ${(s.accent||"#4D6B91")===c?"on":""}" data-c="${c}" style="background:${c}"></button>`).join("")}</div></div>
      <label class="set-toggle"><div><div class="strong">Compact mode</div><div class="dim small">Denser spacing across the app</div></div><span class="switch"><input type="checkbox" id="setCompact" ${s.compact?"checked":""}><span class="track"></span></span></label>
    </div>`;
  $$(".theme-opt", body).forEach(b => b.onclick = () => { $$(".theme-opt", body).forEach(x => x.classList.remove("on")); b.classList.add("on"); Settings.set("theme", b.dataset.theme); toast("Theme updated", "success"); });
  $$("#accentRow .swatch", body).forEach(sw => sw.onclick = () => { $$("#accentRow .swatch", body).forEach(x => x.classList.remove("on")); sw.classList.add("on"); Settings.set("accent", sw.dataset.c); });
  $("#setCompact", body).onchange = (e) => { Settings.set("compact", e.target.checked); document.body.classList.toggle("compact", e.target.checked); };
}

/* ---------- Notifications ---------- */
function notifTab(body) {
  const s = Settings.get("notifs", {});
  const types = [
    ["task_assigned", "Task assigned to me"], ["task_completed", "Task completed"], ["mention", "Mentions"],
    ["comment", "Comments & replies"], ["deadline", "Deadline reminders"], ["overdue", "Overdue alerts"],
    ["file_uploaded", "File uploads"], ["invite", "Workspace invites"], ["update", "Project updates"]
  ];
  body.innerHTML = `
    <div class="set-section">
      <h2>Notifications</h2>
      <label class="set-toggle"><div><div class="strong">Browser notifications</div><div class="dim small">Get desktop alerts even when the tab is in the background</div></div><span class="switch"><input type="checkbox" id="browserNotif" ${s.browser?"checked":""}><span class="track"></span></span></label>
      <div class="hr"></div>
      <div class="dim small mb-12">Choose which events notify you.</div>
      ${types.map(([k, label]) => `<label class="set-toggle sm"><span>${escapeHtml(label)}</span><span class="switch"><input type="checkbox" data-nt="${k}" ${s[k] !== false ? "checked" : ""}><span class="track"></span></span></label>`).join("")}
    </div>`;
  $("#browserNotif", body).onchange = (e) => { if (e.target.checked) requestBrowserNotify(); const n = Settings.get("notifs", {}); n.browser = e.target.checked; Settings.set("notifs", n); };
  $$("[data-nt]", body).forEach(t => t.onchange = () => { const n = Settings.get("notifs", {}); n[t.dataset.nt] = t.checked; Settings.set("notifs", n); toast("Preference saved", "success", 1200); });
}

/* ---------- Accessibility ---------- */
function a11yTab(body) {
  const s = Settings.all();
  body.innerHTML = `
    <div class="set-section">
      <h2>Accessibility</h2>
      <label class="set-toggle"><div><div class="strong">High contrast</div><div class="dim small">Stronger borders and text contrast</div></div><span class="switch"><input type="checkbox" id="setContrast" ${s.highContrast?"checked":""}><span class="track"></span></span></label>
      <label class="set-toggle"><div><div class="strong">Reduce motion</div><div class="dim small">Minimize animations and transitions</div></div><span class="switch"><input type="checkbox" id="setMotion" ${s.reducedMotion?"checked":""}><span class="track"></span></span></label>
      <div class="set-field"><label>Text size</label>
        <div class="segment" id="fontSeg">
          <button data-f="small" class="${s.fontSize==="small"?"active":""}">Small</button>
          <button data-f="normal" class="${!s.fontSize||s.fontSize==="normal"?"active":""}">Normal</button>
          <button data-f="large" class="${s.fontSize==="large"?"active":""}">Large</button>
        </div>
      </div>
    </div>`;
  $("#setContrast", body).onchange = (e) => Settings.set("highContrast", e.target.checked);
  $("#setMotion", body).onchange = (e) => Settings.set("reducedMotion", e.target.checked);
  $$("#fontSeg button", body).forEach(b => b.onclick = () => { $$("#fontSeg button", body).forEach(x => x.classList.remove("active")); b.classList.add("active"); Settings.set("fontSize", b.dataset.f); document.documentElement.style.fontSize = { small: "14px", normal: "16px", large: "18px" }[b.dataset.f]; });
}

/* ---------- Language ---------- */
function langTab(body) {
  const cur = Settings.get("language", "en");
  body.innerHTML = `
    <div class="set-section">
      <h2>Language & Region</h2>
      <div class="set-field"><label>Display language</label><select class="select" id="langSel">${LANGUAGES.map(l => `<option value="${l.id}" ${l.id === cur ? "selected" : ""}>${l.name}</option>`).join("")}</select><div class="hint">Interface language preference (UI strings ship in English in this build).</div></div>
      <div class="set-field"><label>Date format</label><select class="select" id="dateFmt"><option>Automatic (locale)</option><option>MM/DD/YYYY</option><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option></select></div>
      <div class="set-field"><label>Week starts on</label><div class="segment"><button class="active">Sunday</button><button>Monday</button></div></div>
    </div>`;
  $("#langSel", body).onchange = (e) => { Settings.set("language", e.target.value); toast("Language preference saved", "success"); };
}

/* ---------- Storage ---------- */
async function storageTab(body) {
  const mode = backendMode();
  let usage = "—", quota = "—", pct = 0;
  try { if (navigator.storage && navigator.storage.estimate) { const est = await navigator.storage.estimate(); usage = fmt(est.usage); quota = fmt(est.quota); pct = Math.round(est.usage / est.quota * 100); } } catch {}
  const wsId = State.workspace.id;
  const [tasks, files, msgs] = await Promise.all([
    DB.list("tasks", { where: [["workspaceId", "==", wsId]] }),
    DB.list("files", { where: [["workspaceId", "==", wsId]] }),
    DB.list("messages", { where: [["workspaceId", "==", wsId]] })
  ]);
  const totalFileSize = files.reduce((s, f) => s + (f.size || 0), 0);
  body.innerHTML = `
    <div class="set-section">
      <h2>Storage & Data</h2>
      <div class="storage-card">
        <div class="row between"><div class="strong">Backend</div><span class="badge ${mode==="firebase"?"success":"steel"}">${mode === "firebase" ? "Firebase Cloud" : "Local Demo"}</span></div>
        <p class="dim small mt-8">${mode === "firebase" ? "Your data syncs in realtime across all devices via Firestore." : "Data is stored in this browser. Add your Firebase config in js/firebase.js to enable cloud sync across devices."}</p>
      </div>
      <div class="storage-usage">
        <div class="row between mb-8"><span class="dim small">Device storage used</span><span class="strong">${usage} / ${quota}</span></div>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
      <div class="storage-breakdown">
        ${sbRow("check-square", "Tasks", tasks.length)}
        ${sbRow("folder", "Files", `${files.length} · ${fmt(totalFileSize)}`)}
        ${sbRow("message-square", "Messages", msgs.length)}
      </div>
      <div class="row gap-8 mt-16">
        <button class="btn ghost" id="clearCache">${icon("refresh-cw")} Clear local cache</button>
      </div>
    </div>`;
  $("#clearCache", body).onclick = async () => { if (await confirmDialog({ title: "Clear local cache?", message: "Reloads the app. Cloud data is safe; local demo data persists in localStorage.", confirmText: "Clear cache" })) { if ("caches" in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } toast("Cache cleared", "success"); setTimeout(() => location.reload(), 600); } };
}
function sbRow(ic, label, val) { return `<div class="sb-row"><span class="sb-ic">${icon(ic)}</span><span class="grow">${escapeHtml(label)}</span><span class="strong">${escapeHtml(String(val))}</span></div>`; }
function fmt(b) { if (!b) return "0 B"; const u = ["B","KB","MB","GB"]; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return b.toFixed(1) + " " + u[i]; }
