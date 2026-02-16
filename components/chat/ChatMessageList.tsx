"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/api/chat";
import { cn } from "@/lib/utils";

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
      <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/40 p-10 text-center text-sm text-slate-500">
        No messages yet. Start with a clear prompt to begin.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isThinking = thinkingMessageId === message.id;
        const hasThinkingAvailable = Boolean(thinkingAvailableByMessageId?.[message.id]);
        const showThinking = !isUser && (isThinking || hasThinkingAvailable);

        if (isUser) {
          return (
            <article key={message.id} className="flex justify-end">
              <div className="max-w-[85%] sm:max-w-[70%]">
                <div className="inline-block rounded-[999px] bg-slate-900 px-5 py-3 text-left text-sm leading-6 text-white">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
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
                    {message.content || "Thinking..."}
                  </ReactMarkdown>
                </div>
              </div>
            </article>
          );
        }

        return (
          <article key={message.id} className="space-y-2">
            <div className="max-w-3xl text-sm leading-7 text-slate-700">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  a: ({ children, ...props }) => (
                    <a
                      {...props}
                      className="text-emerald-700 underline underline-offset-4"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {children}
                    </a>
                  ),
                  code: ({ children }) => (
                    <code className="rounded bg-slate-900/10 px-1 py-0.5 text-[0.8em] text-slate-700">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900/10 p-3 text-xs">
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
                    <blockquote className="border-l-2 border-slate-300 pl-3 italic">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {message.content || "Thinking..."}
              </ReactMarkdown>
            </div>
            {showThinking ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => onReasoningClick?.(message.id)}
                className={cn(
                  "rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.2em]",
                  isThinking
                    ? "border-amber-200 bg-amber-50 text-amber-700 animate-pulse"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700"
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
