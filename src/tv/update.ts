import { ipcRenderer } from "electron";
import type { UpdateInfo, ReleaseNote } from "../shared/update";
import type { Action } from "./input";
import { hideRing } from "./ring";

/**
 * The shell's update channel, injected into Dropout.
 *
 * Drop-In has no menu of its own, so the version and the entry point are a
 * quiet build stamp at the top right of the storefront header: "Drop-In
 * v0.1.0 / Check for updates". It is a normal button, so the D-pad reaches it
 * by moving up into the header; Y (menu) opens the same dialog from anywhere.
 * The dialog is a shadow-DOM overlay like the OSD and picker, so Dropout's CSS
 * cannot reach it and the page itself is untouched.
 */

export type UpdatePrompt =
  | { name: "checking" }
  | { name: "current"; version: string }
  | {
      name: "available";
      current: string;
      latest: string;
      canInstall: boolean;
    }
  | { name: "installing"; latest: string }
  | { name: "restarting"; latest: string }
  | { name: "failed"; stage: "check" | "install"; reason: string };

export interface UpdateFocus {
  current(): HTMLElement | null;
  focus(el: HTMLElement): void;
  focusPage(): boolean;
}

export interface UpdateUi {
  mount(): void;
  action(action: Action): boolean;
  isOpen(): boolean;
  close(): void;
}

interface DialogRefs {
  panel: HTMLElement;
  eyebrow: HTMLElement;
  title: HTMLElement;
  message: HTMLElement;
  spinner: HTMLElement;
  notes: HTMLElement;
  actions: HTMLElement;
}

interface DialogAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

const DIALOG_Z = "2147483647";
const NOTE_SCROLL = 140;
/** How long to wait for a late-rendered header before giving up. */
const HEADER_GRACE_MS = 15_000;

/** IPC errors arrive wrapped; show the part a person can act on. */
function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/, "")
    .replace(/^Error:\s*/, "")
    .trim();
}

export function createUpdateUi(focus: UpdateFocus): UpdateUi {
  let version = "";
  let known: UpdateInfo | null = null;
  let checking = false;
  let checkSeq = 0;

  let entry: HTMLButtonElement | null = null;
  let entryName: HTMLElement | null = null;
  let entryAction: HTMLElement | null = null;

  let dialogHost: HTMLElement | null = null;
  let dialog: DialogRefs | null = null;
  let prompt: UpdatePrompt | null = null;
  let previous: HTMLElement | null = null;

  let notesFor: string | null = null;
  let notesSeq = 0;
  let notesState: "idle" | "loading" | "ready" | "failed" = "idle";
  let notes: ReleaseNote[] = [];

  let actions: DialogAction[] = [];
  let buttons: HTMLButtonElement[] = [];
  let actionIndex = 0;

  function mount(): void {
    if (entry?.isConnected) return;

    entry = document.createElement("button");
    entry.type = "button";
    entry.className = "dropin-update";
    entry.setAttribute("aria-live", "polite");

    entryName = document.createElement("span");
    entryName.className = "dropin-update-name";
    entryAction = document.createElement("span");
    entryAction.className = "dropin-update-action";
    entry.append(entryName, entryAction);
    entry.addEventListener("click", () => open());

    renderEntry();
    placeInHeader();
    watchForHeader();

    void ipcRenderer
      .invoke("dropin:version")
      .then((value: string) => {
        version = String(value ?? "");
        renderEntry();
      })
      .catch(() => {
        // The version is a nicety; updates still work without it.
      });
  }

  function placeInHeader(): void {
    if (!entry) return;
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    // The secondary actions row is the header's own right-hand group; the
    // version reads as a quiet build stamp beside Sign In / the account menu.
    const row =
      header.querySelector<HTMLElement>(".user-actions") ??
      header.querySelector<HTMLElement>(".identity-container") ??
      header;
    row.append(entry);
  }

  /**
   * The storefront redraws parts of the header when the account or search
   * state changes. If the entry is lost, put it back rather than losing the
   * version line. The check is cheap and stops watching after the header has
   * had its chance.
   */
  function watchForHeader(): void {
    if (!entry) return;
    const observer = new MutationObserver(() => {
      if (!entry || entry.isConnected) return;
      placeInHeader();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    setTimeout(() => observer.disconnect(), HEADER_GRACE_MS);
  }

  function renderEntry(): void {
    if (!entry || !entryName || !entryAction) return;

    entryName.textContent = version ? `Drop-In v${version}` : "Drop-In";
    entry.classList.toggle("checking", checking);
    entry.classList.toggle("available", !!known && !checking);
    // Keep the layout steady while the dialog is up, but do not leave a focus
    // ring from the header showing through the dimmed backdrop.
    entry.style.visibility = dialogHost ? "hidden" : "";

    if (checking) {
      entryAction.textContent = "Checking\u2026";
    } else if (known) {
      entryAction.textContent = `Update to v${known.latest}`;
    } else {
      entryAction.textContent = "Check for updates";
    }

    entry.setAttribute("aria-busy", checking ? "true" : "false");
    entry.title = known
      ? `Drop-In v${known.latest} is available`
      : "Check for updates";
    entry.setAttribute(
      "aria-label",
      checking
        ? "Checking for updates"
        : known
          ? `Drop-In v${version || "unknown"}. Update to v${known.latest} available. Press A for details.`
          : `Drop-In v${version || "unknown"}. Press A to check for updates.`,
    );
  }

  function buildDialog(): void {
    if (dialogHost) return;

    dialogHost = document.createElement("div");
    dialogHost.dataset.dropin = "update-dialog";
    dialogHost.style.setProperty(
      "--dropin-font",
      getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
    );

    const shadow = dialogHost.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          inset: 0;
          z-index: ${DIALOG_Z};
          display: block;
          pointer-events: none;
        }
        .backdrop {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0, 0, 0, 0.72);
          pointer-events: auto;
        }
        .panel {
          display: flex;
          flex-direction: column;
          width: min(720px, 88vw);
          max-height: min(82vh, 760px);
          box-sizing: border-box;
          overflow: hidden;
          padding: 26px 30px 22px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 18px;
          background: #141414;
          color: #fff;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.76);
          font: 500 16px/1.45 var(--dropin-font, system-ui, sans-serif);
          outline: none;
        }
        .eyebrow {
          color: rgba(255, 255, 255, 0.45);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        h2 {
          margin: 6px 0 8px;
          color: #fff;
          font: 700 25px/1.2 var(--dropin-font, system-ui, sans-serif);
        }
        .message-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .message {
          margin: 0;
          color: rgba(255, 255, 255, 0.72);
          font: inherit;
          white-space: pre-wrap;
        }
        .spinner {
          flex: none;
          width: 16px;
          height: 16px;
          margin-top: 3px;
          border: 2px solid rgba(255, 255, 255, 0.22);
          border-top-color: #feea3b;
          border-radius: 50%;
          animation: spin 800ms linear infinite;
        }
        .spinner[hidden] {
          display: none;
        }
        .notes {
          flex: 1 1 auto;
          min-height: 0;
          margin-top: 16px;
          padding: 14px 16px;
          overflow-y: auto;
          overscroll-behavior: contain;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.035);
          scrollbar-width: thin;
        }
        .notes[hidden] {
          display: none;
        }
        .notes-status {
          margin: 0;
          color: rgba(255, 255, 255, 0.48);
          font-size: 13px;
        }
        .release + .release {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .release h3 {
          margin: 0 0 5px;
          color: #feea3b;
          font: 700 13px/1.2 var(--dropin-font, system-ui, sans-serif);
          letter-spacing: 0.04em;
        }
        .release p {
          margin: 0;
          color: rgba(255, 255, 255, 0.66);
          font: 400 13px/1.5 var(--dropin-font, system-ui, sans-serif);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }
        .actions[hidden] {
          display: none;
        }
        .action {
          min-width: 110px;
          padding: 11px 20px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          background: transparent;
          color: #fff;
          font: 700 15px/1 var(--dropin-font, system-ui, sans-serif);
          cursor: pointer;
          outline: none;
        }
        .action.primary {
          border-color: #feea3b;
          background: #feea3b;
          color: #111;
        }
        .action.active {
          outline: 3px solid #feea3b;
          outline-offset: 2px;
        }
        .action.primary.active {
          outline-color: #fff;
        }
        .action:hover {
          border-color: #feea3b;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .spinner { animation: none; }
        }
      </style>
      <div class="backdrop">
        <div class="panel" role="dialog" aria-modal="true"
             aria-labelledby="update-title" aria-describedby="update-message"
             tabindex="-1">
          <div class="eyebrow">Drop-In</div>
          <h2 id="update-title"></h2>
          <div class="message-row">
            <span class="spinner" hidden aria-hidden="true"></span>
            <p class="message" id="update-message"></p>
          </div>
          <div class="notes" role="region" aria-label="Release notes" hidden></div>
          <div class="actions" hidden></div>
        </div>
      </div>
    `;

    const panel = shadow.querySelector<HTMLElement>(".panel");
    const eyebrow = shadow.querySelector<HTMLElement>(".eyebrow");
    const title = shadow.querySelector<HTMLElement>("#update-title");
    const message = shadow.querySelector<HTMLElement>("#update-message");
    const spinner = shadow.querySelector<HTMLElement>(".spinner");
    const notesEl = shadow.querySelector<HTMLElement>(".notes");
    const actionsEl = shadow.querySelector<HTMLElement>(".actions");
    if (
      !panel ||
      !eyebrow ||
      !title ||
      !message ||
      !spinner ||
      !notesEl ||
      !actionsEl
    )
      return;

    dialog = {
      panel,
      eyebrow,
      title,
      message,
      spinner,
      notes: notesEl,
      actions: actionsEl,
    };
    document.documentElement.append(dialogHost);
  }

  function availablePrompt(info: UpdateInfo): UpdatePrompt {
    return {
      name: "available",
      current: info.current,
      latest: info.latest,
      canInstall: info.canInstall,
    };
  }

  function open(): void {
    if (dialogHost) return;

    previous = focus.current();
    hideRing();
    buildDialog();
    if (!dialog) return;

    if (known) {
      setPrompt(availablePrompt(known));
      loadNotes(known.latest);
    } else {
      setPrompt({ name: "checking" });
      void runCheck();
    }
    renderEntry();
  }

  function runCheck(): void {
    if (checking) return;
    checking = true;
    renderEntry();

    const seq = ++checkSeq;
    void ipcRenderer
      .invoke("dropin:update-check")
      .then((info: UpdateInfo) => {
        if (seq !== checkSeq) return;
        known = info.available ? info : null;
        if (dialog && prompt?.name === "checking") {
          setPrompt(
            info.available
              ? availablePrompt(info)
              : { name: "current", version: info.current },
          );
          if (info.available) loadNotes(info.latest);
        }
        checking = false;
        renderEntry();
      })
      .catch((error: unknown) => {
        if (seq !== checkSeq) return;
        known = null;
        if (dialog && prompt?.name === "checking") {
          setPrompt({
            name: "failed",
            stage: "check",
            reason: cleanError(error),
          });
        }
        checking = false;
        renderEntry();
      });
  }

  function loadNotes(latest: string): void {
    if (notesFor === latest) return;
    notesFor = latest;
    notes = [];
    notesState = "loading";
    const seq = ++notesSeq;
    renderDialog();

    void ipcRenderer
      .invoke("dropin:update-notes")
      .then((releases: ReleaseNote[]) => {
        if (seq !== notesSeq) return;
        notes = Array.isArray(releases) ? releases : [];
        notesState = "ready";
        renderDialog();
      })
      .catch(() => {
        if (seq !== notesSeq) return;
        notesState = "failed";
        renderDialog();
      });
  }

  function install(): void {
    if (!known || !dialog) return;
    const latest = known.latest;
    setPrompt({ name: "installing", latest });

    void ipcRenderer
      .invoke("dropin:update-install")
      .then(() => {
        if (!dialog) return;
        setPrompt({ name: "restarting", latest });
      })
      .catch((error: unknown) => {
        if (!dialog) return;
        setPrompt({
          name: "failed",
          stage: "install",
          reason: cleanError(error),
        });
      });
  }

  function retry(): void {
    if (prompt?.name !== "failed") return;
    if (prompt.stage === "install") {
      install();
      return;
    }
    setPrompt({ name: "checking" });
    void runCheck();
  }

  function dismiss(): void {
    if (!dialogHost) return;
    if (prompt?.name === "installing" || prompt?.name === "restarting") return;

    dialogHost.remove();
    dialogHost = null;
    dialog = null;
    prompt = null;
    actions = [];
    buttons = [];
    notesSeq++;
    notesFor = null;
    notesState = "idle";
    notes = [];

    renderEntry();

    const target = previous;
    previous = null;
    if (target?.isConnected) focus.focus(target);
    else focus.focusPage();
  }

  function setPrompt(next: UpdatePrompt): void {
    prompt = next;
    actionIndex = 0;
    renderDialog();
  }

  function promptActions(): DialogAction[] {
    if (!prompt) return [];
    switch (prompt.name) {
      case "checking":
      case "installing":
      case "restarting":
        return [];
      case "current":
        return [{ label: "Close", primary: true, run: dismiss }];
      case "available":
        if (!prompt.canInstall) {
          return [
            { label: "Close", run: dismiss },
            {
              label: "Open releases",
              primary: true,
              run: () => {
                ipcRenderer.send("dropin:update-page");
                dismiss();
              },
            },
          ];
        }
        return [
          { label: "Later", run: dismiss },
          { label: "Update now", primary: true, run: install },
        ];
      case "failed":
        return [
          { label: "Close", run: dismiss },
          { label: "Try again", primary: true, run: retry },
        ];
    }
  }

  function renderDialog(): void {
    if (!dialog || !prompt) return;

    const hardBusy =
      prompt.name === "installing" || prompt.name === "restarting";

    dialog.eyebrow.textContent = version ? `Drop-In v${version}` : "Drop-In";

    let title: string;
    let message: string;
    switch (prompt.name) {
      case "checking":
        title = "Checking for updates";
        message = "Looking for a newer release on GitHub\u2026";
        break;
      case "current":
        title = "You're up to date";
        message = `Drop-In v${prompt.version} is the latest version.`;
        break;
      case "available":
        title = `Drop-In v${prompt.latest} is available`;
        message = prompt.canInstall
          ? `You have v${prompt.current}. Drop-In downloads the update, checks it against the release's SHA-256, then restarts.`
          : `You have v${prompt.current}. This copy can't replace itself: download the new version from the Drop-In releases page on GitHub.`;
        break;
      case "installing":
        title = "Updating Drop-In";
        message = `Downloading Drop-In v${prompt.latest}\u2026`;
        break;
      case "restarting":
        title = "Updating Drop-In";
        message = `Drop-In v${prompt.latest} is installed. Restarting\u2026`;
        break;
      case "failed":
        title =
          prompt.stage === "check"
            ? "Couldn't check for updates"
            : "Couldn't update Drop-In";
        message = prompt.reason;
        break;
    }

    dialog.title.textContent = title;
    dialog.message.textContent = message;
    dialog.panel.setAttribute("aria-busy", hardBusy ? "true" : "false");
    dialog.spinner.hidden =
      prompt.name !== "checking" &&
      prompt.name !== "installing" &&
      prompt.name !== "restarting";

    const showNotes =
      prompt.name === "available" &&
      (notesState === "loading" || notesState === "failed" || notes.length > 0);
    dialog.notes.hidden = !showNotes;
    if (showNotes) renderNotes();

    actions = promptActions();
    dialog.actions.hidden = actions.length === 0;
    dialog.actions.replaceChildren();
    buttons = actions.map((action, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `action${action.primary ? " primary" : ""}`;
      button.textContent = action.label;
      button.addEventListener("click", action.run);
      button.addEventListener("mouseenter", () => {
        actionIndex = index;
        renderActionFocus();
      });
      dialog!.actions.append(button);
      return button;
    });

    if (actions.length === 0) {
      actionIndex = 0;
      // Give a busy or checking dialog focus for screen readers. The panel
      // cannot be reached by D-pad: the dialog handles input itself.
      dialog.panel.focus({ preventScroll: true });
    } else {
      actionIndex = Math.min(actionIndex, actions.length - 1);
      renderActionFocus();
      buttons[actionIndex]?.focus({ preventScroll: true });
    }
  }

  function renderActionFocus(): void {
    buttons.forEach((button, index) => {
      button.classList.toggle("active", index === actionIndex);
      button.setAttribute(
        "aria-current",
        index === actionIndex ? "true" : "false",
      );
    });
  }

  function renderNotes(): void {
    if (!dialog) return;
    const container = dialog.notes;
    container.replaceChildren();

    if (notesState === "loading") {
      container.append(statusLine("Loading release notes\u2026"));
      return;
    }
    if (notesState === "failed") {
      container.append(statusLine("Release notes couldn't be loaded."));
      return;
    }

    for (const release of notes) {
      const section = document.createElement("section");
      section.className = "release";
      const heading = document.createElement("h3");
      heading.textContent = `v${release.version}`;
      const body = document.createElement("p");
      body.textContent = release.notes || "No notes for this release.";
      section.append(heading, body);
      container.append(section);
    }
  }

  function statusLine(text: string): HTMLElement {
    const line = document.createElement("p");
    line.className = "notes-status";
    line.textContent = text;
    return line;
  }

  function moveAction(delta: number): void {
    if (actions.length === 0) return;
    actionIndex = (actionIndex + delta + actions.length) % actions.length;
    renderActionFocus();
    buttons[actionIndex]?.focus({ preventScroll: true });
  }

  function scrollNotes(delta: number): boolean {
    if (!dialog || dialog.notes.hidden) return false;
    const before = dialog.notes.scrollTop;
    dialog.notes.scrollTop = Math.max(0, before + delta);
    return dialog.notes.scrollTop !== before;
  }

  function handleDialogAction(action: Action): void {
    if (!prompt) return;

    if (prompt.name === "installing" || prompt.name === "restarting") {
      // The download is already under way; leaving would restart under the
      // viewer once it finishes.
      return;
    }

    switch (action) {
      case "back":
        dismiss();
        return;
      case "left":
        moveAction(-1);
        return;
      case "right":
        moveAction(1);
        return;
      case "up":
        if (!scrollNotes(-NOTE_SCROLL)) moveAction(-1);
        return;
      case "down":
        if (!scrollNotes(NOTE_SCROLL)) moveAction(1);
        return;
      case "select":
        actions[actionIndex]?.run();
        return;
      default:
        // The dialog owns input while it is open.
        return;
    }
  }

  return {
    mount,
    action(action) {
      if (dialogHost) {
        handleDialogAction(action);
        return true;
      }
      if (action === "menu") {
        open();
        return true;
      }
      return false;
    },
    isOpen() {
      return dialogHost !== null;
    },
    close() {
      dismiss();
    },
  };
}
