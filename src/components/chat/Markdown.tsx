import Image from "next/image";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cx } from "@/components/ui";
import { isOwnStorageImageUrl, safeLinkHref } from "./trusted-image";

const linkClass = "font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent";
const EXTERNAL_REL = "noopener noreferrer nofollow";

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
  a: ({ href, children }) => {
    const safe = safeLinkHref(href);
    if (!safe) return <span className="font-medium text-fg">{children}</span>;
    return (
      <a href={safe} target="_blank" rel={EXTERNAL_REL} className={linkClass}>
        {children}
      </a>
    );
  },
  // Images from any other host become links: loading them would let a prompt-injected answer leak data (#42).
  img: ({ src, alt }) => {
    const url = typeof src === "string" ? src : undefined;
    if (url && isOwnStorageImageUrl(url)) {
      return (
        <span className="relative my-3 block aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface-3">
          <Image src={url} alt={alt ?? ""} fill sizes="(max-width: 768px) 90vw, 448px" className="object-contain" />
        </span>
      );
    }
    const safe = safeLinkHref(url);
    const label = alt || url || "";
    return safe ? (
      <a href={safe} target="_blank" rel={EXTERNAL_REL} className={linkClass}>
        {label}
      </a>
    ) : (
      <span>{alt}</span>
    );
  },
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
