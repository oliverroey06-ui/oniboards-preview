/* ============================================================
   OniSteel Studios Board — Unified Data Layer (Store)
   ------------------------------------------------------------
   Exposes DB (data) + Auth (identity) with a single API that
   works against EITHER Firebase/Firestore OR a built-in demo
   backend (localStorage + BroadcastChannel realtime).

   Every feature module talks only to DB / Auth — never to
   Firebase directly — so the app is fully backend-agnostic.
   ============================================================ */

import { FIREBASE_ENABLED, loadFirebase } from "./firebase.js";

/* =====================================================================
   Small helpers
   ===================================================================== */
export function uid(prefix = "id") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
export function now() { return Date.now(); }
function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
function hashPw(s) { // lightweight non-crypto hash for DEMO auth only
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}
function matchWhere(doc, where = []) {
  return where.every(([field, op, val]) => {
    const v = field.split(".").reduce((a, k) => (a == null ? a : a[k]), doc);
    switch (op) {
      case "==": return v === val;
      case "!=": return v !== val;
      case ">": return v > val;
      case "<": return v < val;
      case ">=": return v >= val;
      case "<=": return v <= val;
      case "in": return Array.isArray(val) && val.includes(v);
      case "not-in": return Array.isArray(val) && !val.includes(v);
      case "array-contains": return Array.isArray(v) && v.includes(val);
      case "array-contains-any": return Array.isArray(v) && Array.isArray(val) && val.some(x => v.includes(x));
      default: return true;
    }
  });
}
function applyQuery(arr, q = {}) {
  let out = arr.filter(d => matchWhere(d, q.where));
  if (q.orderBy) {
    const [field, dir = "asc"] = Array.isArray(q.orderBy) ? q.orderBy : [q.orderBy];
    out.sort((a, b) => {
      const av = a[field], bv = b[field];
      if (av === bv) return 0;
      const r = av > bv ? 1 : -1;
      return dir === "desc" ? -r : r;
    });
  }
  if (q.limit) out = out.slice(0, q.limit);
  return out;
}

/* =====================================================================
   DEMO BACKEND — localStorage + BroadcastChannel
   ===================================================================== */
const LS_KEY = "onisteel:db:v1";
const LS_SESSION = "onisteel:session:v1";
const CHANNEL = "onisteel:sync";

class DemoBackend {
  constructor() {
    this.mode = "demo";
    this.data = this._read();
    this.subs = new Map(); // id -> {collection, query, cb}
    this.authSubs = new Set();
    this.channel = ("BroadcastChannel" in window) ? new BroadcastChannel(CHANNEL) : null;
    if (this.channel) this.channel.onmessage = (e) => this._onRemote(e.data);
    window.addEventListener("storage", (e) => { if (e.key === LS_KEY) { this.data = this._read(); this._fireAll(); } });
    this._session = this._readSession();
    this._heartbeat();
  }
  _read() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch { return {}; }
  }
  _write() {
    localStorage.setItem(LS_KEY, JSON.stringify(this.data));
  }
  _readSession() {
    try { return JSON.parse(localStorage.getItem(LS_SESSION)) || null; } catch { return null; }
  }
  _writeSession(s) {
    this._session = s;
    if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
    else localStorage.removeItem(LS_SESSION);
  }
  _col(name) { return (this.data[name] = this.data[name] || {}); }
  _all(name) { return Object.values(this._col(name)); }

  _broadcast(collection) {
    if (this.channel) this.channel.postMessage({ collection, t: now() });
  }
  _onRemote(msg) {
    this.data = this._read();
    if (msg && msg.collection) this._fireCollection(msg.collection);
    else this._fireAll();
  }
  _heartbeat() {
    // Presence: mark current user online, refresh lastSeen every 25s.
    const beat = () => {
      const s = this._session;
      if (s && this.data.users && this.data.users[s.uid]) {
        this.data.users[s.uid].lastSeen = now();
        this.data.users[s.uid].online = true;
        this._write();
        this._broadcast("users");
      }
    };
    setInterval(beat, 25000);
    window.addEventListener("beforeunload", () => {
      const s = this._session;
      if (s && this.data.users && this.data.users[s.uid]) {
        this.data.users[s.uid].online = false;
        this.data.users[s.uid].lastSeen = now();
        this._write();
      }
    });
  }

  /* ---- realtime firing ---- */
  _fireSub(sub) {
    if (sub.doc) {
      const d = this._col(sub.collection)[sub.id];
      sub.cb(d ? clone(d) : null);
    } else {
      sub.cb(applyQuery(this._all(sub.collection).map(clone), sub.query));
    }
  }
  _fireCollection(name) {
    for (const sub of this.subs.values()) if (sub.collection === name) this._fireSub(sub);
  }
  _fireAll() { for (const sub of this.subs.values()) this._fireSub(sub); }

  /* ---- data API ---- */
  watch(collection, query, cb) {
    const id = uid("sub");
    const sub = { collection, query, cb, doc: false };
    this.subs.set(id, sub);
    queueMicrotask(() => this._fireSub(sub));
    return () => this.subs.delete(id);
  }
  watchDoc(collection, docId, cb) {
    const id = uid("sub");
    const sub = { collection, id: docId, cb, doc: true };
    this.subs.set(id, sub);
    queueMicrotask(() => this._fireSub(sub));
    return () => this.subs.delete(id);
  }
  async list(collection, query) { return applyQuery(this._all(collection).map(clone), query); }
  async getDoc(collection, docId) { const d = this._col(collection)[docId]; return d ? clone(d) : null; }
  async add(collection, docData) {
    const id = docData.id || uid(collection.slice(0, 3));
    this._col(collection)[id] = { ...clone(docData), id, createdAt: docData.createdAt || now(), updatedAt: now() };
    this._write(); this._fireCollection(collection); this._broadcast(collection);
    return id;
  }
  async set(collection, docId, docData) {
    this._col(collection)[docId] = { ...clone(docData), id: docId, updatedAt: now() };
    this._write(); this._fireCollection(collection); this._broadcast(collection);
    return docId;
  }
  async update(collection, docId, patch) {
    const cur = this._col(collection)[docId] || { id: docId };
    this._col(collection)[docId] = { ...cur, ...clone(patch), id: docId, updatedAt: now() };
    this._write(); this._fireCollection(collection); this._broadcast(collection);
  }
  async remove(collection, docId) {
    delete this._col(collection)[docId];
    this._write(); this._fireCollection(collection); this._broadcast(collection);
  }
  async batch(ops) {
    for (const op of ops) {
      if (op.type === "set") this._col(op.collection)[op.id] = { ...clone(op.data), id: op.id, updatedAt: now() };
      else if (op.type === "update") { const c = this._col(op.collection)[op.id] || { id: op.id }; this._col(op.collection)[op.id] = { ...c, ...clone(op.data), id: op.id, updatedAt: now() }; }
      else if (op.type === "add") { const id = op.data.id || uid(op.collection.slice(0,3)); this._col(op.collection)[id] = { ...clone(op.data), id, createdAt: now(), updatedAt: now() }; }
      else if (op.type === "remove") delete this._col(op.collection)[op.id];
    }
    this._write();
    const cols = [...new Set(ops.map(o => o.collection))];
    cols.forEach(c => { this._fireCollection(c); this._broadcast(c); });
  }

  /* ---- file "upload": inline data URL (compressed for images) ---- */
  async uploadFile(path, file, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
      reader.onload = async () => {
        let url = reader.result;
        if (file.type && file.type.startsWith("image/") && file.size > 400 * 1024) {
          try { url = await compressImage(url, 1600, 0.82); } catch {}
        }
        if (onProgress) onProgress(1);
        resolve({ url, path, size: file.size, name: file.name, type: file.type });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---- AUTH ---- */
  onAuth(cb) {
    this.authSubs.add(cb);
    queueMicrotask(() => cb(this.currentUser()));
    return () => this.authSubs.delete(cb);
  }
  _emitAuth() { const u = this.currentUser(); this.authSubs.forEach(cb => cb(u)); }
  currentUser() {
    const s = this._session;
    if (!s) return null;
    const u = this._col("users")[s.uid];
    return u ? clone(u) : { uid: s.uid, id: s.uid, email: s.email, displayName: s.displayName };
  }
  async register({ email, password, displayName, username }) {
    email = email.trim().toLowerCase();
    const exists = this._all("users").find(u => u.email === email);
    if (exists) throw authError("auth/email-already-in-use", "That email is already registered.");
    const id = uid("usr");
    const user = {
      id, uid: id, email, displayName: displayName || username || email.split("@")[0],
      username: (username || email.split("@")[0]).toLowerCase().replace(/\s+/g, ""),
      pw: hashPw(password), photoURL: "", banner: "", bio: "", role: "programmer",
      skills: [], status: "online", online: true, emailVerified: false,
      createdAt: now(), lastSeen: now(),
      stats: { tasksAssigned: 0, tasksCompleted: 0, hoursLogged: 0, comments: 0, streak: 0 }
    };
    this._col("users")[id] = user;
    this._write(); this._broadcast("users");
    this._writeSession({ uid: id, email, displayName: user.displayName });
    this._emitAuth();
    return clone(user);
  }
  async login(email, password, remember = true) {
    email = email.trim().toLowerCase();
    const u = this._all("users").find(x => x.email === email);
    if (!u) throw authError("auth/user-not-found", "No account found with that email.");
    if (u.pw !== hashPw(password)) throw authError("auth/wrong-password", "Incorrect password.");
    u.online = true; u.lastSeen = now(); this._write(); this._broadcast("users");
    this._writeSession({ uid: u.id, email: u.email, displayName: u.displayName });
    this._emitAuth();
    return clone(u);
  }
  async loginWithGoogle() {
    // Demo mode has no real OAuth — simulate a stable "Google" account on this device.
    const email = "google.user@onisteel.studio";
    let u = this._all("users").find(x => x.email === email);
    let isNew = false;
    if (!u) {
      const id = uid("usr");
      u = {
        id, uid: id, email, displayName: "Google User", username: "googleuser",
        pw: hashPw("google-demo-" + id), photoURL: "", banner: "", bio: "", role: "owner",
        skills: [], status: "online", online: true, emailVerified: true, provider: "google",
        createdAt: now(), lastSeen: now(),
        stats: { tasksAssigned: 0, tasksCompleted: 0, hoursLogged: 0, comments: 0, streak: 0 }
      };
      this._col("users")[id] = u; this._write(); this._broadcast("users");
      isNew = true;
    }
    u.online = true; u.lastSeen = now(); this._write();
    this._writeSession({ uid: u.id, email: u.email, displayName: u.displayName });
    this._emitAuth();
    return { user: clone(u), isNew };
  }
  async logout() {
    const s = this._session;
    if (s && this._col("users")[s.uid]) { this._col("users")[s.uid].online = false; this._write(); this._broadcast("users"); }
    this._writeSession(null);
    this._emitAuth();
  }
  async resetPassword(email) {
    email = email.trim().toLowerCase();
    const u = this._all("users").find(x => x.email === email);
    if (!u) throw authError("auth/user-not-found", "No account found with that email.");
    // Demo: surface a deterministic reset token instead of sending mail.
    return { demoToken: hashPw(email + "reset").slice(0, 6).toUpperCase() };
  }
  async applyReset(email, newPassword) {
    email = email.trim().toLowerCase();
    const u = this._all("users").find(x => x.email === email);
    if (u) { u.pw = hashPw(newPassword); this._write(); }
  }
  async sendVerification() {
    const s = this._session; if (!s) return;
    const u = this._col("users")[s.uid];
    if (u) { u.emailVerified = true; this._write(); this._broadcast("users"); this._emitAuth(); }
    return true;
  }
  async updateAuthProfile(patch) {
    const s = this._session; if (!s) return;
    const u = this._col("users")[s.uid];
    if (u) {
      Object.assign(u, patch, { updatedAt: now() });
      this._write(); this._broadcast("users");
      if (patch.displayName) this._writeSession({ ...s, displayName: patch.displayName });
      this._emitAuth();
    }
  }
  async changePassword(current, next) {
    const s = this._session; if (!s) throw authError("auth/no-user", "Not signed in.");
    const u = this._col("users")[s.uid];
    if (u.pw !== hashPw(current)) throw authError("auth/wrong-password", "Current password is incorrect.");
    u.pw = hashPw(next); this._write();
  }
  async deleteAccount() {
    const s = this._session; if (!s) return;
    delete this._col("users")[s.uid];
    this._write(); this._broadcast("users");
    this._writeSession(null); this._emitAuth();
  }
}

/* =====================================================================
   FIREBASE BACKEND
   ===================================================================== */
class FirebaseBackend {
  constructor(sdk) {
    this.mode = "firebase";
    this.sdk = sdk;
    this.fs = sdk.fsMod;
    this.db = sdk.db;
    this.auth = sdk.auth;
    this.storage = sdk.storage;
    this.st = sdk.storeMod;
    this.authApi = sdk.authMod;
  }
  _q(collection, query = {}) {
    const { fs, db } = this;
    const parts = [fs.collection(db, collection)];
    (query.where || []).forEach(([f, op, v]) => parts.push(fs.where(f, op, v)));
    if (query.orderBy) {
      const [f, dir = "asc"] = Array.isArray(query.orderBy) ? query.orderBy : [query.orderBy];
      parts.push(fs.orderBy(f, dir));
    }
    if (query.limit) parts.push(fs.limit(query.limit));
    return fs.query(...parts);
  }
  watch(collection, query, cb) {
    return this.fs.onSnapshot(this._q(collection, query),
      (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => { console.warn("watch error", collection, err); cb([]); });
  }
  watchDoc(collection, docId, cb) {
    return this.fs.onSnapshot(this.fs.doc(this.db, collection, docId),
      (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null),
      () => cb(null));
  }
  async list(collection, query) {
    const snap = await this.fs.getDocs(this._q(collection, query));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async getDoc(collection, docId) {
    const d = await this.fs.getDoc(this.fs.doc(this.db, collection, docId));
    return d.exists() ? { id: d.id, ...d.data() } : null;
  }
  async add(collection, docData) {
    const ref = await this.fs.addDoc(this.fs.collection(this.db, collection),
      { ...docData, createdAt: docData.createdAt || now(), updatedAt: now() });
    return ref.id;
  }
  async set(collection, docId, docData) {
    await this.fs.setDoc(this.fs.doc(this.db, collection, docId), { ...docData, updatedAt: now() });
    return docId;
  }
  async update(collection, docId, patch) {
    await this.fs.updateDoc(this.fs.doc(this.db, collection, docId), { ...patch, updatedAt: now() });
  }
  async remove(collection, docId) {
    await this.fs.deleteDoc(this.fs.doc(this.db, collection, docId));
  }
  async batch(ops) {
    const b = this.fs.writeBatch(this.db);
    for (const op of ops) {
      const ref = op.id ? this.fs.doc(this.db, op.collection, op.id) : this.fs.doc(this.fs.collection(this.db, op.collection));
      if (op.type === "set") b.set(ref, { ...op.data, updatedAt: now() });
      else if (op.type === "update") b.update(ref, { ...op.data, updatedAt: now() });
      else if (op.type === "add") b.set(ref, { ...op.data, createdAt: now(), updatedAt: now() });
      else if (op.type === "remove") b.delete(ref);
    }
    await b.commit();
  }
  async uploadFile(path, file, onProgress) {
    const ref = this.st.ref(this.storage, path);
    const task = this.st.uploadBytesResumable(ref, file, { contentType: file.type });
    return new Promise((resolve, reject) => {
      task.on("state_changed",
        (s) => { if (onProgress) onProgress(s.bytesTransferred / s.totalBytes); },
        reject,
        async () => {
          const url = await this.st.getDownloadURL(task.snapshot.ref);
          resolve({ url, path, size: file.size, name: file.name, type: file.type });
        });
    });
  }

  /* ---- AUTH ---- */
  onAuth(cb) {
    return this.authApi.onAuthStateChanged(this.auth, async (fbUser) => {
      if (!fbUser) return cb(null);
      let profile = await this.getDoc("users", fbUser.uid);
      if (!profile) {
        profile = {
          id: fbUser.uid, uid: fbUser.uid, email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email.split("@")[0],
          username: (fbUser.email.split("@")[0]).toLowerCase(),
          photoURL: fbUser.photoURL || "", banner: "", bio: "", role: "programmer",
          skills: [], status: "online", online: true, emailVerified: fbUser.emailVerified,
          createdAt: now(), lastSeen: now(),
          stats: { tasksAssigned: 0, tasksCompleted: 0, hoursLogged: 0, comments: 0, streak: 0 }
        };
        await this.set("users", fbUser.uid, profile);
      }
      cb({ ...profile, emailVerified: fbUser.emailVerified });
    });
  }
  currentUser() {
    const u = this.auth.currentUser;
    return u ? { uid: u.uid, id: u.uid, email: u.email, displayName: u.displayName, emailVerified: u.emailVerified } : null;
  }
  async register({ email, password, displayName, username }) {
    const cred = await this.authApi.createUserWithEmailAndPassword(this.auth, email, password);
    await this.authApi.updateProfile(cred.user, { displayName: displayName || username });
    const profile = {
      id: cred.user.uid, uid: cred.user.uid, email, displayName: displayName || username,
      username: (username || email.split("@")[0]).toLowerCase(), photoURL: "", banner: "", bio: "",
      role: "programmer", skills: [], status: "online", online: true, emailVerified: false,
      createdAt: now(), lastSeen: now(),
      stats: { tasksAssigned: 0, tasksCompleted: 0, hoursLogged: 0, comments: 0, streak: 0 }
    };
    await this.set("users", cred.user.uid, profile);
    try { await this.authApi.sendEmailVerification(cred.user); } catch {}
    return profile;
  }
  async login(email, password, remember = true) {
    await this.authApi.setPersistence(this.auth,
      remember ? this.authApi.browserLocalPersistence : this.authApi.browserSessionPersistence);
    const cred = await this.authApi.signInWithEmailAndPassword(this.auth, email, password);
    await this.update("users", cred.user.uid, { online: true, lastSeen: now() });
    return this.getDoc("users", cred.user.uid);
  }
  async loginWithGoogle() {
    const provider = new this.authApi.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const cred = await this.authApi.signInWithPopup(this.auth, provider);
    const info = this.authApi.getAdditionalUserInfo ? this.authApi.getAdditionalUserInfo(cred) : null;
    const u = cred.user;
    let profile = await this.getDoc("users", u.uid);
    const isNew = (info && info.isNewUser) || !profile;
    if (!profile) {
      profile = {
        id: u.uid, uid: u.uid, email: u.email,
        displayName: u.displayName || u.email.split("@")[0],
        username: (u.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]/g, ""),
        photoURL: u.photoURL || "", banner: "", bio: "", role: "programmer",
        skills: [], status: "online", online: true, emailVerified: !!u.emailVerified,
        provider: "google", createdAt: now(), lastSeen: now(),
        stats: { tasksAssigned: 0, tasksCompleted: 0, hoursLogged: 0, comments: 0, streak: 0 }
      };
      await this.set("users", u.uid, profile);
    } else {
      await this.update("users", u.uid, { online: true, lastSeen: now() });
    }
    return { user: profile, isNew };
  }
  async logout() {
    const u = this.auth.currentUser;
    if (u) { try { await this.update("users", u.uid, { online: false, lastSeen: now() }); } catch {} }
    await this.authApi.signOut(this.auth);
  }
  async resetPassword(email) { await this.authApi.sendPasswordResetEmail(this.auth, email); return {}; }
  async sendVerification() { const u = this.auth.currentUser; if (u) await this.authApi.sendEmailVerification(u); return true; }
  async updateAuthProfile(patch) {
    const u = this.auth.currentUser; if (!u) return;
    if (patch.displayName || patch.photoURL)
      await this.authApi.updateProfile(u, { displayName: patch.displayName, photoURL: patch.photoURL });
    await this.update("users", u.uid, patch);
  }
  async changePassword(current, next) {
    const u = this.auth.currentUser;
    const cred = this.authApi.EmailAuthProvider.credential(u.email, current);
    await this.authApi.reauthenticateWithCredential(u, cred);
    await this.authApi.updatePassword(u, next);
  }
  async deleteAccount() {
    const u = this.auth.currentUser; if (!u) return;
    await this.remove("users", u.uid);
    await this.authApi.deleteUser(u);
  }
}

/* =====================================================================
   Utility: image compression (shared)
   ===================================================================== */
export function compressImage(dataURL, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale); height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}

function authError(code, message) { const e = new Error(message); e.code = code; return e; }
export function friendlyAuthError(err) {
  const map = {
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-email": "That email address looks invalid.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Try again in a moment.",
    "auth/network-request-failed": "Network error. Check your connection."
  };
  return map[err && err.code] || (err && err.message) || "Something went wrong.";
}

/* =====================================================================
   Backend bootstrap (singleton)
   ===================================================================== */
let _backend = null;
let _initPromise = null;
let _readyResolve;
export const backendReady = new Promise((r) => (_readyResolve = r));

export function initBackend() {
  if (_backend) return Promise.resolve(_backend);
  // If an init is already in flight (e.g. authBoot started it), share that same
  // promise so concurrent callers all wait for the one initialization instead of
  // racing ahead and hitting "Backend not initialized".
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    // Register the service worker (PWA / offline) when served over http(s).
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
    if (FIREBASE_ENABLED) {
      try {
        const sdk = await loadFirebase();
        _backend = new FirebaseBackend(sdk);
      } catch (e) {
        console.warn("Firebase init failed, falling back to demo mode:", e);
        _backend = new DemoBackend();
      }
    } else {
      _backend = new DemoBackend();
    }
    _readyResolve(_backend);
    return _backend;
  })();
  return _initPromise;
}
export function backend() {
  if (!_backend) throw new Error("Backend not initialized — call initBackend() first.");
  return _backend;
}
export function backendMode() { return _backend ? _backend.mode : (FIREBASE_ENABLED ? "firebase" : "demo"); }

/* =====================================================================
   Public facade: DB + Auth
   ===================================================================== */
export const DB = {
  watch: (c, q, cb) => backend().watch(c, q, cb),
  watchDoc: (c, id, cb) => backend().watchDoc(c, id, cb),
  list: (c, q) => backend().list(c, q),
  getDoc: (c, id) => backend().getDoc(c, id),
  add: (c, d) => backend().add(c, d),
  set: (c, id, d) => backend().set(c, id, d),
  update: (c, id, p) => backend().update(c, id, p),
  remove: (c, id) => backend().remove(c, id),
  batch: (ops) => backend().batch(ops),
  uploadFile: (path, file, onProg) => backend().uploadFile(path, file, onProg)
};

export const Auth = {
  onChange: (cb) => backend().onAuth(cb),
  current: () => backend().currentUser(),
  register: (data) => backend().register(data),
  login: (e, p, r) => backend().login(e, p, r),
  loginWithGoogle: () => backend().loginWithGoogle(),
  logout: () => backend().logout(),
  resetPassword: (e) => backend().resetPassword(e),
  applyReset: (e, p) => backend().applyReset ? backend().applyReset(e, p) : Promise.resolve(),
  sendVerification: () => backend().sendVerification(),
  updateProfile: (p) => backend().updateAuthProfile(p),
  changePassword: (c, n) => backend().changePassword(c, n),
  deleteAccount: () => backend().deleteAccount()
};
