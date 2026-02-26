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
  panelClassName?: string;
};

export default function ChatComposer({
  onSend,
  isSending = false,
  isDisabled = false,
  placeholder = "Message the assistant...",
  value,
  onChange,
  panelClassName,
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
      <div
        className={cn(
          "relative rounded-[1.35rem] border border-[#d7d9dd]/80 bg-white/88 p-3 shadow-[0_24px_56px_rgba(15,23,42,0.2)] backdrop-blur",
          panelClassName
        )}
      >
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
            "min-h-[104px] resize-none border-0 bg-transparent px-1 pb-10 pr-12 pt-1 text-[15px] leading-6 text-[#1d1d1f] shadow-none placeholder:text-[#9a9aa0] focus-visible:ring-0",
            isDisabled && "cursor-not-allowed opacity-70"
          )}
        />
        <Button
          type="submit"
          size="icon"
          disabled={isSubmitDisabled}
          className="omicron-chat-send absolute bottom-3 right-3 h-9 w-9 rounded-full shadow-[0_8px_20px_rgba(0,113,227,0.36)]"
          aria-label={statusLabel}
          title={statusLabel}
        >
          {isSending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
        <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-[#8f8f95]">
          Enter to send, Shift + Enter for a new line
        </p>
      </div>
    </form>
  );
}
