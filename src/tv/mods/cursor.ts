import css from "./cursor.css";
import type { Mod } from "./types";

export const cursor: Mod = {
  id: "cursor",
  css,
  setup() {
    const html = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const hide = (): void => html.classList.add("dropin-hide-cursor");
    const show = (): void => {
      html.classList.remove("dropin-hide-cursor");
      if (timer) clearTimeout(timer);
      timer = setTimeout(hide, 2500);
    };

    window.addEventListener("mousemove", show, { passive: true });
    show();
  },
};
