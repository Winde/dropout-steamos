import { beforeEach, describe, expect, it, vi } from "vitest";

type Picker = typeof import("../src/tv/picker");

function makeSelect(
  options: string[],
  selected = 0,
  attributes: Record<string, string> = {},
): HTMLSelectElement {
  const select = document.createElement("select");
  for (const [index, text] of options.entries()) {
    const option = document.createElement("option");
    option.value = `value-${index}`;
    option.textContent = text;
    if (index === selected) option.selected = true;
    select.append(option);
  }
  for (const [name, value] of Object.entries(attributes)) {
    select.setAttribute(name, value);
  }
  document.body.append(select);
  return select;
}

function pickerHost(): HTMLElement {
  const hosts = document.querySelectorAll<HTMLElement>('[data-couch="picker"]');
  const host = hosts[hosts.length - 1];
  if (!host) throw new Error("picker was not opened");
  return host;
}

function pickerPart(selector: string): HTMLElement {
  const part = pickerHost().shadowRoot?.querySelector<HTMLElement>(selector);
  if (!part) throw new Error(`missing ${selector}`);
  return part;
}

function optionButtons(): HTMLButtonElement[] {
  return [
    ...(pickerHost().shadowRoot?.querySelectorAll<HTMLButtonElement>(
      ".option",
    ) ?? []),
  ];
}

function activeIndex(): number {
  return optionButtons().findIndex((button) =>
    button.classList.contains("active"),
  );
}

async function load(): Promise<Picker> {
  return import("../src/tv/picker");
}

beforeEach(() => {
  vi.resetModules();
  for (const host of document.querySelectorAll('[data-couch="picker"]')) {
    host.remove();
  }
});

describe("opening the picker", () => {
  it("shows a dialog with every option and the current selection", async () => {
    const picker = await load();
    const select = makeSelect(["Season 1", "Season 2", "Season 3"], 1);

    picker.openPicker(select);

    expect(picker.isPickerOpen()).toBe(true);
    expect(optionButtons()).toHaveLength(3);
    expect(optionButtons().map((button) => button.textContent)).toEqual([
      "Season 1",
      "Season 2",
      "Season 3",
    ]);
    expect(activeIndex()).toBe(1);
    expect(pickerPart(".panel").getAttribute("role")).toBe("dialog");
    expect(pickerPart(".panel").getAttribute("aria-modal")).toBe("true");
  });

  it("clamps an out-of-range selection to the first option", async () => {
    const picker = await load();
    const select = makeSelect(["One", "Two"], 0);
    select.selectedIndex = -1;

    picker.openPicker(select);
    expect(activeIndex()).toBe(0);
  });

  it("does nothing for an empty select", async () => {
    const picker = await load();
    const select = makeSelect([]);

    picker.openPicker(select);

    expect(picker.isPickerOpen()).toBe(false);
    expect(document.querySelectorAll('[data-couch="picker"]')).toHaveLength(0);
  });

  it("replaces an already open picker", async () => {
    const picker = await load();
    const first = makeSelect(["A", "B"]);
    const second = makeSelect(["C", "D"]);

    picker.openPicker(first);
    picker.openPicker(second);

    expect(document.querySelectorAll('[data-couch="picker"]')).toHaveLength(1);
    expect(optionButtons().map((button) => button.textContent)).toEqual([
      "C",
      "D",
    ]);
  });

  it("labels options that have no text", async () => {
    const picker = await load();
    const select = makeSelect(["", "Two"]);

    picker.openPicker(select);
    expect(optionButtons()[0].textContent).toBe("Option 1");
  });
});

describe("picker titles", () => {
  it("uses an associated label and trims a trailing colon", async () => {
    const picker = await load();
    const label = document.createElement("label");
    label.setAttribute("for", "season-select");
    label.textContent = "Season:";
    document.body.append(label);
    const select = makeSelect(["One"], 0, { id: "season-select" });

    picker.openPicker(select);
    expect(pickerPart(".title").textContent).toBe("Season");
  });

  it("uses an aria-label", async () => {
    const picker = await load();
    const select = makeSelect(["One"], 0, { "aria-label": "Choose a season" });

    picker.openPicker(select);
    expect(pickerPart(".title").textContent).toBe("Choose a season");
  });

  it("falls back to known site attributes", async () => {
    const picker = await load();

    const sort = makeSelect(["Newest"], 0, { "data-sort-by": "" });
    picker.openPicker(sort);
    expect(pickerPart(".title").textContent).toBe("Sort by");
    picker.closePicker();

    const season = makeSelect(["Season 1"], 0, {
      "data-switch-season": "",
    });
    picker.openPicker(season);
    expect(pickerPart(".title").textContent).toBe("Season");
  });

  it("defaults to Select", async () => {
    const picker = await load();
    picker.openPicker(makeSelect(["One"]));
    expect(pickerPart(".title").textContent).toBe("Select");
  });
});

describe("moving the highlight", () => {
  it("moves with the D-pad and stops at the ends", async () => {
    const picker = await load();
    picker.openPicker(makeSelect(["One", "Two", "Three"]));

    expect(activeIndex()).toBe(0);
    picker.movePicker(1);
    expect(activeIndex()).toBe(1);
    picker.movePicker(1);
    expect(activeIndex()).toBe(2);
    picker.movePicker(1);
    expect(activeIndex()).toBe(2);
    picker.movePicker(-1);
    expect(activeIndex()).toBe(1);
    picker.movePicker(-1);
    expect(activeIndex()).toBe(0);
    picker.movePicker(-1);
    expect(activeIndex()).toBe(0);
  });

  it("skips disabled options in both directions", async () => {
    const picker = await load();
    const select = makeSelect(["One", "Two", "Three", "Four"]);
    select.options[1].disabled = true;
    select.options[2].disabled = true;

    picker.openPicker(select);
    picker.movePicker(1);
    expect(activeIndex()).toBe(3);

    picker.movePicker(-1);
    expect(activeIndex()).toBe(0);
  });

  it("closes if the select leaves the document", async () => {
    const picker = await load();
    const select = makeSelect(["One", "Two"]);
    picker.openPicker(select);

    select.remove();
    picker.movePicker(1);

    expect(picker.isPickerOpen()).toBe(false);
    expect(document.querySelectorAll('[data-couch="picker"]')).toHaveLength(0);
  });

  it("is harmless when no picker is open", async () => {
    const picker = await load();
    expect(() => picker.movePicker(1)).not.toThrow();
    expect(() => picker.confirmPicker()).not.toThrow();
    expect(() => picker.closePicker()).not.toThrow();
  });
});

describe("confirming an option", () => {
  it("updates the select and dispatches a bubbling change event", async () => {
    const picker = await load();
    const select = makeSelect(["One", "Two", "Three"]);
    const onChange = vi.fn();
    document.addEventListener("change", onChange);

    picker.openPicker(select);
    picker.movePicker(2);
    picker.confirmPicker();

    expect(select.selectedIndex).toBe(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBeInstanceOf(Event);
    expect(onChange.mock.calls[0]?.[0]?.bubbles).toBe(true);
    expect(picker.isPickerOpen()).toBe(false);
    expect(document.querySelectorAll('[data-couch="picker"]')).toHaveLength(0);
  });

  it("does not dispatch change when the selection did not move", async () => {
    const picker = await load();
    const select = makeSelect(["One", "Two"], 1);
    const onChange = vi.fn();
    document.addEventListener("change", onChange);

    picker.openPicker(select);
    picker.confirmPicker();

    expect(select.selectedIndex).toBe(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(picker.isPickerOpen()).toBe(false);
  });

  it("refuses to confirm a disabled option", async () => {
    const picker = await load();
    const select = makeSelect(["One", "Two"]);
    select.options[0].disabled = true;
    select.selectedIndex = 0;

    picker.openPicker(select);
    picker.confirmPicker();

    expect(picker.isPickerOpen()).toBe(true);
    expect(select.selectedIndex).toBe(0);
  });

  it("closes without a change when the select leaves the document", async () => {
    const picker = await load();
    const select = makeSelect(["One", "Two"]);
    const onChange = vi.fn();
    document.addEventListener("change", onChange);

    picker.openPicker(select);
    picker.movePicker(1);
    select.remove();
    picker.confirmPicker();

    expect(picker.isPickerOpen()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("confirms an option that is clicked", async () => {
    const picker = await load();
    const select = makeSelect(["One", "Two", "Three"]);

    picker.openPicker(select);
    optionButtons()[2].click();

    expect(select.selectedIndex).toBe(2);
    expect(picker.isPickerOpen()).toBe(false);
  });

  it("ignores a click on a disabled option", async () => {
    const picker = await load();
    const select = makeSelect(["One", "Two"]);
    select.options[1].disabled = true;

    picker.openPicker(select);
    optionButtons()[1].click();

    expect(select.selectedIndex).toBe(0);
    expect(picker.isPickerOpen()).toBe(true);
  });
});

describe("closing the picker", () => {
  it("closes from the backdrop but not from inside the panel", async () => {
    const picker = await load();
    picker.openPicker(makeSelect(["One", "Two"]));

    pickerPart(".panel").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(picker.isPickerOpen()).toBe(true);

    pickerPart(".backdrop").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(picker.isPickerOpen()).toBe(false);
    expect(document.querySelectorAll('[data-couch="picker"]')).toHaveLength(0);
  });

  it("closes on request", async () => {
    const picker = await load();
    picker.openPicker(makeSelect(["One"]));

    picker.closePicker();

    expect(picker.isPickerOpen()).toBe(false);
    expect(document.querySelectorAll('[data-couch="picker"]')).toHaveLength(0);
  });
});
