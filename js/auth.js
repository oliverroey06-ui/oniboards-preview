/* ============================================================
   OniSteel Studios Board — Authentication Flows
   Powers index / login / register auth cards:
   sign-in, register, forgot-password, email verification.
   ============================================================ */
import { initBackend, Auth, backendMode, DB } from "./store.js";
import { friendlyAuthError } from "./store.js";
import { icon } from "./icons.js";
import { $, $$, el, toast, escapeHtml } from "./ui.js";
import { seedDemoStudio } from "./seed.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- Password strength ---------- */
function pwStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["#C12A2A", "#E6822E", "#E6C33C", "#5EBE8A", "#3FB98A"];

/* ---------- Boot: redirect if already signed in ---------- */
export async function authBoot() {
  await initBackend();
  Auth.onChange((user) => {
    if (user && !location.pathname.endsWith("verify.html")) {
      // already signed in → go to app
      const params = new URLSearchParams(location.search);
      if (params.get("stay")) return;
      location.href = "dashboard.html";
    }
  });
  // Show which backend is active
  const live = backendMode() === "firebase";
  const chip = $("#backendChip");
  if (chip) {
    chip.innerHTML = `${icon(live ? "database" : "cpu")} ${live ? "Firebase · Live Sync" : "Demo Mode · Local"}`;
    chip.title = live ? "Connected to your Firebase project." : "No Firebase config yet — running a full local demo backend. Add your keys in js/firebase.js to sync across devices.";
  }
  // In a real (Firebase) deployment, hide the throwaway "instant demo" button so
  // teammates create real accounts instead of demo studios.
  if (live) $$("#demoBtn").forEach(b => { b.classList.add("hidden"); const d = b.previousElementSibling; if (d && d.classList.contains("auth-divider")) d.classList.add("hidden"); });
}

/* ---------- Wire the multi-panel auth card ---------- */
export function initAuthCard(defaultPanel = "login") {
  authBoot();
  showPanel(defaultPanel);
  // panel switch links
  $$("[data-panel]").forEach(a => a.addEventListener("click", (e) => { e.preventDefault(); showPanel(a.dataset.panel); }));
  wireLogin(); wireRegister(); wireForgot();
  // password visibility toggles
  $$(".pw-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const inp = btn.parentElement.querySelector("input");
      inp.type = inp.type === "password" ? "text" : "password";
      btn.innerHTML = icon(inp.type === "password" ? "eye" : "eye-off");
    });
  });
}

export function showPanel(name) {
  $$(".auth-panel").forEach(p => p.classList.toggle("hidden", p.dataset.name !== name));
  const titles = { login: "Welcome back", register: "Create your studio account", forgot: "Reset your password", verify: "Verify your email" };
  const sub = { login: "Sign in to your OniSteel workspace.", register: "Join OniSteel Studios Board — free forever.", forgot: "We'll help you get back in.", verify: "Check your inbox to activate your account." };
  const t = $("#authTitle"), s = $("#authSub");
  if (t) t.textContent = titles[name] || "";
  if (s) s.textContent = sub[name] || "";
}

/* ---------- LOGIN ---------- */
function wireLogin() {
  const form = $("#loginForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#loginEmail").value.trim();
    const pw = $("#loginPassword").value;
    const remember = $("#loginRemember")?.checked ?? true;
    const err = $("#loginError");
    err.textContent = "";
    if (!EMAIL_RE.test(email)) { err.textContent = "Enter a valid email address."; return; }
    if (!pw) { err.textContent = "Enter your password."; return; }
    const btn = $("#loginBtn"); setLoading(btn, true);
    try {
      await initBackend();               // ensure the backend is ready before we use it
      await Auth.login(email, pw, remember);
      toast("Signed in", "success");
      location.href = "dashboard.html";
    } catch (ex) {
      err.textContent = friendlyAuthError(ex);
      setLoading(btn, false);
    }
  });
}

/* ---------- REGISTER ---------- */
function wireRegister() {
  const form = $("#registerForm");
  if (!form) return;
  const pwInput = $("#regPassword");
  if (pwInput) {
    pwInput.addEventListener("input", () => {
      const s = pwStrength(pwInput.value);
      const bar = $("#pwStrengthBar"), label = $("#pwStrengthLabel");
      if (bar) { bar.style.width = ((s + 1) * 20) + "%"; bar.style.background = STRENGTH_COLOR[s]; }
      if (label) { label.textContent = pwInput.value ? STRENGTH[s] : ""; label.style.color = STRENGTH_COLOR[s]; }
    });
  }
  // auto username from display name
  const dn = $("#regDisplayName"), un = $("#regUsername");
  if (dn && un) dn.addEventListener("input", () => { if (!un.dataset.touched) un.value = dn.value.toLowerCase().replace(/[^a-z0-9]/g, ""); });
  if (un) un.addEventListener("input", () => un.dataset.touched = "1");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const displayName = $("#regDisplayName").value.trim();
    const username = $("#regUsername").value.trim();
    const email = $("#regEmail").value.trim();
    const pw = $("#regPassword").value;
    const confirm = $("#regConfirm").value;
    const err = $("#registerError");
    err.textContent = "";
    if (displayName.length < 2) { err.textContent = "Please enter your name."; return; }
    if (username.length < 3) { err.textContent = "Username must be at least 3 characters."; return; }
    if (!EMAIL_RE.test(email)) { err.textContent = "Enter a valid email address."; return; }
    if (pw.length < 6) { err.textContent = "Password must be at least 6 characters."; return; }
    if (pw !== confirm) { err.textContent = "Passwords don't match."; return; }
    if (!$("#regTerms")?.checked) { err.textContent = "Please accept the terms to continue."; return; }

    const btn = $("#registerBtn"); setLoading(btn, true);
    try {
      await initBackend();               // ensure the backend is ready before we use it
      const user = await Auth.register({ email, password: pw, displayName, username });
      // Seed a rich sample studio ONLY in local demo mode. In a real Firebase
      // deployment new members start clean (the owner invites them to workspaces).
      if (backendMode() === "demo") {
        setLoading(btn, true, "Building your studio…");
        try { await seedDemoStudio(user); } catch (seedErr) { console.warn("seed failed", seedErr); }
      }
      await Auth.sendVerification().catch(() => {});
      toast("Account created — welcome to OniSteel!", "success");
      location.href = "dashboard.html";
    } catch (ex) {
      err.textContent = friendlyAuthError(ex);
      setLoading(btn, false);
    }
  });
}

/* ---------- FORGOT PASSWORD ---------- */
function wireForgot() {
  const form = $("#forgotForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#forgotEmail").value.trim();
    const err = $("#forgotError"); err.textContent = "";
    if (!EMAIL_RE.test(email)) { err.textContent = "Enter a valid email address."; return; }
    const btn = $("#forgotBtn"); setLoading(btn, true);
    try {
      const res = await Auth.resetPassword(email);
      setLoading(btn, false);
      if (res && res.demoToken) {
        // Demo mode: allow inline reset since we can't send email
        showDemoReset(email, res.demoToken);
      } else {
        toast("Password reset email sent. Check your inbox.", "success");
        showPanel("login");
      }
    } catch (ex) {
      err.textContent = friendlyAuthError(ex);
      setLoading(btn, false);
    }
  });
}
function showDemoReset(email, token) {
  const panel = $('.auth-panel[data-name="forgot"]');
  panel.innerHTML = `
    <div class="field">
      <div class="badge steel mb-8">${icon("info")} Demo mode</div>
      <p class="muted small">In demo mode we can't send real email. Set a new password below (verification code <span class="kbd">${token}</span> shown for realism).</p>
    </div>
    <div class="field"><label>New password</label>
      <div class="input-group"><span class="in-icon">${icon("lock")}</span><input class="input" id="demoNewPw" type="password" placeholder="New password"></div>
    </div>
    <div class="field-error" id="demoResetErr"></div>
    <button class="btn primary block" id="demoResetBtn">Set new password</button>
    <div class="center mt-12"><a href="#" data-panel="login" class="btn link">Back to sign in</a></div>`;
  $("#demoResetBtn").onclick = async () => {
    const np = $("#demoNewPw").value;
    if (np.length < 6) { $("#demoResetErr").textContent = "Password must be at least 6 characters."; return; }
    await Auth.applyReset(email, np);
    toast("Password updated. You can sign in now.", "success");
    location.reload();
  };
  $$('[data-panel]', panel).forEach(a => a.addEventListener("click", (e) => { e.preventDefault(); location.reload(); }));
}

/* ---------- Continue with Google ---------- */
export async function loginGoogle() {
  await initBackend();
  const btn = $("#googleBtn"); if (btn) setLoading(btn, true, "Connecting to Google…");
  try {
    const { user, isNew } = await Auth.loginWithGoogle();
    // Seed sample data only for a brand-new account in local demo mode.
    if (isNew && backendMode() === "demo") { try { await seedDemoStudio(user); } catch {} }
    toast("Signed in with Google", "success");
    location.href = "dashboard.html";
  } catch (ex) {
    if (ex && (ex.code === "auth/popup-closed-by-user" || ex.code === "auth/cancelled-popup-request")) { if (btn) setLoading(btn, false); return; }
    toast(friendlyAuthError(ex), "error");
    if (btn) setLoading(btn, false);
  }
}

/* ---------- Instant demo account ---------- */
export async function launchDemo() {
  await initBackend();
  const btn = $("#demoBtn"); if (btn) setLoading(btn, true, "Spinning up demo…");
  try {
    const stamp = Date.now().toString(36);
    const email = `demo_${stamp}@onisteel.studio`;
    const user = await Auth.register({ email, password: "demo1234", displayName: "Demo Director", username: "demo" + stamp.slice(-4) });
    await seedDemoStudio(user);
    toast("Demo studio ready!", "success");
    location.href = "dashboard.html";
  } catch (ex) {
    toast(friendlyAuthError(ex), "error");
    if (btn) setLoading(btn, false);
  }
}

/* ---------- Helpers ---------- */
function setLoading(btn, loading, text) {
  if (!btn) return;
  btn.classList.toggle("is-loading", loading);
  btn.disabled = loading;
  if (loading) {
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="spin"></span><span class="btn-label" style="visibility:visible;margin-left:8px">${text || "Please wait…"}</span>`;
  } else if (btn.dataset.label) {
    btn.innerHTML = btn.dataset.label;
  }
}

/* Expose for inline onclick in HTML */
window.OniAuth = { launchDemo, loginGoogle, showPanel };
