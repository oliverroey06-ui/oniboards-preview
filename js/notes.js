/* ============================================================
   OniSteel Studios Board — Notes
   Private / shared / pinned notes, folders, search.
   ============================================================ */
import { DB, Auth, uid } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { icon } from "./icons.js";
import {
  $, $$, el, escapeHtml, toast, openModal, confirmDialog, promptDialog, renderMarkdown,
  timeAgo, debounce, menuFromEvent
} from "./ui.js";
import { createRichEditor } from "./editor.js";

let notes = [], filter = "all", folder = "all", search = "";
const subs = [];
const NOTE_COLORS = ["#1A1A1C", "#2A2130", "#22282F", "#2A2620", "#20302A", "#2E2222"];

export async function initNotesPage() {
  setPageTitle("Notes", State.workspace?.name);
  const root = $("#pageRoot");
  root.innerHTML = `
    <div class="page-head">
      <div><div class="ph-title">Notes</div><div class="ph-sub">Capture ideas, todos and references</div></div>
      <div class="ph-actions">
        <div class="searchbox"><span class="s-ic">${icon("search")}</span><input id="noteSearch" placeholder="Search notes"></div>
        <button class="btn primary" id="newNote">${icon("plus")} New note</button>
      </div>
    </div>
    <div class="notes-layout">
      <div class="notes-folders" id="notesFolders"></div>
      <div class="grow">
        <div class="tabs" id="noteTabs">
          <button class="tab active" data-f="all">All</button>
          <button class="tab" data-f="private">Private</button>
          <button class="tab" data-f="shared">Shared</button>
          <button class="tab" data-f="pinned">Pinned</button>
        </div>
        <div id="notesGrid" class="notes-grid"></div>
      </div>
    </div>`;

  $("#newNote").onclick = () => editNote(null);
  $("#noteSearch").addEventListener("input", debounce((e) => { search = e.target.value.toLowerCase(); render(); }, 150));
  $$("#noteTabs .tab").forEach(t => t.onclick = () => { $$("#noteTabs .tab").forEach(x => x.classList.remove("active")); t.classList.add("active"); filter = t.dataset.f; render(); });

  const me = Auth.current();
  // notes owned by me OR shared in this workspace
  subs.push(DB.watch("notes", { where: [["workspaceId", "==", State.workspace.id]] }, (l) => {
    notes = l.filter(n => n.ownerId === me.id || n.shared);
    renderFolders(); render();
    const want = new URLSearchParams(location.search).get("note");
    if (want && notes.find(n => n.id === want)) { editNote(notes.find(n => n.id === want)); history.replaceState(null, "", "notes.html"); }
  }));
  window.addEventListener("beforeunload", () => subs.forEach(u => u && u()));
}

function renderFolders() {
  const box = $("#notesFolders");
  const folders = [...new Set(notes.map(n => n.folder).filter(Boolean))];
  box.innerHTML = `
    <div class="nf-item ${folder === "all" ? "active" : ""}" data-folder="all">${icon("folder")} All notes <span class="dim">${notes.length}</span></div>
    ${folders.map(f => `<div class="nf-item ${folder === f ? "active" : ""}" data-folder="${escapeHtml(f)}">${icon("folder")} ${escapeHtml(f)} <span class="dim">${notes.filter(n => n.folder === f).length}</span></div>`).join("")}
    <button class="btn subtle sm block mt-8" id="newFolder">${icon("plus")} New folder</button>`;
  $$(".nf-item", box).forEach(it => it.onclick = () => { folder = it.dataset.folder; renderFolders(); render(); });
  $("#newFolder", box).onclick = async () => { const name = await promptDialog({ title: "New folder", label: "Folder name" }); if (name) { folder = name; editNote(null, name); } };
}

function render() {
  const grid = $("#notesGrid"); if (!grid) return;
  const me = Auth.current();
  let list = notes.filter(n => {
    if (filter === "private" && n.shared) return false;
    if (filter === "shared" && !n.shared) return false;
    if (filter === "pinned" && !n.pinned) return false;
    if (folder !== "all" && n.folder !== folder) return false;
    if (search && !((n.title || "").toLowerCase().includes(search) || (n.content || "").toLowerCase().includes(search))) return false;
    return true;
  }).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));

  if (!list.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em-ic">${icon("edit-3")}</div><h3>No notes yet</h3><p>Create a note to jot down ideas.</p><button class="btn primary" onclick="document.getElementById('newNote').click()">${icon("plus")} New note</button></div>`; return; }

  grid.innerHTML = list.map(n => `
    <div class="note-card" data-id="${n.id}" style="background:${n.color || NOTE_COLORS[0]}">
      <div class="nc-top">
        ${n.pinned ? `<span class="nc-pin">${icon("pin")}</span>` : ""}
        <span class="grow"></span>
        ${n.shared ? `<span class="badge steel tiny">Shared</span>` : ""}
        <button class="iconbtn sm nc-menu" data-menu="${n.id}">${icon("more-horizontal")}</button>
      </div>
      <div class="nc-title">${escapeHtml(n.title || "Untitled")}</div>
      <div class="nc-body rich">${renderMarkdown((n.content || "").slice(0, 280))}</div>
      <div class="nc-foot dim tiny">${timeAgo(n.updatedAt || n.createdAt)}${n.folder ? ` · ${escapeHtml(n.folder)}` : ""}</div>
    </div>`).join("");

  $$(".note-card", grid).forEach(c => c.onclick = (e) => { if (e.target.closest("button")) return; editNote(notes.find(n => n.id === c.dataset.id)); });
  $$("[data-menu]", grid).forEach(b => b.onclick = (e) => { e.stopPropagation(); noteMenu(e, notes.find(n => n.id === b.dataset.menu)); });
}

function noteMenu(e, n) {
  menuFromEvent(e, [
    { label: n.pinned ? "Unpin" : "Pin", icon: "pin", onClick: () => DB.update("notes", n.id, { pinned: !n.pinned }) },
    { label: n.shared ? "Make private" : "Share with workspace", icon: n.shared ? "lock" : "users", onClick: () => DB.update("notes", n.id, { shared: !n.shared }) },
    { label: "Change color", icon: "palette", onClick: (ev) => colorMenu(e, n) },
    "sep",
    { label: "Delete", icon: "trash-2", danger: true, onClick: async () => { if (await confirmDialog({ title: "Delete note?", danger: true, confirmText: "Delete" })) DB.remove("notes", n.id); } }
  ]);
}
function colorMenu(e, n) {
  const items = NOTE_COLORS.map(c => ({ label: "  ", onClick: () => DB.update("notes", n.id, { color: c }) }));
  const menu = menuFromEvent(e, [{ label: "Note color", header: true }]);
  setTimeout(() => { const m = document.querySelector(".menu.show"); if (m) { const row = el("div", { style: { display: "flex", gap: "6px", padding: "8px" } }); NOTE_COLORS.forEach(c => { const b = el("button", { style: { width: "28px", height: "28px", borderRadius: "8px", background: c, border: "1px solid rgba(255,255,255,.2)", cursor: "pointer" } }); b.onclick = () => { DB.update("notes", n.id, { color: c }); document.querySelector(".menu.show")?.remove(); }; row.appendChild(b); }); m.appendChild(row); } }, 0);
}

function editNote(note, presetFolder) {
  const isNew = !note;
  const me = Auth.current();
  const body = el("div", {});
  const titleInput = el("input", { class: "input", placeholder: "Note title", value: note?.title || "" });
  titleInput.value = note?.title || "";
  const editor = createRichEditor({ value: note?.content ? renderMarkdown(note.content) : "", placeholder: "Start writing…" });
  const meta = el("div", { class: "row gap-10 mt-12 wrap" });
  meta.innerHTML = `
    <label class="row gap-6 small"><input type="checkbox" id="noteShared" ${note?.shared ? "checked" : ""}> Share with workspace</label>
    <input class="input sm" id="noteFolder" placeholder="Folder (optional)" value="${escapeHtml(note?.folder || presetFolder || "")}" style="width:auto">`;
  body.append(el("div", { class: "field" }, titleInput), editor.el, meta);
  const foot = el("div", {});
  const m = openModal({ title: isNew ? "New Note" : "Edit Note", icon: "edit-3", size: "md", body, footer: foot });
  foot.append(
    el("button", { class: "btn ghost", onClick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onClick: async () => {
      const data = {
        title: titleInput.value.trim() || "Untitled",
        content: htmlToMd(editor.getHTML()),
        shared: $("#noteShared", body).checked,
        folder: $("#noteFolder", body).value.trim(),
        color: note?.color || NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]
      };
      if (isNew) await DB.set("notes", uid("note"), { id: uid("note"), workspaceId: State.workspace.id, ownerId: me.id, pinned: false, createdAt: Date.now(), ...data });
      else await DB.update("notes", note.id, data);
      m.close(); toast("Note saved", "success");
    } }, "Save note")
  );
  setTimeout(() => titleInput.focus(), 60);
}

/* Very light HTML→markdown to keep notes portable */
function htmlToMd(html) {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**").replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*").replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<\/(ul|ol)>/gi, "\n").replace(/<(ul|ol)[^>]*>/gi, "")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, "![]($1)")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}
