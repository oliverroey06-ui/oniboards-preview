/* ============================================================
   OniSteel Studios Board — Collaborative Whiteboard
   Freehand pen, shapes, arrows, text, sticky notes, mind-map
   connectors. Realtime sync. Export to PNG.
   ============================================================ */
import { DB, Auth, uid } from "./store.js";
import { State, setPageTitle } from "./app.js";
import { icon } from "./icons.js";
import { $, $$, el, escapeHtml, toast, confirmDialog } from "./ui.js";

const BOARD_W = 2600, BOARD_H = 1700;
const COLORS = ["#EDEFF3", "#8FAFD6", "#C12A2A", "#3FB98A", "#E6A23C", "#8A6BD1", "#4D8F91"];
const STICKY_COLORS = ["#E6C33C", "#8FAFD6", "#5EBE8A", "#E28A6B", "#B06BD1", "#6BB0D1"];

let wbId, elements = [], tool = "pen", color = "#8FAFD6", stroke = 3, unsub = null;
let drawing = false, current = null, selectedId = null;

export async function initWhiteboardPage() {
  setPageTitle("Whiteboard", State.workspace?.name);
  wbId = State.workspace.id + "__wb";
  const root = $("#pageRoot");
  root.closest(".content-pad").style.padding = "0";
  root.style.height = "100%";
  root.innerHTML = `
    <div class="wb-shell">
      <div class="wb-toolbar">
        <div class="wb-tools">
          ${toolBtn("select", "move", "Select")}
          ${toolBtn("pen", "pen-tool", "Pen")}
          ${toolBtn("eraser", "x-circle", "Eraser")}
          ${toolBtn("rect", "square", "Rectangle")}
          ${toolBtn("ellipse", "target", "Ellipse")}
          ${toolBtn("arrow", "arrow-right", "Arrow")}
          ${toolBtn("text", "type", "Text")}
          ${toolBtn("sticky", "sticky-note", "Sticky note")}
        </div>
        <div class="wb-sep"></div>
        <div class="wb-colors" id="wbColors">${COLORS.map(c => `<button class="wb-color ${c === color ? "on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("")}</div>
        <div class="wb-sep"></div>
        <div class="row gap-6"><span class="dim tiny">Size</span><input type="range" class="range wb-stroke" id="wbStroke" min="1" max="18" value="${stroke}" style="width:80px"></div>
        <div class="wb-sep"></div>
        <button class="iconbtn" id="wbExport" data-tip="Export PNG">${icon("download")}</button>
        <button class="iconbtn" id="wbClear" data-tip="Clear board">${icon("trash-2")}</button>
        <div class="wb-hint dim tiny">Realtime · everyone sees changes live</div>
      </div>
      <div class="wb-canvas-wrap" id="wbWrap">
        <div class="wb-board" id="wbBoard" style="width:${BOARD_W}px;height:${BOARD_H}px">
          <svg class="wb-svg" id="wbSvg" width="${BOARD_W}" height="${BOARD_H}" viewBox="0 0 ${BOARD_W} ${BOARD_H}">
            <defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="context-stroke"/></marker></defs>
          </svg>
          <div class="wb-overlay" id="wbOverlay"></div>
        </div>
      </div>
    </div>`;

  $$(".wb-tool").forEach(b => b.onclick = () => { tool = b.dataset.tool; $$(".wb-tool").forEach(x => x.classList.toggle("active", x === b)); $("#wbBoard").dataset.tool = tool; });
  $("#wbBoard").dataset.tool = tool;
  $$("#wbColors .wb-color").forEach(b => b.onclick = () => { color = b.dataset.c; $$("#wbColors .wb-color").forEach(x => x.classList.toggle("on", x === b)); });
  $("#wbStroke").oninput = (e) => stroke = +e.target.value;
  $("#wbExport").onclick = exportPNG;
  $("#wbClear").onclick = clearBoard;

  bindPointer();
  unsub = DB.watch("wbElements", { where: [["whiteboardId", "==", wbId]] }, (l) => { elements = l; renderAll(); });
  window.addEventListener("beforeunload", () => unsub && unsub());
}
function toolBtn(id, ic, tip) { return `<button class="wb-tool ${id === "pen" ? "active" : ""}" data-tool="${id}" data-tip="${tip}">${icon(ic)}</button>`; }

function boardPoint(e) {
  const board = $("#wbBoard").getBoundingClientRect();
  return [e.clientX - board.left, e.clientY - board.top];
}

function bindPointer() {
  const board = $("#wbBoard");
  board.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".wb-sticky, .wb-text-el")) return; // handled by element
    const [x, y] = boardPoint(e);
    if (tool === "pen") { drawing = true; current = { id: uid("wbe"), type: "path", points: [[x, y]], color, stroke, whiteboardId: wbId, workspaceId: State.workspace.id, createdBy: Auth.current().id, createdAt: Date.now() }; }
    else if (tool === "eraser") { eraseAt(x, y); }
    else if (tool === "rect" || tool === "ellipse") { drawing = true; current = { id: uid("wbe"), type: tool, x, y, w: 0, h: 0, color, stroke, whiteboardId: wbId, workspaceId: State.workspace.id, createdBy: Auth.current().id, createdAt: Date.now() }; }
    else if (tool === "arrow") { drawing = true; current = { id: uid("wbe"), type: "arrow", x, y, x2: x, y2: y, color, stroke, whiteboardId: wbId, workspaceId: State.workspace.id, createdBy: Auth.current().id, createdAt: Date.now() }; }
    else if (tool === "text") { addText(x, y); }
    else if (tool === "sticky") { addSticky(x, y); }
    else if (tool === "select") { selectedId = null; renderAll(); }
    if (drawing) board.setPointerCapture(e.pointerId);
  });
  board.addEventListener("pointermove", (e) => {
    if (!drawing || !current) return;
    const [x, y] = boardPoint(e);
    if (current.type === "path") current.points.push([x, y]);
    else if (current.type === "rect" || current.type === "ellipse") { current.w = x - current.x; current.h = y - current.y; }
    else if (current.type === "arrow") { current.x2 = x; current.y2 = y; }
    drawCurrent();
  });
  board.addEventListener("pointerup", async () => {
    if (drawing && current) {
      if (current.type === "path" && current.points.length < 2) { drawing = false; current = null; return; }
      if ((current.type === "rect" || current.type === "ellipse") && Math.abs(current.w) < 5 && Math.abs(current.h) < 5) { drawing = false; current = null; drawCurrent(); return; }
      await DB.set("wbElements", current.id, current);
    }
    drawing = false; current = null;
  });
}

function drawCurrent() {
  const svg = $("#wbSvg");
  let temp = svg.querySelector("#tempEl");
  if (temp) temp.remove();
  if (!current) return;
  temp = elementToSVG(current, "tempEl");
  svg.insertAdjacentHTML("beforeend", temp);
}

function renderAll() {
  const svg = $("#wbSvg"), overlay = $("#wbOverlay");
  if (!svg) return;
  // svg shapes (paths, rect, ellipse, arrow)
  const shapes = elements.filter(e => ["path", "rect", "ellipse", "arrow"].includes(e.type));
  svg.querySelectorAll(".wb-el").forEach(n => n.remove());
  shapes.forEach(e => svg.insertAdjacentHTML("beforeend", elementToSVG(e)));
  // html elements (sticky, text)
  overlay.innerHTML = "";
  elements.filter(e => e.type === "sticky").forEach(e => overlay.appendChild(stickyEl(e)));
  elements.filter(e => e.type === "text").forEach(e => overlay.appendChild(textEl(e)));
  // wire shape selection/delete
  svg.querySelectorAll(".wb-el").forEach(node => {
    node.style.cursor = tool === "select" || tool === "eraser" ? "pointer" : "";
    node.onclick = (ev) => { if (tool === "eraser") { DB.remove("wbElements", node.dataset.id); } else if (tool === "select") { ev.stopPropagation(); selectedId = node.dataset.id; } };
  });
}

function elementToSVG(e, id) {
  const idAttr = id ? `id="${id}"` : `class="wb-el" data-id="${e.id}"`;
  if (e.type === "path") {
    const d = e.points.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return `<path ${idAttr} d="${d}" fill="none" stroke="${e.color}" stroke-width="${e.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (e.type === "rect") { const x = Math.min(e.x, e.x + e.w), y = Math.min(e.y, e.y + e.h); return `<rect ${idAttr} x="${x}" y="${y}" width="${Math.abs(e.w)}" height="${Math.abs(e.h)}" rx="6" fill="none" stroke="${e.color}" stroke-width="${e.stroke}"/>`; }
  if (e.type === "ellipse") { const cx = e.x + e.w / 2, cy = e.y + e.h / 2; return `<ellipse ${idAttr} cx="${cx}" cy="${cy}" rx="${Math.abs(e.w / 2)}" ry="${Math.abs(e.h / 2)}" fill="none" stroke="${e.color}" stroke-width="${e.stroke}"/>`; }
  if (e.type === "arrow") return `<line ${idAttr} x1="${e.x}" y1="${e.y}" x2="${e.x2}" y2="${e.y2}" stroke="${e.color}" stroke-width="${e.stroke}" marker-end="url(#arrowhead)"/>`;
  return "";
}

/* ---------- Sticky notes ---------- */
function addSticky(x, y) {
  const e = { id: uid("wbe"), type: "sticky", x: x - 80, y: y - 60, w: 170, h: 140, text: "", color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], whiteboardId: wbId, workspaceId: State.workspace.id, createdBy: Auth.current().id, createdAt: Date.now() };
  DB.set("wbElements", e.id, e).then(() => setTimeout(() => { const node = $(`.wb-sticky[data-id="${e.id}"] .sticky-text`); if (node) node.focus(); }, 100));
}
function stickyEl(e) {
  const node = el("div", { class: "wb-sticky", "data-id": e.id, style: { left: e.x + "px", top: e.y + "px", width: e.w + "px", height: e.h + "px", background: e.color } });
  node.innerHTML = `<div class="sticky-bar"><span class="sticky-grip">${icon("grip")}</span><button class="sticky-del">${icon("x")}</button></div><div class="sticky-text" contenteditable="true">${escapeHtml(e.text || "")}</div>`;
  const txt = node.querySelector(".sticky-text");
  txt.addEventListener("blur", () => { if (txt.innerText !== e.text) DB.update("wbElements", e.id, { text: txt.innerText }); });
  node.querySelector(".sticky-del").onclick = () => DB.remove("wbElements", e.id);
  makeDraggable(node, node.querySelector(".sticky-bar"), e);
  return node;
}
/* ---------- Text ---------- */
function addText(x, y) {
  const e = { id: uid("wbe"), type: "text", x, y, text: "Text", color, whiteboardId: wbId, workspaceId: State.workspace.id, createdBy: Auth.current().id, createdAt: Date.now() };
  DB.set("wbElements", e.id, e).then(() => setTimeout(() => { const node = $(`.wb-text-el[data-id="${e.id}"]`); if (node) { node.focus(); document.getSelection().selectAllChildren(node); } }, 100));
}
function textEl(e) {
  const node = el("div", { class: "wb-text-el", "data-id": e.id, contenteditable: "true", style: { left: e.x + "px", top: e.y + "px", color: e.color } });
  node.textContent = e.text;
  node.addEventListener("blur", () => { if (!node.textContent.trim()) DB.remove("wbElements", e.id); else if (node.textContent !== e.text) DB.update("wbElements", e.id, { text: node.textContent }); });
  node.addEventListener("pointerdown", (ev) => { if (tool === "eraser") { ev.preventDefault(); DB.remove("wbElements", e.id); } });
  makeDraggable(node, node, e, true);
  return node;
}

function makeDraggable(node, handle, e, isText) {
  handle.addEventListener("pointerdown", (ev) => {
    if (tool !== "select" && !isText) { if (tool === "eraser") { DB.remove("wbElements", e.id); return; } }
    if (isText && ev.target.isContentEditable && tool !== "select") return;
    if (ev.target.closest(".sticky-text, .sticky-del")) return;
    ev.preventDefault();
    const startX = ev.clientX, startY = ev.clientY, ox = e.x, oy = e.y;
    const move = (m) => { const nx = ox + (m.clientX - startX), ny = oy + (m.clientY - startY); node.style.left = nx + "px"; node.style.top = ny + "px"; e._nx = nx; e._ny = ny; };
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); if (e._nx != null) DB.update("wbElements", e.id, { x: e._nx, y: e._ny }); };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  });
}

function eraseAt(x, y) {
  // erase nearest path/shape within threshold
  for (const e of elements) {
    if (e.type === "path" && e.points.some(p => Math.hypot(p[0] - x, p[1] - y) < 14)) { DB.remove("wbElements", e.id); return; }
  }
}

async function clearBoard() {
  if (!elements.length) return;
  if (!await confirmDialog({ title: "Clear whiteboard?", message: "This removes all elements for everyone.", danger: true, confirmText: "Clear" })) return;
  await DB.batch(elements.map(e => ({ type: "remove", collection: "wbElements", id: e.id })));
  toast("Whiteboard cleared", "success");
}

function exportPNG() {
  const svg = $("#wbSvg").cloneNode(true);
  const temp = svg.querySelector("#tempEl"); if (temp) temp.remove();
  // draw sticky/text onto a canvas via foreignObject-free approach: rasterize svg then overlay text
  const svgData = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  const canvas = document.createElement("canvas"); canvas.width = BOARD_W; canvas.height = BOARD_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#141416"; ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    // draw sticky notes + text
    elements.filter(e => e.type === "sticky").forEach(e => {
      ctx.fillStyle = e.color; roundRect(ctx, e.x, e.y, e.w, e.h, 8); ctx.fill();
      ctx.fillStyle = "#1a1a1c"; ctx.font = "14px Inter, sans-serif";
      wrapText(ctx, e.text || "", e.x + 12, e.y + 34, e.w - 24, 18);
    });
    elements.filter(e => e.type === "text").forEach(e => { ctx.fillStyle = e.color; ctx.font = "bold 20px Inter, sans-serif"; ctx.fillText(e.text || "", e.x, e.y + 20); });
    canvas.toBlob(blob => { const a = el("a", { href: URL.createObjectURL(blob), download: `whiteboard_${Date.now()}.png` }); document.body.appendChild(a); a.click(); a.remove(); toast("Whiteboard exported", "success"); });
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrapText(ctx, text, x, y, maxW, lh) { const words = text.split(" "); let line = "", yy = y; for (const w of words) { if (ctx.measureText(line + w).width > maxW && line) { ctx.fillText(line, x, yy); line = w + " "; yy += lh; } else line += w + " "; } ctx.fillText(line, x, yy); }
