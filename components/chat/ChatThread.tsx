"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessageList from "@/components/chat/ChatMessageList";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  isChatApiConfigured,
  listMessages,
  streamAssistantResponse,
  type ChatConversation,
  type ChatMessage,
} from "@/lib/api/chat";
import { useAuth } from "@/components/auth/AuthenticatedApp";
import { useChatShell } from "@/components/chat/ChatShell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const LOAD_HISTORY_KEY = "omicron.loadHistoryFor";
const PENDING_CHAT_KEY = "omicron.pendingChat";
const THREAD_SNAPSHOT_PREFIX = "omicron.threadSnapshot.";

type AgentUpdateEntry = {
  id: string;
  createdAt: string;
  kind: "switch" | "agent_updated" | "handoff";
  from?: string;
  to: string;
};

type ThinkingTimelineEntry =
  | {
      id: string;
      createdAt: string;
      kind: "agent_update";
      updateKind: AgentUpdateEntry["kind"];
      from?: string;
      to: string;
    }
  | {
      id: string;
      createdAt: string;
      kind: "reasoning_bullet";
      agentLabel: string;
      text: string;
    };

const formatUpdatedAt = (timestamp?: string) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const createLocalMessage = (role: "user" | "assistant", content: string): ChatMessage => ({
  id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content,
  createdAt: new Date().toISOString(),
});

const deriveTitle = (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) return "New chat";
  const words = trimmed.split(/\s+/).slice(0, 6).join(" ");
  return words.length < trimmed.length ? `${words}...` : words;
};

const normalizeMessageContentKey = (content: string) =>
  content.trim().replace(/\s+/g, " ");

const normalizeAgentContext = (meta?: { scope?: unknown; agent?: unknown }) => {
  const scope = meta?.scope === "tool" ? "tool" : "main";
  const agentRaw = meta?.agent;
  const agent =
    typeof agentRaw === "string" && agentRaw.trim() ? agentRaw.trim() : scope;
  const label = agent === scope ? scope : `${scope}:${agent}`;
  return { scope, agent, label, key: `${scope}:${agent}` };
};

const sortAgentLabels = (a: string, b: string) => {
  if (a === "main") return -1;
  if (b === "main") return 1;
  return a.localeCompare(b);
};

export default function ChatThread({
  conversationId,
}: {
  conversationId: string;
}) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const router = useRouter();
  const { conversations, upsertConversation } = useChatShell();

  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinkingMessageId, setThinkingMessageId] = useState<string | null>(null);
  const [selectedReasoningId, setSelectedReasoningId] = useState<string | null>(
    null
  );
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingTimelineByMessageId, setThinkingTimelineByMessageId] = useState<
    Record<string, ThinkingTimelineEntry[]>
  >({});

  const streamControllerRef = useRef<AbortController | null>(null);
  const hasAutoStartedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const conversationsRef = useRef<ChatConversation[]>(conversations);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const conversationRef = useRef<ChatConversation | null>(conversation);
  const sessionIdRef = useRef<string | null>(sessionId);
  const thinkingTimelineRef = useRef(thinkingTimelineByMessageId);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    thinkingTimelineRef.current = thinkingTimelineByMessageId;
  }, [thinkingTimelineByMessageId]);

  const lastUpdatedLabel = useMemo(
    () => formatUpdatedAt(conversation?.updatedAt),
    [conversation?.updatedAt]
  );

  const selectedReasoningMessage = useMemo(
    () => messages.find((message) => message.id === selectedReasoningId) ?? null,
    [messages, selectedReasoningId]
  );

  const selectedThinkingTimeline = useMemo(() => {
    if (!selectedReasoningMessage) return [];
    return thinkingTimelineByMessageId[selectedReasoningMessage.id] ?? [];
  }, [thinkingTimelineByMessageId, selectedReasoningMessage]);

  const selectedStructuredReasoningByAgent = useMemo(() => {
    const entries = selectedReasoningMessage?.reasoning ?? [];
    const byAgent: Record<string, string[]> = {};

    for (const entry of entries) {
      const agentLabel =
        typeof entry.agent === "string" && entry.agent.trim()
          ? entry.agent.trim()
          : entry.scope === "tool"
            ? "tool"
            : "main";

      const summary = entry.data?.summary ?? [];
      const bullets =
        summary.length > 0
          ? summary
              .map((item) => item.text)
              .filter((text) => text.trim().length > 0)
          : entry.raw.trim()
            ? [entry.raw.trim()]
            : [];

      if (bullets.length === 0) continue;

      byAgent[agentLabel] = [...(byAgent[agentLabel] ?? []), ...bullets];
    }

    return byAgent;
  }, [selectedReasoningMessage]);

  const selectedHasStructuredReasoning = useMemo(
    () =>
      Object.values(selectedStructuredReasoningByAgent).some(
        (items) => items.length > 0
      ),
    [selectedStructuredReasoningByAgent]
  );

  const selectedHasTimeline = selectedThinkingTimeline.length > 0;
  const selectedHasStreamedReasoningBullets = useMemo(
    () =>
      selectedThinkingTimeline.some(
        (entry) => entry.kind === "reasoning_bullet" && entry.text.trim().length > 0
      ),
    [selectedThinkingTimeline]
  );
  const selectedShouldShowStructuredReasoning =
    selectedHasStructuredReasoning && !selectedHasStreamedReasoningBullets;
  const selectedHasAnyInspection = selectedHasTimeline || selectedHasStructuredReasoning;

  const thinkingAvailableByMessageId = useMemo(() => {
    const availability: Record<string, boolean> = {};

    for (const message of messages) {
      if (message.role !== "assistant") continue;

      const hasTimeline = (thinkingTimelineByMessageId[message.id] ?? []).length > 0;
      const hasStructuredReasoning = (message.reasoning?.length ?? 0) > 0;

      availability[message.id] =
        hasTimeline || hasStructuredReasoning;
    }

    return availability;
  }, [messages, thinkingTimelineByMessageId]);

  const isFreshNewChat = conversationId === "new" && messages.length === 0;

  useEffect(() => {
    let cancelled = false;

    streamControllerRef.current?.abort();
    hasAutoStartedRef.current = false;
    setLoadError(null);
    setSendError(null);
    setThinkingMessageId(null);
    setSelectedReasoningId(null);
    setIsReasoningOpen(false);
    setIsLoading(true);

    const baseConversation =
      conversationId === "new"
        ? {
            id: "new",
            title: "New chat",
            updatedAt: new Date().toISOString(),
            preview: "",
            sessionId: null,
          }
        : (conversationsRef.current.find((item) => item.id === conversationId) ?? {
            id: conversationId,
            title: "Conversation",
            updatedAt: new Date().toISOString(),
            preview: "",
            sessionId: conversationId,
          });

    setConversation(baseConversation);
    setSessionId(conversationId === "new" ? null : baseConversation.sessionId ?? conversationId);
    setMessages([]);
    setThinkingTimelineByMessageId({});

    if (conversationId === "new") {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (typeof window === "undefined") {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    let snapshotMessages: ChatMessage[] | null = null;
    let snapshotThinkingTimelineByMessageId:
      | Record<string, ThinkingTimelineEntry[]>
      | null = null;

    const snapshotRaw = sessionStorage.getItem(
      `${THREAD_SNAPSHOT_PREFIX}${conversationId}`
    );
    if (snapshotRaw) {
      try {
        const parsed = JSON.parse(snapshotRaw) as {
          conversation?: ChatConversation;
          messages?: ChatMessage[];
          thinkingTimelineByMessageId?: Record<string, ThinkingTimelineEntry[]>;
        };

        snapshotMessages = Array.isArray(parsed.messages) ? parsed.messages : null;
        snapshotThinkingTimelineByMessageId =
          parsed.thinkingTimelineByMessageId &&
          typeof parsed.thinkingTimelineByMessageId === "object"
            ? (parsed.thinkingTimelineByMessageId as Record<
                string,
                ThinkingTimelineEntry[]
              >)
            : null;

        if (!cancelled) {
          if (parsed.conversation) {
            setConversation(parsed.conversation);
            setSessionId(parsed.conversation.sessionId ?? parsed.conversation.id);
          }
          if (Array.isArray(parsed.messages)) {
            setMessages(parsed.messages);
          }
          if (snapshotThinkingTimelineByMessageId) {
            setThinkingTimelineByMessageId(snapshotThinkingTimelineByMessageId);
          }
        }
      } catch {
        // Ignore malformed snapshots.
      } finally {
        sessionStorage.removeItem(`${THREAD_SNAPSHOT_PREFIX}${conversationId}`);
      }
    }

    sessionStorage.removeItem(LOAD_HISTORY_KEY);

    if (!accessToken) {
      setLoadError("Missing access token for loading session history.");
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const historySessionId = baseConversation.sessionId ?? conversationId;

    void listMessages(historySessionId, accessToken)
      .then((historyMessages) => {
        if (cancelled) return;

        if (snapshotMessages) {
          const historyIds = new Set(historyMessages.map((message) => message.id));

          const historyBuckets = new Map<string, string[]>();
          for (const message of historyMessages) {
            if (message.role !== "assistant") continue;
            const key = normalizeMessageContentKey(message.content);
            if (!key) continue;
            const bucket = historyBuckets.get(key) ?? [];
            bucket.push(message.id);
            historyBuckets.set(key, bucket);
          }

          const idMap: Record<string, string> = {};
          for (const message of snapshotMessages) {
            if (message.role !== "assistant") continue;
            const key = normalizeMessageContentKey(message.content);
            if (!key) continue;
            const bucket = historyBuckets.get(key);
            const matchId = bucket?.shift();
            if (matchId) {
              idMap[message.id] = matchId;
            }
          }

          if (snapshotThinkingTimelineByMessageId) {
            const migrated: Record<string, ThinkingTimelineEntry[]> = {};

            for (const [fromId, entries] of Object.entries(snapshotThinkingTimelineByMessageId)) {
              const toId = idMap[fromId] ?? (historyIds.has(fromId) ? fromId : null);
              if (!toId) continue;
              if (!Array.isArray(entries) || entries.length === 0) continue;
              migrated[toId] = [...(migrated[toId] ?? []), ...entries];
            }

            if (Object.keys(migrated).length > 0) {
              setThinkingTimelineByMessageId(migrated);
            }
          }
        }

        setMessages(historyMessages);

        if (historyMessages.length > 0) {
          const lastMessage = historyMessages[historyMessages.length - 1];
          const updatedConversation: ChatConversation = {
            ...(baseConversation ?? {
              id: conversationId,
              title: "Conversation",
              preview: "",
              updatedAt: new Date().toISOString(),
              sessionId: conversationId,
            }),
            id: conversationId,
            sessionId: historySessionId,
            updatedAt: lastMessage.createdAt,
            preview: lastMessage.content,
          };

          setConversation(updatedConversation);
          upsertConversation(updatedConversation);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : "Unable to load this conversation history."
        );
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      streamControllerRef.current?.abort();
    };
  }, [conversationId, accessToken, upsertConversation]);

  useEffect(() => {
    if (conversationId === "new") return;
    const match = conversations.find((item) => item.id === conversationId);
    if (!match) return;

    setConversation((prev) => (prev ? { ...prev, ...match } : match));
    setSessionId((prev) => prev ?? match.sessionId ?? match.id);
  }, [conversationId, conversations]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const startStreaming = useCallback(async (content: string) => {
    if (isStreaming) return;

    setSendError(null);
    setThinkingMessageId(null);
    setSelectedReasoningId(null);
    setIsReasoningOpen(false);

    const userMessage = createLocalMessage("user", content);
    const assistantMessageId = `assistant-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

    const now = new Date().toISOString();

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: now,
        reasoning: [],
      },
    ]);
    setThinkingTimelineByMessageId((prev) => ({ ...prev, [assistantMessageId]: [] }));

    setConversation((prev) =>
      prev
        ? {
            ...prev,
            updatedAt: now,
            preview: content,
            title: prev.title || deriveTitle(content),
          }
        : {
            id: conversationId,
            title: deriveTitle(content),
            updatedAt: now,
            preview: content,
            sessionId: conversationId === "new" ? null : conversationId,
          }
    );

    if (conversationId !== "new") {
      upsertConversation({
        id: sessionIdRef.current ?? conversationId,
        sessionId: sessionIdRef.current ?? conversationId,
        title: conversationRef.current?.title ?? deriveTitle(content),
        updatedAt: now,
        preview: content,
      });
    }

    streamControllerRef.current?.abort();
    const controller = new AbortController();
    streamControllerRef.current = controller;

    setIsStreaming(true);

    let streamedSessionId = sessionIdRef.current;
    let lastAgentContext = normalizeAgentContext({ scope: "main", agent: "main" });

    const recordAgentUpdate = (
      kind: AgentUpdateEntry["kind"],
      meta?: { scope?: unknown; agent?: unknown },
      { force }: { force?: boolean } = {}
    ) => {
      const next = normalizeAgentContext(meta);
      const changed = next.key !== lastAgentContext.key;

      if (!changed && !force) {
        return false;
      }

      const entry: ThinkingTimelineEntry = {
        id: `agent-update-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        kind: "agent_update",
        updateKind: kind,
        from: lastAgentContext.label,
        to: next.label,
      };

      setThinkingTimelineByMessageId((prev) => ({
        ...prev,
        [assistantMessageId]: [...(prev[assistantMessageId] ?? []), entry],
      }));

      lastAgentContext = next;
      return true;
    };

    const reasoningLineBufferByAgent: Record<string, string> = {};
    const activeReasoningBulletIdByAgent: Record<string, string | null> = {};

    const cleanStreamedReasoningLine = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^([-*•]|\d+\.)$/.test(trimmed)) return null;
      return trimmed.replace(/^([-*•]|\d+\.)\s+/, "");
    };

    const appendTimelineEntry = (entry: ThinkingTimelineEntry) => {
      setThinkingTimelineByMessageId((prev) => ({
        ...prev,
        [assistantMessageId]: [...(prev[assistantMessageId] ?? []), entry],
      }));
    };

    const updateReasoningBulletText = (entryId: string, text: string) => {
      setThinkingTimelineByMessageId((prev) => {
        const list = prev[assistantMessageId] ?? [];
        const index = list.findIndex((item) => item.id === entryId);
        if (index === -1) return prev;

        const current = list[index];
        if (current.kind !== "reasoning_bullet") return prev;
        if (current.text === text) return prev;

        const next = [...list];
        next[index] = { ...current, text };
        return { ...prev, [assistantMessageId]: next };
      });
    };

    try {
      await streamAssistantResponse(
        content,
        accessToken,
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "session_id") {
              return;
            }

            if (event.type === "reasoning_done") {
              return;
            }

            if (event.type === "reasoning_delta") {
              return;
            }

            if (event.type === "reasoning") {
              // Already handled via onReasoning.
              return;
            }

            if (event.type === "message" && event.scope !== "tool") {
              // Main assistant message is already rendered as the chat reply.
              return;
            }

            if (event.type === "handoff") {
              if (
                recordAgentUpdate("handoff", { scope: event.scope, agent: event.agent }, { force: true })
              ) {
                setThinkingMessageId(assistantMessageId);
              }
              return;
            }

            if (event.type === "agent_updated") {
              if (
                recordAgentUpdate(
                  "agent_updated",
                  { scope: event.scope, agent: event.agent },
                  { force: true }
                )
              ) {
                setThinkingMessageId(assistantMessageId);
              }
              return;
            }

            if (recordAgentUpdate("switch", event)) {
              setThinkingMessageId(assistantMessageId);
            }

            if (event.type === "delta" && event.scope === "tool") {
              setThinkingMessageId(assistantMessageId);
              return;
            }
          },
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content + token }
                  : message
              )
            );
          },
          onMessage: (assistantMessage) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      role: "assistant",
                      content: assistantMessage.content,
                      reasoning: message.reasoning,
                    }
                  : message
              )
            );
          },
          onReasoning: (entry) => {
            setThinkingMessageId(assistantMessageId);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      reasoning: [...(message.reasoning ?? []), entry],
                    }
                  : message
              )
            );
          },
          onReasoningToken: (token, meta) => {
            setThinkingMessageId(assistantMessageId);
            recordAgentUpdate("switch", meta);
            const agentLabel = normalizeAgentContext(meta).label;
            const previous = reasoningLineBufferByAgent[agentLabel] ?? "";
            const normalized = `${previous}${token}`
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n");
            const lines = normalized.split("\n");
            const remainder = lines.pop() ?? "";

            reasoningLineBufferByAgent[agentLabel] = remainder;

            for (const line of lines) {
              const cleaned = cleanStreamedReasoningLine(line);
              const activeId = activeReasoningBulletIdByAgent[agentLabel];

              if (!cleaned) {
                activeReasoningBulletIdByAgent[agentLabel] = null;
                continue;
              }

              if (activeId) {
                updateReasoningBulletText(activeId, cleaned);
                activeReasoningBulletIdByAgent[agentLabel] = null;
                continue;
              }

              appendTimelineEntry({
                id: `reasoning-bullet-${Date.now()}-${Math.random()
                  .toString(16)
                  .slice(2)}`,
                createdAt: new Date().toISOString(),
                kind: "reasoning_bullet",
                agentLabel,
                text: cleaned,
              });
            }

            const remainderCleaned = cleanStreamedReasoningLine(remainder);
            if (!remainderCleaned) return;

            const activeId = activeReasoningBulletIdByAgent[agentLabel];
            if (activeId) {
              updateReasoningBulletText(activeId, remainderCleaned);
              return;
            }

            const entryId = `reasoning-bullet-${Date.now()}-${Math.random()
              .toString(16)
              .slice(2)}`;
            activeReasoningBulletIdByAgent[agentLabel] = entryId;
            appendTimelineEntry({
              id: entryId,
              createdAt: new Date().toISOString(),
              kind: "reasoning_bullet",
              agentLabel,
              text: remainderCleaned,
            });
          },
          onSessionId: (nextSessionId) => {
            streamedSessionId = nextSessionId;
            setSessionId(nextSessionId);

            const updatedConversation: ChatConversation = {
              id: nextSessionId,
              sessionId: nextSessionId,
              title:
                conversationRef.current?.title &&
                conversationRef.current.title !== "Conversation"
                  ? conversationRef.current.title
                  : deriveTitle(content),
              updatedAt: new Date().toISOString(),
              preview: content,
            };

            setConversation(updatedConversation);
            upsertConversation(updatedConversation);
          },
          onDone: () => {
            setThinkingMessageId(null);
          },
        },
        conversationId === "new" ? null : sessionIdRef.current ?? conversationId
      );

      if (conversationId === "new" && streamedSessionId) {
        if (typeof window !== "undefined") {
          const snapshotConversation: ChatConversation = {
            ...(conversationRef.current ?? {
              id: streamedSessionId,
              title: deriveTitle(content),
              updatedAt: new Date().toISOString(),
              preview: content,
              sessionId: streamedSessionId,
            }),
            id: streamedSessionId,
            sessionId: streamedSessionId,
          };

          sessionStorage.setItem(
            `${THREAD_SNAPSHOT_PREFIX}${streamedSessionId}`,
            JSON.stringify({
              conversation: snapshotConversation,
              messages: messagesRef.current,
              thinkingTimelineByMessageId: thinkingTimelineRef.current,
            })
          );
        }

        router.replace(`/chat/${streamedSessionId}`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: "Unable to stream a response. Try again shortly.",
              }
            : message
        )
      );

      setSendError(
        err instanceof Error ? err.message : "Unable to send the message."
      );
    } finally {
      setIsStreaming(false);
      setThinkingMessageId(null);
    }
  }, [accessToken, conversationId, isStreaming, router, upsertConversation]);

  useEffect(() => {
    if (isLoading || hasAutoStartedRef.current) return;
    if (typeof window === "undefined") return;

    const raw = sessionStorage.getItem(PENDING_CHAT_KEY);
    if (!raw) return;

    try {
      const pending = JSON.parse(raw) as {
        conversationId: string;
        content: string;
      };

      if (pending.conversationId !== conversationId) return;

      sessionStorage.removeItem(PENDING_CHAT_KEY);
      hasAutoStartedRef.current = true;
      void startStreaming(pending.content);
    } catch {
      sessionStorage.removeItem(PENDING_CHAT_KEY);
    }
  }, [conversationId, isLoading, startStreaming]);

  if (isLoading && messages.length === 0) {
    return (
      <Card className="flex h-full items-center justify-center gap-0 py-0">
        <CardContent className="p-6 text-sm text-slate-500">
          Loading conversation...
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (isFreshNewChat) {
    return (
      <div className="mx-auto flex h-full w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            New Chat
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900 font-[var(--font-display)]">
            What can I help you with?
          </h2>
        </div>

        <div className="w-full space-y-3">
          {sendError ? (
            <Alert variant="destructive">
              <AlertDescription>{sendError}</AlertDescription>
            </Alert>
          ) : null}

          {!isChatApiConfigured() ? (
            <Alert>
              <AlertDescription>
                Using mock data until the chat API base URL is configured.
              </AlertDescription>
            </Alert>
          ) : null}

          <ChatComposer
            onSend={startStreaming}
            isSending={isStreaming}
            isDisabled={isLoading}
            placeholder="Message Omicron..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Conversation
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 font-[var(--font-display)]">
            {conversation?.title ?? "Conversation"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">Last active {lastUpdatedLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge>SSE streaming</Badge>
          {!isChatApiConfigured() ? <Badge variant="secondary">Mock data</Badge> : null}
        </div>
      </header>

      {sendError ? (
        <Alert variant="destructive">
          <AlertDescription>{sendError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
          <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto pr-2">
            <ChatMessageList
              messages={messages}
              thinkingMessageId={thinkingMessageId}
              thinkingAvailableByMessageId={thinkingAvailableByMessageId}
              onReasoningClick={(messageId) => {
                setSelectedReasoningId(messageId);
                setIsReasoningOpen(true);
              }}
            />
          </div>

          <ChatComposer
            onSend={startStreaming}
            isSending={isStreaming}
            isDisabled={isLoading}
          />
        </div>

        <aside
          className={cn(
            "w-full transition lg:w-80",
            isReasoningOpen ? "block" : "hidden"
          )}
        >
          <Card className="h-full rounded-3xl border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
            <CardHeader className="gap-3 border-b border-slate-200/70 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Reasoning
              </p>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-lg text-slate-900">Model thinking</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setIsReasoningOpen(false)}
                  className="rounded-full border-slate-200 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto text-sm text-slate-600">
              {!selectedReasoningMessage ? (
                <Card className="border-dashed bg-slate-50 py-3 shadow-none">
                  <CardContent className="px-4 text-sm text-slate-500">
                    Click the Thinking button on a message to inspect reasoning
                    steps.
                  </CardContent>
                </Card>
              ) : !selectedHasAnyInspection ? (
                <Card className="bg-white py-3 shadow-none">
                  <CardContent className="px-4 text-sm text-slate-500">
                    No reasoning stream or agent updates captured for this message.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {selectedHasTimeline ? (
                    <div className="space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Updates (in order)
                      </div>
                      <div className="space-y-3">
                        {selectedThinkingTimeline.map((entry) => {
                          if (entry.kind === "agent_update") {
                            const kindLabel =
                              entry.updateKind === "switch"
                                ? "agent switch"
                                : entry.updateKind.replace(/_/g, " ");

                            return (
                              <Card
                                key={entry.id}
                                className="rounded-2xl border-slate-200/80 bg-white py-3 shadow-sm"
                              >
                                <CardContent className="px-4">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                    <span className="flex flex-wrap items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className="border-slate-200 bg-white text-slate-600"
                                      >
                                        {kindLabel}
                                      </Badge>
                                    </span>
                                    <span>{formatUpdatedAt(entry.createdAt)}</span>
                                  </div>

                                  <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-900/5 p-3 text-xs text-slate-700">
                                    {(entry.from ?? "").trim()
                                      ? `${entry.from} -> ${entry.to}`
                                      : entry.to}
                                  </pre>
                                </CardContent>
                              </Card>
                            );
                          }

                          return (
                            <Card
                              key={entry.id}
                              className="rounded-2xl border-slate-200/80 bg-white py-3 shadow-sm"
                            >
                              <CardContent className="px-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="border-slate-200 bg-white text-slate-600"
                                    >
                                      {entry.agentLabel}
                                    </Badge>
                                    <span>reasoning</span>
                                  </span>
                                  <span>{formatUpdatedAt(entry.createdAt)}</span>
                                </div>

                                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
                                  <li>
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        p: ({ children }) => <span>{children}</span>,
                                      }}
                                    >
                                      {entry.text}
                                    </ReactMarkdown>
                                  </li>
                                </ul>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {selectedShouldShowStructuredReasoning ? (
                    <div className="space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Reasoning summary
                      </div>
                      {Object.entries(selectedStructuredReasoningByAgent)
                        .filter(([, bullets]) => bullets.length > 0)
                        .sort(([a], [b]) => sortAgentLabels(a, b))
                        .map(([agentLabel, bullets]) => (
                          <Card
                            key={`structured-reasoning-${agentLabel}`}
                            className="rounded-2xl border-slate-200/80 bg-white py-3 shadow-sm"
                          >
                            <CardContent className="px-4">
                              <div className="flex items-center justify-between gap-2">
                                <Badge
                                  variant="outline"
                                  className="border-slate-200 bg-white text-slate-600"
                                >
                                  {agentLabel}
                                </Badge>
                              </div>
                              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
                                {bullets.map((bullet, bulletIndex) => (
                                  <li key={`structured-reasoning-${agentLabel}-${bulletIndex}`}>
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        p: ({ children }) => <span>{children}</span>,
                                      }}
                                    >
                                      {bullet}
                                    </ReactMarkdown>
                                  </li>
                                ))}
                              </ul>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
