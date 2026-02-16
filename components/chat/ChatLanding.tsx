"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChatComposer from "@/components/chat/ChatComposer";
import { isChatApiConfigured } from "@/lib/api/chat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const PENDING_CHAT_KEY = "omicron.pendingChat";

export default function ChatLanding() {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSend = async (content: string) => {
    setIsCreating(true);
    setError(null);

    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          PENDING_CHAT_KEY,
          JSON.stringify({
            conversationId: "new",
            content,
          })
        );
      }

      router.push("/chat/new");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to start a new chat."
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-between gap-8">
      <div>
        <Badge
          variant="outline"
          className="inline-flex items-center gap-3 rounded-full border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
          Omicron chat
        </Badge>
        <h1 className="mt-6 text-3xl font-semibold text-slate-900 sm:text-4xl font-[var(--font-display)]">
          Start a new conversation.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          Ask the assistant anything about your product roadmap, release plans, or
          internal docs. We will stream answers as the API comes online.
        </p>
      </div>

      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50">
            <AlertTitle>Unable to start chat</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!isChatApiConfigured() ? (
          <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-800">
            <AlertTitle className="text-amber-800">Mock mode enabled</AlertTitle>
            <AlertDescription className="text-amber-800">
              Using mock data until the chat API base URL is configured.
            </AlertDescription>
          </Alert>
        ) : null}

        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          isSending={isCreating}
          placeholder="Describe what you need help with today..."
        />
      </div>
    </div>
  );
}
