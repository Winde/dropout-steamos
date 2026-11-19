let root: ShadowRoot | null = null;
let pill: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensure(): { root: ShadowRoot; pill: HTMLElement } {
  if (root && pill) return { root, pill };

  const host = document.createElement("div");
  host.dataset.dropin = "hint";
  host.setAttribute("aria-live", "polite");
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .pill {
        position: fixed;
        left: 50%;
        top: max(96px, 9vh);
        bottom: auto;
        max-width: 70vw;
        text-align: center;
        padding: 14px 20px;
        border-radius: 12px;
        background: rgba(12, 12, 12, 0.93);
        color: #fff;
        font: 600 20px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
        letter-spacing: 0.01em;
        border-left: 4px solid #feea3b;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
        opacity: 0;
        transform: translateX(-50%) translateY(-8px);
        transition: opacity 160ms ease, transform 160ms ease;
      }
      .pill.show { opacity: 1; transform: translateX(-50%); }
    </style>
    <div class="pill" role="status"></div>
  `;

  root = shadow;
  pill = shadow.querySelector<HTMLElement>(".pill");
  if (!pill) throw new Error("hint pill missing");
  return { root, pill };
}

export function showHint(text: string, duration = 3000): void {
  const { pill: element } = ensure();
  element.textContent = text;
  element.classList.add("show");

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    element.classList.remove("show");
  }, duration);
}

