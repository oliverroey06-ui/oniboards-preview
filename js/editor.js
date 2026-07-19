/* ============================================================
   OniSteel Studios Board — Rich Text Editor
   Lightweight contenteditable editor with a formatting toolbar.
   Used by task descriptions, comments, wiki and notes.
   ============================================================ */
import { icon } from "./icons.js";
import { el, pickFile, toast } from "./ui.js";
import { DB, uid } from "./store.js";

export function createRichEditor({ value = "", placeholder = "Write something…", compact = false, onImage } = {}) {
  const wrap = el("div", { class: "rte" + (compact ? " compact" : "") });
  const toolbar = el("div", { class: "rte-toolbar" });
  const area = el("div", { class: "rte-area rich", contenteditable: "true", "data-ph": placeholder });
  area.innerHTML = value || "";

  const cmd = (command, val = null) => { area.focus(); document.execCommand(command, false, val); };
  const buttons = compact
    ? [["bold", "bold", "Bold"], ["italic", "italic", "Italic"], ["list", "insertUnorderedList", "List"], ["link", "__link", "Link"], ["smile", "__emoji", "Emoji"]]
    : [
        ["type", "__h", "Heading"], ["bold", "bold", "Bold"], ["italic", "italic", "Italic"],
        ["list", "insertUnorderedList", "Bullet list"], ["check-square", "insertOrderedList", "Numbered"],
        ["code", "__code", "Code"], ["link", "__link", "Link"], ["image", "__image", "Image"]
      ];
  buttons.forEach(([ic, command, tip]) => {
    const b = el("button", { class: "rte-btn", type: "button", "data-tip": tip });
    b.innerHTML = icon(ic);
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = async () => {
      if (command === "__link") { const url = prompt("Link URL"); if (url) cmd("createLink", url); }
      else if (command === "__h") { cmd("formatBlock", "<h3>"); }
      else if (command === "__code") { cmd("formatBlock", "<pre>"); }
      else if (command === "__emoji") { insertText(area, "🙂"); }
      else if (command === "__image") {
        const file = await pickFile({ accept: "image/*" });
        if (!file) return;
        const b64 = await fileToDataURL(file);
        let url = b64;
        if (onImage) { try { url = await onImage(file); } catch {} }
        cmd("insertHTML", `<img src="${url}" alt="${file.name}">`);
      }
      else cmd(command);
    };
    toolbar.appendChild(b);
  });

  wrap.append(toolbar, area);
  return {
    el: wrap, area,
    getHTML: () => area.innerHTML.trim(),
    getText: () => area.innerText.trim(),
    setHTML: (h) => { area.innerHTML = h; },
    focus: () => area.focus(),
    clear: () => { area.innerHTML = ""; }
  };
}

function insertText(area, text) { area.focus(); document.execCommand("insertText", false, text); }
function fileToDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
