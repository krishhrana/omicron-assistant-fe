"use client";

import Image from "next/image";
import Link from "next/link";
import { Grid2X2, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  deleteConversation,
  isChatApiConfigured,
  listSessions,
  type ChatConversation,
} from "@/lib/api/chat";
import { useAuth } from "@/components/auth/AuthenticatedApp";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { OmicronBackdrop } from "@/components/layout/OmicronBackdrop";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LOAD_HISTORY_KEY = "omicron.loadHistoryFor";

type ChatShellContextValue = {
  conversations: ChatConversation[];
  upsertConversation: (conversation: ChatConversation) => void;
  removeConversation: (conversationId: string) => void;
};

const ChatShellContext = createContext<ChatShellContextValue | null>(null);

export const useChatShell = () => {
  const context = useContext(ChatShellContext);
  if (!context) {
    throw new Error("useChatShell must be used within ChatShell");
  }
  return context;
};

const formatDate = (timestamp: string) =>
  new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

const sortByUpdatedAtDesc = (items: ChatConversation[]) =>
  [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export default function ChatShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const pathname = usePathname();
  const router = useRouter();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<
    string | null
  >(null);
  const [confirmingConversationId, setConfirmingConversationId] = useState<
    string | null
  >(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [connectedApps, setConnectedApps] = useState<
    { name: string; logo: string }[]
  >([]);

  const isMountedRef = useRef(true);
  const isMock = useMemo(() => !isChatApiConfigured(), []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setConversations([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setError(null);

    void listSessions(accessToken)
      .then((data) => {
        if (cancelled || !isMountedRef.current) return;
        setConversations(sortByUpdatedAtDesc(data));
      })
      .catch((err: unknown) => {
        if (cancelled || !isMountedRef.current) return;
        setError(
          err instanceof Error ? err.message : "Unable to load conversations."
        );
      })
      .finally(() => {
        if (cancelled || !isMountedRef.current) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pendingGmail =
      localStorage.getItem("omicron.pendingGmailConnect") === "true";
    if (pendingGmail) {
      localStorage.setItem("omicron.gmail.connected", "true");
      localStorage.removeItem("omicron.pendingGmailConnect");
    }

    const pendingGoogleDrive =
      localStorage.getItem("omicron.pendingGoogleDriveConnect") === "true";
    if (pendingGoogleDrive) {
      localStorage.setItem("omicron.google-drive.connected", "true");
      localStorage.removeItem("omicron.pendingGoogleDriveConnect");
    }

    const apps: { name: string; logo: string }[] = [];
    if (localStorage.getItem("omicron.gmail.connected") === "true") {
      apps.push({ name: "Gmail", logo: "/apps/gmail.png" });
    }
    if (localStorage.getItem("omicron.google-drive.connected") === "true") {
      apps.push({ name: "Google Drive", logo: "/apps/google-drive.png" });
    }

    setConnectedApps(apps);
  }, []);

  const upsertConversation = useCallback((conversation: ChatConversation) => {
    setConversations((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === conversation.id);

      if (existingIndex === -1) {
        return sortByUpdatedAtDesc([conversation, ...prev]);
      }

      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        ...conversation,
      };
      return sortByUpdatedAtDesc(next);
    });
  }, []);

  const removeConversation = useCallback((conversationId: string) => {
    setConversations((prev) => prev.filter((item) => item.id !== conversationId));
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setSignOutError(null);

    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setSignOutError(
        err instanceof Error ? err.message : "Unable to sign out."
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    setDeletingConversationId(conversationId);
    setError(null);

    try {
      await deleteConversation(conversationId, accessToken);
      if (!isMountedRef.current) return;

      removeConversation(conversationId);

      if (typeof window !== "undefined") {
        if (sessionStorage.getItem(LOAD_HISTORY_KEY) === conversationId) {
          sessionStorage.removeItem(LOAD_HISTORY_KEY);
        }
      }

      if (pathname === `/chat/${conversationId}`) {
        router.replace("/chat");
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(
        err instanceof Error ? err.message : "Unable to delete conversation."
      );
    } finally {
      if (isMountedRef.current) {
        setDeletingConversationId(null);
      }
    }
  };

  const contextValue = useMemo(
    () => ({
      conversations,
      upsertConversation,
      removeConversation,
    }),
    [conversations, upsertConversation, removeConversation]
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleConversations = useMemo(() => {
    if (!normalizedSearchQuery) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const title = conversation.title.toLowerCase();
      const preview = conversation.preview.toLowerCase();
      return (
        title.includes(normalizedSearchQuery) ||
        preview.includes(normalizedSearchQuery)
      );
    });
  }, [conversations, normalizedSearchQuery]);

  const confirmingConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === confirmingConversationId
      ) ?? null,
    [conversations, confirmingConversationId]
  );

  const confirmDeleteConversation = () => {
    if (!confirmingConversationId) return;
    void handleDeleteConversation(confirmingConversationId);
    setConfirmingConversationId(null);
  };

  const handleConversationOpen = useCallback((conversationId: string) => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(LOAD_HISTORY_KEY, conversationId);
  }, []);

  return (
    <ChatShellContext.Provider value={contextValue}>
      <OmicronBackdrop>
        <div className="mx-auto h-screen max-w-7xl px-4 py-6">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur lg:flex-row">
          <Card
            className={cn(
              "overflow-hidden border-0 bg-transparent py-0 shadow-none transition-all duration-300",
              isSidebarCollapsed
                ? "pointer-events-none max-h-0 w-full opacity-0 lg:max-h-none lg:w-0"
                : "max-h-full w-full opacity-100 lg:w-80"
            )}
          >
            <CardContent className="flex h-full flex-col gap-6 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Omicron
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900 font-[var(--font-display)]">
                    Chat
                  </h2>
                </div>
                <div className="flex items-start gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsSidebarCollapsed(true)}
                    className="rounded-full text-slate-500 hover:text-slate-800"
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </Button>
                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      variant="outline"
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                        isMock
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {isMock ? "Mock" : "Live"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                      className="h-auto px-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:text-slate-800"
                    >
                      {isSigningOut ? "Signing out" : "Sign out"}
                    </Button>
                  </div>
                </div>
              </div>

              {signOutError ? (
                <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50">
                  <AlertDescription className="text-xs text-rose-700">
                    {signOutError}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Card className="gap-0 rounded-2xl border-slate-200/70 bg-white/90 py-0 shadow-sm">
                <CardContent className="space-y-2 p-3">
                  <Label
                    htmlFor="chat-shell-search"
                    className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400"
                  >
                    Search chats
                  </Label>
                  <Input
                    id="chat-shell-search"
                    type="text"
                    placeholder="Find a thread"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="h-8 border-0 bg-transparent px-0 text-sm text-slate-700 shadow-none focus-visible:ring-0 placeholder:text-slate-400"
                  />
                </CardContent>
              </Card>

              <Card className="gap-0 rounded-2xl border-slate-200/70 bg-white/90 py-0 shadow-sm">
                <CardContent className="space-y-2 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Navigation
                  </p>
                  <Button
                    asChild
                    variant="ghost"
                    className="h-auto w-full justify-between rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 hover:border-slate-200 hover:bg-white"
                  >
                    <Link href="/apps">
                      <span className="inline-flex items-center gap-2">
                        <Grid2X2 className="h-4 w-4 text-slate-500" />
                        Apps
                      </span>
                      <span className="text-xs text-slate-400">View</span>
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {connectedApps.length > 0 ? (
                <Card className="gap-0 rounded-2xl border-slate-200/70 bg-white/90 py-0 shadow-sm">
                  <CardContent className="space-y-2 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Connected apps
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {connectedApps.map((app) => (
                        <Badge
                          key={app.name}
                          variant="outline"
                          className="inline-flex items-center gap-2 rounded-full border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                        >
                          <Image
                            src={app.logo}
                            alt={`${app.name} logo`}
                            width={14}
                            height={14}
                            className="h-3.5 w-3.5"
                          />
                          {app.name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Conversations
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="xs"
                  className="rounded-full border-slate-200 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 hover:border-emerald-200 hover:text-emerald-700"
                >
                  <Link href="/chat">New</Link>
                </Button>
              </div>

              {error ? (
                <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50">
                  <AlertDescription className="text-xs text-rose-700">
                    {error}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {isLoading
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton
                        key={`skeleton-${index}`}
                        className="h-16 rounded-2xl border border-white/60 bg-white/60"
                      />
                    ))
                  : visibleConversations.length === 0
                    ? (
                        <Card className="gap-0 rounded-2xl border-slate-200/70 bg-white/80 py-0 shadow-none">
                          <CardContent className="px-4 py-3 text-xs text-slate-500">
                            {normalizedSearchQuery
                              ? "No chats match your search."
                              : "No conversations yet."}
                          </CardContent>
                        </Card>
                      )
                    : visibleConversations.map((conversation) => {
                      const isActive = pathname === `/chat/${conversation.id}`;
                      const isDeleting =
                        deletingConversationId === conversation.id;
                      return (
                        <Card
                          key={conversation.id}
                          className={`group gap-0 rounded-2xl border py-0 text-sm shadow-none transition ${
                            isActive
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-transparent bg-white/80 hover:border-slate-200"
                          }`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-2">
                              <Button
                                asChild
                                variant="ghost"
                                className="h-auto min-w-0 flex-1 justify-start p-0 text-left hover:bg-transparent"
                              >
                                <Link
                                  href={`/chat/${conversation.id}`}
                                  onClick={() =>
                                    handleConversationOpen(conversation.id)
                                  }
                                  className="min-w-0"
                                >
                                  <span className="block truncate font-semibold text-slate-900">
                                    {conversation.title}
                                  </span>
                                </Link>
                              </Button>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">
                                  {formatDate(conversation.updatedAt)}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() =>
                                    setConfirmingConversationId(conversation.id)
                                  }
                                  disabled={isDeleting}
                                  className="rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  aria-label="Delete conversation"
                                  title="Delete conversation"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>

                            <Button
                              asChild
                              variant="ghost"
                              className="mt-1 h-auto w-full justify-start p-0 text-left hover:bg-transparent"
                            >
                              <Link
                                href={`/chat/${conversation.id}`}
                                onClick={() =>
                                  handleConversationOpen(conversation.id)
                                }
                                className="block w-full min-w-0"
                              >
                                <span className="block truncate text-xs text-slate-500">
                                  {conversation.preview}
                                </span>
                              </Link>
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
              </div>

              <Card className="gap-0 rounded-2xl border-slate-200/70 bg-white/80 py-0 shadow-none">
                <CardContent className="px-4 py-3 text-xs text-slate-600">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Signed in
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {session?.user?.email ?? "Unknown"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Workspace: Omicron</p>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          <section
            className={cn(
              "relative flex min-h-0 flex-1 flex-col bg-transparent p-6",
              isSidebarCollapsed ? "pt-14" : ""
            )}
          >
            {isSidebarCollapsed ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setIsSidebarCollapsed(false)}
                className="absolute left-4 top-4 z-10 rounded-full border-slate-200 bg-white/90 text-slate-600 shadow-sm hover:text-slate-900"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            ) : null}
            {children}
          </section>
          </div>
        </div>

        <Dialog
          open={Boolean(confirmingConversationId)}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmingConversationId(null);
            }
          }}
        >
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Delete conversation?</DialogTitle>
              <DialogDescription>
                This action cannot be undone.
                {confirmingConversation ? (
                  <span className="mt-2 block font-medium text-slate-700">
                    {confirmingConversation.title}
                  </span>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingConversationId(null)}
                disabled={Boolean(deletingConversationId)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDeleteConversation}
                disabled={
                  !confirmingConversationId || Boolean(deletingConversationId)
                }
              >
                {deletingConversationId === confirmingConversationId
                  ? "Deleting..."
                  : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </OmicronBackdrop>
    </ChatShellContext.Provider>
  );
}
