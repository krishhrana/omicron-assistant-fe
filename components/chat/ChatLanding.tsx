"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChatComposer from "@/components/chat/ChatComposer";
import { isChatApiConfigured } from "@/lib/api/chat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const PENDING_CHAT_KEY = "omicron.pendingChat";

export default function ChatLanding() {
  const router = useRouter();
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
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center">
      <div className="w-full max-w-[44rem] space-y-4">
        {error ? (
          <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50">
            <AlertTitle>Unable to start chat</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!isChatApiConfigured() ? (
          <Alert className="omicron-notice rounded-2xl">
            <AlertTitle>Sample mode enabled</AlertTitle>
            <AlertDescription>
              Chat backend is not configured yet. Showing sample responses.
            </AlertDescription>
          </Alert>
        ) : null}

        <ChatComposer
          onSend={handleSend}
          isSending={isCreating}
          placeholder="Describe what you need help with today..."
        />
      </div>
    </div>
  );
}
