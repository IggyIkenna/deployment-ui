/**
 * Minimal markdown renderer for in-app help docs — no external dependency.
 *
 * Handles only the small subset our `.md` help files use: `##` / `###` headings,
 * `- ` bullet lists, `**bold**`, `` `code` ``, and blank-line-separated paragraphs.
 * Docs live in `.md` files imported via `?raw`, so the content is edited in one place
 * (the document) and rendered directly here — no content duplicated in components.
 */
import { Fragment, type ReactNode } from "react";

/** Render inline `**bold**` and `` `code` `` spans within a line of text. */
function renderInline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter((seg) => seg !== "")
    .map((seg, i) => {
      if (seg.startsWith("**") && seg.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-[var(--color-text-primary)]">
            {seg.slice(2, -2)}
          </strong>
        );
      }
      if (seg.startsWith("`") && seg.endsWith("`")) {
        return (
          <code key={i} className="rounded bg-[var(--color-bg-secondary)] px-1 py-0.5 font-mono text-[0.9em]">
            {seg.slice(1, -1)}
          </code>
        );
      }
      return <Fragment key={i}>{seg}</Fragment>;
    });
}

export function Markdown({ src }: { src: string }) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p${blocks.length}`} className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          {renderInline(para.join(" "))}
        </p>,
      );
      para = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`u${blocks.length}`} className="space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-text-muted)]" aria-hidden="true" />
              <span>{renderInline(b)}</span>
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      flushPara();
      flushBullets();
      blocks.push(
        <h3
          key={`h${blocks.length}`}
          className="mt-5 mb-1 text-sm font-semibold text-[var(--color-text-primary)] first:mt-0"
        >
          {renderInline(line.slice(3))}
        </h3>,
      );
    } else if (line.startsWith("### ")) {
      flushPara();
      flushBullets();
      blocks.push(
        <h4
          key={`h${blocks.length}`}
          className="mt-3 mb-1 text-[13px] font-semibold text-[var(--color-text-secondary)]"
        >
          {renderInline(line.slice(4))}
        </h4>,
      );
    } else if (line.startsWith("- ")) {
      flushPara();
      bullets.push(line.slice(2));
    } else if (line.trim() === "") {
      flushPara();
      flushBullets();
    } else {
      flushBullets();
      para.push(line);
    }
  }
  flushPara();
  flushBullets();

  return <div className="space-y-2">{blocks}</div>;
}
