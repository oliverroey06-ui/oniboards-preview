/* ============================================================
   OniSteel Studios Board — Wiki / Documentation
   Markdown pages, images, tables, code blocks, version history.
   ============================================================ */
import { DB, Auth, uid } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { icon } from "./icons.js";
import {
  $, $$, el, escapeHtml, avatarHTML, toast, openModal, confirmDialog, promptDialog,
  renderMarkdown, fmtDateTime, timeAgo, debounce, menuFromEvent
} from "./ui.js";
import { cachedUser } from "./users.js";
import { logActivity } from "./notifications.js";

let docs = [], active = null, editing = false;
const subs = [];

export async function initDocsPage() {
  setPageTitle("Wiki", State.workspace?.name);
  const root = $("#pageRoot");
  root.closest(".content-pad").style.padding = "0";
  root.style.height = "100%";
  root.innerHTML = `
    <div class="docs-shell">
      <div class="docs-sidebar">
        <div class="ds-head">
          <div class="searchbox"><span class="s-ic">${icon("search")}</span><input id="docSearch" placeholder="Search wiki"></div>
          <button class="btn primary sm block mt-8" id="newDoc">${icon("plus")} New page</button>
        </div>
        <div class="ds-list" id="docList"></div>
      </div>
      <div class="docs-main" id="docsMain"></div>
    </div>`;

  $("#newDoc").onclick = createDoc;
  $("#docSearch").addEventListener("input", debounce((e) => renderList(e.target.value.toLowerCase()), 150));

  subs.push(DB.watch("docs", { where: [["workspaceId", "==", State.workspace.id]] }, (l) => {
    docs = l.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
    renderList();
    const want = new URLSearchParams(location.search).get("doc");
    if (!active && docs.length) openDoc(want && docs.find(d => d.id === want) ? want : docs[0].id);
    else if (active) { const cur = docs.find(d => d.id === active); if (cur && !editing) openDoc(active); }
  }));
  window.addEventListener("beforeunload", () => subs.forEach(u => u && u()));
}

function renderList(q = "") {
  const list = $("#docList"); if (!list) return;
  const filtered = docs.filter(d => !q || d.title.toLowerCase().includes(q) || (d.content || "").toLowerCase().includes(q));
  if (!filtered.length) { list.innerHTML = `<div class="dim small" style="padding:16px">No pages found.</div>`; return; }
  list.innerHTML = filtered.map(d => `
    <div class="doc-item ${d.id === active ? "active" : ""}" data-id="${d.id}">
      ${d.pinned ? `<span class="di-pin">${icon("pin")}</span>` : `<span class="di-ic">${icon("file-text")}</span>`}
      <div class="grow"><div class="truncate strong small">${escapeHtml(d.title)}</div><div class="dim tiny">${timeAgo(d.updatedAt || d.createdAt)}</div></div>
    </div>`).join("");
  $$(".doc-item", list).forEach(it => it.onclick = () => openDoc(it.dataset.id));
}

async function openDoc(id) {
  active = id; editing = false;
  history.replaceState(null, "", `docs.html?doc=${id}`);
  const d = docs.find(x => x.id === id) || await DB.getDoc("docs", id);
  if (!d) return;
  renderList($("#docSearch")?.value?.toLowerCase() || "");
  const author = cachedUser(d.authorId);
  const main = $("#docsMain");
  main.innerHTML = `
    <div class="doc-header">
      <div class="grow"><h1 class="doc-title">${escapeHtml(d.title)}</h1>
        <div class="doc-meta">${author ? avatarHTML(author, "xs") : ""}<span class="dim small">Updated ${fmtDateTime(d.updatedAt || d.createdAt)}</span>${(d.versions || []).length ? `<span class="dim small">· ${d.versions.length} version${d.versions.length > 1 ? "s" : ""}</span>` : ""}</div>
      </div>
      <div class="row gap-6">
        <button class="iconbtn" id="docPin" data-tip="${d.pinned ? "Unpin" : "Pin"}">${icon("pin")}</button>
        <button class="iconbtn" id="docHistory" data-tip="History">${icon("refresh-cw")}</button>
        <button class="btn ghost sm" id="docEdit">${icon("edit-3")} Edit</button>
        <button class="iconbtn" id="docMore">${icon("more-vertical")}</button>
      </div>
    </div>
    <div class="doc-content rich" id="docContent">${renderMarkdown(d.content || "*This page is empty. Click Edit to add content.*")}</div>`;
  $("#docEdit").onclick = () => editDoc(d);
  $("#docPin").onclick = () => DB.update("docs", id, { pinned: !d.pinned });
  $("#docHistory").onclick = () => showHistory(d);
  $("#docMore").onclick = (e) => menuFromEvent(e, [
    { label: "Rename", icon: "edit-3", onClick: async () => { const t = await promptDialog({ title: "Rename page", value: d.title }); if (t) DB.update("docs", id, { title: t }); } },
    { label: "Duplicate", icon: "copy", onClick: async () => { const nid = uid("doc"); await DB.set("docs", nid, { ...d, id: nid, title: d.title + " (copy)", createdAt: Date.now() }); toast("Duplicated", "success"); openDoc(nid); } },
    "sep",
    { label: "Delete", icon: "trash-2", danger: true, onClick: async () => { if (await confirmDialog({ title: "Delete page?", message: d.title, danger: true, confirmText: "Delete" })) { await DB.remove("docs", id); active = null; toast("Page deleted", "success"); } } }
  ]);
}

function editDoc(d) {
  editing = true;
  const main = $("#docsMain");
  main.innerHTML = `
    <div class="doc-header">
      <input class="doc-title-edit" id="editTitle" value="${escapeHtml(d.title)}">
      <div class="row gap-6">
        <button class="btn ghost sm" id="cancelEdit">Cancel</button>
        <button class="btn primary sm" id="saveEdit">${icon("save")} Save</button>
      </div>
    </div>
    <div class="doc-edit-split">
      <div class="doc-editor-pane">
        <div class="md-toolbar" id="mdToolbar"></div>
        <textarea class="doc-editor" id="editContent" placeholder="Write in Markdown…&#10;&#10;# Heading&#10;**bold**  *italic*  \`code\`&#10;- list item&#10;| table | header |">${escapeHtml(d.content || "")}</textarea>
      </div>
      <div class="doc-preview rich" id="editPreview"></div>
    </div>`;
  const ta = $("#editContent");
  const preview = () => $("#editPreview").innerHTML = renderMarkdown(ta.value);
  ta.addEventListener("input", debounce(preview, 150));
  preview();
  // markdown toolbar
  const tools = [["type", "# "], ["bold", "**", "**"], ["italic", "*", "*"], ["list", "- "], ["code", "```\n", "\n```"], ["link", "[text](url)"], ["hash", "| A | B |\n|---|---|\n| 1 | 2 |"]];
  $("#mdToolbar").innerHTML = tools.map((t, i) => `<button class="rte-btn" data-i="${i}">${icon(t[0])}</button>`).join("");
  $$("#mdToolbar .rte-btn").forEach(b => b.onclick = () => {
    const [, pre, post = ""] = tools[+b.dataset.i];
    const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e);
    ta.value = ta.value.slice(0, s) + pre + sel + post + ta.value.slice(e);
    ta.focus(); preview();
  });
  $("#cancelEdit").onclick = () => { editing = false; openDoc(d.id); };
  $("#saveEdit").onclick = async () => {
    const title = $("#editTitle").value.trim() || d.title;
    const content = ta.value;
    const versions = [...(d.versions || [])];
    if (content !== d.content) versions.unshift({ content: d.content || "", at: d.updatedAt || d.createdAt, by: d.authorId });
    await DB.update("docs", d.id, { title, content, versions: versions.slice(0, 20), authorId: Auth.current().id });
    logActivity(State.workspace.id, { verb: "updated", actorId: Auth.current().id, target: title, targetType: "wiki" });
    editing = false;
    toast("Saved", "success");
    openDoc(d.id);
  };
}

async function createDoc() {
  const title = await promptDialog({ title: "New Wiki Page", label: "Page title", placeholder: "e.g. Combat Design", confirmText: "Create" });
  if (!title) return;
  const id = uid("doc");
  await DB.set("docs", id, { id, workspaceId: State.workspace.id, title, content: `# ${title}\n\nStart writing…`, authorId: Auth.current().id, pinned: false, versions: [], createdAt: Date.now() });
  openDoc(id);
  setTimeout(() => { const d = docs.find(x => x.id === id); if (d) editDoc(d); }, 300);
}

function showHistory(d) {
  const versions = d.versions || [];
  const body = el("div", {});
  body.innerHTML = versions.length ? versions.map((v, i) => {
    const u = cachedUser(v.by);
    return `<div class="version-row"><div class="grow"><div class="strong small">Version ${versions.length - i}</div><div class="dim tiny">${fmtDateTime(v.at)} ${u ? "· " + escapeHtml(u.displayName) : ""}</div></div><button class="btn ghost sm" data-restore="${i}">Restore</button></div>`;
  }).join("") : `<div class="empty" style="padding:20px"><p>No previous versions yet.</p></div>`;
  const m = openModal({ title: "Version History", icon: "refresh-cw", size: "sm", body });
  $$("[data-restore]", body).forEach(b => b.onclick = async () => {
    const v = versions[+b.dataset.restore];
    if (await confirmDialog({ title: "Restore version?", message: "Current content will be saved as a new version.", confirmText: "Restore" })) {
      const newVersions = [{ content: d.content, at: d.updatedAt, by: d.authorId }, ...versions];
      await DB.update("docs", d.id, { content: v.content, versions: newVersions.slice(0, 20) });
      m.close(); toast("Version restored", "success"); openDoc(d.id);
    }
  });
}
