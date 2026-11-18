import { describe, expect, it } from "vitest";
import { useSimpleInputMethod } from "../src/main/linux-env";

describe("useSimpleInputMethod", () => {
  it("replaces the module Steam sets in Game Mode", () => {
    const env = { GTK_IM_MODULE: "Steam" };

    useSimpleInputMethod(env, "linux");

    expect(env.GTK_IM_MODULE).toBe("gtk-im-context-simple");
  });

  it("matches Steam's module regardless of case and padding", () => {
    const env = { GTK_IM_MODULE: " steam " };

    useSimpleInputMethod(env, "linux");

    expect(env.GTK_IM_MODULE).toBe("gtk-im-context-simple");
  });

  it("leaves the input method a desktop session uses", () => {
    const env = { GTK_IM_MODULE: "ibus" };

    useSimpleInputMethod(env, "linux");

    expect(env.GTK_IM_MODULE).toBe("ibus");
  });

  it("leaves an environment without an input method alone", () => {
    const env: NodeJS.ProcessEnv = {};

    useSimpleInputMethod(env, "linux");

    expect(env.GTK_IM_MODULE).toBeUndefined();
  });

  it("leaves a module the player picked alone", () => {
    const env = { GTK_IM_MODULE: "fcitx" };

    useSimpleInputMethod(env, "linux");

    expect(env.GTK_IM_MODULE).toBe("fcitx");
  });

  it("does nothing on other platforms", () => {
    const env = { GTK_IM_MODULE: "Steam" };

    useSimpleInputMethod(env, "darwin");

    expect(env.GTK_IM_MODULE).toBe("Steam");
  });
});
