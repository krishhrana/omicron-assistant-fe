"use client";

import Image from "next/image";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppRow, type AppRowModel } from "@/components/apps/AppRow";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/AuthenticatedApp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildOAuthStatusPath,
  clearPendingOAuthTransaction,
  isPendingOAuthTransactionExpired,
  parseOAuthStartResponse,
  parseOAuthStatusResponse,
  pollOAuthStatusUntilTerminal,
  readPendingOAuthTransaction,
  writePendingOAuthTransaction,
} from "@/lib/api/oauth";

const APPS_API_BASE_URL = (process.env.NEXT_PUBLIC_CHAT_API_URL ?? "").replace(
  /\/$/,
  ""
);
const DEFAULT_SUPPORTED_APP_LOGO = "/apps/default-app.svg";
const SUPPORTED_APP_LOGOS: Record<string, string> = {
  gmail: "/apps/gmail.png",
  drive: "/apps/google-drive.png",
  "google-drive": "/apps/google-drive.png",
  google_drive: "/apps/google-drive.png",
  browser: "/apps/browser.svg",
  whatsapp: "/apps/whatsapp.svg",
};

type OAuthConnectConfig = {
  kind: "oauth";
  startPath: string;
  pendingKey: string;
};

type WhatsAppConnectConfig = {
  kind: "whatsapp";
  startPath: string;
  statusPath: string;
};

type ConnectConfig = OAuthConnectConfig | WhatsAppConnectConfig;

const CONNECTABLE_APPS: Record<string, ConnectConfig> = {
  gmail: {
    kind: "oauth",
    startPath: "/oauth/gmail/start",
    pendingKey: "omicron.pendingGmailConnect",
  },
  drive: {
    kind: "oauth",
    startPath: "/oauth/google-drive/start",
    pendingKey: "omicron.pendingGoogleDriveConnect",
  },
  "google-drive": {
    kind: "oauth",
    startPath: "/oauth/google-drive/start",
    pendingKey: "omicron.pendingGoogleDriveConnect",
  },
  google_drive: {
    kind: "oauth",
    startPath: "/oauth/google-drive/start",
    pendingKey: "omicron.pendingGoogleDriveConnect",
  },
  whatsapp: {
    kind: "whatsapp",
    startPath: "/whatsapp/connect/start",
    statusPath: "/whatsapp/connect/status",
  },
};

const OAUTH_PENDING_KEYS = Array.from(
  new Set(
    Object.values(CONNECTABLE_APPS)
      .filter((config): config is OAuthConnectConfig => config.kind === "oauth")
      .map((config) => config.pendingKey)
  )
);

const DISCONNECTABLE_APPS: Record<string, string> = {
  gmail: "/oauth/gmail/disconnect",
  drive: "/oauth/google-drive/disconnect",
  "google-drive": "/oauth/google-drive/disconnect",
  google_drive: "/oauth/google-drive/disconnect",
  whatsapp: "/whatsapp/connect/disconnect",
};

const APP_LONG_DESCRIPTIONS: Record<string, string> = {
  gmail:
    "Connect Gmail to summarize threads, draft replies, and surface follow-ups that need attention.",
  drive:
    "Connect Google Drive to quickly find files, summarize documents, and draft content with your existing context.",
  browser:
    "Use the browser agent to automate website workflows and run actions against sites you configure.",
  whatsapp:
    "Connect your personal WhatsApp account and scan a QR code to sync chats for retrieval and messaging.",
};

type PlatformApp = AppRowModel & {
  id: string;
  longDescription: string;
  requiresUserConnection: boolean;
  runtimeAvailable: boolean;
};

type BrowserCredentialDraft = {
  id: string;
  websiteUrl: string;
  username: string;
  password: string;
};

type BrowserCredentialDraftErrors = {
  websiteUrl?: string;
  username?: string;
  password?: string;
};

type SavedBrowserCredential = {
  siteKey: string;
  siteName: string;
  loginUrl: string | null;
  usernameMasked: string;
  createdAt: string | null;
};

type WhatsAppConnectStatus = {
  runtimeId: string | null;
  status: string;
  connected: boolean;
  reauthRequired: boolean;
  disconnectReason: string | null;
  message: string | null;
  qrCode: string | null;
  qrImageDataUrl: string | null;
  syncProgress: number | null;
  syncCurrent: number | null;
  syncTotal: number | null;
  updatedAt: string | null;
  pollAfterSeconds: number;
};

const normalizeAppId = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "google_drive" || normalized === "google-drive") {
    return "drive";
  }
  return normalized;
};

const resolveSupportedLogo = (id: string, name: string) => {
  const normalizedId = normalizeAppId(id);
  if (SUPPORTED_APP_LOGOS[normalizedId]) {
    return SUPPORTED_APP_LOGOS[normalizedId];
  }

  const normalizedName = normalizeAppId(name.replace(/\s+/g, "-"));
  if (SUPPORTED_APP_LOGOS[normalizedName]) {
    return SUPPORTED_APP_LOGOS[normalizedName];
  }

  return DEFAULT_SUPPORTED_APP_LOGO;
};

const buildAppsApiUrl = (path: string) => {
  if (!APPS_API_BASE_URL) {
    throw new Error(
      "Missing NEXT_PUBLIC_CHAT_API_URL. Configure it to load app integrations."
    );
  }
  return `${APPS_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
};

const extractErrorMessage = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return `Request failed (${response.status}).`;
  }

  try {
    const parsed = JSON.parse(text) as {
      detail?: unknown;
      message?: unknown;
      error?: unknown;
    };
    return (
      (typeof parsed.detail === "string" && parsed.detail.trim()) ||
      (typeof parsed.message === "string" && parsed.message.trim()) ||
      (typeof parsed.error === "string" && parsed.error.trim()) ||
      text
    );
  } catch {
    return text;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseSupportedApps = (payload: unknown): PlatformApp[] => {
  if (!isRecord(payload)) return [];
  const rawApps = Array.isArray(payload.apps) ? payload.apps : [];
  const appsBySlug = new Map<string, PlatformApp>();

  for (const rawApp of rawApps) {
    if (!isRecord(rawApp)) continue;

    const rawId = typeof rawApp.id === "string" ? rawApp.id : "";
    const rawName =
      typeof rawApp.display_name === "string" ? rawApp.display_name.trim() : "";
    if (!rawId || !rawName) continue;

    const slug = normalizeAppId(rawId);
    if (!slug) continue;

    const description =
      typeof rawApp.description === "string" && rawApp.description.trim()
        ? rawApp.description.trim()
        : `Use ${rawName} with Omicron.`;

    appsBySlug.set(slug, {
      id: rawId,
      slug,
      name: rawName,
      description,
      longDescription: APP_LONG_DESCRIPTIONS[slug] ?? description,
      logo: resolveSupportedLogo(slug, rawName),
      logoBg: "#FFFFFF",
      requiresUserConnection: Boolean(rawApp.requires_user_connection),
      runtimeAvailable: Boolean(rawApp.runtime_available),
    });
  }

  return Array.from(appsBySlug.values());
};

const parseSavedBrowserCredential = (
  rawCredential: unknown
): SavedBrowserCredential | null => {
  if (!isRecord(rawCredential)) return null;

  const siteKey =
    typeof rawCredential.site_key === "string" ? rawCredential.site_key : "";
  const siteName =
    typeof rawCredential.site_name === "string" ? rawCredential.site_name : "";
  if (!siteKey || !siteName) return null;

  return {
    siteKey,
    siteName,
    loginUrl:
      typeof rawCredential.login_url === "string"
        ? rawCredential.login_url
        : null,
    usernameMasked:
      typeof rawCredential.username_masked === "string"
        ? rawCredential.username_masked
        : "",
    createdAt:
      typeof rawCredential.created_at === "string"
        ? rawCredential.created_at
        : null,
  };
};

const parseWhatsAppConnectStatus = (
  payload: unknown
): WhatsAppConnectStatus | null => {
  if (!isRecord(payload)) return null;

  const rawStatus = payload.status;
  if (typeof rawStatus !== "string" || !rawStatus.trim()) return null;

  const pollAfterSeconds =
    typeof payload.poll_after_seconds === "number" &&
    Number.isFinite(payload.poll_after_seconds) &&
    payload.poll_after_seconds > 0
      ? Math.trunc(payload.poll_after_seconds)
      : 2;

  return {
    runtimeId:
      typeof payload.runtime_id === "string" && payload.runtime_id.trim()
        ? payload.runtime_id
        : null,
    status: rawStatus.trim().toLowerCase(),
    connected: Boolean(payload.connected),
    reauthRequired: Boolean(payload.reauth_required),
    disconnectReason:
      typeof payload.disconnect_reason === "string" &&
      payload.disconnect_reason.trim()
        ? payload.disconnect_reason.trim().toLowerCase()
        : null,
    message:
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message
        : null,
    qrCode:
      typeof payload.qr_code === "string" && payload.qr_code.trim()
        ? payload.qr_code
        : null,
    qrImageDataUrl:
      typeof payload.qr_image_data_url === "string" &&
      payload.qr_image_data_url.trim()
        ? payload.qr_image_data_url
        : null,
    syncProgress:
      typeof payload.sync_progress === "number" &&
      Number.isFinite(payload.sync_progress)
        ? Math.max(0, Math.min(100, Math.trunc(payload.sync_progress)))
        : null,
    syncCurrent:
      typeof payload.sync_current === "number" &&
      Number.isFinite(payload.sync_current)
        ? Math.max(0, Math.trunc(payload.sync_current))
        : null,
    syncTotal:
      typeof payload.sync_total === "number" &&
      Number.isFinite(payload.sync_total)
        ? Math.max(0, Math.trunc(payload.sync_total))
        : null,
    updatedAt:
      typeof payload.updated_at === "string" && payload.updated_at.trim()
        ? payload.updated_at
        : null,
    pollAfterSeconds,
  };
};

const parseSavedBrowserCredentialsFromState = (
  payload: unknown
): SavedBrowserCredential[] => {
  if (!isRecord(payload) || !Array.isArray(payload.website_credentials)) {
    return [];
  }

  const parsed: SavedBrowserCredential[] = [];
  for (const credential of payload.website_credentials) {
    const resolved = parseSavedBrowserCredential(credential);
    if (!resolved) continue;
    parsed.push(resolved);
  }
  return parsed;
};

const parseConnectedAppSlugs = (
  payload: unknown,
  browserCredentials: SavedBrowserCredential[]
): Set<string> => {
  const connected = new Set<string>();
  if (!isRecord(payload)) return connected;

  const connections = isRecord(payload.connections) ? payload.connections : null;
  if (connections) {
    const connectedAppIds = Array.isArray(connections.connected_app_ids)
      ? connections.connected_app_ids
      : [];

    for (const rawId of connectedAppIds) {
      if (typeof rawId !== "string") continue;
      const normalized = normalizeAppId(rawId);
      if (normalized) connected.add(normalized);
    }

    if (connected.size === 0) {
      if (Boolean(connections.gmail)) connected.add("gmail");
      if (Boolean(connections.google_drive)) connected.add("drive");
      if (Boolean(connections.whatsapp)) connected.add("whatsapp");
    }
  }

  if (browserCredentials.length > 0) {
    connected.add("browser");
  }

  return connected;
};

const createEmptyBrowserCredentialDraft = (): BrowserCredentialDraft => ({
  id: `browser-site-${Math.random().toString(36).slice(2, 10)}`,
  websiteUrl: "",
  username: "",
  password: "",
});

const WHATSAPP_ACTIVE_CONNECT_STATES = new Set([
  "connecting",
  "awaiting_qr",
  "logging_in",
  "syncing",
]);
const WHATSAPP_CONNECTABLE_STATES = new Set(["disconnected", "logged_out", "error"]);

const resolveBrowserSiteName = (websiteUrl: string): string => {
  const trimmed = websiteUrl.trim();
  if (!trimmed) return "website";

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.replace(/^www\./i, "");
    return hostname || trimmed;
  } catch {
    return trimmed;
  }
};

const resolveConnectedAppStorageKey = (provider: string | null): string | null => {
  if (!provider) return null;
  const normalized = provider.trim().toLowerCase();
  if (normalized === "gmail") return "omicron.gmail.connected";
  if (
    normalized === "google-drive" ||
    normalized === "drive" ||
    normalized === "google_drive"
  ) {
    return "omicron.google-drive.connected";
  }
  return null;
};

export default function AppsPage() {
  const { session, isLoading: isAuthLoading } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [activeTab, setActiveTab] = useState("your-apps");
  const [supportedApps, setSupportedApps] = useState<PlatformApp[]>([]);
  const [connectedAppSlugs, setConnectedAppSlugs] = useState<string[]>([]);
  const [savedBrowserCredentials, setSavedBrowserCredentials] = useState<
    SavedBrowserCredential[]
  >([]);
  const [isAppsLoading, setIsAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState<string | null>(null);

  const [selectedApp, setSelectedApp] = useState<PlatformApp | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppConnectStatus | null>(
    null
  );
  const [isWhatsAppStatusLoading, setIsWhatsAppStatusLoading] = useState(false);
  const [isWhatsAppStatusPolling, setIsWhatsAppStatusPolling] = useState(false);
  const whatsAppStatusRequestSeqRef = useRef(0);
  const oauthPollingKeysRef = useRef<Set<string>>(new Set());
  const [whatsAppCountdownNowMs, setWhatsAppCountdownNowMs] = useState(() =>
    Date.now()
  );

  const [browserCredentialDrafts, setBrowserCredentialDrafts] = useState<
    BrowserCredentialDraft[]
  >([createEmptyBrowserCredentialDraft()]);
  const [browserCredentialDraftErrors, setBrowserCredentialDraftErrors] =
    useState<BrowserCredentialDraftErrors[]>([]);
  const [browserCredentialFormError, setBrowserCredentialFormError] = useState<
    string | null
  >(null);
  const [browserCredentialNotice, setBrowserCredentialNotice] = useState<
    string | null
  >(null);
  const [isSavingBrowserCredentials, setIsSavingBrowserCredentials] =
    useState(false);

  const isDialogOpen = Boolean(selectedApp);
  const selectedAppSlug = selectedApp ? normalizeAppId(selectedApp.slug) : null;
  const selectedAppIsBrowser = selectedAppSlug === "browser";
  const selectedAppIsWhatsApp = selectedAppSlug === "whatsapp";
  const connectConfig = selectedAppSlug
    ? CONNECTABLE_APPS[selectedAppSlug]
    : undefined;
  const disconnectPath = selectedAppSlug
    ? DISCONNECTABLE_APPS[selectedAppSlug]
    : undefined;
  const isConnectable = Boolean(
    selectedApp?.requiresUserConnection && selectedApp?.runtimeAvailable && connectConfig
  );
  const isContentLoading = isAuthLoading || isAppsLoading;

  const connectedLookup = useMemo(
    () => new Set(connectedAppSlugs.map((slug) => normalizeAppId(slug))),
    [connectedAppSlugs]
  );
  const selectedAppConnected = Boolean(
    selectedAppSlug && connectedLookup.has(selectedAppSlug)
  ) || Boolean(selectedAppIsWhatsApp && whatsAppStatus?.connected);
  const canDisconnect = Boolean(
    selectedApp &&
      selectedApp.requiresUserConnection &&
      selectedAppConnected &&
      disconnectPath
  );
  const showWhatsAppProgress = Boolean(
    selectedAppIsWhatsApp &&
      (whatsAppStatus?.status === "logging_in" ||
        whatsAppStatus?.status === "syncing")
  );
  const effectiveWhatsAppStatus = selectedAppIsWhatsApp
    ? (whatsAppStatus?.status ?? "disconnected")
    : null;
  const isWhatsAppConnected = selectedAppIsWhatsApp
    ? effectiveWhatsAppStatus === "connected" || Boolean(whatsAppStatus?.connected)
    : false;
  const isWhatsAppAwaitingScan =
    selectedAppIsWhatsApp && effectiveWhatsAppStatus === "awaiting_qr";
  const whatsAppQrUpdatedAtMs =
    isWhatsAppAwaitingScan && whatsAppStatus?.updatedAt
      ? Date.parse(whatsAppStatus.updatedAt)
      : NaN;
  const whatsAppQrAgeSeconds =
    isWhatsAppAwaitingScan && Number.isFinite(whatsAppQrUpdatedAtMs)
      ? Math.max(0, Math.floor((whatsAppCountdownNowMs - whatsAppQrUpdatedAtMs) / 1000))
      : 0;
  const whatsAppQrSecondsUntilRecreate = Math.max(0, 30 - whatsAppQrAgeSeconds);
  const canRecreateWhatsAppQr = isWhatsAppAwaitingScan && whatsAppQrAgeSeconds >= 30;
  const whatsAppPrimaryAction: "connect" | "disconnect" | "disabled" =
    selectedAppIsWhatsApp
      ? isWhatsAppConnected
        ? "disconnect"
        : WHATSAPP_CONNECTABLE_STATES.has(effectiveWhatsAppStatus ?? "")
          ? "connect"
          : "disabled"
      : "disabled";
  const isWhatsAppPrimaryButtonDisabled = selectedAppIsWhatsApp
    ? isWhatsAppStatusLoading ||
      isConnecting ||
      isDisconnecting ||
      (whatsAppPrimaryAction === "disconnect"
        ? !canDisconnect
        : whatsAppPrimaryAction === "connect"
          ? !isConnectable
          : true)
    : true;
  const isWhatsAppConnectButtonEnabled =
    selectedAppIsWhatsApp &&
    whatsAppPrimaryAction === "connect" &&
    !isWhatsAppPrimaryButtonDisabled;
  const shouldShowWhatsAppQrPanel =
    selectedAppIsWhatsApp &&
    (isWhatsAppAwaitingScan || isWhatsAppConnectButtonEnabled);
  const whatsAppProgressValue = (() => {
    if (!showWhatsAppProgress) return 0;
    if (typeof whatsAppStatus?.syncProgress === "number") {
      return whatsAppStatus.syncProgress;
    }
    if (whatsAppStatus?.status === "logging_in") return 15;
    return 35;
  })();
  const whatsAppEventMessage = (() => {
    if (!selectedAppIsWhatsApp) return null;
    if (isWhatsAppStatusLoading) {
      return "Checking your current WhatsApp connection...";
    }
    switch (effectiveWhatsAppStatus) {
      case "connected":
        return "You're all set. WhatsApp is connected.";
      case "awaiting_qr":
        return "Almost there. Scan the QR code in WhatsApp to finish linking.";
      case "logged_out":
        if (whatsAppStatus?.disconnectReason === "user_disconnected") {
          return "You disconnected WhatsApp. Tap Connect to relink.";
        }
        return "Your WhatsApp session has ended. Tap Connect to sign in again.";
      case "disconnected":
        if (whatsAppStatus?.disconnectReason === "runtime_expired") {
          return "Your WhatsApp runtime expired. Tap Connect to resume.";
        }
        if (whatsAppStatus?.disconnectReason === "user_disconnected") {
          return "You disconnected WhatsApp. Tap Connect to relink.";
        }
        return "Ready when you are. Tap Connect to link your WhatsApp.";
      case "error":
        return "We couldn't connect right now. Tap Connect to try again.";
      case "connecting":
        return "Starting your WhatsApp connection...";
      case "logging_in":
        return "Signing you in to WhatsApp...";
      case "syncing":
        return "Bringing in your chats. This may take a moment.";
      default:
        return "Ready when you are. Tap Connect to link your WhatsApp.";
    }
  })();
  const whatsAppStatusTextKey =
    selectedAppIsWhatsApp
      ? isWhatsAppStatusLoading
        ? "checking_status"
        : effectiveWhatsAppStatus
      : "disconnected";
  const yourApps = useMemo(
    () =>
      supportedApps
        .filter((app) => connectedLookup.has(app.slug))
        .map((app) => ({ ...app, connected: true })),
    [connectedLookup, supportedApps]
  );
  const allApps = useMemo(
    () =>
      supportedApps.map((app) => ({
        ...app,
        connected: connectedLookup.has(app.slug),
      })),
    [connectedLookup, supportedApps]
  );

  const syncWhatsAppConnectedState = useCallback((status: WhatsAppConnectStatus) => {
    const shouldMarkConnected = status.connected || status.status === "connected";
    const shouldMarkDisconnected = WHATSAPP_CONNECTABLE_STATES.has(status.status);
    if (!shouldMarkConnected && !shouldMarkDisconnected) return;

    setConnectedAppSlugs((previous) => {
      const normalized = Array.from(
        new Set(previous.map((slug) => normalizeAppId(slug)))
      );
      const hasWhatsApp = normalized.includes("whatsapp");

      if (shouldMarkConnected) {
        return hasWhatsApp ? previous : [...normalized, "whatsapp"];
      }

      return hasWhatsApp
        ? normalized.filter((slug) => slug !== "whatsapp")
        : previous;
    });
  }, []);

  const loadSavedBrowserCredentials = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(
        buildAppsApiUrl("/onboarding/browser-credentials"),
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) return;
      const payload = (await response.json()) as { credentials?: unknown };
      const nextCredentials: SavedBrowserCredential[] = [];

      if (Array.isArray(payload.credentials)) {
        for (const credential of payload.credentials) {
          const parsed = parseSavedBrowserCredential(credential);
          if (!parsed) continue;
          nextCredentials.push(parsed);
        }
      }

      setSavedBrowserCredentials(nextCredentials);
    } catch {
      // Keep modal usable when metadata lookup fails.
    }
  }, [accessToken]);

  const loadAppsData = useCallback(async () => {
    if (isAuthLoading) return;

    if (!accessToken) {
      setSupportedApps([]);
      setConnectedAppSlugs([]);
      setSavedBrowserCredentials([]);
      setAppsError("Missing access token. Please sign in again.");
      setIsAppsLoading(false);
      return;
    }

    setIsAppsLoading(true);
    setAppsError(null);

    try {
      const [supportedResponse, onboardingStateResponse] = await Promise.all([
        fetch(buildAppsApiUrl("/apps/supported"), {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
        fetch(buildAppsApiUrl("/onboarding/state"), {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      ]);

      if (!supportedResponse.ok) {
        throw new Error(await extractErrorMessage(supportedResponse));
      }
      if (!onboardingStateResponse.ok) {
        throw new Error(await extractErrorMessage(onboardingStateResponse));
      }

      const [supportedPayload, onboardingStatePayload] = await Promise.all([
        supportedResponse.json(),
        onboardingStateResponse.json(),
      ]);

      const parsedSupportedApps = parseSupportedApps(supportedPayload);
      const parsedBrowserCredentials =
        parseSavedBrowserCredentialsFromState(onboardingStatePayload);
      const connectedSlugs = parseConnectedAppSlugs(
        onboardingStatePayload,
        parsedBrowserCredentials
      );

      setSupportedApps(parsedSupportedApps);
      setConnectedAppSlugs(Array.from(connectedSlugs));
      setSavedBrowserCredentials(parsedBrowserCredentials);
      setSelectedApp((prev) => {
        if (!prev) return null;
        return parsedSupportedApps.find((app) => app.slug === prev.slug) ?? null;
      });
    } catch (err) {
      setAppsError(
        err instanceof Error
          ? err.message
          : "Unable to load your app integrations."
      );
      setSupportedApps([]);
      setConnectedAppSlugs([]);
      setSavedBrowserCredentials([]);
    } finally {
      setIsAppsLoading(false);
    }
  }, [accessToken, isAuthLoading]);

  useEffect(() => {
    void loadAppsData();
  }, [loadAppsData]);

  useEffect(() => {
    if (!accessToken) return;

    const abortController = new AbortController();

    const pollPendingOAuthTransaction = async (pendingKey: string) => {
      if (oauthPollingKeysRef.current.has(pendingKey)) return;

      const pendingTransaction = readPendingOAuthTransaction(pendingKey);
      if (!pendingTransaction) return;

      if (isPendingOAuthTransactionExpired(pendingTransaction)) {
        clearPendingOAuthTransaction(pendingKey);
        localStorage.removeItem(pendingKey);
        return;
      }

      oauthPollingKeysRef.current.add(pendingKey);

      try {
        const terminalStatus = await pollOAuthStatusUntilTerminal({
          signal: abortController.signal,
          readStatus: async () => {
            if (abortController.signal.aborted) return null;

            const response = await fetch(
              buildAppsApiUrl(pendingTransaction.statusPath),
              {
                method: "GET",
                cache: "no-store",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              }
            );

            if (response.status === 404) {
              return {
                status: "expired",
                connected: false,
                detail: "Connection request expired. Please try again.",
                provider: pendingTransaction.provider,
                transactionId: pendingTransaction.transactionId,
                updatedAt: null,
              };
            }

            if (!response.ok) {
              throw new Error(await extractErrorMessage(response));
            }

            const payload = await response.json();
            const parsed = parseOAuthStatusResponse(payload);
            if (!parsed) {
              throw new Error("Invalid OAuth status payload.");
            }
            return parsed;
          },
        });

        if (abortController.signal.aborted || !terminalStatus) return;

        clearPendingOAuthTransaction(pendingKey);
        localStorage.removeItem(pendingKey);

        const provider = terminalStatus.provider ?? pendingTransaction.provider;
        const connectedStorageKey = resolveConnectedAppStorageKey(provider);

        if (terminalStatus.status === "connected") {
          if (connectedStorageKey) {
            localStorage.setItem(connectedStorageKey, "true");
          }
          setConnectError(null);
          await loadAppsData();
          return;
        }

        if (terminalStatus.status === "error" || terminalStatus.status === "expired") {
          setConnectError(
            terminalStatus.detail ??
              (terminalStatus.status === "expired"
                ? "Connection request expired. Please try again."
                : "Unable to complete OAuth connection.")
          );
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        setConnectError(
          error instanceof Error
            ? error.message
            : "Unable to read OAuth connection status."
        );
      } finally {
        oauthPollingKeysRef.current.delete(pendingKey);
      }
    };

    for (const pendingKey of OAUTH_PENDING_KEYS) {
      void pollPendingOAuthTransaction(pendingKey);
    }

    return () => {
      abortController.abort();
    };
  }, [accessToken, loadAppsData]);

  const loadWhatsAppStatus = useCallback(
    async (startPath: string = "/whatsapp/connect/status") => {
      if (!accessToken) {
        setConnectError("Missing access token. Please sign in again.");
        return null;
      }

      const requestSeq = ++whatsAppStatusRequestSeqRef.current;
      let response: Response;
      try {
        response = await fetch(buildAppsApiUrl(startPath), {
          method: startPath.endsWith("/start") ? "POST" : "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch (error) {
        if (requestSeq !== whatsAppStatusRequestSeqRef.current) {
          return null;
        }
        throw error;
      }

      if (requestSeq !== whatsAppStatusRequestSeqRef.current) {
        return null;
      }

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const payload = await response.json();
      const parsed = parseWhatsAppConnectStatus(payload);
      if (!parsed) {
        throw new Error("Invalid WhatsApp status payload.");
      }

      if (requestSeq !== whatsAppStatusRequestSeqRef.current) {
        return null;
      }

      setWhatsAppStatus((previous) => {
        if (
          parsed.status === "awaiting_qr" &&
          !parsed.qrImageDataUrl &&
          previous?.status === "awaiting_qr" &&
          previous.qrImageDataUrl
        ) {
          return {
            ...parsed,
            qrImageDataUrl: previous.qrImageDataUrl,
            qrCode: parsed.qrCode ?? previous.qrCode,
          };
        }
        return parsed;
      });
      syncWhatsAppConnectedState(parsed);
      return parsed;
    },
    [accessToken, syncWhatsAppConnectedState]
  );

  useEffect(() => {
    if (!selectedAppIsBrowser) return;
    if (browserCredentialDrafts.length > 0) return;
    setBrowserCredentialDrafts([createEmptyBrowserCredentialDraft()]);
  }, [browserCredentialDrafts.length, selectedAppIsBrowser]);

  useEffect(() => {
    if (!isWhatsAppAwaitingScan) return;

    setWhatsAppCountdownNowMs(Date.now());
    const intervalId = setInterval(() => {
      setWhatsAppCountdownNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isWhatsAppAwaitingScan, whatsAppStatus?.updatedAt]);

  useEffect(() => {
    if (!selectedAppIsWhatsApp) {
      setIsWhatsAppStatusPolling(false);
      return;
    }
    if (!isWhatsAppStatusPolling) return;

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const status = await loadWhatsAppStatus();
        if (!status || isCancelled) {
          return;
        }
        if (status.connected) {
          setIsWhatsAppStatusPolling(false);
          return;
        }

        if (!WHATSAPP_ACTIVE_CONNECT_STATES.has(status.status)) {
          setIsWhatsAppStatusPolling(false);
          return;
        }

        const delayMs = Math.max(2, status.pollAfterSeconds) * 1000;
        timeoutId = setTimeout(() => {
          void poll();
        }, delayMs);
      } catch (error) {
        if (isCancelled) return;
        setConnectError(
          error instanceof Error
            ? error.message
            : "Unable to read WhatsApp connection status."
        );
        setIsWhatsAppStatusPolling(false);
      }
    };

    void poll();
    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isWhatsAppStatusPolling, loadWhatsAppStatus, selectedAppIsWhatsApp]);

  useEffect(() => {
    if (!selectedAppIsWhatsApp) {
      setIsWhatsAppStatusLoading(false);
      return;
    }

    let isCancelled = false;

    const loadInitialWhatsAppStatus = async () => {
      try {
        const status = await loadWhatsAppStatus();
        if (!status || isCancelled) return;

        if (status.connected) {
          setIsWhatsAppStatusPolling(false);
          return;
        }

        if (WHATSAPP_ACTIVE_CONNECT_STATES.has(status.status)) {
          setIsWhatsAppStatusPolling(true);
        } else {
          setIsWhatsAppStatusPolling(false);
        }
      } catch (error) {
        if (isCancelled) return;
        setConnectError(
          error instanceof Error
            ? error.message
            : "Unable to read WhatsApp connection status."
        );
        setIsWhatsAppStatusPolling(false);
      } finally {
        if (!isCancelled) {
          setIsWhatsAppStatusLoading(false);
        }
      }
    };

    void loadInitialWhatsAppStatus();
    return () => {
      isCancelled = true;
    };
  }, [loadWhatsAppStatus, selectedAppIsWhatsApp]);

  const handleOpenApp = (app: PlatformApp) => {
    whatsAppStatusRequestSeqRef.current += 1;
    setSelectedApp(app);
    setConnectError(null);
    setBrowserCredentialFormError(null);
    setBrowserCredentialNotice(null);
    setWhatsAppStatus(null);
    setIsWhatsAppStatusPolling(false);
    setIsWhatsAppStatusLoading(false);
    if (normalizeAppId(app.slug) === "browser") {
      if (browserCredentialDrafts.length === 0) {
        setBrowserCredentialDrafts([createEmptyBrowserCredentialDraft()]);
      }
      void loadSavedBrowserCredentials();
    }
    if (normalizeAppId(app.slug) === "whatsapp") {
      setIsWhatsAppStatusLoading(true);
    }
  };

  const handleConnect = async () => {
    if (!selectedApp) return;

    if (!selectedApp.requiresUserConnection) {
      setConnectError(`${selectedApp.name} is available automatically.`);
      return;
    }

    if (!connectConfig) {
      setConnectError("Connect flow is coming soon for this app.");
      return;
    }
    if (!accessToken) {
      setConnectError("Missing access token. Please sign in again.");
      return;
    }

    setIsConnecting(true);
    setConnectError(null);

    try {
      if (connectConfig.kind === "whatsapp") {
        const status = await loadWhatsAppStatus(connectConfig.startPath);
        if (!status) {
          return;
        }
        if (status.connected) {
          setIsWhatsAppStatusPolling(false);
        } else {
          setIsWhatsAppStatusPolling(true);
        }
        return;
      }

      const startUrl = new URL(buildAppsApiUrl(connectConfig.startPath));
      startUrl.searchParams.set("return_to", window.location.href);

      const response = await fetch(startUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: "manual",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const responseText = await response.text();
      let payload: unknown = null;
      if (responseText.trim()) {
        try {
          payload = JSON.parse(responseText) as unknown;
        } catch {
          payload = responseText;
        }
      }

      const redirectTo = (url?: string | null) => {
        if (!url) return false;
        window.location.href = url;
        return true;
      };

      const parsedStart = parseOAuthStartResponse(payload);
      const fallbackRedirect =
        typeof payload === "string" ? payload.match(/https?:\/\/[^\s"]+/)?.[0] : null;
      const redirectUrl = parsedStart.url ?? fallbackRedirect;

      if (parsedStart.transactionId) {
        writePendingOAuthTransaction({
          pendingKey: connectConfig.pendingKey,
          transactionId: parsedStart.transactionId,
          statusPath: buildOAuthStatusPath(
            connectConfig.startPath,
            parsedStart.transactionId
          ),
          provider: parsedStart.provider,
          expiresAt: parsedStart.expiresAt,
          createdAt: new Date().toISOString(),
        });
      }

      localStorage.setItem(connectConfig.pendingKey, "true");

      if (redirectTo(redirectUrl)) return;
      throw new Error(`Unable to start ${selectedApp.name} connection.`);
    } catch (err) {
      setConnectError(
        err instanceof Error
          ? err.message
          : `Unable to start ${selectedApp.name} connection.`
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!selectedApp || !disconnectPath) return;
    if (!accessToken) {
      setConnectError("Missing access token. Please sign in again.");
      return;
    }

    setIsDisconnecting(true);
    setConnectError(null);

    try {
      const response = await fetch(buildAppsApiUrl(disconnectPath), {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      if (selectedAppSlug === "whatsapp") {
        whatsAppStatusRequestSeqRef.current += 1;
        setWhatsAppStatus(null);
        setIsWhatsAppStatusPolling(false);
        setIsWhatsAppStatusLoading(false);
        setConnectedAppSlugs((previous) =>
          previous.filter((slug) => normalizeAppId(slug) !== "whatsapp")
        );
      } else {
        await loadAppsData();
      }
    } catch (error) {
      setConnectError(
        error instanceof Error
          ? error.message
          : `Unable to disconnect ${selectedApp.name}.`
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleAddBrowserCredentialDraft = () => {
    setBrowserCredentialDrafts((prev) => [
      ...prev,
      createEmptyBrowserCredentialDraft(),
    ]);
    setBrowserCredentialDraftErrors((prev) => [...prev, {}]);
    setBrowserCredentialFormError(null);
    setBrowserCredentialNotice(null);
  };

  const handleRemoveBrowserCredentialDraft = (index: number) => {
    setBrowserCredentialDrafts((prev) => {
      if (prev.length <= 1) {
        return [createEmptyBrowserCredentialDraft()];
      }
      return prev.filter((_, draftIndex) => draftIndex !== index);
    });
    setBrowserCredentialDraftErrors((prev) => {
      if (prev.length <= 1) return [];
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
    setBrowserCredentialFormError(null);
    setBrowserCredentialNotice(null);
  };

  const handleChangeBrowserCredentialDraft = (
    index: number,
    field: keyof BrowserCredentialDraft,
    value: string
  ) => {
    setBrowserCredentialDrafts((prev) =>
      prev.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, [field]: value } : draft
      )
    );
    setBrowserCredentialDraftErrors((prev) =>
      prev.map((rowError, rowIndex) =>
        rowIndex === index ? { ...rowError, [field]: undefined } : rowError
      )
    );
    setBrowserCredentialFormError(null);
    setBrowserCredentialNotice(null);
  };

  const handleSaveBrowserCredentials = useCallback(async () => {
    setBrowserCredentialNotice(null);

    const nextRowErrors: BrowserCredentialDraftErrors[] = browserCredentialDrafts.map(
      (draft) => {
        const rowError: BrowserCredentialDraftErrors = {};
        if (!draft.websiteUrl.trim()) {
          rowError.websiteUrl = "Website URL is required.";
        }
        if (!draft.username.trim()) {
          rowError.username = "Username is required.";
        }
        if (!draft.password) {
          rowError.password = "Password is required.";
        }
        return rowError;
      }
    );

    const hasRowErrors = nextRowErrors.some(
      (rowError) => rowError.websiteUrl || rowError.username || rowError.password
    );
    if (hasRowErrors) {
      setBrowserCredentialDraftErrors(nextRowErrors);
      return;
    }

    if (!accessToken) {
      setBrowserCredentialFormError("Session expired. Sign in again to continue.");
      return;
    }

    setBrowserCredentialDraftErrors(browserCredentialDrafts.map(() => ({})));
    setBrowserCredentialFormError(null);
    setIsSavingBrowserCredentials(true);

    try {
      for (const draft of browserCredentialDrafts) {
        const websiteUrl = draft.websiteUrl.trim();
        const response = await fetch(
          buildAppsApiUrl("/onboarding/browser-credentials"),
          {
            method: "POST",
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              site_name: resolveBrowserSiteName(websiteUrl),
              login_url: websiteUrl,
              username: draft.username.trim(),
              password: draft.password,
            }),
          }
        );

        if (!response.ok) {
          const message = await extractErrorMessage(response);
          setBrowserCredentialFormError(message);
          return;
        }
      }

      await loadSavedBrowserCredentials();
      await loadAppsData();
      setBrowserCredentialDrafts([createEmptyBrowserCredentialDraft()]);
      setBrowserCredentialDraftErrors([]);
      setBrowserCredentialNotice(
        `Saved ${browserCredentialDrafts.length} website credential${
          browserCredentialDrafts.length === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      setBrowserCredentialFormError(
        error instanceof Error
          ? error.message
          : "Unable to save browser credentials."
      );
    } finally {
      setIsSavingBrowserCredentials(false);
    }
  }, [accessToken, browserCredentialDrafts, loadAppsData, loadSavedBrowserCredentials]);

  const appsLoadingSkeleton = (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card
          key={`apps-loading-skeleton-${index}`}
          className="gap-0 rounded-2xl border-[#d8d8d8] bg-transparent py-0 shadow-none"
        >
          <CardContent className="flex items-center gap-4 p-5">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-full max-w-[18rem]" />
            </div>
            <Skeleton className="h-4 w-4 rounded-sm" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[64rem] flex-1 flex-col overflow-x-hidden">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6">
          <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8b8b8f]">
                  Integrations
                </p>
                <h1 className="mt-2 text-[2rem] leading-tight font-semibold text-[#1d1d1f] font-[var(--font-display)]">
                  Connect your tools
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-[#7a7a7a]">
                  Bring your favorite apps into Omicron. Connect Gmail, Drive,
                  WhatsApp, and Browser once, and get faster help with richer
                  context in every conversation.
                </p>
              </div>

              <Badge
                variant="outline"
                className="border-[#d2d2d2] bg-white/80 text-[#6e6e6e]"
              >
                {connectedLookup.size} connected
              </Badge>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex flex-col items-center gap-2 text-center">
                <TabsList>
                  <TabsTrigger value="your-apps">Your Apps</TabsTrigger>
                  <TabsTrigger value="all-apps">All Apps</TabsTrigger>
                </TabsList>

              </div>

              <TabsContent value="your-apps" className="mt-4">
                {isContentLoading ? (
                  appsLoadingSkeleton
                ) : appsError ? (
                  <Card className="gap-0 rounded-2xl border-0 bg-white/72 py-0 text-center shadow-none">
                    <CardContent className="space-y-4 p-6 text-left">
                      <Alert variant="destructive" className="rounded-2xl">
                        <AlertDescription>{appsError}</AlertDescription>
                      </Alert>
                      <Button
                        className="omicron-cta rounded-full px-6 text-sm font-semibold"
                        onClick={() => void loadAppsData()}
                      >
                        Retry
                      </Button>
                    </CardContent>
                  </Card>
                ) : yourApps.length === 0 ? (
                  <Card className="gap-0 rounded-2xl border-0 bg-white/72 py-0 text-center shadow-none">
                    <CardContent className="p-10">
                      <p className="text-sm text-[#6e6e6e]">
                        No apps connected yet.
                      </p>
                      <Button
                        className="omicron-cta mt-4 rounded-full px-6 text-sm font-semibold"
                        onClick={() => setActiveTab("all-apps")}
                      >
                        Browse all apps
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {yourApps.map((app) => (
                      <AppRow
                        key={app.slug}
                        app={app}
                        onSelect={() => handleOpenApp(app)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="all-apps" className="mt-4">
                {isContentLoading ? (
                  appsLoadingSkeleton
                ) : appsError ? (
                  <Card className="gap-0 rounded-2xl border-0 bg-white/72 py-0 text-center shadow-none">
                    <CardContent className="space-y-4 p-6 text-left">
                      <Alert variant="destructive" className="rounded-2xl">
                        <AlertDescription>{appsError}</AlertDescription>
                      </Alert>
                      <Button
                        className="omicron-cta rounded-full px-6 text-sm font-semibold"
                        onClick={() => void loadAppsData()}
                      >
                        Retry
                      </Button>
                    </CardContent>
                  </Card>
                ) : allApps.length === 0 ? (
                  <Card className="gap-0 rounded-2xl border-0 bg-white/72 py-0 text-center shadow-none">
                    <CardContent className="p-10">
                      <p className="text-sm text-[#6e6e6e]">
                        No supported apps are available right now.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {allApps.map((app) => (
                      <AppRow
                        key={app.slug}
                        app={app}
                        onSelect={() => handleOpenApp(app)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              whatsAppStatusRequestSeqRef.current += 1;
              setSelectedApp(null);
              setConnectError(null);
              setIsConnecting(false);
              setIsDisconnecting(false);
              setWhatsAppStatus(null);
              setIsWhatsAppStatusPolling(false);
              setIsWhatsAppStatusLoading(false);
              setBrowserCredentialFormError(null);
              setBrowserCredentialNotice(null);
            }
          }}
        >
          <DialogContent
            className={`${selectedAppIsBrowser || selectedAppIsWhatsApp ? "max-w-3xl" : "max-w-lg"} rounded-2xl border border-[#d8d8d8] bg-white/95 p-6 shadow-[0_30px_80px_rgba(17,17,17,0.14)]`}
          >
            {selectedApp ? (
              <div className="flex flex-col gap-6">
                <DialogHeader className="gap-3">
                  <div className="flex items-center gap-4">
                    <span
                      className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#d2d2d2] bg-white shadow-sm"
                      style={{ backgroundColor: selectedApp.logoBg }}
                    >
                      <Image
                        src={selectedApp.logo}
                        alt={`${selectedApp.name} logo`}
                        width={32}
                        height={32}
                        className="h-8 w-8 object-contain"
                        onError={(event) => {
                          event.currentTarget.src = DEFAULT_SUPPORTED_APP_LOGO;
                        }}
                      />
                      {selectedAppConnected ? (
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                          <span className="text-[10px] font-bold">✓</span>
                        </span>
                      ) : null}
                    </span>
                    <div>
                      <DialogTitle className="text-2xl font-semibold text-[#1d1d1f]">
                        {selectedApp.name}
                      </DialogTitle>
                      <DialogDescription className="text-sm text-[#7a7a7a]">
                        {selectedApp.description}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <p className="text-sm text-[#6e6e6e]">{selectedApp.longDescription}</p>

                {selectedAppIsBrowser ? (
                  <div className="space-y-4">
                    {browserCredentialFormError ? (
                      <Alert
                        variant="destructive"
                        className="rounded-xl border-rose-200 bg-rose-50"
                      >
                        <AlertDescription>{browserCredentialFormError}</AlertDescription>
                      </Alert>
                    ) : null}

                    {browserCredentialNotice ? (
                      <Alert className="rounded-xl border-[#d8d8d8] bg-[#f8f8f8]">
                        <AlertDescription>{browserCredentialNotice}</AlertDescription>
                      </Alert>
                    ) : null}

                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#1d1d1f]">
                        Website credentials
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleAddBrowserCredentialDraft}
                        className="h-8 w-8 rounded-full border-[#d2d2d2] p-0"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="max-h-[19rem] space-y-3 overflow-y-auto pr-1">
                      {browserCredentialDrafts.map((draft, index) => {
                        const rowErrors = browserCredentialDraftErrors[index] ?? {};

                        return (
                          <div
                            key={draft.id}
                            className="rounded-xl border border-[#d8d8d8] bg-[#f8f8f6] p-3"
                          >
                            <div className="space-y-2">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1 space-y-1">
                                  <Label className="text-xs text-[#6e6e6e]">URL</Label>
                                  <Input
                                    value={draft.websiteUrl}
                                    onChange={(event) =>
                                      handleChangeBrowserCredentialDraft(
                                        index,
                                        "websiteUrl",
                                        event.target.value
                                      )
                                    }
                                    placeholder="https://example.com"
                                    className="h-9 rounded-lg border-[#d2d2d2] bg-white text-sm"
                                  />
                                  {rowErrors.websiteUrl ? (
                                    <p className="text-xs text-rose-600">
                                      {rowErrors.websiteUrl}
                                    </p>
                                  ) : null}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => handleRemoveBrowserCredentialDraft(index)}
                                  className="h-8 w-8 shrink-0 rounded-full p-0 text-[#8e8e8e] hover:text-rose-600"
                                  aria-label="Delete website credentials"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-[#6e6e6e]">Username</Label>
                                  <Input
                                    value={draft.username}
                                    onChange={(event) =>
                                      handleChangeBrowserCredentialDraft(
                                        index,
                                        "username",
                                        event.target.value
                                      )
                                    }
                                    placeholder="username"
                                    className="h-9 rounded-lg border-[#d2d2d2] bg-white text-sm"
                                  />
                                  {rowErrors.username ? (
                                    <p className="text-xs text-rose-600">
                                      {rowErrors.username}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs text-[#6e6e6e]">Password</Label>
                                  <Input
                                    type="password"
                                    value={draft.password}
                                    onChange={(event) =>
                                      handleChangeBrowserCredentialDraft(
                                        index,
                                        "password",
                                        event.target.value
                                      )
                                    }
                                    placeholder="password"
                                    className="h-9 rounded-lg border-[#d2d2d2] bg-white text-sm"
                                  />
                                  {rowErrors.password ? (
                                    <p className="text-xs text-rose-600">
                                      {rowErrors.password}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {savedBrowserCredentials.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#7b7b7b]">
                          Saved websites
                        </p>
                        <div className="max-h-[8.5rem] space-y-2 overflow-y-auto pr-1">
                          {savedBrowserCredentials.map((credential) => (
                            <div
                              key={credential.siteKey}
                              className="rounded-lg border border-[#e0e0e0] bg-[#fbfbfa] px-3 py-2"
                            >
                              <p className="truncate text-sm font-medium text-[#1d1d1f]">
                                {credential.siteName}
                              </p>
                              <p className="truncate text-xs text-[#6e6e6e]">
                                {credential.loginUrl || credential.siteKey}
                              </p>
                              {credential.usernameMasked ? (
                                <p className="truncate text-xs text-[#8e8e8e]">
                                  Username: {credential.usernameMasked}
                                </p>
                              ) : null}
                              <p className="truncate text-xs text-[#8e8e8e]">
                                Password: ••••••••
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <DialogFooter className="sm:justify-between">
                      <span className="text-xs text-[#8e8e8e]">
                        {savedBrowserCredentials.length > 0
                          ? `${savedBrowserCredentials.length} website credential${
                              savedBrowserCredentials.length === 1 ? "" : "s"
                            } saved.`
                          : "Add websites for browser automation."}
                      </span>
                      <Button
                        type="button"
                        onClick={() => void handleSaveBrowserCredentials()}
                        disabled={isSavingBrowserCredentials}
                        className="h-9 rounded-full px-5"
                      >
                        {isSavingBrowserCredentials ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          "Save websites"
                        )}
                      </Button>
                    </DialogFooter>
                  </div>
                ) : selectedAppIsWhatsApp ? (
                  <div className="space-y-4">
                    {connectError ? (
                      <Alert
                        variant="destructive"
                        className="rounded-xl border-rose-200 bg-rose-50"
                      >
                        <AlertDescription>{connectError}</AlertDescription>
                      </Alert>
                    ) : null}

                    <div className="rounded-xl border border-[#d8d8d8] bg-[#f8f8f6] p-4">
                      <p
                        key={whatsAppStatusTextKey}
                        className="text-sm font-semibold text-[#1d1d1f] animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
                      >
                        {whatsAppEventMessage ??
                          "Connect your WhatsApp account to start syncing chats."}
                      </p>
                      {showWhatsAppProgress ? (
                        <div className="mt-3 space-y-2">
                          <Progress value={whatsAppProgressValue} />
                          <div className="flex items-center justify-between text-[11px] text-[#7a7a7a]">
                            <span>{whatsAppProgressValue}%</span>
                            {typeof whatsAppStatus?.syncCurrent === "number" &&
                            typeof whatsAppStatus?.syncTotal === "number" &&
                            whatsAppStatus.syncTotal > 0 ? (
                              <span>
                                {whatsAppStatus.syncCurrent}/{whatsAppStatus.syncTotal} chats
                              </span>
                            ) : (
                              <span>Preparing history sync</span>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {shouldShowWhatsAppQrPanel ? (
                      whatsAppStatus?.qrImageDataUrl ? (
                        <div className="rounded-xl border border-[#d8d8d8] bg-white p-4">
                          <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[#7b7b7b]">
                            Scan QR Code
                          </p>
                          <div className="flex justify-center">
                            <Image
                              src={whatsAppStatus.qrImageDataUrl}
                              alt="WhatsApp login QR code"
                              width={224}
                              height={224}
                              unoptimized
                              className="h-56 w-56 rounded-lg border border-[#e2e2e2] bg-white p-2"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-[#d8d8d8] bg-[#fcfcfc] p-4 text-center text-xs text-[#7b7b7b]">
                          QR code will appear here after you tap Connect.
                        </div>
                      )
                    ) : null}

                    <DialogFooter className="sm:justify-end">
                      <Button
                        className="omicron-cta rounded-full px-6 text-sm font-semibold"
                        onClick={() =>
                          whatsAppPrimaryAction === "disconnect"
                            ? void handleDisconnect()
                            : void handleConnect()
                        }
                        disabled={isWhatsAppPrimaryButtonDisabled}
                      >
                        {whatsAppPrimaryAction === "disconnect"
                          ? isDisconnecting
                            ? "Disconnecting..."
                            : "Disconnect"
                          : whatsAppPrimaryAction === "connect"
                            ? isConnecting
                              ? "Starting..."
                              : "Connect"
                            : whatsAppStatus?.status === "awaiting_qr"
                              ? "Waiting for scan..."
                              : whatsAppStatus?.status === "logging_in"
                                ? "Logging in..."
                                : whatsAppStatus?.status === "syncing"
                                  ? "Syncing..."
                                  : "Please wait..."}
                      </Button>
                    </DialogFooter>
                    {isWhatsAppAwaitingScan ? (
                      <div className="flex items-center justify-end gap-2">
                        {canRecreateWhatsAppQr ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full px-4"
                            onClick={() => void handleConnect()}
                            disabled={isConnecting || isDisconnecting}
                          >
                            Recreate QR
                          </Button>
                        ) : (
                          <span className="text-xs text-[#8e8e8e]">
                            Recreate QR in {whatsAppQrSecondsUntilRecreate}s
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <DialogFooter className="sm:justify-between">
                    <span className="text-xs text-[#8e8e8e]">
                      {selectedAppConnected
                        ? "This app is connected."
                        : selectedApp.runtimeAvailable
                          ? selectedApp.requiresUserConnection
                            ? "Connection is required."
                            : "No account connection required."
                          : "This app is currently offline."}
                    </span>
                    <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                      {connectError ? (
                        <Alert
                          variant="destructive"
                          className="w-full rounded-xl px-3 py-2 sm:w-auto"
                        >
                          <AlertDescription className="text-xs">
                            {connectError}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                      <Button
                        className="omicron-cta rounded-full px-6 text-sm font-semibold"
                        onClick={() =>
                          selectedAppConnected ? void handleDisconnect() : void handleConnect()
                        }
                        disabled={
                          isConnecting ||
                          isDisconnecting ||
                          (selectedAppConnected ? !canDisconnect : !isConnectable)
                        }
                      >
                        {selectedAppConnected
                          ? canDisconnect
                            ? isDisconnecting
                              ? "Disconnecting..."
                              : "Disconnect"
                            : "Connected"
                          : isConnectable
                            ? isConnecting
                              ? "Connecting..."
                              : "Connect"
                            : "Coming soon"}
                      </Button>
                    </div>
                  </DialogFooter>
                )}
              </div>
            ) : null}
          </DialogContent>
      </Dialog>
    </>
  );
}
