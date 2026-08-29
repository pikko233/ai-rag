import { memo } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function normalizeMathDelimiters(markdown: string) {
  // 保留代码块和行内代码原文，只规范化普通 Markdown 文本。
  return markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }

      return part
        // CommonMark 不解析紧贴中英文的词内粗体，例如“使用**SSE**方案”。
        .replace(
          /([\p{L}\p{N}])\*\*(\S(?:[^\n]*?\S)?)\*\*([\p{L}\p{N}])/gu,
          (_, prefix: string, content: string, suffix: string) =>
            `${prefix} **${content}** ${suffix}`,
        )
        .replace(/\\\[/g, () => "\n$$\n")
        .replace(/\\\]/g, () => "\n$$\n")
        .replace(/\\\(/g, () => "$")
        .replace(/\\\)/g, () => "$");
    })
    .join("");
}

const markdownComponents = {
  h1: ({ children }) => (
    <h1 className="mt-6 mb-3 text-2xl font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-3 text-xl font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-2 text-lg font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-2 font-semibold first:mt-0">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 break-words last:mb-0">{children}</p>
  ),
  a: ({ children, href, title }) => (
    <a
      className="font-medium wrap-break-word text-primary underline underline-offset-4"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
      title={title}
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>
  ),
  li: ({ children }) => <li className="min-w-0 break-words pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-border pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-border" />,
  code: ({ children, className }) => {
    const match = /language-(\w+)/.exec(className ?? "");

    return match ? (
      <SyntaxHighlighter
        codeTagProps={{
          style: {
            fontFamily: "inherit",
            textShadow: "none",
          },
        }}
        customStyle={{
          background: "transparent",
          border: 0,
          borderRadius: 0,
          boxShadow: "none",
          fontFamily:
            "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "0.8125rem",
          lineHeight: 1.65,
          margin: 0,
          padding: 0,
          textShadow: "none",
        }}
        language={match[1]}
        PreTag="div"
        style={vscDarkPlus}
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    ) : (
      <code
        className={`break-all whitespace-normal rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] font-medium text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-rose-300 ${className ?? ""}`}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 max-w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm leading-relaxed shadow-sm dark:border-slate-700 dark:bg-slate-900 [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 max-w-full overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b last:border-b-0">{children}</tr>
  ),
  th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
  img: ({ alt, src, title }) => (
    // Markdown image sources are sanitized by react-markdown's default URL transform.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt ?? ""}
      className="my-4 h-auto max-w-full rounded-lg"
      loading="lazy"
      src={src}
      title={title}
    />
  ),
} satisfies Components;

export const MarkdownContent = memo(function MarkdownContent({
  text,
}: {
  text: string;
}) {
  return (
    <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {normalizeMathDelimiters(text)}
      </Markdown>
    </div>
  );
});
