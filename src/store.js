// ---------- store: current program, undo history, per-tab persistence ----------

const SESSION_KEY = "popeye-sheet-builder:session";
const HISTORY_LIMIT = 100;
const TYPING_COMMIT_MS = 500;

const store = {
  doc: null,
  activePageId: null,
  dirty: false, // changed since the last download
  past: [],
  future: [],
  burstSnapshot: null,
  burstTimer: 0,
  listeners: new Set(),
};

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ doc: store.doc, activePageId: store.activePageId, dirty: store.dirty }));
  } catch {
    // storage full or blocked: the app keeps working in memory
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // nothing to clear
  }
}

function initStore() {
  const saved = readSession();
  try {
    store.doc = normalizeDoc(saved.doc);
    store.dirty = Boolean(saved.dirty);
  } catch {
    store.doc = newDoc();
    store.dirty = false;
  }
  store.activePageId = store.doc.pages.find((page) => page.id === saved?.activePageId)?.id ?? store.doc.pages[0]?.id ?? null;
}

function hasPages() {
  return store.doc.pages.length > 0;
}

function activePage() {
  return store.doc.pages.find((page) => page.id === store.activePageId) || store.doc.pages[0] || null;
}

function subscribe(listener) {
  store.listeners.add(listener);
}

function emit(kind) {
  store.listeners.forEach((listener) => listener(kind));
}

function snapshot() {
  return JSON.stringify({ doc: store.doc, activePageId: store.activePageId, dirty: store.dirty });
}

function pushHistory(entry) {
  store.past.push(entry);
  if (store.past.length > HISTORY_LIMIT) store.past.shift();
  store.future = [];
}

/** Typing bursts collapse into one undo step; everything else is its own step. */
function endBurst() {
  clearTimeout(store.burstTimer);
  if (!store.burstSnapshot) return;
  pushHistory(store.burstSnapshot);
  store.burstSnapshot = null;
}

function change(mutate, { typing = false } = {}) {
  if (typing) {
    store.burstSnapshot ??= snapshot();
    clearTimeout(store.burstTimer);
    store.burstTimer = setTimeout(endBurst, TYPING_COMMIT_MS);
  } else {
    endBurst();
    pushHistory(snapshot());
  }
  mutate(store.doc, activePage());
  if (!store.doc.pages.some((page) => page.id === store.activePageId)) store.activePageId = store.doc.pages[0]?.id ?? null;
  store.dirty = true;
  writeSession();
  emit(typing ? "text" : "structure");
}

function replaceDoc(doc, { dirty = true } = {}) {
  endBurst();
  pushHistory(snapshot());
  store.doc = doc;
  store.activePageId = doc.pages[0]?.id ?? null;
  store.dirty = dirty;
  writeSession();
  emit("structure");
}

function markSaved() {
  store.dirty = false;
  writeSession();
  emit("saved");
}

function setActivePage(id) {
  if (store.activePageId === id) return;
  store.activePageId = id;
  writeSession();
  emit("structure");
}

function restore(entry) {
  const state = JSON.parse(entry);
  store.doc = state.doc;
  store.activePageId = state.activePageId;
  store.dirty = state.dirty;
  writeSession();
  emit("structure");
}

function undo() {
  endBurst();
  if (!store.past.length) return false;
  store.future.push(snapshot());
  restore(store.past.pop());
  return true;
}

function redo() {
  endBurst();
  if (!store.future.length) return false;
  store.past.push(snapshot());
  restore(store.future.pop());
  return true;
}

/** Back to the start screen; history is dropped on purpose, this is the "start over" action. */
function resetStore() {
  endBurst();
  store.doc = newDoc();
  store.activePageId = null;
  store.dirty = false;
  store.past = [];
  store.future = [];
  clearSession();
  emit("structure");
}
