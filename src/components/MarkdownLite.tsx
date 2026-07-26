import { Fragment, type ReactNode } from "react";

/**
 * Minimal, dependency-free markdown renderer for Sage's chat + audit prose.
 * Sage speaks markdown (**bold**, ## headings, - bullets, `code`), but the
 * chat previously rendered it as raw whitespace-pre-wrap text so the `**` and
 * `###` showed literally. This handles the handful of constructs Sage actually
 * emits — everything else falls through as plain text.
 *
 * Safe by construction: output is React text nodes (auto-escaped), never
 * dangerouslySetInnerHTML.
 * ponytail: covers bold/italic/code/headings/lists/paragraphs — no full CommonMark
 * lib. Add react-markdown only if Sage starts emitting tables/links/blockquotes.
 */

// Inline: **bold**, `code`, *italic*, _italic_ (underscore only at word
// boundaries so scenario keys like co2_enabled aren't italicized).
const INLINE_RE =
  /(\*\*(.+?)\*\*|`([^`]+?)`|(?<![A-Za-z0-9])_(.+?)_(?![A-Za-z0-9])|\*(.+?)\*)/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3] != null)
      nodes.push(
        <code key={k++} className="rounded bg-ink-200/60 px-1 font-mono text-[0.92em]">
          {m[3]}
        </code>,
      );
    else if (m[4] != null) nodes.push(<em key={k++}>{m[4]}</em>);
    else if (m[5] != null) nodes.push(<em key={k++}>{m[5]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING_CLASS = ["text-sm font-bold", "text-sm font-bold", "text-[13px] font-semibold"];
const isBlockStart = (l: string) => /^(#{1,6})\s|^\s*[-*]\s|^\s*\d+\.\s/.test(l);

export default function MarkdownLite({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = Math.min(h[1].length, 3) - 1;
      blocks.push(
        <div key={key++} className={`${HEADING_CLASS[lvl]} text-ink-900`}>
          {renderInline(h[2])}
        </div>,
      );
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(
          <li key={items.length}>{renderInline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>,
        );
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-0.5 pl-4">
          {items}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(
          <li key={items.length}>{renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>,
        );
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal space-y-0.5 pl-5">
          {items}
        </ol>,
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: gather contiguous non-blank, non-block lines; join with <br>.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="leading-snug">
        {para.map((l, idx) => (
          <Fragment key={idx}>
            {renderInline(l)}
            {idx < para.length - 1 && <br />}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className={className ?? "space-y-1.5"}>{blocks}</div>;
}
