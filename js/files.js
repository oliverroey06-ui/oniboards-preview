/* ============================================================
   OniSteel Studios Board — File Manager & Asset Library
   Upload, folders, previews, download, rename, move, delete,
   version history, categories, tags, search.
   ============================================================ */
import { DB, Auth, uid, backendMode } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { ASSET_CATEGORIES, fileKind } from "./constants.js";
import { icon } from "./icons.js";
import {
  $, $$, el, escapeHtml, avatarHTML, toast, openModal, confirmDialog, promptDialog,
  fmtBytes, fmtDate, timeAgo, debounce, menuFromEvent, pickFile, showMenu
} from "./ui.js";
import { cachedUser } from "./users.js";
import { logActivity, notifyMany } from "./notifications.js";

let files = [], view = "grid", category = "all", folder = "/", search = "";
const subs = [];

export async function initFilesPage() {
  setPageTitle("Files & Assets", State.workspace?.name);
  const root = $("#pageRoot");
  root.innerHTML = `
    <div class="page-head">
      <div><div class="ph-title">Files & Assets</div><div class="ph-sub" id="fileCount">Loading…</div></div>
      <div class="ph-actions">
        <div class="searchbox"><span class="s-ic">${icon("search")}</span><input id="fileSearch" placeholder="Search files"></div>
        <div class="segment" id="fileView"><button data-v="grid" class="active">${icon("grid")}</button><button data-v="list">${icon("list")}</button></div>
        <button class="btn ghost" id="newFolderBtn">${icon("folder")}<span class="hide-sm">Folder</span></button>
        <button class="btn primary" id="uploadBtn">${icon("upload")} Upload</button>
      </div>
    </div>
    <div class="files-layout">
      <aside class="files-nav" id="filesNav"></aside>
      <div class="grow">
        <div class="drop-zone" id="dropZone">
          <div id="filesGrid"></div>
        </div>
      </div>
    </div>`;

  $("#uploadBtn").onclick = () => doUpload();
  $("#newFolderBtn").onclick = newFolder;
  $("#fileSearch").addEventListener("input", debounce((e) => { search = e.target.value.toLowerCase(); render(); }, 150));
  $$("#fileView button").forEach(b => b.onclick = () => { view = b.dataset.v; $$("#fileView button").forEach(x => x.classList.toggle("active", x === b)); render(); });
  setupDropZone();

  subs.push(DB.watch("files", { where: [["workspaceId", "==", State.workspace.id]] }, (l) => { files = l; renderNav(); render(); }));
  window.addEventListener("beforeunload", () => subs.forEach(u => u && u()));

  const wantFile = new URLSearchParams(location.search).get("file");
  if (wantFile) setTimeout(() => { const f = files.find(x => x.id === wantFile); if (f) openPreview(f); }, 500);
}

function renderNav() {
  const nav = $("#filesNav");
  const folders = [...new Set(files.map(f => f.folder).filter(Boolean))];
  const catCounts = {};
  files.forEach(f => catCounts[f.category] = (catCounts[f.category] || 0) + 1);
  nav.innerHTML = `
    <div class="fn-section">
      <div class="fn-title">Library</div>
      <div class="fn-item ${category === "all" ? "active" : ""}" data-cat="all">${icon("layers")} All files <span class="dim">${files.length}</span></div>
      ${ASSET_CATEGORIES.filter(c => catCounts[c]).map(c => `<div class="fn-item ${category === c ? "active" : ""}" data-cat="${escapeHtml(c)}">${icon("tag")} ${escapeHtml(c)} <span class="dim">${catCounts[c]}</span></div>`).join("")}
    </div>
    ${folders.length ? `<div class="fn-section"><div class="fn-title">Folders</div>${folders.map(f => `<div class="fn-item ${folder === f ? "active" : ""}" data-folder="${escapeHtml(f)}">${icon("folder")} ${escapeHtml(f.replace(/^\//, "") || "Root")}</div>`).join("")}</div>` : ""}
    <div class="fn-storage"><div class="dim tiny">${backendMode() === "firebase" ? "Firebase Storage" : "Local demo storage"}</div><div class="strong small">${fmtBytes(files.reduce((s, f) => s + (f.size || 0), 0))} used</div></div>`;
  $$(".fn-item", nav).forEach(it => it.onclick = () => { if (it.dataset.cat) { category = it.dataset.cat; folder = "/all"; } if (it.dataset.folder) { folder = it.dataset.folder; category = "all"; } renderNav(); render(); });
}

function render() {
  const grid = $("#filesGrid"); if (!grid) return;
  let list = files.filter(f => {
    if (category !== "all" && f.category !== category) return false;
    if (folder !== "/" && folder !== "/all" && f.folder !== folder) return false;
    if (search && !f.name.toLowerCase().includes(search)) return false;
    return true;
  }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  $("#fileCount").textContent = `${files.length} files · ${fmtBytes(files.reduce((s, f) => s + (f.size || 0), 0))}`;

  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="padding:60px 20px"><div class="em-ic">${icon("folder")}</div><h3>No files here</h3><p>Drag & drop files anywhere, or click Upload.</p><button class="btn primary" onclick="document.getElementById('uploadBtn').click()">${icon("upload")} Upload files</button></div>`;
    return;
  }

  if (view === "list") { renderList(grid, list); return; }
  grid.className = "file-grid";
  grid.innerHTML = list.map(f => {
    const k = fileKind(f.name);
    const isImg = k.kind === "image" && f.url;
    const uploader = cachedUser(f.uploadedBy);
    return `<div class="file-card" data-id="${f.id}">
      <div class="fc-preview" style="${isImg ? "" : `background:${k.color}18`}">
        ${isImg ? `<img src="${escapeHtml(f.url)}" alt="" loading="lazy">` : `<span class="fc-ic" style="color:${k.color}">${icon(k.icon)}</span>`}
        <span class="fc-ext">${escapeHtml(k.ext || "file")}</span>
        <button class="iconbtn sm fc-menu" data-menu="${f.id}">${icon("more-horizontal")}</button>
      </div>
      <div class="fc-body">
        <div class="fc-name truncate" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
        <div class="fc-meta"><span>${fmtBytes(f.size || 0)}</span><span class="dot-sep"></span><span>${timeAgo(f.createdAt)}</span></div>
      </div>
    </div>`;
  }).join("");
  $$(".file-card", grid).forEach(c => c.onclick = (e) => { if (e.target.closest("button")) return; openPreview(files.find(f => f.id === c.dataset.id)); });
  $$("[data-menu]", grid).forEach(b => b.onclick = (e) => { e.stopPropagation(); fileMenu(e, files.find(f => f.id === b.dataset.menu)); });
}
function renderList(grid, list) {
  grid.className = "file-list";
  grid.innerHTML = `<table class="list-table"><thead><tr><th>Name</th><th>Category</th><th>Size</th><th>Uploaded by</th><th>Date</th><th></th></tr></thead><tbody>
    ${list.map(f => { const k = fileKind(f.name); const u = cachedUser(f.uploadedBy); return `<tr data-id="${f.id}">
      <td class="fl-name"><span class="fl-ic" style="color:${k.color}">${icon(k.icon)}</span><span class="truncate">${escapeHtml(f.name)}</span></td>
      <td><span class="chip">${escapeHtml(f.category || "—")}</span></td>
      <td class="dim small">${fmtBytes(f.size || 0)}</td>
      <td>${u ? `<span class="row gap-6">${avatarHTML(u, "xs")}<span class="small">${escapeHtml(u.displayName)}</span></span>` : "—"}</td>
      <td class="dim small">${fmtDate(f.createdAt)}</td>
      <td><button class="iconbtn sm" data-menu="${f.id}">${icon("more-horizontal")}</button></td>
    </tr>`; }).join("")}</tbody></table>`;
  $$("tr[data-id]", grid).forEach(tr => tr.onclick = (e) => { if (e.target.closest("button")) return; openPreview(files.find(f => f.id === tr.dataset.id)); });
  $$("[data-menu]", grid).forEach(b => b.onclick = (e) => { e.stopPropagation(); fileMenu(e, files.find(f => f.id === b.dataset.menu)); });
}

/* ---------- Upload ---------- */
async function doUpload(fileList) {
  const list = fileList || await pickFile({ multiple: true });
  if (!list) return;
  const arr = Array.isArray(list) ? list : [list];
  for (const file of arr) await uploadOne(file);
}
async function uploadOne(file) {
  const t = toast(`Uploading ${file.name}…`, "info", 60000);
  try {
    const path = `workspaces/${State.workspace.id}/files/${Date.now()}_${file.name}`;
    const res = await DB.uploadFile(path, file);
    const k = fileKind(file.name);
    const cat = { image: "Concept Art", model: "Models", audio: "Audio", video: "Documents", design: "Concept Art", code: "Scripts", doc: "Documents", archive: "Documents", engine: "Scripts" }[k.kind] || "Documents";
    const id = uid("fil");
    await DB.set("files", id, {
      id, workspaceId: State.workspace.id, name: file.name, size: file.size, url: res.url,
      folder: folder === "/all" ? "/" : folder, category: cat, uploadedBy: Auth.current().id,
      createdAt: Date.now(), versions: [{ v: 1, size: file.size, at: Date.now(), by: Auth.current().id }], tags: []
    });
    logActivity(State.workspace.id, { verb: "uploaded", actorId: Auth.current().id, target: file.name });
    notifyMany(State.members.map(m => m.userId).filter(u => u !== Auth.current().id).slice(0, 5), { type: "file_uploaded", title: "New file uploaded", body: file.name, actorId: Auth.current().id, link: `files.html?file=${id}` });
    t.close(); toast(`${file.name} uploaded`, "success");
  } catch (e) { t.close(); toast(`Upload failed: ${file.name}`, "error"); }
}
function setupDropZone() {
  const zone = $("#dropZone");
  ["dragenter", "dragover"].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag-active"); }));
  ["dragleave", "drop"].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || !zone.contains(e.relatedTarget)) zone.classList.remove("drag-active"); }));
  zone.addEventListener("drop", (e) => { const files = [...(e.dataTransfer?.files || [])]; if (files.length) doUpload(files); });
}
async function newFolder() {
  const name = await promptDialog({ title: "New Folder", label: "Folder name", placeholder: "e.g. characters" });
  if (!name) return;
  folder = "/" + name.replace(/^\//, "");
  toast(`Folder "${name}" ready — upload files to fill it.`, "success");
  renderNav();
}

/* ---------- File menu ---------- */
function fileMenu(e, f) {
  menuFromEvent(e, [
    { label: "Preview", icon: "eye", onClick: () => openPreview(f) },
    { label: "Download", icon: "download", onClick: () => downloadFile(f) },
    { label: "Rename", icon: "edit-3", onClick: async () => { const n = await promptDialog({ title: "Rename file", value: f.name }); if (n) DB.update("files", f.id, { name: n }); } },
    { label: "Move to category", icon: "move", onClick: (ev) => showMenu(e.clientX, e.clientY, ASSET_CATEGORIES.map(c => ({ label: c, checked: c === f.category, onClick: () => DB.update("files", f.id, { category: c }) }))) },
    { label: "Add tag", icon: "tag", onClick: async () => { const t = await promptDialog({ title: "Add tag", label: "Tag" }); if (t) DB.update("files", f.id, { tags: [...new Set([...(f.tags || []), t])] }); } },
    "sep",
    { label: "Delete", icon: "trash-2", danger: true, onClick: async () => { if (await confirmDialog({ title: "Delete file?", message: f.name, danger: true, confirmText: "Delete" })) DB.remove("files", f.id); } }
  ]);
}
function downloadFile(f) {
  if (!f.url) { toast("This is a placeholder file (no binary in demo seed).", "info"); return; }
  const a = el("a", { href: f.url, download: f.name, target: "_blank" });
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Preview ---------- */
function openPreview(f) {
  if (!f) return;
  const k = fileKind(f.name);
  const uploader = cachedUser(f.uploadedBy);
  const body = el("div", {});
  const previewHTML = k.kind === "image" && f.url ? `<img src="${escapeHtml(f.url)}" alt="" class="preview-media">`
    : k.kind === "video" && f.url ? `<video src="${escapeHtml(f.url)}" controls class="preview-media"></video>`
    : k.kind === "audio" && f.url ? `<div class="preview-audio">${icon("music")}<audio src="${escapeHtml(f.url)}" controls></audio></div>`
    : `<div class="preview-placeholder" style="color:${k.color}">${icon(k.icon)}<div class="dim small mt-8">${escapeHtml(k.ext.toUpperCase())} file · preview not available</div></div>`;
  body.innerHTML = `
    <div class="preview-stage">${previewHTML}</div>
    <div class="preview-info">
      <div class="row between"><div><div class="strong">${escapeHtml(f.name)}</div><div class="dim small">${fmtBytes(f.size || 0)} · ${escapeHtml(f.category || "")}</div></div></div>
      <div class="row gap-8 mt-12">${uploader ? avatarHTML(uploader, "sm") : ""}<div class="grow"><div class="small">Uploaded by ${escapeHtml(uploader?.displayName || "—")}</div><div class="dim tiny">${fmtDate(f.createdAt)}</div></div></div>
      ${(f.tags || []).length ? `<div class="row gap-6 mt-12 wrap">${f.tags.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      ${(f.versions || []).length ? `<div class="mt-16"><div class="panel-title mb-8">Version history</div>${f.versions.map((v, i) => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>v${v.v || (f.versions.length - i)}</span><span class="dim">${fmtBytes(v.size || 0)} · ${timeAgo(v.at)}</span></div>`).join("")}</div>` : ""}
    </div>`;
  const foot = el("div", {});
  const m = openModal({ title: "File Preview", size: "lg", body, footer: foot });
  foot.append(
    el("button", { class: "btn ghost", onClick: async () => { const n = await promptDialog({ title: "Rename", value: f.name }); if (n) { DB.update("files", f.id, { name: n }); m.close(); } } }, "Rename"),
    el("button", { class: "btn ghost", onClick: () => uploadNewVersion(f, m) }, "Upload new version"),
    el("button", { class: "btn primary", onClick: () => downloadFile(f) }, "Download")
  );
}
async function uploadNewVersion(f, m) {
  const file = await pickFile({});
  if (!file) return;
  const path = `workspaces/${State.workspace.id}/files/${Date.now()}_${file.name}`;
  const res = await DB.uploadFile(path, file);
  const versions = [{ v: (f.versions?.length || 0) + 1, size: file.size, at: Date.now(), by: Auth.current().id }, ...(f.versions || [])];
  await DB.update("files", f.id, { url: res.url, size: file.size, versions });
  toast("New version uploaded", "success");
  m.close();
}
