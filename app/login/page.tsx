"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const displayFont = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormErrors = {
  email?: string;
  password?: string;
  form?: string;
};

export default function LoginPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  const isSignUp = mode === "sign-up";

  const inputClassName = (hasError: boolean) =>
    `mt-2 h-11 rounded-2xl bg-white/80 px-4 py-3 text-base text-slate-900 shadow-sm ring-1 ring-transparent transition ${
      hasError
        ? "border-rose-400 ring-rose-200 focus-visible:border-rose-400 focus-visible:ring-rose-200"
        : "border-slate-200 focus-visible:border-emerald-600 focus-visible:ring-emerald-200"
    }`;

  const handleModeChange = (nextMode: "sign-in" | "sign-up") => {
    if (mode === nextMode) return;
    setMode(nextMode);
    setErrors({});
    setNotice(null);
    setPassword("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    const nextErrors: FormErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!emailPattern.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = isSignUp
        ? "Create a password to continue."
        : "Password is required.";
    } else if (isSignUp && password.length < 8) {
      nextErrors.password = "Use at least 8 characters.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseClient();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });

        if (error) {
          setErrors({ form: error.message });
          return;
        }

        if (data.session) {
          router.push("/chat");
          router.refresh();
          return;
        }

        setNotice("Check your email to confirm your account.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        setErrors({ form: error.message });
        return;
      }

      if (!data.session) {
        setErrors({ form: "Unable to start a session. Try again." });
        return;
      }

      router.push("/chat");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to connect to Supabase.";
      setErrors({ form: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`${bodyFont.className} ${displayFont.variable} relative min-h-screen overflow-hidden bg-[#f6f1e8] text-slate-900`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-[-10%] h-[520px] w-[520px] rounded-full bg-[#ffd5a6] blur-3xl opacity-70" />
        <div className="absolute top-24 right-[-15%] h-[420px] w-[420px] rounded-full bg-[#b9ddff] blur-3xl opacity-70" />
        <div className="absolute bottom-[-30%] left-[20%] h-[520px] w-[520px] rounded-full bg-[#f2c3d4] blur-3xl opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(#d8c8b8_1px,transparent_1px)] [background-size:26px_26px] opacity-25" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-12 px-6 py-16 lg:flex-row lg:items-center">
        <section className="flex-1 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <Badge
            variant="outline"
            className="inline-flex items-center gap-3 rounded-full border-slate-900/10 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 backdrop-blur"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
            Omicron Access
          </Badge>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl font-[var(--font-display)]">
            Calm security for fast-moving teams.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-600">
            Sign in to unlock your workspace. We are starting with email and
            password, with OAuth providers on deck.
          </p>
          <Badge className="mt-6 inline-flex items-center gap-3 rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-slate-900/30 animate-float">
            Local dev ready
          </Badge>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Card className="gap-0 rounded-2xl bg-white/70 py-0 ring-1 ring-black/5 backdrop-blur">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Token ready
                </CardDescription>
                <CardTitle className="text-base text-slate-900">
                  JWTs flow to your API
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">
                Supabase sessions give you access + refresh tokens for the Python
                service.
              </CardContent>
            </Card>
            <Card className="gap-0 rounded-2xl bg-white/70 py-0 ring-1 ring-black/5 backdrop-blur">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Focused auth
                </CardDescription>
                <CardTitle className="text-base text-slate-900">
                  Email + password first
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">
                Clear onboarding now. Social providers can land after launch.
              </CardContent>
            </Card>
            <Card className="gap-0 rounded-2xl bg-white/70 py-0 ring-1 ring-black/5 backdrop-blur">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Routing
                </CardDescription>
                <CardTitle className="text-base text-slate-900">
                  Redirects already aligned
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">
                Local URLs are wired for http://localhost:3000.
              </CardContent>
            </Card>
            <Card className="gap-0 rounded-2xl bg-white/70 py-0 ring-1 ring-black/5 backdrop-blur">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Launch checklist
                </CardDescription>
                <CardTitle className="text-base text-slate-900">
                  Secure, calm, verified
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">
                Add route guards next and ship with confidence.
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          className="w-full max-w-md animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          <Card className="rounded-3xl bg-white/85 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.18)] ring-1 ring-black/5 backdrop-blur">
            <CardContent className="p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                    Omicron
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-900 font-[var(--font-display)]">
                    {isSignUp ? "Create your account" : "Welcome back"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {isSignUp
                      ? "Start with email and a strong password."
                      : "Use your work email to continue."}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-900/10 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  v0.1
                </Badge>
              </div>

              <div className="mt-6 inline-flex rounded-full bg-slate-100 p-1 text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleModeChange("sign-in")}
                  className={`h-auto rounded-full px-4 py-2 font-semibold ${
                    !isSignUp
                      ? "bg-white text-slate-900 shadow-sm hover:bg-white"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleModeChange("sign-up")}
                  className={`h-auto rounded-full px-4 py-2 font-semibold ${
                    isSignUp
                      ? "bg-white text-slate-900 shadow-sm hover:bg-white"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Sign up
                </Button>
              </div>

              {errors.form && (
                <Alert
                  variant="destructive"
                  className="mt-6 rounded-2xl border-rose-200 bg-rose-50"
                >
                  <AlertTitle>Authentication failed</AlertTitle>
                  <AlertDescription>{errors.form}</AlertDescription>
                </Alert>
              )}

              {notice && (
                <Alert className="mt-6 rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-700">
                  <AlertTitle className="text-emerald-700">Check your inbox</AlertTitle>
                  <AlertDescription className="text-emerald-700">
                    {notice}
                  </AlertDescription>
                </Alert>
              )}

              <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={inputClassName(Boolean(errors.email))}
                    placeholder="you@company.com"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                  />
                  {errors.email && (
                    <p id="email-error" className="mt-2 text-sm text-rose-600">
                      {errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={inputClassName(Boolean(errors.password))}
                    placeholder={isSignUp ? "Create a password" : "Your password"}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                  />
                  {errors.password && (
                    <p id="password-error" className="mt-2 text-sm text-rose-600">
                      {errors.password}
                    </p>
                  )}
                  {isSignUp && !errors.password && (
                    <p className="mt-2 text-xs text-slate-500">
                      Use at least 8 characters with a mix of letters and numbers.
                    </p>
                  )}
                </div>

                {!isSignUp && (
                  <div className="flex items-center justify-between text-sm">
                    <Button
                      type="button"
                      variant={remember ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setRemember((prev) => !prev)}
                      className="h-8 rounded-full px-3 text-slate-600"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          remember ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      Remember me
                    </Button>
                    <Button
                      asChild
                      variant="link"
                      className="h-auto px-0 text-sm font-medium text-slate-700"
                    >
                      <Link href="#">Forgot password?</Link>
                    </Button>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-auto w-full rounded-2xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700"
                >
                  {isSubmitting ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <span>{isSignUp ? "Create account" : "Sign in"}</span>
                  )}
                </Button>

                <p className="text-xs text-slate-500">
                  By continuing, you agree to the Omicron terms and acknowledge the
                  privacy policy.
                </p>
              </form>

              <Card className="mt-6 gap-0 rounded-2xl border-slate-200 bg-slate-50 py-0 shadow-none">
                <CardContent className="px-4 py-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Coming next</p>
                  <p className="mt-1">OAuth providers and route protection.</p>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
