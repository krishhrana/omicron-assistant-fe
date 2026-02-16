"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthenticatedApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      router.replace("/login");
      router.refresh();
    }
  }, [isLoading, session, error, router]);

  const value = useMemo(
    () => ({ session, isLoading, error }),
    [session, isLoading, error]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f1ea] text-slate-600">
        <Card className="w-full max-w-sm gap-4 rounded-3xl border-white/60 bg-white/85 py-4 shadow-xl">
          <CardHeader className="items-start">
            <Badge variant="secondary" className="rounded-full">
              Auth
            </Badge>
            <CardTitle className="text-base">Checking session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="inline-flex items-center gap-3 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              Validating your workspace access.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f1ea] px-6 text-slate-700">
        <Card className="w-full max-w-md rounded-3xl border-white/60 bg-white/90 py-4 shadow-xl">
          <CardHeader>
            <Badge variant="destructive" className="w-fit rounded-full">
              Auth error
            </Badge>
            <CardTitle className="text-base text-slate-900">
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
    );
  }

  if (!session) {
    return null;
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
