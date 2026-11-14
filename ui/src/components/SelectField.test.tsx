import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SelectField, type SelectOption } from "./SelectField";

const OPTIONS: SelectOption<"a" | "b" | "c">[] = [
  { value: "a", label: "Mục A", badge: "Tốt", description: "Mô tả A" },
  { value: "b", label: "Mục B" },
  { value: "c", label: "Mục C (khóa)", disabled: true },
];

describe("SelectField", () => {
  it("renders selected option label and placeholder fallback", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SelectField
        value="a"
        onChange={onChange}
        options={OPTIONS}
        ariaLabel="Chọn mục"
      />
    );

    expect(screen.getByRole("combobox", { name: "Chọn mục" })).toHaveTextContent(
      "Mục A"
    );

    rerender(
      <SelectField
        value={"missing" as "a"}
        onChange={onChange}
        options={OPTIONS}
        placeholder="Vui lòng chọn..."
        ariaLabel="Chọn mục"
      />
    );
    expect(screen.getByRole("combobox", { name: "Chọn mục" })).toHaveTextContent(
      "Vui lòng chọn..."
    );
  });

  it("opens menu, selects an enabled option, ignores disabled options, and closes on Escape", () => {
    const onChange = vi.fn();
    render(
      <SelectField
        value="a"
        onChange={onChange}
        options={OPTIONS}
        ariaLabel="Chọn mục"
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Chọn mục" });
    fireEvent.click(trigger);

    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Disabled option should not trigger onChange
    fireEvent.click(screen.getByRole("option", { name: /Mục C/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Enabled option triggers onChange and closes menu
    fireEvent.click(screen.getByRole("option", { name: /Mục B/ }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();

    // Escape closes an open menu
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open menu when disabled", () => {
    const onChange = vi.fn();
    render(
      <SelectField
        value="a"
        onChange={onChange}
        options={OPTIONS}
        disabled
        ariaLabel="Chọn mục"
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Chọn mục" });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
