"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  error: string | null;
  onboardingComplete: boolean | null;
  onboardingCurrentStep: number | null;
  isOnboardingLoading: boolean;
  onboardingError: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ONBOARDING_API_BASE_URL = (process.env.NEXT_PUBLIC_CHAT_API_URL ?? "").replace(
  /\/$/,
  ""
);
const ONBOARDING_ENFORCED =
  (process.env.NEXT_PUBLIC_ONBOARDING_ENFORCED ?? "true").toLowerCase() !==
  "false";

const resolveOnboardingResumeStep = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;

  const step = Math.trunc(parsed);
  if (step <= 2) return 2;
  return 3;
};

const resolveOnboardingSessionKey = (session: Session): string =>
  session.refresh_token ?? session.user.id;

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

export function AuthenticatedApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(
    null
  );
  const [onboardingCurrentStep, setOnboardingCurrentStep] = useState<number | null>(
    null
  );
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(true);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const onboardingCheckedSessionKeyRef = useRef<string | null>(null);
  const whatsappPrewarmSessionKeyRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError) {
          setError(sessionError.message);
        }

        setSession(data.session ?? null);
        setIsLoading(false);

        const { data: listener } = supabase.auth.onAuthStateChange(
          (_event, nextSession) => {
            setSession(nextSession ?? null);
            setIsLoading(false);
          }
        );

        unsubscribe = () => listener.subscription.unsubscribe();
      } catch (err) {
        if (!isMounted) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to check authentication status."
        );
        setIsLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (isLoading || error) return;
    if (!session) {
      router.replace("/onboarding?step=1&mode=sign-in");
      router.refresh();
    }
  }, [isLoading, session, error, router]);

  useEffect(() => {
    let isMounted = true;

    if (!session) {
      onboardingCheckedSessionKeyRef.current = null;
      setOnboardingComplete(null);
      setOnboardingCurrentStep(null);
      setOnboardingError(null);
      setIsOnboardingLoading(false);
      return () => {
        isMounted = false;
      };
    }

    if (!ONBOARDING_ENFORCED) {
      onboardingCheckedSessionKeyRef.current = resolveOnboardingSessionKey(session);
      setOnboardingComplete(true);
      setOnboardingCurrentStep(null);
      setOnboardingError(null);
      setIsOnboardingLoading(false);
      return () => {
        isMounted = false;
      };
    }

    if (!ONBOARDING_API_BASE_URL) {
      setOnboardingError("Missing NEXT_PUBLIC_CHAT_API_URL for onboarding gate.");
      setOnboardingComplete(null);
      setOnboardingCurrentStep(null);
      setIsOnboardingLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const onboardingSessionKey = resolveOnboardingSessionKey(session);
    if (onboardingCheckedSessionKeyRef.current === onboardingSessionKey) {
      setIsOnboardingLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const loadOnboardingState = async () => {
      setIsOnboardingLoading(true);
      setOnboardingError(null);

      try {
        const response = await fetch(`${ONBOARDING_API_BASE_URL}/onboarding/state`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          throw new Error(await extractErrorMessage(response));
        }

        const payload = (await response.json()) as {
          is_complete?: unknown;
          current_step?: unknown;
        };
        if (!isMounted) return;

        setOnboardingComplete(Boolean(payload.is_complete));
        setOnboardingCurrentStep(resolveOnboardingResumeStep(payload.current_step));
        onboardingCheckedSessionKeyRef.current = onboardingSessionKey;
      } catch (err) {
        if (!isMounted) return;
        onboardingCheckedSessionKeyRef.current = null;
        setOnboardingComplete(null);
        setOnboardingCurrentStep(null);
        setOnboardingError(
          err instanceof Error
            ? err.message
            : "Unable to verify onboarding status."
        );
      } finally {
        if (isMounted) {
          setIsOnboardingLoading(false);
        }
      }
    };

    void loadOnboardingState();

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (!ONBOARDING_ENFORCED) return;
    if (isLoading || error || isOnboardingLoading || !session) return;
    if (onboardingError) return;
    if (onboardingComplete === null) return;

    if (!onboardingComplete) {
      const step = onboardingCurrentStep ?? 2;
      router.replace(`/onboarding?step=${step}`);
    }
  }, [
    isLoading,
    error,
    isOnboardingLoading,
    session,
    onboardingComplete,
    onboardingCurrentStep,
    onboardingError,
    router,
  ]);

  useEffect(() => {
    if (isLoading || error || !session) return;
    if (!ONBOARDING_API_BASE_URL) return;
    if (ONBOARDING_ENFORCED) {
      if (isOnboardingLoading || onboardingError || onboardingComplete !== true) {
        return;
      }
    } else if (onboardingComplete !== true) {
      return;
    }

    const sessionKey = resolveOnboardingSessionKey(session);
    if (whatsappPrewarmSessionKeyRef.current === sessionKey) {
      return;
    }
    whatsappPrewarmSessionKeyRef.current = sessionKey;

    const abortController = new AbortController();
    void fetch(`${ONBOARDING_API_BASE_URL}/whatsapp/runtime/prewarm`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      signal: abortController.signal,
    }).catch(() => {
      // Prewarm is a non-blocking optimization.
    });

    return () => {
      abortController.abort();
    };
  }, [
    session,
    isLoading,
    error,
    onboardingComplete,
    isOnboardingLoading,
    onboardingError,
  ]);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      error,
      onboardingComplete,
      onboardingCurrentStep,
      isOnboardingLoading,
      onboardingError,
    }),
    [
      session,
      isLoading,
      error,
      onboardingComplete,
      onboardingCurrentStep,
      isOnboardingLoading,
      onboardingError,
    ]
  );

  const authLoadingSkeleton = (
    <Card className="omicron-surface-xl w-full max-w-sm gap-4 rounded-3xl py-4">
      <CardHeader className="items-start space-y-3">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-6 w-44" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="omicron-canvas text-[#6e6e6e]">
        <div className="omicron-canvas-overlay">
          <div className="absolute inset-0 omicron-canvas-gradient" />
        </div>
        <div className="pointer-events-none absolute inset-0 flowing-dots-bg opacity-70" />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          {authLoadingSkeleton}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="omicron-canvas">
        <div className="omicron-canvas-overlay">
          <div className="absolute inset-0 omicron-canvas-gradient" />
        </div>
        <div className="pointer-events-none absolute inset-0 flowing-dots-bg opacity-70" />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <Card className="omicron-surface-xl w-full max-w-md rounded-3xl py-4">
            <CardHeader>
              <Badge variant="destructive" className="w-fit rounded-full">
                Auth error
              </Badge>
              <CardTitle className="text-base text-[#1d1d1f]">
                We could not verify your session.
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertTitle>Session check failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (ONBOARDING_ENFORCED && isOnboardingLoading) {
    return (
      <div className="omicron-canvas text-[#6e6e6e]">
        <div className="omicron-canvas-overlay">
          <div className="absolute inset-0 omicron-canvas-gradient" />
        </div>
        <div className="pointer-events-none absolute inset-0 flowing-dots-bg opacity-70" />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          {authLoadingSkeleton}
        </div>
      </div>
    );
  }

  if (ONBOARDING_ENFORCED && onboardingError) {
    return (
      <div className="omicron-canvas">
        <div className="omicron-canvas-overlay">
          <div className="absolute inset-0 omicron-canvas-gradient" />
        </div>
        <div className="pointer-events-none absolute inset-0 flowing-dots-bg opacity-70" />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <Card className="omicron-surface-xl w-full max-w-md rounded-3xl py-4">
            <CardHeader>
              <Badge variant="destructive" className="w-fit rounded-full">
                Onboarding error
              </Badge>
              <CardTitle className="text-base text-[#1d1d1f]">
                We could not verify your onboarding state.
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertTitle>Onboarding gate failed</AlertTitle>
                <AlertDescription>{onboardingError}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthenticatedApp");
  }
  return context;
}
