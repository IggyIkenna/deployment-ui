import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

/**
 * Markdown branch coverage — the parser is a line-by-line state machine (heading /
 * sub-heading / bullet / blank / paragraph) plus an inline-span splitter (bold / code /
 * plain). Sat at 0% coverage (nothing renders the help-doc dialog in existing tests);
 * these exercise every line-type branch and every inline-span branch directly.
 */
describe("Markdown", () => {
  it("renders a ## heading", () => {
    render(<Markdown src="## Section title" />);
    expect(screen.getByText("Section title").tagName).toBe("H3");
  });

  it("renders a ### sub-heading", () => {
    render(<Markdown src="### Sub title" />);
    expect(screen.getByText("Sub title").tagName).toBe("H4");
  });

  it("renders a paragraph, joining consecutive non-blank lines with a space", () => {
    render(<Markdown src={"line one\nline two"} />);
    expect(screen.getByText("line one line two").tagName).toBe("P");
  });

  it("renders a bullet list, one <li> per '- ' line", () => {
    render(<Markdown src={"- first\n- second\n- third"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("first");
    expect(items[2]).toHaveTextContent("third");
  });

  it("flushes an open paragraph when a bullet line starts (paragraph -> bullets transition)", () => {
    render(<Markdown src={"a paragraph\n- then a bullet"} />);
    expect(screen.getByText("a paragraph").tagName).toBe("P");
    expect(screen.getByRole("listitem")).toHaveTextContent("then a bullet");
  });

  it("flushes open bullets when a paragraph line starts (bullets -> paragraph transition)", () => {
    render(<Markdown src={"- a bullet\nthen a paragraph"} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("a bullet");
    expect(screen.getByText("then a paragraph").tagName).toBe("P");
  });

  it("flushes both paragraph and bullets on a heading line", () => {
    render(<Markdown src={"para\n- bullet\n## heading"} />);
    expect(screen.getByText("para").tagName).toBe("P");
    expect(screen.getByRole("listitem")).toHaveTextContent("bullet");
    expect(screen.getByText("heading").tagName).toBe("H3");
  });

  it("a blank line closes the current paragraph without starting a new block", () => {
    render(<Markdown src={"first para\n\nsecond para"} />);
    expect(screen.getByText("first para").tagName).toBe("P");
    expect(screen.getByText("second para").tagName).toBe("P");
  });

  it("a blank line closes an open bullet list", () => {
    render(<Markdown src={"- only bullet\n\nafter"} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("after").tagName).toBe("P");
  });

  it("normalizes CRLF line endings before parsing", () => {
    render(<Markdown src={"## title\r\n- item"} />);
    expect(screen.getByText("title").tagName).toBe("H3");
    expect(screen.getByRole("listitem")).toHaveTextContent("item");
  });

  it("renders inline **bold** as <strong>", () => {
    render(<Markdown src="a **bold** word" />);
    const strong = screen.getByText("bold");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders inline `code` as <code>", () => {
    render(<Markdown src="a `snippet` here" />);
    const code = screen.getByText("snippet");
    expect(code.tagName).toBe("CODE");
  });

  it("renders bold and code together with plain text in one line", () => {
    const { container } = render(<Markdown src="**bold** and `code` and plain" />);
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("code")).toHaveTextContent("code");
    expect(container.textContent).toContain("and plain");
  });

  it("renders nothing for an empty source (no trailing empty block)", () => {
    const { container } = render(<Markdown src="" />);
    expect(container.querySelector("div")?.children.length).toBe(0);
  });

  it("flushes a still-open paragraph at end of input (no trailing blank line)", () => {
    render(<Markdown src="trailing paragraph, no newline after" />);
    expect(screen.getByText("trailing paragraph, no newline after").tagName).toBe("P");
  });

  it("flushes a still-open bullet list at end of input", () => {
    render(<Markdown src={"- last bullet, no trailing blank"} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("last bullet, no trailing blank");
  });
});
