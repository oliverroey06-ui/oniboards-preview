/* ============================================================
   OniSteel Studios Board — Shared Constants
   ============================================================ */

export const APP = {
  name: "OniSteel Studios Board",
  studio: "OniSteel Studios",
  version: "1.0.0",
  tagline: "Forge worlds. Ship games."
};

/* ---------- Team roles (with permission tier) ---------- */
export const ROLES = [
  { id: "owner",          name: "Owner",           tier: 100, color: "#C12A2A", cat: "leadership" },
  { id: "studio_director",name: "Studio Director", tier: 95,  color: "#E24B47", cat: "leadership" },
  { id: "project_manager",name: "Project Manager", tier: 80,  color: "#4D6B91", cat: "leadership" },
  { id: "lead_developer", name: "Lead Developer",  tier: 75,  color: "#4D8F91", cat: "engineering" },
  { id: "programmer",     name: "Programmer",      tier: 50,  color: "#5B8BB0", cat: "engineering" },
  { id: "artist",         name: "Artist",          tier: 50,  color: "#8A6BD1", cat: "art" },
  { id: "concept_artist", name: "Concept Artist",  tier: 50,  color: "#A16BD1", cat: "art" },
  { id: "artist_3d",      name: "3D Artist",       tier: 50,  color: "#6B8BD1", cat: "art" },
  { id: "animator",       name: "Animator",        tier: 50,  color: "#6BB0D1", cat: "art" },
  { id: "technical_artist",name:"Technical Artist",tier: 55,  color: "#4DB0A0", cat: "art" },
  { id: "ui_designer",    name: "UI Designer",     tier: 50,  color: "#D18A6B", cat: "design" },
  { id: "ux_designer",    name: "UX Designer",     tier: 50,  color: "#D1A66B", cat: "design" },
  { id: "writer",         name: "Writer",          tier: 45,  color: "#B0A16B", cat: "narrative" },
  { id: "composer",       name: "Composer",        tier: 45,  color: "#8AB06B", cat: "audio" },
  { id: "sound_designer", name: "Sound Designer",  tier: 45,  color: "#6BB08A", cat: "audio" },
  { id: "qa_tester",      name: "QA Tester",       tier: 40,  color: "#B06B6B", cat: "qa" },
  { id: "marketing",      name: "Marketing",       tier: 40,  color: "#D16B9E", cat: "biz" },
  { id: "community_manager",name:"Community Manager",tier:40, color: "#B06BD1", cat: "biz" },
  { id: "guest",          name: "Guest",           tier: 10,  color: "#6B7280", cat: "external" },
  { id: "viewer",         name: "Viewer",          tier: 5,   color: "#565b68", cat: "external" }
];
export const roleById = (id) => ROLES.find(r => r.id === id) || ROLES[ROLES.length - 1];

/* ---------- Permission capabilities ---------- */
export const CAPS = {
  MANAGE_WORKSPACE: 80,
  MANAGE_MEMBERS: 80,
  MANAGE_BOARDS: 50,
  CREATE_TASK: 40,
  EDIT_ANY_TASK: 50,
  DELETE_TASK: 50,
  COMMENT: 10,
  UPLOAD: 40,
  CHAT: 10,
  VIEW: 5
};
export function can(roleId, capTier) {
  return roleById(roleId).tier >= capTier;
}

/* ---------- Default board columns ---------- */
export const DEFAULT_COLUMNS = [
  { name: "Ideas",       color: "#8A6BD1" },
  { name: "Backlog",     color: "#6B7280" },
  { name: "To Do",       color: "#4D6B91" },
  { name: "In Progress", color: "#E6A23C" },
  { name: "Review",      color: "#4D8F91" },
  { name: "Testing",     color: "#5B8BB0" },
  { name: "Blocked",     color: "#C12A2A" },
  { name: "Completed",   color: "#3FB98A" },
  { name: "Released",    color: "#8AB06B" }
];

/* ---------- Priorities ---------- */
export const PRIORITIES = [
  { id: "critical", name: "Critical", color: "#E24B47", rank: 4 },
  { id: "high",     name: "High",     color: "#E6822E", rank: 3 },
  { id: "medium",   name: "Medium",   color: "#E6C33C", rank: 2 },
  { id: "low",      name: "Low",      color: "#5EBE8A", rank: 1 },
  { id: "none",     name: "None",     color: "#6B7280", rank: 0 }
];
export const prioById = (id) => PRIORITIES.find(p => p.id === id) || PRIORITIES[4];

/* ---------- Difficulty ---------- */
export const DIFFICULTIES = [
  { id: "trivial", name: "Trivial", color: "#5EBE8A" },
  { id: "easy",    name: "Easy",    color: "#8AB06B" },
  { id: "medium",  name: "Medium",  color: "#E6C33C" },
  { id: "hard",    name: "Hard",    color: "#E6822E" },
  { id: "epic",    name: "Epic",    color: "#E24B47" }
];

/* ---------- Label palette ---------- */
export const LABELS = [
  { id: "bug",        name: "Bug",         color: "#C12A2A" },
  { id: "feature",    name: "Feature",     color: "#4D6B91" },
  { id: "polish",     name: "Polish",      color: "#8A6BD1" },
  { id: "art",        name: "Art",         color: "#D18A6B" },
  { id: "audio",      name: "Audio",       color: "#6BB08A" },
  { id: "design",     name: "Design",      color: "#D1A66B" },
  { id: "optimization",name:"Optimization",color: "#4DB0A0" },
  { id: "blocker",    name: "Blocker",     color: "#E24B47" },
  { id: "research",   name: "Research",    color: "#6B8BD1" },
  { id: "milestone",  name: "Milestone",   color: "#E6C33C" },
  { id: "urgent",     name: "Urgent",      color: "#E6822E" },
  { id: "backend",    name: "Backend",     color: "#5B8BB0" }
];
export const labelById = (id) => LABELS.find(l => l.id === id);

/* ---------- Board template icons (emoji-free glyph keys) ---------- */
export const BOARD_TEMPLATES = [
  "Programming","Art","Animation","3D Models","UI","UX","Audio","Music",
  "Story","QA","Marketing","Community","Publishing"
];
export const BOARD_ICONS = {
  "Programming":"code","Art":"palette","Animation":"film","3D Models":"cube",
  "UI":"layout","UX":"compass","Audio":"volume","Music":"music","Story":"book",
  "QA":"bug","Marketing":"megaphone","Community":"users","Publishing":"rocket"
};

/* ---------- Workspace accent colors ---------- */
export const WS_COLORS = ["#4D6B91","#C12A2A","#8A6BD1","#3FB98A","#E6A23C","#4D8F91","#D16B9E","#6B8BD1"];

/* ---------- Notification types ---------- */
export const NOTIF_TYPES = {
  task_assigned:  { icon: "user-check", label: "Task assigned" },
  task_completed: { icon: "check-circle", label: "Task completed" },
  mention:        { icon: "at-sign", label: "Mention" },
  reply:          { icon: "corner-up-left", label: "Reply" },
  comment:        { icon: "message-square", label: "New comment" },
  deadline:       { icon: "clock", label: "Deadline soon" },
  overdue:        { icon: "alert-triangle", label: "Overdue" },
  file_uploaded:  { icon: "upload", label: "File uploaded" },
  invite:         { icon: "user-plus", label: "Workspace invite" },
  update:         { icon: "activity", label: "Project update" }
};

/* ---------- File type registry ---------- */
export const FILE_TYPES = {
  image: { ext: ["png","jpg","jpeg","webp","gif","bmp","svg"], color: "#8A6BD1", icon: "image" },
  design:{ ext: ["psd","ai","xd","fig","sketch"], color: "#D16B9E", icon: "layers" },
  model: { ext: ["blend","fbx","obj","gltf","glb","dae","3ds","stl"], color: "#6B8BD1", icon: "cube" },
  video: { ext: ["mp4","mov","webm","avi","mkv"], color: "#4D8F91", icon: "film" },
  audio: { ext: ["mp3","wav","ogg","flac","aac"], color: "#6BB08A", icon: "volume" },
  archive:{ ext: ["zip","rar","7z","tar","gz"], color: "#E6A23C", icon: "archive" },
  doc:   { ext: ["pdf","doc","docx","txt","md"], color: "#5B8BB0", icon: "file-text" },
  engine:{ ext: ["unity","unitypackage","uasset","umap","prefab","scene"], color: "#4DB0A0", icon: "box" },
  code:  { ext: ["js","ts","cs","cpp","h","py","json","xml","hlsl","shader","glsl"], color: "#4D6B91", icon: "code" }
};
export function fileKind(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  for (const k in FILE_TYPES) if (FILE_TYPES[k].ext.includes(ext)) return { kind: k, ext, ...FILE_TYPES[k] };
  return { kind: "other", ext, color: "#6B7280", icon: "file" };
}

/* ---------- Asset library categories ---------- */
export const ASSET_CATEGORIES = [
  "Concept Art","Characters","Weapons","Environments","Animations",
  "Audio","Music","Textures","Models","Scripts","Documents"
];

/* ---------- Achievements ---------- */
export const ACHIEVEMENTS = [
  { id: "first_task",   name: "First Blood",     desc: "Complete your first task",        icon: "zap",    tiers: 1 },
  { id: "task_10",      name: "Task Slayer",     desc: "Complete 10 tasks",               icon: "sword",  tiers: 10 },
  { id: "task_50",      name: "Grinder",         desc: "Complete 50 tasks",               icon: "trophy", tiers: 50 },
  { id: "streak_7",     name: "On Fire",         desc: "7-day activity streak",           icon: "flame",  tiers: 7 },
  { id: "hours_100",    name: "Dedicated",       desc: "Log 100 hours",                   icon: "clock",  tiers: 100 },
  { id: "collaborator", name: "Team Player",     desc: "Comment on 25 tasks",             icon: "users",  tiers: 25 },
  { id: "shipper",      name: "Shipped It",      desc: "Move a task to Released",         icon: "rocket", tiers: 1 },
  { id: "documenter",   name: "Loremaster",      desc: "Write 5 wiki pages",              icon: "book",   tiers: 5 }
];

/* ---------- Skills tags for profiles ---------- */
export const SKILL_TAGS = [
  "Unity","Unreal","C#","C++","Blender","Maya","ZBrush","Substance","Photoshop",
  "Shader","Gameplay","AI","Networking","Level Design","Rigging","VFX","UI/UX",
  "Sound Design","Composition","Narrative","Marketing","Community","Producing"
];

/* ---------- Keyboard shortcuts ---------- */
export const SHORTCUTS = [
  { keys: "G then D", desc: "Go to Dashboard" },
  { keys: "G then B", desc: "Go to Boards" },
  { keys: "G then C", desc: "Go to Chat" },
  { keys: "G then K", desc: "Go to Calendar" },
  { keys: "N",        desc: "New task" },
  { keys: "/",        desc: "Focus search" },
  { keys: "Cmd/Ctrl K", desc: "Command palette" },
  { keys: "Esc",      desc: "Close dialog" },
  { keys: "?",        desc: "Show shortcuts" }
];

/* ---------- Languages ---------- */
export const LANGUAGES = [
  { id: "en", name: "English" }, { id: "es", name: "Español" }, { id: "fr", name: "Français" },
  { id: "de", name: "Deutsch" }, { id: "ja", name: "日本語" }, { id: "pt", name: "Português" }
];

/* ---------- Activity verb map ---------- */
export const ACTIVITY_VERBS = {
  created: "created", updated: "updated", moved: "moved", completed: "completed",
  assigned: "assigned", commented: "commented on", uploaded: "uploaded",
  deleted: "deleted", archived: "archived", joined: "joined", invited: "invited",
  created_board: "created board", created_task: "created task", logged: "logged time on"
};
