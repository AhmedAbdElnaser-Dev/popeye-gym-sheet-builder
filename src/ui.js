// ---------- small UI kit: icons, toast, popover menus, dialogs, focus keeping ----------

const svg = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  grip: svg('<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>'),
  open: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 15h6M9 12h3"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
  reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'),
  warn: svg('<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17.5v.5"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  ungroup: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M14 7h3a2 2 0 0 1 2 2v1M10 17H7a2 2 0 0 1-2-2v-1"/>'),
  dumbbell: svg('<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>'),
  run: svg('<circle cx="15" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v4M6 11l3-3 4 1 2 3 3 1M11 15l-1-4"/>'),
  check: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>'),
  link: svg('<path d="M8 7h8M8 12h8M8 17h5"/><path d="M4 4v16"/>'),
  repeat: svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  section: svg('<path d="M4 6h16M4 12h10M4 18h7"/>'),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
};

// ---------- toast ----------

let toastTimer = 0;

function showToast(message, action) {
  const toast = document.getElementById("toast");
  toast.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast__action">${esc(action.label)}</button>` : ""}`;
  toast.classList.add("is-visible");
  if (action) {
    toast.querySelector(".toast__action").addEventListener("click", () => {
      action.run();
      hideToast();
    }, { once: true });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 3200);
}

function hideToast() {
  document.getElementById("toast").classList.remove("is-visible");
}

// ---------- popover menus: one open at a time, Escape / outside click closes ----------

function closeMenus(except) {
  document.querySelectorAll("[data-menu].is-open").forEach((menu) => {
    if (menu === except) return;
    menu.classList.remove("is-open");
    menu.querySelector("[data-menu-trigger]")?.setAttribute("aria-expanded", "false");
  });
}

function toggleMenu(menu, render) {
  const opening = !menu.classList.contains("is-open");
  closeMenus(menu);
  menu.classList.toggle("is-open", opening);
  menu.querySelector("[data-menu-trigger]").setAttribute("aria-expanded", String(opening));
  if (!opening) return;
  const panel = menu.querySelector(".menu__panel");
  panel.innerHTML = render();
  panel.querySelector("input, button")?.focus();
}

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-menu]")) closeMenus();
});

document.addEventListener("focusout", (event) => {
  const menu = event.target.closest?.("[data-menu].is-open");
  if (menu && event.relatedTarget && !menu.contains(event.relatedTarget)) closeMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const open = document.querySelector("[data-menu].is-open");
  if (!open) return;
  closeMenus();
  open.querySelector("[data-menu-trigger]").focus();
});

// ---------- dialogs: native <dialog>, resolved by the button that closed it ----------

function openDialog({ title, body, actions, danger = false, onOpen }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("dialog");
    dialog.innerHTML = `
      <form method="dialog" class="dlg">
        <h2 class="dlg__title" id="dialog-title">${esc(title)}</h2>
        <div class="dlg__body">${body}</div>
        <div class="dlg__actions">${[...actions.filter((action) => action.primary), ...actions.filter((action) => !action.primary)].map((action) =>
          `<button class="btn ${action.primary ? (danger ? "btn--danger-solid" : "btn--primary") : "btn--ghost"}" value="${esc(action.value)}"${action.autofocus ? " autofocus" : ""}>${action.icon ? ICONS[action.icon] : ""}<span>${esc(action.label)}</span></button>`).join("")}
        </div>
      </form>`;
    dialog.setAttribute("aria-labelledby", "dialog-title");
    const done = () => {
      dialog.removeEventListener("close", done);
      resolve({ value: dialog.returnValue || "cancel", form: dialog.querySelector("form") });
    };
    dialog.addEventListener("close", done);
    dialog.returnValue = "";
    dialog.showModal();
    onOpen?.(dialog);
  });
}

function confirmDialog({ title, body, okLabel, okIcon, danger = true }) {
  return openDialog({
    title,
    body: `<p>${body}</p>`,
    danger,
    actions: [
      { value: "cancel", label: "إلغاء", autofocus: true },
      { value: "ok", label: okLabel, icon: okIcon, primary: true },
    ],
  }).then((result) => result.value === "ok");
}

// ---------- keep focus across re-renders: elements opt in with data-focus ----------

function captureFocus(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active) || !active.dataset.focus) return null;
  return {
    key: active.dataset.focus,
    start: active.selectionStart ?? null,
    end: active.selectionEnd ?? null,
  };
}

function restoreFocus(root, saved) {
  if (!saved) return;
  const target = root.querySelector(`[data-focus="${CSS.escape(saved.key)}"]:not(:disabled)`)
    ?? root.querySelector(`[data-focus="${CSS.escape(saved.key)}"]`)?.closest(".card, .panel")?.querySelector("button:not(:disabled), input");
  if (!target) return;
  target.focus({ preventScroll: true });
  if (saved.start !== null && typeof target.setSelectionRange === "function") {
    try {
      target.setSelectionRange(saved.start, saved.end);
    } catch {
      // number inputs don't support selection ranges
    }
  }
}
