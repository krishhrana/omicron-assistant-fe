"use client";

export type OAuthStatus = "pending" | "connected" | "error" | "expired";

export type OAuthStartResponse = {
  url: string | null;
  transactionId: string | null;
  expiresAt: string | null;
  provider: string | null;
};

export type OAuthStatusResponse = {
  status: OAuthStatus;
  connected: boolean;
  detail: string | null;
  provider: string | null;
  transactionId: string | null;
  updatedAt: string | null;
};

export type PendingOAuthTransaction = {
  transactionId: string;
  statusPath: string;
  pendingKey: string;
  provider: string | null;
  expiresAt: string | null;
  createdAt: string;
};

const PENDING_OAUTH_STORAGE_PREFIX = "omicron.oauth.pending.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const pickString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const normalizeStatus = (value: unknown): OAuthStatus | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "connected" ||
    normalized === "error" ||
    normalized === "expired"
  ) {
    return normalized;
  }
  return null;
};

export const parseOAuthStartResponse = (payload: unknown): OAuthStartResponse => {
  if (!isRecord(payload)) {
    return {
      url: null,
      transactionId: null,
      expiresAt: null,
      provider: null,
    };
  }

  return {
    url: pickString(
      payload.authorization_url,
      payload.authorizationUrl,
      payload.authUrl,
      payload.redirectUrl,
      payload.url,
      payload.location
    ),
    transactionId: pickString(payload.transaction_id, payload.transactionId),
    expiresAt: pickString(payload.expires_at, payload.expiresAt),
    provider: pickString(payload.provider),
  };
};

export const parseOAuthStatusResponse = (
  payload: unknown
): OAuthStatusResponse | null => {
  if (!isRecord(payload)) return null;

  const status = normalizeStatus(payload.status);
  if (!status) return null;

  return {
    status,
    connected: Boolean(payload.connected) || status === "connected",
    detail: pickString(payload.detail, payload.error, payload.message),
    provider: pickString(payload.provider),
    transactionId: pickString(payload.transaction_id, payload.transactionId),
    updatedAt: pickString(payload.updated_at, payload.updatedAt),
  };
};

export const isOAuthTerminalStatus = (status: OAuthStatus) =>
  status === "connected" || status === "error" || status === "expired";

export const buildOAuthStatusPath = (startPath: string, transactionId: string) => {
  const trimmed = startPath.trim();
  const base = trimmed.endsWith("/start")
    ? trimmed.slice(0, trimmed.length - "/start".length)
    : trimmed;
  return `${base}/status/${encodeURIComponent(transactionId)}`;
};

const pendingOAuthStorageKey = (pendingKey: string) =>
  `${PENDING_OAUTH_STORAGE_PREFIX}${pendingKey}`;

export const writePendingOAuthTransaction = (transaction: PendingOAuthTransaction) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    pendingOAuthStorageKey(transaction.pendingKey),
    JSON.stringify(transaction)
  );
};

export const readPendingOAuthTransaction = (
  pendingKey: string
): PendingOAuthTransaction | null => {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(pendingOAuthStorageKey(pendingKey));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingOAuthTransaction>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.pendingKey !== "string" ||
      typeof parsed.transactionId !== "string" ||
      typeof parsed.statusPath !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }

    return {
      pendingKey: parsed.pendingKey,
      transactionId: parsed.transactionId,
      statusPath: parsed.statusPath,
      provider: parsed.provider ?? null,
      expiresAt: parsed.expiresAt ?? null,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
};

export const clearPendingOAuthTransaction = (pendingKey: string) => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(pendingOAuthStorageKey(pendingKey));
};

const resolveTimestampMs = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isPendingOAuthTransactionExpired = (
  transaction: PendingOAuthTransaction,
  nowMs: number = Date.now()
) => {
  const expiresAtMs = resolveTimestampMs(transaction.expiresAt);
  if (expiresAtMs === null) return false;
  return nowMs >= expiresAtMs;
};

const delay = async (durationMs: number, signal?: AbortSignal) => {
  await new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);

    signal?.addEventListener("abort", onAbort);
  });
};

type PollOAuthStatusOptions = {
  readStatus: () => Promise<OAuthStatusResponse | null>;
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
};

export const pollOAuthStatusUntilTerminal = async ({
  readStatus,
  signal,
  intervalMs = 1200,
  timeoutMs = 120000,
}: PollOAuthStatusOptions): Promise<OAuthStatusResponse | null> => {
  const startedAt = Date.now();
  let latestStatus: OAuthStatusResponse | null = null;

  while (!signal?.aborted) {
    latestStatus = await readStatus();
    if (latestStatus && isOAuthTerminalStatus(latestStatus.status)) {
      return latestStatus;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      return latestStatus;
    }

    await delay(intervalMs, signal);
  }

  return latestStatus;
};
