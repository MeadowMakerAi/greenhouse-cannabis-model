import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import MarkdownLite from "../components/MarkdownLite";

afterEach(cleanup);

describe("MarkdownLite", () => {
  it("renders bold, inline code, and headings as elements, not literal syntax", () => {
    const { container } = render(
      <MarkdownLite text={"## Priorities\nUse **double poly** and set `co2Enabled`."} />,
    );
    // Heading text present without the ## markers.
    expect(screen.getByText("Priorities")).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("double poly");
    expect(container.querySelector("code")?.textContent).toBe("co2Enabled");
    // The raw markdown tokens must not survive as text.
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("##");
  });

  it("renders bullet lists", () => {
    const { container } = render(
      <MarkdownLite text={"- first\n- second"} />,
    );
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("first");
  });

  it("does not italicize underscores inside identifiers", () => {
    const { container } = render(<MarkdownLite text={"field co2_enabled stays plain"} />);
    expect(container.querySelector("em")).toBeNull();
    expect(container.textContent).toContain("co2_enabled");
  });
});
