# Get OniSteel Studios Board online — GitHub Pages + Firebase Spark (free)

This is the **5-minute account setup** — the only part that has to be done by you,
because it means signing in with your Google account and accepting each service's
terms. Everything else (rules, config wiring, deployment) is already done in the code.

Steps marked **→ [YOU]** need your Google login / a terms checkbox. The rest is
copy-paste.

---

## Part 1 — Firebase (the realtime backend) · ~3 min

1. **→ [YOU]** Go to **https://console.firebase.google.com** and sign in with
   `oliverroebuck06@gmail.com`.
2. Click **Add project** → name it `onisteel-board` → Continue.
   You can **turn OFF Google Analytics** (not needed) → Create project.
   *(Accepting the Firebase terms here is the "you" bit.)*
3. In the left sidebar open **Build → Authentication → Get started**.
   - Enable **Email/Password** (toggle on → Save).
   - Enable **Google** (toggle on → pick `oliverroebuck06@gmail.com` as support
     email → Save). *This is what powers the "Continue with Google" button.*
4. **Build → Firestore Database → Create database** → Start in **production mode**
   → pick the region closest to your team → Enable.
5. **Build → Storage → Get started** → Next → Done. *(Optional — enables large file
   uploads. Skip it and images still work, compressed inline.)*
6. Click the **⚙ gear → Project settings**. Scroll to **Your apps** → click the
   **`</>` (Web)** icon → nickname `onisteel` → **Register app**.
7. Copy the `firebaseConfig = { … }` block it shows you. **Send it to me**, or paste
   it yourself into **`js/firebase.js`** (replace the `REPLACE_ME` block at the top).

That's the whole backend. The app auto-detects the config and switches from demo
mode to live cloud sync.

---

## Part 2 — GitHub Pages (hosts the site) · ~2 min

1. **→ [YOU]** Go to **https://github.com** and sign in (or **Sign up** — you can
   use "Continue with Google" and `oliverroebuck06@gmail.com`).
2. Click **New repository** → name `onisteel-board` → **Public** → Create.
3. On the empty repo page click **uploading an existing file**, drag in **all the
   files from this project folder**, and **Commit**.
4. Go to **Settings → Pages** → under *Build and deployment* set **Source =
   Deploy from a branch**, **Branch = `main` / `(root)`** → **Save**.
5. Wait ~1 minute. Your live URL appears at the top of that Pages screen:
   `https://<your-username>.github.io/onisteel-board/`

---

## Part 3 — Two small connections (so login works on the live URL)

1. Back in **Firebase → Authentication → Settings → Authorized domains → Add
   domain**, add your GitHub Pages domain: `<your-username>.github.io`.
2. **(Recommended)** Deploy the security rules so only your team can read/write:
   ```bash
   npm install -g firebase-tools
   firebase login          # → [YOU] opens a Google sign-in
   firebase use --add      # pick onisteel-board
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
   *(If you skip this, tell me and I'll set the rules through the console with you.)*

---

## Then: invite your 20 people

- You sign in first (Continue with Google) → you're the **Owner**.
- Create your workspaces/boards, then **Members → Invite** → paste each teammate's
  email (or share the invite link).
- Teammates open the URL → **Continue with Google** → they're in. No passwords.

## Staying free (Firebase Spark)

Auth, hosting and 1 GiB Firestore are free. The one meter to watch is **50,000
reads/day** — the app is already tuned to stay well under that for ~20 people
(the user list is cached, queries are workspace-scoped, and offline persistence
serves repeats). Keep big game binaries (BLEND/FBX/trailers) linked from Drive
rather than uploaded, so you don't fill the 5 GB storage.
