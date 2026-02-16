"use client";

export type ChatRole = "user" | "assistant" | "system";

export type ReasoningSummary = {
  text: string;
};

export type ReasoningPayload = {
  id: string;
  summary: ReasoningSummary[];
};

export type ReasoningEntry = {
  id: string;
  createdAt: string;
  raw: string;
  data?: ReasoningPayload;
  agent?: string | null;
  scope?: "tool" | "main";
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  reasoning?: ReasoningEntry[];
};

export type ChatConversation = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  sessionId?: string | null;
};

export type AgentStreamMeta = {
  scope?: "tool" | "main";
  agent?: string | null;
};

export type StreamCallbacks = {
  onToken?: (token: string) => void;
  onMessage?: (message: ChatMessage) => void;
  onReasoning?: (entry: ReasoningEntry) => void;
  onReasoningToken?: (token: string, meta: AgentStreamMeta) => void;
  onEvent?: (event: AgentStreamEvent) => void;
  onSessionId?: (sessionId: string) => void;
  onDone?: () => void;
  signal?: AbortSignal;
};

export type AgentStreamEvent =
  | ({ type: "delta"; text: string } & AgentStreamMeta)
  | ({ type: "reasoning_delta"; text: string } & AgentStreamMeta)
  | ({ type: "message"; text: string } & AgentStreamMeta)
  | ({ type: "tool_called"; tool?: string | null } & AgentStreamMeta)
  | ({ type: "tool_output"; output?: unknown } & AgentStreamMeta)
  | ({ type: "reasoning"; reasoning: string } & AgentStreamMeta)
  | ({ type: "reasoning_done" } & AgentStreamMeta)
  | ({ type: "agent_updated"; agent?: string | null } & AgentStreamMeta)
  | ({ type: "handoff"; agent?: string | null } & AgentStreamMeta)
  | ({ type: "session_id"; session_id?: string | null } & AgentStreamMeta);

const CHAT_API_BASE_URL = (process.env.NEXT_PUBLIC_CHAT_API_URL ?? "").replace(
  /\/$/,
  ""
);

const HAS_CHAT_API = CHAT_API_BASE_URL.length > 0;
const SESSION_LIST_PATH = "/sessions";
const SESSION_HISTORY_PATH = (sessionId: string) =>
  `/sessions/${encodeURIComponent(sessionId)}/history`;
const SESSION_DELETE_PATH = (sessionId: string) =>
  `/sessions/${encodeURIComponent(sessionId)}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureAccessToken = (accessToken: string | null) => {
  if (!accessToken) {
    throw new Error("Missing access token for chat API request.");
  }
  return accessToken;
};

const safeJsonParse = (value: string): unknown | null => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
};

const toIsoString = (value: unknown) => {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (typeof value === "number") {
    const millis = value > 1e12 ? value : value * 1000;
    const parsed = new Date(millis);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
};

const buildChatApiUrl = (path: string) =>
  `${CHAT_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

const parseJsonResponse = async (response: Response) => {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  return safeJsonParse(text) ?? text;
};

const requestChatApi = async (
  path: string,
  accessToken: string,
  init?: RequestInit
) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...(init?.headers ?? {}),
  };

  const response = await fetch(buildChatApiUrl(path), {
    ...init,
    cache: init?.cache ?? "no-store",
    headers,
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Chat API request failed (${response.status}).`);
  }

  return response;
};

const normalizeReasoning = (value: unknown): ReasoningPayload | undefined => {
  if (!value || typeof value !== "object") return undefined;

  const maybe = value as { id?: unknown; summary?: unknown };
  if (typeof maybe.id !== "string") return undefined;

  if (!Array.isArray(maybe.summary)) {
    return { id: maybe.id, summary: [] };
  }

  const summary = maybe.summary
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const text = (item as { text?: unknown }).text;
      if (typeof text !== "string") return null;
      const trimmed = text.trim();
      if (!trimmed) return null;
      return { text: trimmed };
    })
    .filter((item): item is ReasoningSummary => Boolean(item));

  return { id: maybe.id, summary };
};

const extractArray = (value: unknown) => (Array.isArray(value) ? value : null);

const extractSessionsPayload = (payload: unknown) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const obj = payload as Record<string, unknown>;
  return (
    extractArray(obj.sessions) ??
    extractArray(obj.data) ??
    extractArray(obj.items) ??
    extractArray(obj.results) ??
    []
  );
};

const pickTimestamp = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return value;
      }
    }
  }

  return null;
};

const normalizeSession = (session: unknown): ChatConversation | null => {
  if (!session || typeof session !== "object") return null;

  const data = session as Record<string, unknown>;
  const metadata =
    data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>)
      : null;

  const id = pickString(data.id, data.session_id, data.sessionId);
  if (!id) return null;

  const title = pickString(data.title, metadata?.title) ?? "New chat";
  const preview =
    pickString(
      data.preview,
      data.last_message,
      data.lastMessage,
      data.last_message_preview,
      data.lastMessagePreview,
      metadata?.preview,
      metadata?.last_message,
      metadata?.lastMessage,
      metadata?.last_message_preview,
      metadata?.lastMessagePreview
    ) ?? "No messages yet.";

  const updatedAt = toIsoString(
    pickTimestamp(
      data.last_message_at,
      data.lastMessageAt,
      data.updated_at,
      data.updatedAt,
      data.created_at,
      data.createdAt
    )
  );

  return {
    id,
    sessionId: id,
    title,
    preview,
    updatedAt,
  };
};

const normalizeRole = (value: unknown): ChatRole | null => {
  if (typeof value !== "string") return null;

  const normalized = value.toLowerCase();
  if (normalized === "user" || normalized === "assistant" || normalized === "system") {
    return normalized as ChatRole;
  }

  if (normalized === "human") return "user";
  if (normalized === "ai" || normalized === "bot") return "assistant";

  return null;
};

const extractTextFromContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!content) return "";

  if (Array.isArray(content)) {
    return content
      .map((item) => extractTextFromContent(item))
      .filter((text) => text.trim())
      .join("\n\n");
  }

  if (typeof content === "object") {
    const data = content as Record<string, unknown>;
    if (typeof data.text === "string") return data.text;
    if (typeof data.value === "string") return data.value;
    if (typeof data.message === "string") return data.message;
    if (typeof data.content === "string") return data.content;

    if (data.text && typeof data.text === "object") {
      const nested = data.text as Record<string, unknown>;
      if (typeof nested.value === "string") return nested.value;
      if (typeof nested.text === "string") return nested.text;
    }

    if (data.content) {
      return extractTextFromContent(data.content);
    }
  }

  return "";
};

const createReasoningEntry = (
  raw: string,
  meta?: AgentStreamMeta
): ReasoningEntry => {
  const parsed = safeJsonParse(raw);
  const data = parsed ? normalizeReasoning(parsed) : undefined;

  return {
    id: `reasoning-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    raw,
    data,
    agent: meta?.agent ?? null,
    scope: meta?.scope ?? "main",
  };
};

const normalizeHistoryItems = (items: unknown[]): ChatMessage[] => {
  const messages: ChatMessage[] = [];
  const pendingReasoning: ReasoningEntry[] = [];
  const baseTimestamp = Date.now() - Math.max(items.length, 1) * 1000;

  const attachToLatestAssistant = (entry: ReasoningEntry) => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "assistant") {
        messages[index].reasoning = [...(messages[index].reasoning ?? []), entry];
        return true;
      }
    }
    return false;
  };

  items.forEach((item, index) => {
    if (!item || typeof item !== "object") return;

    const data = item as Record<string, unknown>;
    const type = data.type;

    if (type === "reasoning") {
      const raw =
        typeof data.reasoning === "string"
          ? data.reasoning
          : data.reasoning != null
            ? JSON.stringify(data.reasoning)
            : "";

      if (!raw) return;

      const entry = createReasoningEntry(raw);
      if (!attachToLatestAssistant(entry)) {
        pendingReasoning.push(entry);
      }
      return;
    }

    if (type !== "message") {
      return;
    }

    const role = normalizeRole(data.role ?? data.sender ?? data.message_role);
    if (!role) return;

    const content = extractTextFromContent(
      data.content ?? data.text ?? data.message ?? data.body
    );
    if (!content.trim()) return;

    const createdAt = toIsoString(
      data.created_at ?? data.createdAt ?? baseTimestamp + index * 1000
    );

    const message: ChatMessage = {
      id:
        pickString(data.id, data.message_id, data.uuid) ??
        `msg-${createdAt}-${index}`,
      role,
      content: content.trim(),
      createdAt,
    };

    if (role === "assistant" && pendingReasoning.length > 0) {
      message.reasoning = [...pendingReasoning.splice(0)];
    }

    messages.push(message);
  });

  return messages;
};

const asAgentStreamEvent = (value: unknown): AgentStreamEvent | null => {
  if (!value || typeof value !== "object") return null;

  const type = (value as { type?: unknown }).type;
  if (typeof type !== "string") return null;

  switch (type) {
    case "delta":
    case "reasoning_delta":
    case "message":
    case "tool_called":
    case "tool_output":
    case "reasoning":
    case "reasoning_done":
    case "agent_updated":
    case "handoff":
    case "session_id":
      return value as AgentStreamEvent;
    default:
      return null;
  }
};

const createLocalMessage = (role: ChatRole, content: string): ChatMessage => ({
  id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content,
  createdAt: new Date().toISOString(),
});

const findSseBoundary = (buffer: string) => {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");

  if (lf === -1) {
    return crlf === -1 ? null : { index: crlf, length: 4 };
  }

  if (crlf === -1) {
    return { index: lf, length: 2 };
  }

  return crlf < lf ? { index: crlf, length: 4 } : { index: lf, length: 2 };
};

const parseSseChunk = (
  chunk: string,
  onEvent: (eventName: string, data: string) => void,
  bufferState: { value: string }
) => {
  bufferState.value += chunk;

  while (true) {
    const boundary = findSseBoundary(bufferState.value);
    if (!boundary) break;

    const rawEvent = bufferState.value.slice(0, boundary.index);
    bufferState.value = bufferState.value.slice(boundary.index + boundary.length);

    if (!rawEvent.trim()) continue;

    const lines = rawEvent.split(/\r?\n/);
    let eventName = "message";
    let sawSseDirective = false;
    let hasData = false;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("id:") || line.startsWith("retry:")) {
        // Ignore metadata.
        sawSseDirective = true;
        continue;
      }

      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
        sawSseDirective = true;
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
        hasData = true;
        sawSseDirective = true;
        continue;
      }

      if (line.startsWith(":")) {
        // SSE comment lines (used for keep-alives / preambles).
        sawSseDirective = true;
        continue;
      }
    }

    // If this looks like an SSE frame (event/data/comment/id/retry), ignore frames with no data.
    // This prevents keepalive/comment-only frames from being misinterpreted as chat content.
    if (sawSseDirective && !hasData) {
      continue;
    }

    const data = hasData ? dataLines.join("\n") : rawEvent.trim();
    if (!data) continue;

    onEvent(eventName, data);
  }
};

const mockStreamAssistantResponse = async (
  prompt: string,
  { onToken, onMessage, onDone, signal }: StreamCallbacks
) => {
  const response =
    "Mock mode is active. Configure NEXT_PUBLIC_CHAT_API_URL to connect live sessions.";
  const tokens = response.split(" ");

  for (const token of tokens) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    onToken?.(`${token} `);
    await sleep(35);
  }

  if (prompt.trim()) {
    onMessage?.(createLocalMessage("assistant", response));
  }

  onDone?.();
};

export const isChatApiConfigured = () => HAS_CHAT_API;

export const listSessions = async (
  accessToken: string | null
): Promise<ChatConversation[]> => {
  if (!HAS_CHAT_API) {
    return [];
  }

  const token = ensureAccessToken(accessToken);
  const response = await requestChatApi(SESSION_LIST_PATH, token);
  const payload = await parseJsonResponse(response);

  const conversations = extractSessionsPayload(payload)
    .map((session) => normalizeSession(session))
    .filter((session): session is ChatConversation => Boolean(session));

  return conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const listConversations = listSessions;

export const listMessages = async (
  sessionId: string,
  accessToken: string | null
): Promise<ChatMessage[]> => {
  if (!HAS_CHAT_API) {
    return [];
  }

  const token = ensureAccessToken(accessToken);
  const items: unknown[] = [];
  const seenAfter = new Set<string>();
  let after: string | null = null;

  while (true) {
    const path = after
      ? `${SESSION_HISTORY_PATH(sessionId)}?${new URLSearchParams({
          after,
        }).toString()}`
      : SESSION_HISTORY_PATH(sessionId);

    const response = await requestChatApi(path, token);

    const payload = await parseJsonResponse(response);
    const data =
      payload && typeof payload === "object"
        ? extractArray((payload as Record<string, unknown>).data) ?? []
        : [];

    items.push(...data);

    const nextAfterRaw =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).next_after
        : null;

    const nextAfter =
      typeof nextAfterRaw === "string" && nextAfterRaw.trim()
        ? nextAfterRaw
        : typeof nextAfterRaw === "number"
          ? String(nextAfterRaw)
          : null;

    if (!nextAfter || seenAfter.has(nextAfter)) {
      break;
    }

    seenAfter.add(nextAfter);
    after = nextAfter;
  }

  return normalizeHistoryItems(items);
};

export const deleteConversation = async (
  conversationId: string,
  accessToken: string | null
): Promise<void> => {
  if (!HAS_CHAT_API) {
    return;
  }

  const token = ensureAccessToken(accessToken);
  await requestChatApi(SESSION_DELETE_PATH(conversationId), token, {
    method: "DELETE",
  });
};

export const streamAssistantResponse = async (
  content: string,
  accessToken: string | null,
  callbacks: StreamCallbacks,
  sessionId?: string | null
) => {
  if (!HAS_CHAT_API) {
    await mockStreamAssistantResponse(content, callbacks);
    return;
  }

  const token = ensureAccessToken(accessToken);
  const body = JSON.stringify(
    sessionId ? { query: content, session_id: sessionId } : { query: content }
  );

  const response = await fetch(`${CHAT_API_BASE_URL}/run-agent`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body,
    signal: callbacks.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(text || "Unable to open SSE stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const bufferState = { value: "" };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    parseSseChunk(
      chunk,
      (eventName, data) => {
        if (data === "[DONE]") {
          callbacks.onDone?.();
          return;
        }

        const parsed = safeJsonParse(data);
        const agentEvent = asAgentStreamEvent(parsed);

        if (agentEvent) {
          callbacks.onEvent?.(agentEvent);

          const isToolEvent = agentEvent.scope === "tool";

          if (agentEvent.type === "delta") {
            if (!isToolEvent) {
              callbacks.onToken?.(agentEvent.text);
            }
            return;
          }

          if (agentEvent.type === "reasoning_delta") {
            callbacks.onReasoningToken?.(agentEvent.text, agentEvent);
            return;
          }

          if (agentEvent.type === "message") {
            if (!isToolEvent) {
              callbacks.onMessage?.(
                createLocalMessage("assistant", agentEvent.text)
              );
            }
            return;
          }

          if (agentEvent.type === "reasoning") {
            callbacks.onReasoning?.(createReasoningEntry(agentEvent.reasoning, agentEvent));
            return;
          }

          if (agentEvent.type === "session_id" && agentEvent.session_id) {
            callbacks.onSessionId?.(agentEvent.session_id);
            return;
          }

          return;
        }

        if (parsed && typeof parsed === "object") {
          const tokenChunk = (parsed as { token?: unknown }).token;
          const message = (parsed as { message?: unknown }).message;

          if (typeof tokenChunk === "string" && tokenChunk) {
            callbacks.onToken?.(tokenChunk);
            return;
          }

          if (
            message &&
            typeof message === "object" &&
            typeof (message as { role?: unknown }).role === "string" &&
            typeof (message as { content?: unknown }).content === "string"
          ) {
            callbacks.onMessage?.(message as ChatMessage);
            return;
          }
        }

        if (eventName === "token") {
          callbacks.onToken?.(data);
          return;
        }

        if (eventName === "message") {
          callbacks.onMessage?.(createLocalMessage("assistant", data));
        }
      },
      bufferState
    );
  }

  callbacks.onDone?.();
};
