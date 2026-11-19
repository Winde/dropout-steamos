/**
 * TV picker for native <select> elements.
 *
 * The controller opens it with A. Up/down moves the highlight, A confirms,
 * B closes. It replaces the native OS popup (which the controller cannot
 * drive) and keeps the select itself as the page's source of truth: on
 * confirm the picker sets selectedIndex and dispatches a normal change event.
 */

interface PickerController {
  move(delta: number): void;
  confirm(): void;
  close(): void;
}

let controller: PickerController | null = null;

export function isPickerOpen(): boolean {
  return controller !== null;
}

function titleFor(select: HTMLSelectElement): string {
  const label = select.labels?.[0]?.textContent?.trim();
  if (label) return label.replace(/\s*:+\s*$/, "");

  const aria = select.getAttribute("aria-label")?.trim();
  if (aria) return aria;

  if (select.dataset.sortBy !== undefined) return "Sort by";
  if (select.dataset.switchSeason !== undefined) return "Season";
  return "Select";
}

export function openPicker(select: HTMLSelectElement): void {
  controller?.close();

  const options = [...select.options];
  if (options.length === 0) return;

  let index = Math.min(Math.max(select.selectedIndex, 0), options.length - 1);

  const host = document.createElement("div");
  host.dataset.dropin = "picker";
  host.style.setProperty(
    "--dropin-font",
    getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
  );

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: block;
        pointer-events: none;
      }
      .backdrop {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        background: rgba(0, 0, 0, 0.68);
        pointer-events: auto;
      }
      .panel {
        display: flex;
        flex-direction: column;
        width: min(640px, 82vw);
        max-height: min(72vh, 680px);
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        background: #141414;
        color: #fff;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.72);
        font: 600 18px/1.35 var(--dropin-font, system-ui, sans-serif);
      }
      .title {
        padding: 22px 26px 10px;
        color: rgba(255, 255, 255, 0.55);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0 12px 12px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: none;
      }
      .list::-webkit-scrollbar {
        display: none;
      }
      .option {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 13px 16px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        appearance: none;
        outline: none;
        pointer-events: auto;
      }
      .option .dot {
        flex: none;
        width: 10px;
        height: 10px;
        margin-right: 14px;
        border: 2px solid rgba(255, 255, 255, 0.25);
        border-radius: 50%;
      }
      .option.active {
        background: #feea3b;
        color: #111;
      }
      .option.active .dot {
        border-color: #111;
        background: #111;
      }
      .option.disabled {
        opacity: 0.35;
      }
    </style>
    <div class="backdrop">
      <div class="panel" role="dialog" aria-modal="true">
        <div class="title"></div>
        <div class="list"></div>
      </div>
    </div>
  `;

  const backdrop = shadow.querySelector<HTMLElement>(".backdrop");
  const title = shadow.querySelector<HTMLElement>(".title");
  const list = shadow.querySelector<HTMLElement>(".list");
  if (!backdrop || !title || !list) return;

  title.textContent = titleFor(select);

  const items: HTMLButtonElement[] = options.map((option, optionIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    if (option.disabled) {
      button.disabled = true;
      button.classList.add("disabled");
    }

    const dot = document.createElement("span");
    dot.className = "dot";
    const label = document.createElement("span");
    label.textContent =
      (option.textContent ?? "").trim() || `Option ${optionIndex + 1}`;
    button.append(dot, label);

    button.addEventListener("click", () => choose(optionIndex));
    list.append(button);
    return button;
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });

  function render(): void {
    items.forEach((item, itemIndex) => {
      item.classList.toggle("active", itemIndex === index);
    });
    items[index]?.scrollIntoView({ block: "nearest" });
  }

  function move(delta: number): void {
    if (!select.isConnected) {
      close();
      return;
    }

    let next = index + delta;
    while (next >= 0 && next < options.length && options[next].disabled) {
      next += delta;
    }
    if (next < 0 || next >= options.length) return;

    index = next;
    render();
  }

  function choose(optionIndex: number): void {
    if (options[optionIndex]?.disabled) return;
    index = optionIndex;
    render();
    confirm();
  }

  function confirm(): void {
    if (!select.isConnected) {
      close();
      return;
    }

    const option = options[index];
    if (!option || option.disabled) return;

    const changed = select.selectedIndex !== index;
    close();
    if (!changed) return;

    select.selectedIndex = index;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  let self: PickerController | null = null;

  function close(): void {
    host.remove();
    if (controller === self) controller = null;
  }

  self = { move, confirm, close };
  controller = self;

  document.documentElement.append(host);
  render();
}

export function movePicker(delta: number): void {
  controller?.move(delta);
}

export function confirmPicker(): void {
  controller?.confirm();
}

export function closePicker(): void {
  controller?.close();
}
