

/* ── Types ─────────────────────────────────────────────── */

interface Counter {
  id: string;
  name: string;
  count: number;
}

type ViewMode = "single" | "grid" | "list";
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

interface AppState {
  counters: Counter[];
  activeId: string;
  viewMode: ViewMode;
}



/* ── Constants ─────────────────────────────────────────── */

const STORAGE_KEY = "talier_multi_v2";
const OLD_STORAGE_KEY = "talier_single_v1";
const MAX_NAME_LEN = 30;
const VIEW_MODES: ReadonlyArray<ViewMode> = ["single", "grid", "list"];
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

/* ── Helpers ───────────────────────────────────────────── */

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && VIEW_MODES.includes(value as ViewMode);
}

function normalizeViewMode(value: unknown): ViewMode {
  return isViewMode(value) ? value : "grid";
}

function sanitizeCounter(input: unknown, fallbackName: string): Counter | null {
  if (typeof input !== "object" || input === null) return null;

  const candidate = input as { id?: unknown; name?: unknown; count?: unknown };
  const id = typeof candidate.id === "string" && candidate.id ? candidate.id : uid();
  const rawName = typeof candidate.name === "string" ? candidate.name : fallbackName;
  const name = rawName.trim().slice(0, MAX_NAME_LEN) || "Untitled";
  const count =
    typeof candidate.count === "number" && Number.isFinite(candidate.count) ? candidate.count : 0;

  return { id, name, count };
}

function parseCounters(input: unknown): Counter[] {
  if (!Array.isArray(input)) return [];

  const counters: Counter[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const parsed = sanitizeCounter(input[index], `Counter ${index + 1}`);
    if (parsed) counters.push(parsed);
  }
  return counters;
}

function resolveActiveId(counters: Counter[], activeId: unknown): string {
  if (counters.length === 0) {
    return "";
  }
  if (typeof activeId === "string" && counters.some((counter) => counter.id === activeId)) {
    return activeId;
  }
  return counters[0].id;
}

/* ── State ─────────────────────────────────────────────── */

const state: AppState = loadState();

/* ── Boot ──────────────────────────────────────────────── */

bindGlobalEvents();

render();
registerServiceWorker();
bindInstallPrompt();

/* ── Persistence ───────────────────────────────────────── */

function loadState(): AppState {
  const fallback = (): AppState => {
    const c: Counter = { id: uid(), name: "Counter 1", count: 0 };
    return { counters: [c], activeId: c.id, viewMode: "grid" };
  };

  try {
    // Try new format first
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        counters?: unknown;
        activeId?: unknown;
        viewMode?: unknown;
      };
      const counters = parseCounters(parsed.counters);
      if (counters.length > 0) {
        return {
          counters,
          activeId: resolveActiveId(counters, parsed.activeId),
          viewMode: normalizeViewMode(parsed.viewMode)
        };
      }
    }

    // Migrate from old single-counter format
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const old = JSON.parse(oldRaw) as { name?: unknown; count?: unknown; counters?: unknown };
      if (typeof old.name === "string" && typeof old.count === "number" && Number.isFinite(old.count)) {
        const c: Counter = { id: uid(), name: old.name.trim().slice(0, MAX_NAME_LEN) || "Untitled", count: old.count };
        const migrated: AppState = {
          counters: [c],
          activeId: c.id,
          viewMode: "grid"
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        localStorage.removeItem(OLD_STORAGE_KEY);
        return migrated;
      }

      // Old format with counters array
      const migratedCounters = parseCounters(old.counters);
      if (migratedCounters.length > 0) {
        const migrated: AppState = {
          counters: migratedCounters,
          activeId: migratedCounters[0].id,
          viewMode: "grid"
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        localStorage.removeItem(OLD_STORAGE_KEY);
        return migrated;
      }
    }

    return fallback();
  } catch {
    return fallback();
  }
}

function persist(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persistAndRender(): void {
  persist();
  render();
}

/* ── Counter CRUD ──────────────────────────────────────── */

function addCounter(): void {
  const c: Counter = { id: uid(), name: `Counter ${state.counters.length + 1}`, count: 0 };
  state.counters.push(c);
  state.activeId = c.id;
  persistAndRender();
}

function deleteCounter(id: string): void {
  if (state.counters.length <= 1) return; // keep at least one
  state.counters = state.counters.filter((c) => c.id !== id);
  if (state.activeId === id) {
    state.activeId = state.counters[0].id;
  }
  persistAndRender();
}

function resetCounter(id: string): void {
  const c = state.counters.find((c) => c.id === id);
  if (c) {
    c.count = 0;
    persistAndRender();
  }
}

function renameCounter(id: string): void {
  const c = state.counters.find((c) => c.id === id);
  if (!c) return;
  const newName = prompt("Rename counter:", c.name);
  if (newName !== null) {
    c.name = newName.trim().slice(0, MAX_NAME_LEN) || "Untitled";
    persistAndRender();
  }
}

function changeCount(id: string, delta: number): void {
  const c = state.counters.find((c) => c.id === id);
  if (c) {
    c.count += delta;
    state.activeId = id;
    persistAndRender();
  }
}

/* ── View Mode ─────────────────────────────────────────── */

function setViewMode(mode: ViewMode): void {
  state.viewMode = mode;
  persistAndRender();
}

/* ── Event Delegation ──────────────────────────────────── */

let openMenuId: string | null = null;

function bindGlobalEvents(): void {
  // View mode toggles
  el("viewSingle").addEventListener("click", () => setViewMode("single"));
  el("viewGrid").addEventListener("click", () => setViewMode("grid"));
  el("viewList").addEventListener("click", () => setViewMode("list"));
  el<HTMLSelectElement>("activeSelect").addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    if (!select.value) return;
    state.activeId = select.value;
    persistAndRender();
  });


  // Container event delegation
  el("counterContainer").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest("[data-counter-id]") as HTMLElement | null;

    // Add new counter card
    if (target.closest("#addNewCounter")) {
      addCounter();
      return;
    }

    if (!card) return;
    const id = card.dataset.counterId!;

    // Increment / Decrement
    if (target.closest(".card-inc")) {
      changeCount(id, 1);
      return;
    }
    if (target.closest(".card-dec")) {
      changeCount(id, -1);
      return;
    }
    if (target.closest(".card-reset")) {
      resetCounter(id);
      return;
    }

    // Menu toggle
    if (target.closest(".card-menu-btn")) {
      e.stopPropagation();
      openMenuId = openMenuId === id ? null : id;
      render();
      return;
    }

    // Menu actions
    if (target.closest(".menu-reset")) {
      openMenuId = null;
      resetCounter(id);
      return;
    }
    if (target.closest(".menu-rename")) {
      openMenuId = null;
      render();
      renameCounter(id);
      return;
    }
    if (target.closest(".menu-delete")) {
      openMenuId = null;
      deleteCounter(id);
      return;
    }

    // Click on card body → set active
    state.activeId = id;
    persistAndRender();
  });

  // Close menu on outside click
  document.addEventListener("click", () => {
    if (openMenuId) {
      openMenuId = null;
      render();
    }
  });
}

/* ── Render ─────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(): void {
  const container = el("counterContainer");
  const active = state.counters.find((c) => c.id === state.activeId) ?? state.counters[0];
  if (state.activeId !== active.id) {
    state.activeId = active.id;
    persist();
  }
  const totalCount = state.counters.reduce((sum, c) => sum + c.count, 0);

  // Summary
  const activeSelect = el<HTMLSelectElement>("activeSelect");
  el("activeSummary").textContent = active.name;
  activeSelect.innerHTML = state.counters
    .map((counter) => `<option value="${counter.id}">${escapeHtml(counter.name)}</option>`)
    .join("");
  activeSelect.value = active.id;
  el("totalSummary").textContent = String(totalCount);


  // View mode classes on container
  container.className = `counter-container view-${state.viewMode}`;

  // View mode button states
  (["single", "grid", "list"] as ViewMode[]).forEach((m) => {
    const btn = document.getElementById(`view${m[0].toUpperCase() + m.slice(1)}`);
    if (btn) btn.classList.toggle("view-active", m === state.viewMode);
  });

  // Determine which counters to show
  const visible =
    state.viewMode === "single" ? [active] : state.counters;

  let html = "";
  for (const c of visible) {
    const isActive = c.id === state.activeId;
    const menuOpen = openMenuId === c.id;
    const countColor = c.count < 0 ? "var(--danger)" : c.count > 0 ? "var(--primary)" : "var(--text)";
    html += `
      <div class="counter-card${isActive ? " card-active" : ""}" data-counter-id="${c.id}">
        <div class="card-header">
          <span class="card-name">${escapeHtml(c.name)}</span>
          <button class="card-menu-btn" aria-label="Menu" type="button">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <circle cx="9" cy="3.5" r="1.5"/>
              <circle cx="9" cy="9" r="1.5"/>
              <circle cx="9" cy="14.5" r="1.5"/>
            </svg>
          </button>
          ${menuOpen ? `
            <div class="card-dropdown">
              <button class="menu-rename" type="button">Rename</button>
              <button class="menu-reset" type="button">Reset</button>
              <button class="menu-delete${state.counters.length <= 1 ? " disabled" : ""}" type="button"${state.counters.length <= 1 ? " disabled" : ""}>Delete</button>
            </div>` : ""}
        </div>
        <div class="card-count" style="color:${countColor}">${c.count}</div>
        <div class="card-controls">
          <button class="card-dec" type="button" aria-label="Decrement">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><line x1="6" y1="10" x2="14" y2="10"/></svg>
          </button>
          <button class="card-reset" type="button" aria-label="Reset">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10a6 6 0 1 1-2.9-5.2"/><polyline points="16 2.8 16 7.2 11.6 7.2"/></svg>
          </button>
          <button class="card-inc" type="button" aria-label="Increment">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><line x1="6" y1="10" x2="14" y2="10"/><line x1="10" y1="6" x2="10" y2="14"/></svg>
          </button>
        </div>
      </div>`;
  }

  // Add New Counter card (not in single view if there's already a counter)
  if (state.viewMode !== "single") {
    html += `
      <div class="counter-card add-card" id="addNewCounter">
        <div class="add-card-content">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="4" y="4" width="10" height="10" rx="2"/>
            <rect x="18" y="4" width="10" height="10" rx="2"/>
            <rect x="4" y="18" width="10" height="10" rx="2"/>
            <line x1="23" y1="20" x2="23" y2="28"/>
            <line x1="19" y1="24" x2="27" y2="24"/>
          </svg>
          <span>Add New Counter</span>
        </div>
      </div>`;
  }

  container.innerHTML = html;
}



/* ── Service Worker ────────────────────────────────────── */

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").then((registration) => {
      if (registration.waiting) {
        registration.waiting.postMessage("SKIP_WAITING");
      }

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            registration.waiting?.postMessage("SKIP_WAITING");
          }
        });
      });
    });
  });
}

function bindInstallPrompt(): void {
  const installButton = document.getElementById("installAppBtn") as HTMLButtonElement | null;
  if (!installButton) return;

  const inStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (inStandalone) {
    installButton.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    const promptEvent = deferredInstallPrompt;
    if (!promptEvent) return;

    installButton.hidden = true;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    deferredInstallPrompt = null;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
}
