"use client";

import { useMemo, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatComposerProps = {
  onSend: (content: string) => Promise<void> | void;
  isSending?: boolean;
  isDisabled?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
};

export default function ChatComposer({
  onSend,
  isSending = false,
  isDisabled = false,
  placeholder = "Message the assistant...",
  value,
  onChange,
}: ChatComposerProps) {
  const [internalValue, setInternalValue] = useState("");
  const message = value ?? internalValue;
  const setMessage = onChange ?? setInternalValue;

  const isSubmitDisabled =
    isSending || isDisabled || message.trim().length === 0;
  const statusLabel = useMemo(
    () => (isSending ? "Sending message" : "Send message"),
    [isSending]
  );

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    await onSend(trimmed);
    setMessage("");
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
      className="w-full"
    >
      <div className="relative rounded-3xl border border-slate-200/80 bg-white/95 p-3 shadow-sm">
        <Textarea
          id="chat-composer"
          rows={2}
          value={message}
          disabled={isDisabled || isSending}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={placeholder}
          aria-label="Message input"
          className={cn(
            "min-h-[96px] resize-none border-0 bg-transparent px-1 pb-10 pr-12 pt-1 shadow-none focus-visible:ring-0",
            isDisabled && "cursor-not-allowed opacity-70"
          )}
        />
        <Button
          type="submit"
          size="icon"
          disabled={isSubmitDisabled}
          className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-slate-900 text-white hover:bg-slate-800"
          aria-label={statusLabel}
          title={statusLabel}
        >
          {isSending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
        <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-slate-400">
          Enter to send, Shift + Enter for a new line
        </p>
      </div>
    </form>
  );
}
