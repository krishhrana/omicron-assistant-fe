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
import { Separator } from "@/components/ui/separator";

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
  const [newChatDraft, setNewChatDraft] = useState("");
  const [showHeaderSeparator, setShowHeaderSeparator] = useState(false);
  const [composerInsetBottom, setComposerInsetBottom] = useState(168);
  const [thinkingTimelineByMessageId, setThinkingTimelineByMessageId] = useState<
    Record<string, ThinkingTimelineEntry[]>
  >({});

  const streamControllerRef = useRef<AbortController | null>(null);
  const hasAutoStartedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const composerContainerRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const previousMessageCountRef = useRef(0);
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

  useEffect(() => {
    const composerContainer = composerContainerRef.current;
    if (!composerContainer) return;

    const updateInset = () => {
      const nextInset =
        Math.ceil(composerContainer.getBoundingClientRect().height) + 20;
      setComposerInsetBottom((previous) =>
        Math.abs(previous - nextInset) < 1 ? previous : nextInset
      );
    };

    updateInset();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updateInset();
    });

    observer.observe(composerContainer);

    return () => {
      observer.disconnect();
    };
  }, []);

  const lastMessageContentLength = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.content.length ?? 0;
  }, [messages]);

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

    const messageCountIncreased = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    if (!messageCountIncreased) {
      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceToBottom > 120) return;
    }

    isProgrammaticScrollRef.current = true;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: messageCountIncreased ? "smooth" : "auto",
    });

    const timeoutId = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, messageCountIncreased ? 350 : 120);

    return () => {
      window.clearTimeout(timeoutId);
      isProgrammaticScrollRef.current = false;
    };
  }, [messages.length, lastMessageContentLength, composerInsetBottom]);

  useEffect(() => {
    setShowHeaderSeparator(false);
  }, [conversationId]);

  const handleThreadScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    setShowHeaderSeparator(container.scrollTop > 1);
  }, []);

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
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
        <Card className="gap-0 border-0 bg-transparent py-0 shadow-none">
          <CardContent className="inline-flex items-center gap-3 rounded-full border border-[#d8d8d8] bg-white/72 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6e6e6e]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#0b5cb6]" />
            Loading conversation
          </CardContent>
        </Card>
        <p className="mt-3 text-xs text-[#8e8e8e]">
          Syncing messages and context...
        </p>
      </div>
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
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
        <div className="w-full max-w-[44rem] space-y-3">
          {sendError ? (
            <Alert variant="destructive">
              <AlertDescription>{sendError}</AlertDescription>
            </Alert>
          ) : null}

          {!isChatApiConfigured() ? (
            <Alert className="omicron-notice">
              <AlertDescription>
                Chat backend is not configured yet. Showing sample responses.
              </AlertDescription>
            </Alert>
          ) : null}

          <ChatComposer
            value={newChatDraft}
            onChange={setNewChatDraft}
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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="-mr-6 -mt-6 space-y-4 pr-6 pt-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[2rem] leading-tight font-semibold text-[#1d1d1f] font-[var(--font-display)]">
              {conversation?.title ?? "Conversation"}
            </h2>
          </div>
          {!isChatApiConfigured() ? (
            <Badge
              variant="outline"
              className="border-[#d2d2d2] bg-[#f5f5f2] text-[#6e6e6e]"
            >
              Sample mode
            </Badge>
          ) : null}
        </header>
        <Separator
          className={cn(
            "transition-opacity duration-200",
            showHeaderSeparator ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      <div className="-mb-3 -mr-6 min-h-0 flex-1 pr-6 pt-4">
        <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
          <div className="relative min-h-0 min-w-0 flex-1">
            <div
              ref={scrollContainerRef}
              onScroll={handleThreadScroll}
              className="h-full overflow-y-auto"
            >
              <div
                className="mx-auto w-full max-w-[44rem] space-y-6 pt-2"
                style={{ paddingBottom: `${composerInsetBottom}px` }}
              >
                {sendError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{sendError}</AlertDescription>
                  </Alert>
                ) : null}

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
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-[#f6f6f3]">
              <div
                ref={composerContainerRef}
                className="pointer-events-auto mx-auto w-full max-w-[44rem] pb-3"
              >
                <ChatComposer
                  onSend={startStreaming}
                  isSending={isStreaming}
                  isDisabled={isLoading}
                  panelClassName="bg-[#f6f6f3] backdrop-blur-none"
                />
              </div>
            </div>
          </div>

          <aside
            className={cn(
              "w-full overflow-hidden transition duration-300 lg:h-full lg:min-h-0 lg:w-[24rem]",
              isReasoningOpen ? "block" : "hidden"
            )}
          >
            <Card className="flex h-full min-h-0 flex-col gap-4 rounded-3xl border-0 bg-transparent py-0 shadow-none">
              <CardHeader className="gap-3 pb-0">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8e8e8e]">
                  Reasoning
                </p>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-lg text-[#1d1d1f]">Model thinking</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setIsReasoningOpen(false)}
                    className="rounded-full border-[#d2d2d2] bg-white text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7a7a7a] hover:border-[#c8dcff] hover:text-[#0b5cb6]"
                  >
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto px-0 text-sm text-[#6e6e6e]">
                {!selectedReasoningMessage ? (
                  <Card className="bg-white/55 py-3 shadow-none">
                    <CardContent className="px-4 text-sm text-[#7a7a7a]">
                      Click the Thinking button on a message to inspect reasoning
                      steps.
                    </CardContent>
                  </Card>
                ) : !selectedHasAnyInspection ? (
                  <Card className="bg-white/55 py-3 shadow-none">
                    <CardContent className="px-4 text-sm text-[#7a7a7a]">
                      No reasoning stream or agent updates captured for this message.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {selectedHasTimeline ? (
                      <div className="space-y-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e8e8e]">
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
                                  className="rounded-2xl border-0 bg-white/72 py-3 shadow-none"
                                >
                                  <CardContent className="px-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e8e8e]">
                                      <span className="flex flex-wrap items-center gap-2">
                                        <Badge
                                          variant="outline"
                                          className="border-[#d2d2d2] bg-white text-[#6e6e6e]"
                                        >
                                          {kindLabel}
                                        </Badge>
                                      </span>
                                      <span>{formatUpdatedAt(entry.createdAt)}</span>
                                    </div>

                                    <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-[#f5f8fc]/85 p-3 text-xs text-[#3a3a3a]">
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
                                className="rounded-2xl border-0 bg-white/72 py-3 shadow-none"
                              >
                                <CardContent className="px-4">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e8e8e]">
                                    <span className="flex flex-wrap items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className="border-[#d2d2d2] bg-white text-[#6e6e6e]"
                                      >
                                        {entry.agentLabel}
                                      </Badge>
                                      <span>reasoning</span>
                                    </span>
                                    <span>{formatUpdatedAt(entry.createdAt)}</span>
                                  </div>

                                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[#6e6e6e]">
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
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e8e8e]">
                          Reasoning summary
                        </div>
                        {Object.entries(selectedStructuredReasoningByAgent)
                          .filter(([, bullets]) => bullets.length > 0)
                          .sort(([a], [b]) => sortAgentLabels(a, b))
                          .map(([agentLabel, bullets]) => (
                            <Card
                              key={`structured-reasoning-${agentLabel}`}
                              className="rounded-2xl border-0 bg-white/72 py-3 shadow-none"
                            >
                              <CardContent className="px-4">
                                <div className="flex items-center justify-between gap-2">
                                  <Badge
                                    variant="outline"
                                    className="border-[#d2d2d2] bg-white text-[#6e6e6e]"
                                  >
                                    {agentLabel}
                                  </Badge>
                                </div>
                                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[#6e6e6e]">
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
    </div>
  );
}
