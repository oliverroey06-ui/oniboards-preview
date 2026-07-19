/* ============================================================
   OniSteel Studios Board — Firebase Configuration & Loader
   ------------------------------------------------------------
   HOW TO CONNECT YOUR OWN BACKEND
   1. Create a free Firebase project at https://console.firebase.google.com
   2. Enable Authentication (Email/Password), Firestore, and Storage.
   3. Copy your web-app config object below (replace the placeholder).
   4. Deploy firestore.rules / storage.rules from the /firebase folder.
   5. Push to GitHub Pages — done. Realtime sync works across all devices.

   Until a real config is provided the app runs in DEMO MODE:
   a fully-functional offline backend (localStorage + BroadcastChannel)
   that mimics Firestore realtime sync across browser tabs.
   ============================================================ */

export const firebaseConfig = {
  apiKey: "AIzaSyA5WxnWnw52ftiIWd2c9ibIhMe4pQpkcwg",
  authDomain: "onisteel-board.firebaseapp.com",
  projectId: "onisteel-board",
  storageBucket: "onisteel-board.firebasestorage.app",
  messagingSenderId: "249691726043",
  appId: "1:249691726043:web:cdb0bbfc128af293436cfe"
};

/* Detects whether a real Firebase config has been supplied. */
export const FIREBASE_ENABLED =
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "REPLACE_ME" &&
  firebaseConfig.projectId !== "REPLACE_ME";

const SDK_VERSION = "10.12.2";
const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

let _sdk = null;

/**
 * Lazily loads the Firebase modular SDK from the official CDN and
 * initializes app/auth/firestore/storage. Returns a bundle of the
 * live instances plus the imported function references so the rest
 * of the app can stay decoupled from the import URLs.
 */
export async function loadFirebase() {
  if (_sdk) return _sdk;
  if (!FIREBASE_ENABLED) throw new Error("Firebase not configured — using demo mode.");

  const [appMod, authMod, fsMod, storeMod] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
    import(`${CDN}/firebase-storage.js`)
  ]);

  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);
  const storage = storeMod.getStorage(app);

  // Best-effort offline persistence (multi-tab).
  try { await fsMod.enableMultiTabIndexedDbPersistence(db); }
  catch (e) { /* multiple tabs or unsupported — safe to ignore */ }

  _sdk = { app, auth, db, storage, appMod, authMod, fsMod, storeMod };
  return _sdk;
}
