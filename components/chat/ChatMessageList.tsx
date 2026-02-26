"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/api/chat";
import { cn } from "@/lib/utils";

const HTML_CODE_FENCE_PATTERN = /^\s*```(?:html|htm|xml)?\s*([\s\S]*?)\s*```\s*$/i;
const ESCAPED_HTML_TAG_PATTERN = /&lt;\s*\/?\s*[a-zA-Z][\s\S]*?&gt;/;

const decodeBasicHtmlEntities = (value: string) =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

const normalizeRenderableContent = (value: string) => {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(HTML_CODE_FENCE_PATTERN);
  const candidate = fencedMatch ? fencedMatch[1] : value;

  if (!ESCAPED_HTML_TAG_PATTERN.test(candidate)) {
    return candidate;
  }

  return decodeBasicHtmlEntities(candidate);
};

export default function ChatMessageList({
  messages,
  thinkingMessageId = null,
  thinkingAvailableByMessageId,
  onReasoningClick,
}: {
  messages: ChatMessage[];
  thinkingMessageId?: string | null;
  thinkingAvailableByMessageId?: Record<string, boolean>;
  onReasoningClick?: (messageId: string) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-[#7a7a7a]">
        No messages yet. Start with a clear prompt to begin.
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isThinking = thinkingMessageId === message.id;
        const hasThinkingAvailable = Boolean(thinkingAvailableByMessageId?.[message.id]);
        const showThinking = !isUser && (isThinking || hasThinkingAvailable);
        const renderableContent = normalizeRenderableContent(
          message.content || "Thinking..."
        );

        if (isUser) {
          return (
            <article key={message.id} className="flex justify-end">
              <div className="max-w-[85%] sm:max-w-[70%]">
                <div className="inline-block rounded-[1.35rem] bg-gradient-to-b from-[#232326] to-[#151517] px-5 py-3 text-left text-sm leading-6 text-white shadow-[0_4px_12px_rgba(17,17,17,0.12)]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    skipHtml={false}
                    components={{
                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0">{children}</p>
                      ),
                      a: ({ children, ...props }) => (
                        <a
                          {...props}
                          className="text-white/90 underline underline-offset-4"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {children}
                        </a>
                      ),
                      code: ({ children }) => (
                        <code className="rounded bg-white/20 px-1 py-0.5 text-[0.8em] text-white">
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre className="mt-2 overflow-x-auto rounded-2xl bg-white/15 p-3 text-xs">
                          {children}
                        </pre>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-2 list-disc space-y-1 pl-5">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-2 list-decimal space-y-1 pl-5">
                          {children}
                        </ol>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-white/40 pl-3 italic">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {renderableContent}
                  </ReactMarkdown>
                </div>
              </div>
            </article>
          );
        }

        return (
          <article key={message.id} className="space-y-2">
            <div className="w-full px-1 py-1 text-[15px] leading-7 text-[#303036]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                skipHtml={false}
                components={{
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  a: ({ children, ...props }) => (
                    <a
                      {...props}
                      className="text-[#0b5cb6] underline underline-offset-4 hover:text-[#084f9b]"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {children}
                    </a>
                  ),
                  code: ({ children }) => (
                    <code className="rounded bg-[#f2f5f9] px-1 py-0.5 text-[0.8em] text-[#303036]">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-[#dde3ec] bg-[#f5f8fc] p-3 text-xs text-[#303036]">
                      {children}
                    </pre>
                  ),
                  ul: ({ children }) => (
                    <ul className="mb-2 list-disc space-y-1 pl-5">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="mb-2 list-decimal space-y-1 pl-5">
                      {children}
                    </ol>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-[#d2d2d2] pl-3 italic">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {renderableContent}
              </ReactMarkdown>
            </div>
            {showThinking ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onReasoningClick?.(message.id)}
                className={cn(
                  "h-auto rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.2em]",
                  isThinking
                    ? "bg-transparent text-[#0b5cb6] animate-pulse"
                    : "bg-transparent text-[#7a7a7a] hover:text-[#0b5cb6]"
                )}
              >
                Thinking
              </Button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
