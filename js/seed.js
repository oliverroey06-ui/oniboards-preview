/* ============================================================
   OniSteel Studios Board — Demo Seed Data
   Populates a brand-new account with a believable game studio:
   teammates, workspaces, boards, tasks, chat, files, wiki, notes,
   activity and notifications — so the app feels alive instantly.
   ============================================================ */
import { DB, uid } from "./store.js";
import { DEFAULT_COLUMNS } from "./constants.js";
import { addMember } from "./users.js";

const day = 86400000, hour = 3600000;
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

/* Believable teammates */
const TEAM = [
  { displayName: "Sarah Chen",     username: "sarahc",   role: "studio_director", color: "#C12A2A", bio: "Studio director. 12 years shipping games. Ex-Naughty Dog.", skills: ["Producing","Level Design","Narrative"] },
  { displayName: "Marcus Vale",    username: "mvale",    role: "lead_developer",  color: "#4D8F91", bio: "Lead engineer. Unreal & custom engines. Loves gameplay systems.", skills: ["Unreal","C++","Gameplay","Networking"] },
  { displayName: "Yuki Tanaka",    username: "yukitanaka",role: "artist_3d",      color: "#6B8BD1", bio: "3D character artist. ZBrush wizard.", skills: ["Blender","ZBrush","Substance","Rigging"] },
  { displayName: "Elena Rossi",    username: "elenar",   role: "concept_artist",  color: "#8A6BD1", bio: "Concept & environment art. World-building enthusiast.", skills: ["Photoshop","Level Design","VFX"] },
  { displayName: "Diego Santos",   username: "dsantos",  role: "animator",        color: "#6BB0D1", bio: "Gameplay animator. Motion capture cleanup.", skills: ["Maya","Rigging","Unity"] },
  { displayName: "Aisha Bello",    username: "aisha",    role: "ux_designer",     color: "#D1A66B", bio: "UX designer. Player-first interfaces.", skills: ["UI/UX","Level Design"] },
  { displayName: "Tom Fisher",     username: "tomf",     role: "programmer",      color: "#5B8BB0", bio: "Gameplay programmer. Combat systems & AI.", skills: ["Unity","C#","AI","Gameplay"] },
  { displayName: "Nadia Petrov",   username: "nadiap",   role: "composer",        color: "#8AB06B", bio: "Composer & audio director. Adaptive soundtracks.", skills: ["Composition","Sound Design"] },
  { displayName: "Ryan Cole",      username: "ryanc",    role: "qa_tester",       color: "#B06B6B", bio: "QA lead. Breaks everything so players don't.", skills: ["Gameplay"] },
  { displayName: "Mia Nakamura",   username: "mian",     role: "community_manager",color: "#B06BD1", bio: "Community & marketing. Discord & socials.", skills: ["Marketing","Community"] }
];

const WORKSPACES = [
  { name: "Project Oni",     color: "#4D6B91", description: "Flagship action-RPG. Steel-punk world, spirit combat." },
  { name: "Project Echo",    color: "#8A6BD1", description: "Atmospheric narrative adventure. First-person exploration." },
  { name: "Project Crimson", color: "#C12A2A", description: "Fast-paced roguelite shooter. Co-op focused." }
];

const BOARDS = ["Programming", "Art", "Animation", "3D Models", "UI", "Audio", "QA", "Marketing"];

const TASK_BANK = {
  Programming: [
    ["Implement spirit-dash traversal", "Add the mid-air dash with i-frames and cooldown. Tune against combat pacing.", "high", "hard"],
    ["Fix save/load corruption on chapter 3", "Serialized inventory occasionally drops equipped items. Repro on autosave.", "critical", "hard"],
    ["Enemy AI: flanking behavior", "Ranged enemies should reposition when the player takes cover.", "medium", "medium"],
    ["Optimize shadow cascades", "Frame spikes in the forest zone. Profile and reduce cascade count.", "high", "medium"],
    ["Controller remapping UI hooks", "Wire input rebinding to the settings menu.", "low", "easy"],
    ["Boss phase transition scripting", "Sequence the second-phase arena collapse.", "high", "epic"],
    ["Steam achievements integration", "Hook 24 achievements to gameplay events.", "medium", "medium"]
  ],
  Art: [
    ["Oni mask concept variations", "5 silhouette explorations for the antagonist mask.", "high", "medium"],
    ["Forest shrine environment paint", "Key art for the shrine hub area.", "medium", "hard"],
    ["Weapon icon set (32)", "Consistent icon language for the arsenal.", "low", "medium"],
    ["Crimson district mood board", "Lighting and palette study for the finale district.", "medium", "easy"],
    ["Character costume trim sheets", "Reusable steel trim materials.", "medium", "medium"]
  ],
  Animation: [
    ["Player idle breathing loop", "Subtle 4s idle with weapon settle.", "low", "easy"],
    ["Spirit-blade combo chain", "3-hit ground combo + finisher.", "high", "hard"],
    ["Cinematic: awakening intro", "20s in-engine intro animation.", "high", "epic"],
    ["Enemy stagger reactions", "Directional hit reactions for grunts.", "medium", "medium"]
  ],
  "3D Models": [
    ["Protagonist high-poly sculpt", "ZBrush sculpt ready for retopo.", "high", "epic"],
    ["Modular ruin kit", "Wall, arch, floor, rubble pieces.", "medium", "hard"],
    ["Katana + sheath asset", "Hero weapon with PBR textures.", "medium", "medium"],
    ["Lantern prop set", "Interactive light props.", "low", "easy"]
  ],
  UI: [
    ["HUD redesign v2", "Cleaner health/spirit meters, less clutter.", "high", "medium"],
    ["Inventory grid interaction", "Drag-to-equip with controller support.", "medium", "medium"],
    ["Main menu motion pass", "Parallax + steel particle ambience.", "low", "easy"],
    ["Accessibility: colorblind modes", "Three LUT presets + UI markers.", "high", "medium"]
  ],
  Audio: [
    ["Combat music adaptive layers", "Intensity-driven stems.", "high", "hard"],
    ["Foley: footsteps on stone/wood", "Surface-based footstep banks.", "medium", "medium"],
    ["Oni roar sound design", "Layered creature vocal.", "medium", "medium"],
    ["Ambient: forest at dusk", "3-minute loop with wildlife.", "low", "easy"]
  ],
  QA: [
    ["Regression pass: build 0.7.2", "Full smoke test of core loop.", "high", "medium"],
    ["Controller disconnect edge cases", "Test hot-swap and reconnection.", "medium", "easy"],
    ["Localization string overflow", "Check German/Japanese UI clipping.", "medium", "medium"],
    ["Performance capture: min spec", "FPS logs on GTX 1060.", "high", "medium"]
  ],
  Marketing: [
    ["Announcement trailer script", "60s reveal beat sheet.", "high", "medium"],
    ["Steam page copy + capsules", "Store presence for wishlisting.", "high", "medium"],
    ["Devlog #4: combat systems", "Behind-the-scenes video.", "low", "easy"],
    ["Press kit assets", "Logos, screenshots, fact sheet.", "medium", "easy"]
  ]
};

const CHAT_LINES = [
  "morning team ☕ standup in 10",
  "pushed the dash fix to the branch, can someone review?",
  "the new oni mask concepts look incredible 🔥",
  "build 0.7.2 is green ✅ QA can start the regression pass",
  "anyone else getting a shadow flicker in the forest zone?",
  "@marcus the flanking AI feels so much better now",
  "uploaded the shrine environment paint to the assets library",
  "reminder: milestone review friday 3pm",
  "combat music adaptive layers are done, feedback welcome 🎧",
  "wishlists just crossed 10k 🎉🎉",
  "retopo on the protagonist sculpt is going to take another day",
  "great work everyone, the vertical slice is really coming together"
];

const WIKI_PAGES = [
  { title: "Game Design Document", content: "# Project Oni — GDD\n\n## Vision\nA steel-punk action-RPG where the player channels ancient spirits to fight corrupted machines.\n\n## Core Loop\n1. **Explore** interconnected districts\n2. **Fight** using spirit-infused melee + traversal\n3. **Upgrade** the katana and spirit abilities\n4. **Uncover** the story of the fallen studio\n\n## Pillars\n- Fluid, weighty combat\n- A hauntingly beautiful world\n- Meaningful build variety\n\n> \"Forge worlds. Ship games.\"" },
  { title: "Art Bible", content: "# Art Direction\n\n## Palette\n- **Steel Blue** for the world\n- **Crimson** for danger & spirit energy\n- Deep blacks for contrast\n\n## Silhouette Rules\nEvery character reads at 32px. Strong negative space.\n\n## Materials\nBrushed steel, weathered stone, glowing spirit lines." },
  { title: "Engineering Standards", content: "# Engineering Standards\n\n## Branching\n- `main` is always shippable\n- Feature branches: `feat/<name>`\n- PRs require one review\n\n## Code Style\n- Systems over inheritance\n- Data-driven where possible\n- Profile before optimizing\n\n```cpp\n// Prefer composition\nclass SpiritComponent { /* ... */ };\n```" },
  { title: "Onboarding Guide", content: "# Welcome to OniSteel Studios\n\n1. Read the **GDD** and **Art Bible**\n2. Join the relevant **Boards**\n3. Say hi in **#general**\n4. Grab a task from **To Do**\n\nAsk anyone — we've got you." }
];

/**
 * Seeds a full demo studio for a freshly-registered user.
 * Idempotent-ish: guarded by a flag on the user doc.
 */
export async function seedDemoStudio(owner) {
  const ownerId = owner.id;
  // Create teammate users
  const teammates = [];
  for (const t of TEAM) {
    const id = uid("usr");
    const u = {
      id, uid: id, email: `${t.username}@onisteel.studio`, displayName: t.displayName,
      username: t.username, photoURL: "", banner: "", bio: t.bio, role: t.role,
      skills: t.skills, status: pick(["online", "online", "away", "offline"]),
      online: Math.random() > 0.4, emailVerified: true, isDemo: true,
      createdAt: Date.now() - rnd(60, 400) * day, lastSeen: Date.now() - rnd(0, 6) * hour,
      stats: { tasksAssigned: rnd(4, 20), tasksCompleted: rnd(10, 80), hoursLogged: rnd(40, 320), comments: rnd(5, 60), streak: rnd(0, 14) }
    };
    await DB.set("users", id, u);
    teammates.push(u);
  }
  const everyone = [owner, ...teammates];

  const ops = [];
  let firstWsId = null, firstBoardId = null;

  for (let w = 0; w < WORKSPACES.length; w++) {
    const ws = WORKSPACES[w];
    const wsId = uid("ws");
    if (!firstWsId) firstWsId = wsId;
    ops.push({ type: "set", collection: "workspaces", id: wsId, data: {
      id: wsId, name: ws.name, description: ws.description, color: ws.color,
      ownerId, createdAt: Date.now() - rnd(30, 180) * day
    }});
    // members: owner + subset of team
    const wsMembers = [owner, ...pickN(teammates, rnd(6, teammates.length))];
    for (const m of wsMembers) {
      const mid = `${wsId}__${m.id}`;
      ops.push({ type: "set", collection: "members", id: mid, data: {
        id: mid, workspaceId: wsId, userId: m.id, role: m.id === ownerId ? "owner" : m.role, joinedAt: Date.now() - rnd(10, 120) * day
      }});
    }
    // chat channels
    for (const ch of ["general", "programming", "art", "audio", "random"]) {
      const cid = `${wsId}__${ch}`;
      ops.push({ type: "set", collection: "channels", id: cid, data: {
        id: cid, workspaceId: wsId, name: ch, type: "channel", createdAt: Date.now() - 100 * day
      }});
    }
    // boards (only fully populate the first workspace's boards heavily)
    const boardNames = w === 0 ? BOARDS : pickN(BOARDS, rnd(4, 6));
    for (let bi = 0; bi < boardNames.length; bi++) {
      const bn = boardNames[bi];
      const boardId = uid("brd");
      if (!firstBoardId && w === 0) firstBoardId = boardId;
      const columns = DEFAULT_COLUMNS.map((c, i) => ({ id: uid("col"), name: c.name, color: c.color, order: i }));
      ops.push({ type: "set", collection: "boards", id: boardId, data: {
        id: boardId, workspaceId: wsId, name: bn, description: `${bn} tasks for ${ws.name}`,
        columns, ownerId, createdAt: Date.now() - rnd(20, 90) * day, favorite: bi < 2 && w === 0
      }});
      // tasks
      const bank = TASK_BANK[bn] || TASK_BANK.Programming;
      const taskCount = w === 0 ? bank.length : rnd(3, 5);
      for (let ti = 0; ti < taskCount; ti++) {
        const [title, desc, prio, diff] = bank[ti % bank.length];
        const col = pick(columns);
        const isDone = ["Completed", "Released"].includes(col.name);
        const assignees = pickN(wsMembers, rnd(1, 2)).map(m => m.id);
        const est = rnd(2, 40);
        const tid = uid("tsk");
        ops.push({ type: "set", collection: "tasks", id: tid, data: {
          id: tid, workspaceId: wsId, boardId, columnId: col.id,
          title, description: desc, priority: prio, difficulty: diff,
          estimatedHours: est, loggedHours: isDone ? est : rnd(0, est),
          completion: isDone ? 100 : (col.name === "In Progress" ? rnd(20, 80) : col.name === "Review" ? rnd(70, 95) : 0),
          labels: pickN(["bug", "feature", "polish", "art", "audio", "optimization", "research"], rnd(1, 3)),
          assignees, watchers: pickN(wsMembers, rnd(0, 2)).map(m => m.id),
          storyPoints: pick([1, 2, 3, 5, 8, 13]), order: ti,
          startDate: Math.random() > 0.5 ? Date.now() - rnd(1, 20) * day : null,
          dueDate: Math.random() > 0.35 ? Date.now() + rnd(-6, 30) * day : null,
          checklist: Math.random() > 0.4 ? Array.from({ length: rnd(2, 5) }, (_, k) => ({ id: uid("chk"), text: pick(["Blockout", "First pass", "Review notes", "Polish", "Final export", "QA sign-off", "Merge to main"]), done: Math.random() > 0.5 })) : [],
          attachments: [], links: [], subtasks: [], dependencies: [],
          milestone: Math.random() > 0.85, pinned: false, archived: false, favorite: false,
          createdBy: pick(wsMembers).id, createdAt: Date.now() - rnd(2, 60) * day
        }});
        // a couple comments on some tasks
        if (Math.random() > 0.55) {
          for (let ci = 0; ci < rnd(1, 3); ci++) {
            const cid = uid("cmt");
            ops.push({ type: "set", collection: "comments", id: cid, data: {
              id: cid, taskId: tid, workspaceId: wsId, authorId: pick(wsMembers).id,
              body: pick(["Looking great, ship it.", "Can we tweak the timing a bit?", "Blocked on the art assets.", "Reviewed — left a couple notes.", "This fixed the crash, thanks!", "Let's sync on this tomorrow."]),
              createdAt: Date.now() - rnd(1, 20) * day
            }});
          }
        }
      }
      // chat messages for the general channel (first ws only, richer)
    }
    // seed chat for #general
    const genId = `${wsId}__general`;
    const lineCount = w === 0 ? CHAT_LINES.length : rnd(3, 6);
    for (let li = 0; li < lineCount; li++) {
      const mid = uid("msg");
      const author = pick(wsMembers);
      ops.push({ type: "set", collection: "messages", id: mid, data: {
        id: mid, channelId: genId, workspaceId: wsId, authorId: author.id,
        text: CHAT_LINES[li % CHAT_LINES.length], type: "text",
        reactions: Math.random() > 0.6 ? { "🔥": pickN(wsMembers, rnd(1, 3)).map(m => m.id) } : {},
        createdAt: Date.now() - (lineCount - li) * rnd(1, 4) * hour
      }});
    }
    // files
    const fileNames = [
      ["oni_mask_concept_v3.png", "image", 2_400_000], ["shrine_environment.png", "image", 4_100_000],
      ["protagonist_highpoly.blend", "model", 48_000_000], ["katana_asset.fbx", "model", 3_200_000],
      ["combat_theme_layers.wav", "audio", 22_000_000], ["announcement_trailer.mp4", "video", 88_000_000],
      ["hud_redesign_v2.psd", "design", 15_000_000], ["press_kit.zip", "archive", 34_000_000],
      ["game_design_document.pdf", "doc", 1_200_000], ["weapon_icons.png", "image", 800_000]
    ];
    const cats = ["Concept Art", "Environments", "Characters", "Weapons", "Audio", "Music"];
    for (const [name, kind, size] of pickN(fileNames, w === 0 ? fileNames.length : 4)) {
      const fid = uid("fil");
      ops.push({ type: "set", collection: "files", id: fid, data: {
        id: fid, workspaceId: wsId, name, size, folder: pick(["/", "/concept", "/models", "/audio"]),
        category: pick(cats), url: "", uploadedBy: pick(wsMembers).id, createdAt: Date.now() - rnd(1, 40) * day,
        versions: [{ v: 1, size, at: Date.now() - rnd(1, 40) * day, by: pick(wsMembers).id }], tags: pickN(["hero", "wip", "final", "review"], rnd(0, 2))
      }});
    }
    // wiki
    for (const p of (w === 0 ? WIKI_PAGES : WIKI_PAGES.slice(0, 2))) {
      const did = uid("doc");
      ops.push({ type: "set", collection: "docs", id: did, data: {
        id: did, workspaceId: wsId, title: p.title, content: p.content,
        authorId: pick(wsMembers).id, pinned: p.title.includes("GDD"),
        versions: [{ content: p.content, at: Date.now() - rnd(5, 30) * day, by: pick(wsMembers).id }],
        createdAt: Date.now() - rnd(20, 80) * day
      }});
    }
    // activity feed
    for (let ai = 0; ai < (w === 0 ? 14 : 5); ai++) {
      const aid = uid("act");
      const verb = pick(["created_task", "completed", "moved", "commented", "uploaded", "assigned"]);
      ops.push({ type: "set", collection: "activity", id: aid, data: {
        id: aid, workspaceId: wsId, verb, actorId: pick(wsMembers).id,
        target: pick(["Fix save corruption", "Oni mask concept", "Combat music", "HUD redesign", "Boss phase 2"]),
        targetType: "task", boardId: firstBoardId || "", link: "", meta: {},
        createdAt: Date.now() - ai * rnd(1, 5) * hour
      }});
    }
  }

  // Notifications for the owner
  const notifs = [
    { type: "task_assigned", title: "You were assigned a task", body: "Fix save/load corruption on chapter 3" },
    { type: "mention", title: "Marcus Vale mentioned you", body: "@you the flanking AI feels so much better now" },
    { type: "deadline", title: "Deadline approaching", body: "HUD redesign v2 is due in 2 days" },
    { type: "comment", title: "New comment on your task", body: "Reviewed — left a couple notes." },
    { type: "task_completed", title: "Task completed", body: "Yuki Tanaka completed 'Katana + sheath asset'" }
  ];
  notifs.forEach((n, i) => {
    const nid = uid("ntf");
    ops.push({ type: "set", collection: "notifications", id: nid, data: {
      id: nid, userId: ownerId, ...n, read: i > 2, actorId: pick(teammates).id, link: "",
      createdAt: Date.now() - i * rnd(2, 12) * hour
    }});
  });

  // Commit in chunks
  const CHUNK = 60;
  for (let i = 0; i < ops.length; i += CHUNK) {
    await DB.batch(ops.slice(i, i + CHUNK));
  }

  // Mark owner seeded + set current workspace
  await DB.update("users", ownerId, { seeded: true, role: "owner" });
  localStorage.setItem("onisteel:ws", firstWsId);
  return { workspaceId: firstWsId, boardId: firstBoardId };
}
