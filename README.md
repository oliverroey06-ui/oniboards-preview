<div align="center">

<img src="assets/images/logo.svg" width="88" alt="OniSteel Studios">

# OniSteel Studios Board

### Forge worlds. Ship games.

A premium, realtime **game‑development project management platform** — built for indie and AAA studios. Boards, tasks, chat, calendars, wikis, asset libraries, analytics and a collaborative whiteboard, wrapped in a cyber‑steel dark UI.

**Pure HTML · CSS · JavaScript (ES6 modules)** · No build step · No paid services · Deploys straight to GitHub Pages.

</div>

---

## ✨ Highlights

- **Runs instantly in Demo Mode** — a full local backend (localStorage + `BroadcastChannel`) mimics realtime Firestore sync across browser tabs, so the app works the moment you open it, with zero configuration.
- **Plug in Firebase for real cloud sync** — add your web config to one file and every change syncs live across every device.
- **One consistent data API** (`DB` / `Auth`) means the entire app is backend‑agnostic — swap Demo ↔ Firebase without touching feature code.
- **Beautiful, responsive, accessible** — glassmorphism, smooth micro‑animations, keyboard shortcuts, command palette, light/dark, high‑contrast and reduced‑motion modes.

---

## 🎮 Features

| Area | What's inside |
|---|---|
| **Auth** | Register, login, forgot/reset password, email verification, remember‑me, profile pictures, account settings |
| **Dashboard** | Recent activity, project overview, upcoming deadlines, my tasks, notifications, recent files & chat, mini‑calendar, productivity charts, quick actions, live stats |
| **Workspaces** | Unlimited workspaces, members, invitations, settings, accent colors, export/import & backup |
| **Boards** | Unlimited Trello‑style boards, 9 default columns + unlimited custom columns, animated drag‑and‑drop, list view, filters, templates (Programming, Art, Animation, 3D, UI, Audio, QA, Marketing…) |
| **Task cards** | Rich‑text description, images/videos/GIFs/attachments/links, priority, difficulty, estimated & logged hours, completion %, labels, tags, checklist, subtasks, dependencies, milestones, story points, comments, activity log, version history, pin/archive/duplicate/clone/move/favorite/watch |
| **Assignments** | Assign to one/many users, roles & departments, avatars, assignment history |
| **Team roles** | 20 built‑in roles (Owner → Viewer), tier‑based permission model, in‑app role editor |
| **Deadlines** | Start/due dates & times, countdowns, overdue highlighting, reminders, priority alerts |
| **Calendar** | Month · Week · Day · Agenda · Timeline (Gantt) views, drag tasks to reschedule, milestones |
| **Chat** | Realtime channels, DMs, typing indicators, read receipts, emoji, GIF/sticker picker, image/video upload, voice notes, mentions, pinned messages, reactions, search |
| **Notifications** | Realtime in‑app + browser notifications, unread badges, per‑type preferences |
| **Search** | Global search across tasks, boards, files, people, wiki, notes |
| **Files & Assets** | Drag‑and‑drop uploads, folders, categories, tags, image/video/audio previews, download/rename/move/delete, version history, storage meter |
| **Profiles** | Avatar, banner, bio, skills, role, presence, stats, achievements, hours logged |
| **Time tracking** | Start/pause/stop timer, manual entries, per‑user & per‑project totals, reports |
| **Analytics** | Completion charts, burndown, velocity, productivity trend, hours by teammate, user performance, activity heatmap |
| **Wiki** | Markdown pages with images, tables, code blocks, and full version history |
| **Notes** | Private/shared/pinned notes, folders, colors, search |
| **Whiteboard** | Realtime canvas — pen, shapes, arrows, text, sticky notes, mind‑map connectors, export to PNG |
| **Settings** | Theme, accent, notifications, accessibility, language, storage & data, security |

---

## 🚀 Quick start (Demo Mode)

No setup required.

```bash
# 1. Clone
git clone https://github.com/<you>/onisteel-studios-board.git
cd onisteel-studios-board

# 2. Serve locally (any static server works)
python3 -m http.server 8080
#   or:  npx serve .
```

Open **http://localhost:8080** and click **“Launch instant demo studio.”** A complete sample studio — teammates, boards, tasks, chat, files and a wiki — is generated for you.

> Because it uses ES6 modules, the app must be served over `http(s)://`, not opened as a `file://` path.

---

## 🔥 Connect Firebase (realtime multi‑device sync)

Demo Mode is per‑device. To sync across devices and users, connect a **free** Firebase project.

1. Create a project at **https://console.firebase.google.com**.
2. **Authentication → Sign‑in method →** enable **Email/Password**.
3. **Firestore Database → Create database** (production mode).
4. **Storage → Get started** (optional — enables large binary uploads; without it, images are compressed and stored inline so uploads still work on the free tier).
5. **Project settings → Your apps → Web app** → copy the config object.
6. Paste it into **`js/firebase.js`**:

```js
export const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "…",
  appId: "1:…:web:…"
};
```

7. Deploy the security rules & indexes (recommended):

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # select your project
firebase deploy --only firestore:rules,firestore:indexes,storage
```

That's it — the app detects the config automatically and switches from Demo Mode to live Firebase sync. The account badge in the top‑right shows which backend is active.

---

## 🌐 Deploy to GitHub Pages

```bash
git add .
git commit -m "Deploy OniSteel Studios Board"
git push origin main
```

Then in your repository: **Settings → Pages → Build and deployment → Source: “Deploy from a branch” → `main` / `/ (root)` → Save.**

Your app goes live at `https://<you>.github.io/<repo>/`. It's a static site — no server needed. (You can also run `firebase deploy --only hosting` to host it on Firebase instead.)

> **Add your production domain** to Firebase → Authentication → Settings → **Authorized domains** so sign‑in works on GitHub Pages.

---

## 📁 Folder structure

```
onisteel-studios-board/
├── index.html            # Landing + auth (login / register / forgot)
├── login.html            # Dedicated sign-in
├── register.html         # Dedicated sign-up
├── dashboard.html        # Home dashboard
├── workspace.html        # Boards hub + workspace settings
├── board.html            # Kanban board view
├── calendar.html         # Calendar (month/week/day/agenda/timeline)
├── chat.html             # Realtime chat
├── files.html            # File manager & asset library
├── docs.html             # Wiki
├── notes.html            # Notes
├── whiteboard.html       # Collaborative whiteboard
├── analytics.html        # Analytics & reports
├── members.html          # Members, roles & permissions
├── profile.html          # User profiles
├── settings.html         # Settings
├── manifest.webmanifest  # PWA manifest
├── sw.js                 # Service worker (offline / PWA)
├── firebase.json         # Firebase hosting + rules config
│
├── css/
│   ├── styles.css        # Design system (tokens, components, shell, responsive)
│   ├── auth.css  boards.css  chat.css  calendar.css
│   ├── dashboard.css  pages.css  docs.css  files.css  whiteboard.css
│
├── js/
│   ├── firebase.js       # Firebase config + lazy SDK loader
│   ├── store.js          # Unified data layer (Firebase ⟷ Demo), Auth + DB
│   ├── constants.js      # Roles, columns, priorities, labels, file types…
│   ├── app.js            # App shell: sidebar, topbar, search, notifications, palette
│   ├── ui.js             # UI kit: modals, toasts, menus, formatters, markdown
│   ├── icons.js          # SVG icon library
│   ├── editor.js         # Rich-text editor
│   ├── charts.js         # SVG chart engine
│   ├── auth.js  seed.js  users.js  notifications.js
│   ├── boards.js  tasks.js  chat.js  calendar.js
│   ├── dashboard.js  analytics.js  workspace.js  members.js
│   ├── profile.js  settings.js  docs.js  notes.js  whiteboard.js  files.js
│
├── firebase/
│   ├── firestore.rules   # Firestore security rules
│   ├── storage.rules     # Storage security rules
│   └── firestore.indexes.json
│
├── assets/images/        # Logo, favicon
├── README.md
└── LICENSE
```

---

## 📸 Screenshots

> Add your own captures here after deploying.

| Dashboard | Kanban Board | Task Detail |
|---|---|---|
| `docs/screenshot-dashboard.png` | `docs/screenshot-board.png` | `docs/screenshot-task.png` |

| Chat | Calendar | Analytics |
|---|---|---|
| `docs/screenshot-chat.png` | `docs/screenshot-calendar.png` | `docs/screenshot-analytics.png` |

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Command palette |
| `/` | Focus global search |
| `N` | New task |
| `G` then `D / B / C / K` | Go to Dashboard / Boards / Chat / Calendar |
| `?` | Show all shortcuts |
| `Esc` | Close dialog |

---

## 🗺️ Roadmap

- [ ] Google / GitHub OAuth sign‑in
- [ ] Real‑time cursors on the whiteboard
- [ ] Sprint planning board & backlog grooming view
- [ ] Automations & rules ("when moved to Done → notify #general")
- [ ] Guest share links for individual boards
- [ ] Native mobile wrapper (Capacitor)
- [ ] AI task summaries & standup generation
- [ ] Tenor/Giphy GIF integration

---

## 🛠️ Tech notes

- **No framework, no bundler** — plain ES6 modules loaded natively by the browser.
- **`DB` / `Auth` facade** abstracts the backend; `store.js` ships two implementations (`FirebaseBackend`, `DemoBackend`) behind an identical API.
- **Realtime everywhere** — Firestore `onSnapshot` in cloud mode; `BroadcastChannel` + `storage` events in demo mode.
- **PWA‑ready** — installable, offline‑capable via `sw.js` and the web manifest.

---

## 🤝 Credits

Designed & engineered as the **OniSteel Studios Board**.
Icons are original, Feather‑style SVGs. Fonts: **Inter**, **Orbitron**, **JetBrains Mono** (Google Fonts). Firebase by Google.

---

## 📄 License

Released under the **MIT License** — see [`LICENSE`](LICENSE).

<div align="center">

**OniSteel Studios** · Forge worlds. Ship games.

</div>
