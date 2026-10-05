import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cx } from "@/components/ui";

const components: Components = {
  h1: ({ children }) => <h3 className="mb-2 mt-5 font-display text-xl font-semibold text-fg first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-5 font-display text-lg font-semibold text-fg first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-4 font-display text-base font-semibold text-accent first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mb-1 mt-3 text-sm font-semibold uppercase tracking-wider text-fg-muted first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 space-y-1.5 pl-5 marker:text-accent last:mb-0 [list-style:disc]">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-accent last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-relaxed [&>ol]:mt-1.5 [&>p]:mb-1 [&>ul]:mt-1.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic text-fg-muted">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-xl border-l-2 border-accent bg-accent-soft py-2 pl-4 pr-3 text-fg-muted">{children}</blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-xl border border-border bg-surface p-3 text-sm [&>code]:bg-transparent [&>code]:p-0">{children}</pre>
  ),
  code: ({ className, children }) => (
    <code className={cx("rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[0.875em] text-accent", className)}>{children}</code>
  ),
  hr: () => <hr className="my-5 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-3 text-left">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
  th: ({ children }) => <th className="px-3 py-2 font-semibold text-fg">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
};

export default function Markdown({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className={cx("chat-prose text-[0.975rem] text-fg-muted", streaming && "chat-streaming")}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
