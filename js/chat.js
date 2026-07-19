/* ============================================================
   OniSteel Studios Board — Realtime Chat
   Channels, DMs, typing, reactions, mentions, pins, voice notes,
   image/video/GIF upload, read receipts, search.
   ============================================================ */
import { DB, Auth, uid } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { icon } from "./icons.js";
import {
  $, $$, el, escapeHtml, avatarHTML, toast, fmtTime, fmtDate, timeAgo, debounce,
  renderChat, emojiPicker, popover, closeMenu, menuFromEvent, pickFile, confirmDialog, promptDialog
} from "./ui.js";
import { cachedUser, presenceClass } from "./users.js";
import { notify, notifyMany } from "./notifications.js";

let channels = [], activeChannel = null, messages = [];
let unsubChannels = null, unsubMessages = null, unsubTyping = null, unsubReads = null;
let memberMap = {};

export async function initChatPage() {
  setPageTitle("Chat", State.workspace?.name);
  const root = $("#pageRoot");
  root.closest(".content-pad").style.padding = "0";
  root.closest(".content-pad").style.height = "100%";
  root.style.height = "100%";
  root.innerHTML = `
    <div class="chat-shell">
      <div class="chat-sidebar" id="chatSidebar">
        <div class="cs-head">
          <div class="searchbox"><span class="s-ic">${icon("search")}</span><input id="chSearch" placeholder="Search channels & people"></div>
        </div>
        <div class="cs-scroll" id="channelList"></div>
      </div>
      <div class="chat-main" id="chatMain">
        <div class="empty" style="margin:auto"><div class="em-ic">${icon("chat")}</div><h3>Select a conversation</h3><p>Pick a channel or teammate to start chatting.</p></div>
      </div>
    </div>`;

  // build member map for mentions
  State.members.forEach(m => { memberMap[(m.user.username || "").toLowerCase()] = m.user.displayName; });

  unsubChannels = DB.watch("channels", { where: [["workspaceId", "==", State.workspace.id]] }, (list) => {
    channels = list;
    renderChannelList();
    if (!activeChannel && channels.length) {
      const params = new URLSearchParams(location.search);
      const want = params.get("c") || channels.find(c => c.name === "general")?.id || channels[0].id;
      openChannel(want);
    }
  });

  $("#chSearch", root).addEventListener("input", debounce((e) => renderChannelList(e.target.value.toLowerCase()), 150));
  window.addEventListener("beforeunload", cleanup);
}
function cleanup() { [unsubChannels, unsubMessages, unsubTyping, unsubReads].forEach(u => u && u()); }

/* ---------- Channel list ---------- */
function renderChannelList(q = "") {
  const list = $("#channelList");
  const me = Auth.current();
  const chans = channels.filter(c => c.type !== "dm");
  const dms = channels.filter(c => c.type === "dm" && (c.members || []).includes(me.id));
  const others = State.members.filter(m => m.userId !== me.id);

  const filt = (name) => !q || name.toLowerCase().includes(q);

  list.innerHTML = `
    <div class="cs-section">
      <div class="cs-title">Channels <button class="iconbtn sm" id="addChannel" data-tip="New channel">${icon("plus")}</button></div>
      ${chans.filter(c => filt(c.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(c => channelRow(c)).join("")}
    </div>
    <div class="cs-section">
      <div class="cs-title">Direct Messages</div>
      ${others.filter(m => filt(m.user.displayName)).map(m => dmRow(m, me)).join("")}
    </div>`;

  $("#addChannel", list).onclick = createChannel;
  $$(".chan-row", list).forEach(r => r.onclick = () => {
    if (r.dataset.dm) openDM(r.dataset.dm);
    else openChannel(r.dataset.channel);
  });
}
function channelRow(c) {
  const active = activeChannel?.id === c.id;
  return `<div class="chan-row ${active ? "active" : ""}" data-channel="${c.id}">
    <span class="chan-hash">${icon("hash")}</span><span class="grow truncate">${escapeHtml(c.name)}</span>
  </div>`;
}
function dmRow(m, me) {
  const dmId = dmChannelId(me.id, m.userId);
  const active = activeChannel?.id === dmId;
  return `<div class="chan-row ${active ? "active" : ""}" data-dm="${m.userId}">
    ${avatarHTML(m.user, "xs")}<span class="grow truncate">${escapeHtml(m.user.displayName)}</span>
    <span class="presence-dot ${presenceClass(m.user)}"></span>
  </div>`;
}
function dmChannelId(a, b) { return State.workspace.id + "__dm__" + [a, b].sort().join("_"); }

async function createChannel() {
  const name = await promptDialog({ title: "New Channel", label: "Channel name", placeholder: "e.g. level-design", confirmText: "Create" });
  if (!name) return;
  const clean = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const id = `${State.workspace.id}__${clean}`;
  await DB.set("channels", id, { id, workspaceId: State.workspace.id, name: clean, type: "channel", createdAt: Date.now() });
  openChannel(id);
}

/* ---------- Open channel / DM ---------- */
async function openChannel(id) {
  activeChannel = channels.find(c => c.id === id);
  if (!activeChannel) { activeChannel = await DB.getDoc("channels", id); }
  if (!activeChannel) return;
  history.replaceState(null, "", `chat.html?c=${id}`);
  bindMessages();
  renderChannelList($("#chSearch")?.value?.toLowerCase() || "");
}
async function openDM(otherId) {
  const me = Auth.current();
  const id = dmChannelId(me.id, otherId);
  let ch = channels.find(c => c.id === id) || await DB.getDoc("channels", id);
  if (!ch) {
    ch = { id, workspaceId: State.workspace.id, name: "dm", type: "dm", members: [me.id, otherId], createdAt: Date.now() };
    await DB.set("channels", id, ch);
  }
  activeChannel = ch;
  bindMessages();
  renderChannelList();
}

/* ---------- Message pane ---------- */
function bindMessages() {
  [unsubMessages, unsubTyping, unsubReads].forEach(u => u && u());
  const me = Auth.current();
  const ch = activeChannel;
  const isDM = ch.type === "dm";
  const other = isDM ? cachedUser((ch.members || []).find(m => m !== me.id)) : null;
  const title = isDM ? (other?.displayName || "Direct message") : "#" + ch.name;

  $("#chatMain").innerHTML = `
    <div class="chat-header">
      <button class="iconbtn chat-back" id="chatBack">${icon("arrow-left")}</button>
      <div class="ch-title">
        ${isDM ? avatarHTML(other, "sm") : `<span class="ch-hash">${icon("hash")}</span>`}
        <div><div class="ch-name">${escapeHtml(title)}</div><div class="ch-sub" id="chSub">${isDM ? (other?.online ? "Online" : "Offline") : (State.members.length + " members")}</div></div>
      </div>
      <div class="row gap-4">
        <button class="iconbtn" id="chPins" data-tip="Pinned">${icon("pin")}</button>
        <button class="iconbtn" id="chSearchBtn" data-tip="Search">${icon("search")}</button>
      </div>
    </div>
    <div class="msg-scroll" id="msgScroll"></div>
    <div class="typing-line" id="typingLine"></div>
    <div class="composer" id="composer"></div>`;

  $("#chatBack").onclick = () => $("#chatSidebar").classList.add("show-mobile");
  $("#chPins").onclick = (e) => showPins(e.currentTarget);
  $("#chSearchBtn").onclick = () => searchMessages();

  renderComposer();

  unsubMessages = DB.watch("messages", { where: [["channelId", "==", ch.id]], orderBy: ["createdAt", "asc"] }, (list) => {
    const wasBottom = isScrolledBottom();
    messages = list;
    renderMessages();
    markReadUpTo();
    if (wasBottom) scrollBottom();
  });
  unsubTyping = DB.watch("typing", { where: [["channelId", "==", ch.id]] }, (list) => renderTyping(list));
  if (isDM) unsubReads = DB.watch("reads", { where: [["channelId", "==", ch.id]] }, () => renderMessages());

  // close mobile sidebar
  $("#chatSidebar")?.classList.remove("show-mobile");
}

function renderMessages() {
  const scroll = $("#msgScroll"); if (!scroll) return;
  const me = Auth.current();
  if (!messages.length) {
    scroll.innerHTML = `<div class="empty" style="margin:auto"><div class="em-ic">${icon("send")}</div><h3>No messages yet</h3><p>Say hello 👋</p></div>`;
    return;
  }
  let html = "", lastAuthor = null, lastTime = 0, lastDay = "";
  messages.forEach(m => {
    const day = fmtDate(m.createdAt);
    if (day !== lastDay) { html += `<div class="day-sep"><span>${day}</span></div>`; lastDay = day; lastAuthor = null; }
    const grouped = m.authorId === lastAuthor && (m.createdAt - lastTime) < 5 * 60000 && m.type !== "system";
    html += messageHTML(m, grouped, me);
    lastAuthor = m.authorId; lastTime = m.createdAt;
  });
  scroll.innerHTML = html;
  wireMessageEvents(scroll);
}

function messageHTML(m, grouped, me) {
  const u = cachedUser(m.authorId) || { displayName: "User" };
  const mine = m.authorId === me.id;
  const reactions = m.reactions || {};
  const reactHTML = Object.entries(reactions).filter(([e, arr]) => arr.length).map(([e, arr]) =>
    `<button class="reaction ${arr.includes(me.id) ? "on" : ""}" data-emoji="${e}">${e} ${arr.length}</button>`).join("");
  const body = renderMessageBody(m);
  const pinBadge = m.pinned ? `<span class="pin-badge" title="Pinned">${icon("pin")}</span>` : "";

  if (grouped) {
    return `<div class="msg grouped" data-id="${m.id}">
      <div class="msg-gutter"><span class="msg-time-hover">${fmtTime(m.createdAt)}</span></div>
      <div class="msg-content">${pinBadge}${body}${reactHTML ? `<div class="reactions">${reactHTML}</div>` : ""}</div>
      ${msgActions(m, mine)}
    </div>`;
  }
  return `<div class="msg" data-id="${m.id}">
    <div class="msg-avatar">${avatarHTML(u, "sm")}</div>
    <div class="msg-content">
      <div class="msg-head"><strong>${escapeHtml(u.displayName)}</strong><span class="msg-time">${fmtTime(m.createdAt)}</span>${m.editedAt ? '<span class="dim tiny">(edited)</span>' : ""}${pinBadge}</div>
      ${body}${reactHTML ? `<div class="reactions">${reactHTML}</div>` : ""}
    </div>
    ${msgActions(m, mine)}
  </div>`;
}
function renderMessageBody(m) {
  if (m.type === "image") return `<div class="msg-media"><img src="${escapeHtml(m.url)}" alt="" loading="lazy"></div>${m.text ? `<div class="msg-text">${renderChat(m.text, memberMap)}</div>` : ""}`;
  if (m.type === "gif") return `<div class="msg-media gif">${m.url.startsWith("data:image/svg") ? `<img src="${m.url}">` : `<img src="${escapeHtml(m.url)}" alt="gif">`}</div>`;
  if (m.type === "video") return `<div class="msg-media"><video src="${escapeHtml(m.url)}" controls></video></div>`;
  if (m.type === "voice") return `<div class="msg-voice"><span class="vn-ic">${icon("mic")}</span><audio src="${escapeHtml(m.url)}" controls></audio><span class="vn-dur">${m.duration || ""}</span></div>`;
  if (m.type === "file") return `<a class="msg-file" href="${escapeHtml(m.url)}" download="${escapeHtml(m.name)}">${icon("file")}<span>${escapeHtml(m.name)}</span>${icon("download")}</a>`;
  if (m.type === "system") return `<div class="msg-system">${renderChat(m.text, memberMap)}</div>`;
  return `<div class="msg-text">${renderChat(m.text, memberMap)}</div>`;
}
function msgActions(m, mine) {
  return `<div class="msg-actions">
    <button class="iconbtn sm" data-act="react" data-tip="React">${icon("smile")}</button>
    <button class="iconbtn sm" data-act="reply" data-tip="Reply">${icon("corner-up-left")}</button>
    <button class="iconbtn sm" data-act="pin" data-tip="${m.pinned ? "Unpin" : "Pin"}">${icon("pin")}</button>
    ${mine ? `<button class="iconbtn sm" data-act="more" data-tip="More">${icon("more-horizontal")}</button>` : ""}
  </div>`;
}
function wireMessageEvents(scroll) {
  const me = Auth.current();
  $$(".msg", scroll).forEach(msgEl => {
    const id = msgEl.dataset.id;
    const m = messages.find(x => x.id === id);
    msgEl.querySelectorAll(".reaction").forEach(r => r.onclick = () => toggleReaction(m, r.dataset.emoji));
    msgEl.querySelector('[data-act="react"]').onclick = (e) => openReactPicker(e.currentTarget, m);
    msgEl.querySelector('[data-act="reply"]').onclick = () => setReply(m);
    msgEl.querySelector('[data-act="pin"]').onclick = () => DB.update("messages", id, { pinned: !m.pinned });
    const more = msgEl.querySelector('[data-act="more"]');
    if (more) more.onclick = (e) => menuFromEvent(e, [
      { label: "Edit", icon: "edit-3", onClick: () => editMessage(m) },
      { label: "Delete", icon: "trash-2", danger: true, onClick: async () => { if (await confirmDialog({ title: "Delete message?", danger: true, confirmText: "Delete" })) DB.remove("messages", id); } }
    ]);
  });
}

/* ---------- Reactions ---------- */
function openReactPicker(anchor, m) {
  const quick = ["👍","❤️","🔥","😂","🎉","👀","✅","🚀"];
  const box = el("div", { style: { display: "flex", gap: "4px", padding: "8px" } });
  quick.forEach(e => { const b = el("button", { class: "emoji-btn", style: { fontSize: "20px", border: "none", background: "transparent", cursor: "pointer", padding: "4px", borderRadius: "8px" }, text: e }); b.onmouseenter = () => b.style.background = "rgba(255,255,255,.1)"; b.onmouseleave = () => b.style.background = "transparent"; b.onclick = () => { toggleReaction(m, e); closeMenu(); }; box.appendChild(b); });
  popover(anchor, box);
}
async function toggleReaction(m, emoji) {
  const me = Auth.current();
  const reactions = { ...(m.reactions || {}) };
  const arr = new Set(reactions[emoji] || []);
  arr.has(me.id) ? arr.delete(me.id) : arr.add(me.id);
  reactions[emoji] = [...arr];
  if (!reactions[emoji].length) delete reactions[emoji];
  await DB.update("messages", m.id, { reactions });
}

/* ---------- Composer ---------- */
let replyTo = null;
function renderComposer() {
  const c = $("#composer");
  c.innerHTML = `
    <div class="reply-bar hidden" id="replyBar"></div>
    <div class="composer-row">
      <button class="iconbtn" id="cAttach" data-tip="Attach file">${icon("paperclip")}</button>
      <button class="iconbtn" id="cGif" data-tip="GIF">${icon("film")}</button>
      <div class="composer-input" contenteditable="true" id="cInput" data-ph="Message ${activeChannel.type === "dm" ? "" : "#" + activeChannel.name}…"></div>
      <button class="iconbtn" id="cEmoji" data-tip="Emoji">${icon("smile")}</button>
      <button class="iconbtn" id="cVoice" data-tip="Voice note">${icon("mic")}</button>
      <button class="iconbtn send-btn" id="cSend" data-tip="Send">${icon("send")}</button>
    </div>`;
  const input = $("#cInput", c);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
    else broadcastTyping();
  });
  $("#cSend", c).onclick = sendText;
  $("#cEmoji", c).onclick = (e) => popover(e.currentTarget, emojiPicker(em => { input.focus(); document.execCommand("insertText", false, em); }));
  $("#cAttach", c).onclick = attachFile;
  $("#cGif", c).onclick = (e) => gifPicker(e.currentTarget);
  $("#cVoice", c).onclick = toggleVoice;
}
async function sendText() {
  const input = $("#cInput");
  const text = input.innerText.trim();
  if (!text) return;
  await sendMessage({ type: "text", text });
  input.innerHTML = "";
  clearTyping();
}
async function sendMessage(payload) {
  const me = Auth.current();
  const msg = { id: uid("msg"), channelId: activeChannel.id, workspaceId: State.workspace.id, authorId: me.id, reactions: {}, replyTo: replyTo?.id || null, createdAt: Date.now(), ...payload };
  await DB.set("messages", msg.id, msg);
  clearReply();
  // mentions → notify
  if (payload.text) {
    const mentions = (payload.text.match(/@(\w+)/g) || []).map(x => x.slice(1).toLowerCase());
    if (mentions.length) {
      const targets = State.members.filter(m => mentions.includes((m.user.username || "").toLowerCase()) && m.userId !== me.id);
      notifyMany(targets.map(t => t.userId), { type: "mention", title: `${me.displayName} mentioned you`, body: payload.text.slice(0, 80), actorId: me.id, link: `chat.html?c=${activeChannel.id}` });
    }
  }
  // DM notify
  if (activeChannel.type === "dm") {
    const other = (activeChannel.members || []).find(u => u !== me.id);
    notify(other, { type: "reply", title: `Message from ${me.displayName}`, body: (payload.text || payload.type), actorId: me.id, link: `chat.html?c=${activeChannel.id}` });
  }
  setTimeout(scrollBottom, 50);
}
async function attachFile() {
  const file = await pickFile({});
  if (!file) return;
  toast("Uploading…", "info", 1500);
  const path = `workspaces/${State.workspace.id}/chat/${Date.now()}_${file.name}`;
  const res = await DB.uploadFile(path, file);
  const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
  await sendMessage({ type, url: res.url, name: file.name, size: file.size });
}
function editMessage(m) {
  promptDialog({ title: "Edit message", value: m.text || "", multiline: true, confirmText: "Save" }).then(v => { if (v != null) DB.update("messages", m.id, { text: v, editedAt: Date.now() }); });
}

/* ---------- Reply ---------- */
function setReply(m) {
  replyTo = m;
  const bar = $("#replyBar");
  const u = cachedUser(m.authorId) || {};
  bar.classList.remove("hidden");
  bar.innerHTML = `<span class="dim">Replying to <strong>${escapeHtml(u.displayName || "")}</strong>: ${escapeHtml((m.text || m.type || "").slice(0, 60))}</span><button class="iconbtn sm" id="cancelReply">${icon("x")}</button>`;
  $("#cancelReply").onclick = clearReply;
  $("#cInput").focus();
}
function clearReply() { replyTo = null; const bar = $("#replyBar"); if (bar) { bar.classList.add("hidden"); bar.innerHTML = ""; } }

/* ---------- Typing ---------- */
const broadcastTyping = debounce(() => {
  const me = Auth.current();
  DB.set("typing", `${activeChannel.id}__${me.id}`, { id: `${activeChannel.id}__${me.id}`, channelId: activeChannel.id, userId: me.id, at: Date.now() });
  setTimeout(clearTyping, 4000);
}, 400);
function clearTyping() { const me = Auth.current(); DB.remove("typing", `${activeChannel.id}__${me.id}`).catch(() => {}); }
function renderTyping(list) {
  const me = Auth.current();
  const active = list.filter(t => t.userId !== me.id && Date.now() - t.at < 5000);
  const line = $("#typingLine"); if (!line) return;
  if (!active.length) { line.textContent = ""; return; }
  const names = active.map(t => (cachedUser(t.userId)?.displayName || "Someone").split(" ")[0]);
  line.innerHTML = `<span class="typing-dots"><i></i><i></i><i></i></span> ${escapeHtml(names.join(", "))} ${names.length > 1 ? "are" : "is"} typing…`;
}

/* ---------- Read receipts ---------- */
async function markReadUpTo() {
  if (!messages.length) return;
  const me = Auth.current();
  const last = messages[messages.length - 1];
  DB.set("reads", `${activeChannel.id}__${me.id}`, { id: `${activeChannel.id}__${me.id}`, channelId: activeChannel.id, userId: me.id, lastRead: last.createdAt, at: Date.now() });
}

/* ---------- Voice notes ---------- */
let mediaRecorder = null, chunks = [], recStart = 0;
async function toggleVoice() {
  const btn = $("#cVoice");
  if (mediaRecorder && mediaRecorder.state === "recording") { mediaRecorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    chunks = []; recStart = Date.now();
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      btn.classList.remove("recording");
      const blob = new Blob(chunks, { type: "audio/webm" });
      const dur = Math.round((Date.now() - recStart) / 1000);
      const reader = new FileReader();
      reader.onload = () => sendMessage({ type: "voice", url: reader.result, duration: `${dur}s` });
      reader.readAsDataURL(blob);
    };
    mediaRecorder.start();
    btn.classList.add("recording");
    toast("Recording… tap mic to stop", "info", 1500);
  } catch { toast("Microphone access denied", "error"); }
}

/* ---------- GIF picker (built-in animated stickers, offline-safe) ---------- */
function gifPicker(anchor) {
  const box = el("div", { style: { padding: "10px", width: "280px" } });
  box.innerHTML = `<div class="menu-label">Stickers & GIFs</div><div class="gif-grid" id="gifGrid"></div>
    <div class="field" style="margin-top:8px"><input class="input sm" id="gifUrl" placeholder="…or paste a GIF URL"></div>`;
  const grid = box.querySelector("#gifGrid");
  BUILTIN_GIFS.forEach(g => { const b = el("button", { class: "gif-cell" }); b.innerHTML = `<img src="${g}">`; b.onclick = () => { sendMessage({ type: "gif", url: g }); closeMenu(); }; grid.appendChild(b); });
  box.querySelector("#gifUrl").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.value) { sendMessage({ type: "gif", url: e.target.value }); closeMenu(); } });
  popover(anchor, box);
}
// Animated SVG "stickers" as data URIs — reliable & offline
const BUILTIN_GIFS = [
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='16' fill='%231A1A1C'/><g transform='translate(60,60)'><path fill='%23C12A2A'><animateTransform attributeName='transform' type='rotate' from='0' to='360' dur='2s' repeatCount='indefinite'/><path d='M0-28 8-8 28 0 8 8 0 28 -8 8 -28 0 -8 -8Z'/></path></g></svg>`)}`,
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='16' fill='%231A1A1C'/><text x='60' y='72' font-size='54' text-anchor='middle'>🔥<animate attributeName='font-size' values='48;60;48' dur='1s' repeatCount='indefinite'/></text></svg>`)}`,
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='16' fill='%231A1A1C'/><text x='60' y='74' font-size='54' text-anchor='middle'>🚀<animateTransform attributeName='transform' type='translate' values='0 6;0 -6;0 6' dur='1.2s' repeatCount='indefinite'/></text></svg>`)}`,
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='16' fill='%231A1A1C'/><text x='60' y='74' font-size='54' text-anchor='middle'>🎉<animate attributeName='opacity' values='1;.4;1' dur='.8s' repeatCount='indefinite'/></text></svg>`)}`,
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='16' fill='%231A1A1C'/><g transform='translate(60,60)'><rect x='-20' y='-20' width='40' height='40' rx='6' fill='%234D6B91'><animateTransform attributeName='transform' type='rotate' from='0' to='360' dur='3s' repeatCount='indefinite'/></rect></g></svg>`)}`,
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='16' fill='%231A1A1C'/><text x='60' y='74' font-size='54' text-anchor='middle'>👾<animateTransform attributeName='transform' type='translate' values='-6 0;6 0;-6 0' dur='1s' repeatCount='indefinite'/></text></svg>`)}`,
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='16' fill='%231A1A1C'/><text x='60' y='74' font-size='54' text-anchor='middle'>⚔️<animateTransform attributeName='transform' type='rotate' values='-10 60 60;10 60 60;-10 60 60' dur='1s' repeatCount='indefinite'/></text></svg>`)}`,
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='16' fill='%231A1A1C'/><text x='60' y='74' font-size='50' text-anchor='middle'>✅<animate attributeName='font-size' values='44;56;44' dur='1s' repeatCount='indefinite'/></text></svg>`)}`
];

/* ---------- Pins & search ---------- */
async function showPins(anchor) {
  const pins = messages.filter(m => m.pinned);
  const box = el("div", { style: { width: "320px", maxHeight: "400px", overflow: "auto", padding: "8px" } });
  box.innerHTML = `<div class="menu-label">Pinned messages</div>` + (pins.length ? pins.map(m => {
    const u = cachedUser(m.authorId) || {};
    return `<div class="pin-item" data-id="${m.id}">${avatarHTML(u, "xs")}<div class="grow"><div class="small"><strong>${escapeHtml(u.displayName)}</strong></div><div class="dim small truncate">${escapeHtml((m.text || m.type))}</div></div></div>`;
  }).join("") : `<div class="dim small" style="padding:10px">No pinned messages.</div>`);
  popover(anchor, box, { align: "right" });
  $$(".pin-item", box).forEach(p => p.onclick = () => { closeMenu(); const target = $(`.msg[data-id="${p.dataset.id}"]`); if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 1200); } });
}
function searchMessages() {
  const q = prompt("Search this conversation");
  if (!q) return;
  const matches = messages.filter(m => (m.text || "").toLowerCase().includes(q.toLowerCase()));
  if (!matches.length) { toast("No matches", "info"); return; }
  const first = matches[0];
  const target = $(`.msg[data-id="${first.id}"]`);
  if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 1200); }
  toast(`${matches.length} match${matches.length > 1 ? "es" : ""}`, "success");
}

/* ---------- Scroll helpers ---------- */
function isScrolledBottom() { const s = $("#msgScroll"); return !s || (s.scrollHeight - s.scrollTop - s.clientHeight < 120); }
function scrollBottom() { const s = $("#msgScroll"); if (s) s.scrollTop = s.scrollHeight; }
