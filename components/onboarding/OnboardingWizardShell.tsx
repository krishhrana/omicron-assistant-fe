"use client";

import {
  type ComponentType,
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  Globe2,
  LoaderCircle,
  Link2,
  Plus,
  Trash2,
  TrendingUp,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";

type OnboardingStep = {
  id: number;
  label: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

type StepActions = {
  onNext: () => void;
  profile: {
    values: ProfileFormValues;
    errors: ProfileFormErrors;
    notice: string | null;
    isSubmitting: boolean;
    onFieldChange: (field: keyof ProfileFormValues, value: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  };
  apps: {
    items: SupportedAppSummary[];
    isLoading: boolean;
    error: string | null;
    connectError: string | null;
    connectingAppId: string | null;
    connectedProviderAppIds: string[];
    connectedProviderAppId: string | null;
    oauthStatus: string | null;
    oauthDetail: string | null;
    selectedApp: SupportedAppSummary | null;
    browserCredentialDrafts: BrowserCredentialDraft[];
    browserCredentialDraftErrors: BrowserCredentialDraftErrors[];
    browserCredentialFormError: string | null;
    browserCredentialNotice: string | null;
    savedBrowserCredentials: SavedBrowserCredential[];
    browserCredentialSavedCount: number;
    isSavingBrowserCredentials: boolean;
    isCompletingOnboarding: boolean;
    layout: SupportedAppsLayout;
    onOpenApp: (app: SupportedAppSummary) => void;
    onCloseApp: () => void;
    onConnect: (app: SupportedAppSummary) => void;
    onAddBrowserCredentialDraft: () => void;
    onRemoveBrowserCredentialDraft: (index: number) => void;
    onChangeBrowserCredentialDraft: (
      index: number,
      field: keyof BrowserCredentialDraft,
      value: string
    ) => void;
    onSaveBrowserCredentials: () => void;
    onRetry: () => void;
  };
};

type AuthMode = "sign-in" | "sign-up";

type AuthFormErrors = {
  email?: string;
  password?: string;
  form?: string;
};

type ProfileFormValues = {
  name: string;
  city: string;
  age: string;
  gender: string;
};

type ProfileFormErrors = {
  name?: string;
  city?: string;
  age?: string;
  form?: string;
};

type SupportedAppSummary = {
  id: string;
  display_name: string;
  description: string;
  category: string;
  requires_user_connection: boolean;
  runtime_available: boolean;
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

type SupportedAppsLayout = {
  outerMaxWidthClass: string;
  innerMaxWidthClass: string;
  gridClass: string;
  headerMaxWidthClass: string;
};

type OnboardingStateSnapshot = {
  isComplete: boolean;
  resumeStep: number;
  profile: {
    name: string;
    city: string | null;
    age: number | null;
    gender: string | null;
  } | null;
  connectedProviderAppIds: string[];
  websiteCredentials: SavedBrowserCredential[];
  requirements: {
    profileComplete: boolean;
    appConnected: boolean;
    browserCredentialsAdded: boolean;
  };
};

type AuthStepSurfaceProps = {
  mode: AuthMode;
  email: string;
  password: string;
  remember: boolean;
  isSubmitting: boolean;
  errors: AuthFormErrors;
  notice: string | null;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberChange: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONBOARDING_API_BASE_URL = (process.env.NEXT_PUBLIC_CHAT_API_URL ?? "").replace(
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
};
const OAUTH_CONNECTABLE_APPS: Record<
  string,
  { startPath: string; pendingKey: string }
> = {
  gmail: {
    startPath: "/oauth/gmail/start",
    pendingKey: "omicron.pendingGmailConnect",
  },
  drive: {
    startPath: "/oauth/google-drive/start",
    pendingKey: "omicron.pendingGoogleDriveConnect",
  },
  "google-drive": {
    startPath: "/oauth/google-drive/start",
    pendingKey: "omicron.pendingGoogleDriveConnect",
  },
  google_drive: {
    startPath: "/oauth/google-drive/start",
    pendingKey: "omicron.pendingGoogleDriveConnect",
  },
};

const buildOnboardingApiUrl = (path: string) => {
  if (!ONBOARDING_API_BASE_URL) {
    throw new Error(
      "Missing NEXT_PUBLIC_CHAT_API_URL. Configure it to call onboarding APIs."
    );
  }
  return `${ONBOARDING_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
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

    const detail =
      (typeof parsed.detail === "string" && parsed.detail.trim()) ||
      (typeof parsed.message === "string" && parsed.message.trim()) ||
      (typeof parsed.error === "string" && parsed.error.trim());

    return detail || text;
  } catch {
    return text;
  }
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    label: "Signup",
    title: "Create your Omicron account",
    description: "Use your email to continue.",
    icon: UserRoundPlus,
  },
  {
    id: 2,
    label: "Profile",
    title: "Tell us a little about yourself",
    description: "Add your basics so Omicron can personalize recommendations.",
    icon: UserRound,
  },
  {
    id: 3,
    label: "Apps",
    title: "Connect your first app",
    description: "Connect your everyday apps to unlock instant automations.",
    icon: Link2,
  },
];

const LEFT_FEATURES: Array<{
  icon: ComponentType<{ className?: string }>;
  text: string;
}> = [
  { icon: Globe2, text: "Track important updates across the web automatically." },
  { icon: TrendingUp, text: "Receive only high-signal alerts and opportunities." },
  { icon: BellRing, text: "Stay proactive with minimal daily effort." },
];

const clampStep = (value: number) => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(ONBOARDING_STEPS.length, Math.max(1, Math.trunc(value)));
};

const resolveResumeStep = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;

  const clamped = clampStep(Math.trunc(parsed));
  return clamped <= 1 ? 2 : clamped;
};

const isExistingAccountSignUpOutcome = ({
  error,
  user,
  hasSession,
}: {
  error: AuthError | null;
  user: User | null;
  hasSession: boolean;
}) => {
  if (hasSession) return false;

  if (error?.code === "user_already_exists" || error?.code === "email_exists") {
    return true;
  }

  if (!user) {
    return false;
  }

  const identities = user.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return true;
  }
  return false;
};

const getSupportedAppsLayout = (count: number): SupportedAppsLayout => {
  if (count <= 3) {
    return {
      outerMaxWidthClass: "max-w-[30rem]",
      innerMaxWidthClass: "max-w-[24.5rem]",
      gridClass: "grid-cols-1",
      headerMaxWidthClass: "max-w-[20.5rem]",
    };
  }

  if (count <= 8) {
    return {
      outerMaxWidthClass: "max-w-[36rem]",
      innerMaxWidthClass: "max-w-[31rem]",
      gridClass: "grid-cols-1 sm:grid-cols-2",
      headerMaxWidthClass: "max-w-[23rem]",
    };
  }

  return {
    outerMaxWidthClass: "max-w-[44rem]",
    innerMaxWidthClass: "max-w-[38rem]",
    gridClass: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    headerMaxWidthClass: "max-w-[27rem]",
  };
};

const resolveSupportedAppLogo = (app: SupportedAppSummary): string => {
  const normalizedId = app.id.trim().toLowerCase();
  if (SUPPORTED_APP_LOGOS[normalizedId]) {
    return SUPPORTED_APP_LOGOS[normalizedId];
  }

  const normalizedName = app.display_name.trim().toLowerCase().replace(/\s+/g, "-");
  if (SUPPORTED_APP_LOGOS[normalizedName]) {
    return SUPPORTED_APP_LOGOS[normalizedName];
  }

  return DEFAULT_SUPPORTED_APP_LOGO;
};

const resolveSupportedAppOAuthConfig = (
  app: SupportedAppSummary
): { startPath: string; pendingKey: string } | null => {
  const idCandidate = app.id.trim().toLowerCase();
  if (OAUTH_CONNECTABLE_APPS[idCandidate]) {
    return OAUTH_CONNECTABLE_APPS[idCandidate];
  }

  const nameDash = app.display_name.trim().toLowerCase().replace(/\s+/g, "-");
  if (OAUTH_CONNECTABLE_APPS[nameDash]) {
    return OAUTH_CONNECTABLE_APPS[nameDash];
  }

  const nameUnderscore = app.display_name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (OAUTH_CONNECTABLE_APPS[nameUnderscore]) {
    return OAUTH_CONNECTABLE_APPS[nameUnderscore];
  }

  return null;
};

const resolveConnectedProviderAppId = (provider: string | null): string | null => {
  if (!provider) return null;
  const normalized = provider.trim().toLowerCase();
  if (normalized === "gmail") return "gmail";
  if (
    normalized === "google-drive" ||
    normalized === "drive" ||
    normalized === "google_drive"
  ) {
    return "drive";
  }
  return null;
};

const parseSavedBrowserCredential = (
  rawCredential: unknown
): SavedBrowserCredential | null => {
  if (!rawCredential || typeof rawCredential !== "object") {
    return null;
  }

  const credential = rawCredential as Record<string, unknown>;
  const siteKey = typeof credential.site_key === "string" ? credential.site_key : "";
  const siteName =
    typeof credential.site_name === "string" ? credential.site_name : "";
  if (!siteKey || !siteName) {
    return null;
  }

  return {
    siteKey,
    siteName,
    loginUrl: typeof credential.login_url === "string" ? credential.login_url : null,
    usernameMasked:
      typeof credential.username_masked === "string"
        ? credential.username_masked
        : "",
    createdAt:
      typeof credential.created_at === "string" ? credential.created_at : null,
  };
};

const createEmptyBrowserCredentialDraft = (): BrowserCredentialDraft => ({
  id: `browser-site-${Math.random().toString(36).slice(2, 10)}`,
  websiteUrl: "",
  username: "",
  password: "",
});

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

const renderAuthSurface = ({
  mode,
  email,
  password,
  remember,
  isSubmitting,
  errors,
  notice,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onRememberChange,
  onSubmit,
}: AuthStepSurfaceProps) => {
  const isSignUpMode = mode === "sign-up";

  return (
    <Card className="mx-auto w-full rounded-[1.8rem] border border-[#d8d8d8] bg-white/92 py-0 shadow-[0_20px_50px_rgba(17,17,17,0.14)]">
      <CardContent className="space-y-5 p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.42em] text-[#6e6e6e]">
              Omicron
            </p>
            <h3 className="text-4xl leading-none font-[var(--font-display)] text-[#1d1d1f]">
              {isSignUpMode ? "Create account" : "Welcome back"}
            </h3>
            <p className="text-base leading-[1.35] text-[#6e6e6e]">
              {isSignUpMode
                ? "Start with your email."
                : "Use your email to continue."}
            </p>
          </div>
          <Badge
            variant="outline"
            className="rounded-full border border-[#d2d2d2] bg-[#f2f2f2] px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-[#6e6e6e]"
          >
            V0.1
          </Badge>
        </div>

        <div className="inline-flex rounded-full bg-[#ececec] p-1.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onModeChange("sign-in")}
            className={`h-9 rounded-full px-5 text-base font-semibold ${
              !isSignUpMode
                ? "bg-white text-[#1d1d1f] shadow-[0_8px_16px_rgba(17,17,17,0.12)] hover:bg-white"
                : "text-[#6e6e6e] hover:text-[#515151]"
            }`}
          >
            Sign in
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onModeChange("sign-up")}
            className={`h-9 rounded-full px-5 text-base font-semibold ${
              isSignUpMode
                ? "bg-white text-[#1d1d1f] shadow-[0_8px_16px_rgba(17,17,17,0.12)] hover:bg-white"
                : "text-[#6e6e6e] hover:text-[#515151]"
            }`}
          >
            Sign up
          </Button>
        </div>

        {errors.form ? (
          <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50">
            <AlertTitle>Authentication failed</AlertTitle>
            <AlertDescription>{errors.form}</AlertDescription>
          </Alert>
        ) : null}

        {notice ? (
          <Alert className="omicron-notice rounded-2xl">
            <AlertTitle>Check your inbox</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="onboarding-email" className="text-lg font-semibold text-[#3a3a3a]">
              Email
            </Label>
            <Input
              id="onboarding-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "onboarding-email-error" : undefined}
              className="h-12 rounded-[1.4rem] border-[#d2d2d2] bg-white px-5 text-lg text-[#1d1d1f] shadow-[0_4px_12px_rgba(17,17,17,0.08)] placeholder:text-[#8e8e8e] focus-visible:border-[#8e8e8e] focus-visible:ring-[#e3e3e1]"
            />
            {errors.email ? (
              <p id="onboarding-email-error" className="text-base text-rose-600">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboarding-password" className="text-lg font-semibold text-[#3a3a3a]">
              Password
            </Label>
            <Input
              id="onboarding-password"
              type="password"
              autoComplete={isSignUpMode ? "new-password" : "current-password"}
              placeholder="Your password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "onboarding-password-error" : undefined}
              className="h-12 rounded-[1.4rem] border-[#d2d2d2] bg-white px-5 text-lg text-[#1d1d1f] shadow-[0_4px_12px_rgba(17,17,17,0.08)] placeholder:text-[#8e8e8e] focus-visible:border-[#8e8e8e] focus-visible:ring-[#e3e3e1]"
            />
            {errors.password ? (
              <p id="onboarding-password-error" className="text-base text-rose-600">
                {errors.password}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onRememberChange}
              className="h-9 rounded-full bg-[#f2f2f2] px-4 text-base font-medium text-[#3a3a3a] hover:bg-[#e8e8e8]"
            >
              <span
                className={`mr-2.5 h-3.5 w-3.5 rounded-full ${
                  remember ? "bg-[#1d1d1f]" : "bg-[#c7c7c7]"
                }`}
              />
              Remember me
            </Button>
            <Button asChild variant="link" className="h-auto px-0 text-lg text-[#3a3a3a]">
              <Link href="#">Forgot password?</Link>
            </Button>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="omicron-cta h-12 w-full rounded-[1.5rem] text-xl font-semibold shadow-[0_10px_22px_rgba(17,17,17,0.22)] transition"
          >
            {isSubmitting ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : isSignUpMode ? (
              "Create account"
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

const renderStepSurface = (step: OnboardingStep, actions: StepActions) => {
  if (step.id === 2) {
    return (
      <Card className="mx-auto w-full max-w-[25.75rem] gap-0 rounded-2xl border-[#d8d8d8] bg-white py-0 shadow-[0_22px_52px_rgba(17,17,17,0.12)]">
        <CardContent className="space-y-3.5 p-4 sm:p-5">
          {actions.profile.errors.form ? (
            <Alert variant="destructive" className="rounded-xl border-rose-200 bg-rose-50">
              <AlertTitle>Could not save profile</AlertTitle>
              <AlertDescription>{actions.profile.errors.form}</AlertDescription>
            </Alert>
          ) : null}

          {actions.profile.notice ? (
            <Alert className="omicron-notice rounded-xl">
              <AlertDescription>{actions.profile.notice}</AlertDescription>
            </Alert>
          ) : null}

          <form className="space-y-3.5" onSubmit={actions.profile.onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="onboarding-full-name" className="text-sm text-[#3a3a3a]">
                Full name
              </Label>
              <Input
                id="onboarding-full-name"
                autoComplete="name"
                value={actions.profile.values.name}
                onChange={(event) =>
                  actions.profile.onFieldChange("name", event.target.value)
                }
                aria-invalid={Boolean(actions.profile.errors.name)}
                aria-describedby={
                  actions.profile.errors.name ? "onboarding-full-name-error" : undefined
                }
                className="h-10 rounded-xl border-[#d2d2d2] bg-white text-[#1d1d1f]"
              />
              {actions.profile.errors.name ? (
                <p id="onboarding-full-name-error" className="text-sm text-rose-600">
                  {actions.profile.errors.name}
                </p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-[1.35fr_1fr]">
              <div className="space-y-2">
                <Label htmlFor="onboarding-city" className="text-sm text-[#3a3a3a]">
                  City
                </Label>
                <Input
                  id="onboarding-city"
                  autoComplete="address-level2"
                  value={actions.profile.values.city}
                  onChange={(event) =>
                    actions.profile.onFieldChange("city", event.target.value)
                  }
                  aria-invalid={Boolean(actions.profile.errors.city)}
                  aria-describedby={
                    actions.profile.errors.city ? "onboarding-city-error" : undefined
                  }
                  className="h-10 rounded-xl border-[#d2d2d2] bg-white text-[#1d1d1f]"
                />
                {actions.profile.errors.city ? (
                  <p id="onboarding-city-error" className="text-sm text-rose-600">
                    {actions.profile.errors.city}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-age" className="text-sm text-[#3a3a3a]">
                  Age
                </Label>
                <Input
                  id="onboarding-age"
                  type="number"
                  min={13}
                  max={120}
                  inputMode="numeric"
                  value={actions.profile.values.age}
                  onChange={(event) =>
                    actions.profile.onFieldChange("age", event.target.value)
                  }
                  aria-invalid={Boolean(actions.profile.errors.age)}
                  aria-describedby={
                    actions.profile.errors.age ? "onboarding-age-error" : undefined
                  }
                  className="h-10 rounded-xl border-[#d2d2d2] bg-white text-[#1d1d1f]"
                />
                {actions.profile.errors.age ? (
                  <p id="onboarding-age-error" className="text-sm text-rose-600">
                    {actions.profile.errors.age}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-gender" className="text-sm text-[#3a3a3a]">
                Gender
              </Label>
              <Select
                value={actions.profile.values.gender}
                onValueChange={(value) =>
                  actions.profile.onFieldChange("gender", value)
                }
              >
                <SelectTrigger
                  id="onboarding-gender"
                  className="h-10 rounded-xl border-[#d2d2d2] bg-white text-sm text-[#1d1d1f] shadow-none focus-visible:border-[#8e8e8e] focus-visible:ring-[#e3e3e1]"
                >
                  <SelectValue placeholder="Select gender (optional)" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[#d2d2d2]">
                  <SelectItem value="woman">Woman</SelectItem>
                  <SelectItem value="man">Man</SelectItem>
                  <SelectItem value="non_binary">Non-binary</SelectItem>
                  <SelectItem value="prefer_not_to_say">
                    Prefer not to say
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={actions.profile.isSubmitting}
              className="omicron-cta h-10 w-full rounded-xl"
            >
              {actions.profile.isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                "Save profile"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (step.id === 3) {
    const totalSupportedApps = actions.apps.items.length;
    const showScrollableApps = totalSupportedApps > 9;
    const selectedApp = actions.apps.selectedApp;
    const selectedAppId = selectedApp?.id.trim().toLowerCase() ?? null;
    const selectedAppIsBrowser = selectedAppId === "browser";
    const selectedAppConnected = selectedAppIsBrowser
      ? actions.apps.browserCredentialSavedCount > 0
      : Boolean(
          selectedAppId &&
            actions.apps.connectedProviderAppIds.includes(selectedAppId)
        );
    const selectedAppConnectable = Boolean(
      selectedApp &&
        !selectedAppIsBrowser &&
        selectedApp.requires_user_connection &&
        selectedApp.runtime_available &&
        !selectedAppConnected
    );
    const selectedAppConnecting =
      Boolean(selectedApp) && actions.apps.connectingAppId === selectedApp?.id;
    const selectedAppActionLabel = selectedAppConnected
      ? "Connected"
      : selectedAppConnectable
        ? selectedAppConnecting
          ? "Connecting..."
          : "Connect"
        : selectedApp?.runtime_available
          ? "Ready"
          : "Offline";
    const oauthConnectedAppLabel =
      actions.apps.oauthStatus === "connected" &&
      actions.apps.connectedProviderAppId
        ? actions.apps.items.find((app) => {
            const appId = app.id.trim().toLowerCase();
            return appId === actions.apps.connectedProviderAppId;
          })?.display_name ?? "App"
        : null;

    return (
      <Card
        className={`mx-auto w-full ${actions.apps.layout.innerMaxWidthClass} gap-0 rounded-2xl border-[#d8d8d8] bg-white py-0 shadow-[0_22px_52px_rgba(17,17,17,0.12)]`}
      >
        <CardContent className="space-y-3 p-4 sm:p-5">
          {actions.apps.oauthStatus === "connected" && oauthConnectedAppLabel ? (
            <Alert className="omicron-notice rounded-xl">
              <AlertDescription>
                {oauthConnectedAppLabel} connected successfully.
              </AlertDescription>
            </Alert>
          ) : null}

          {actions.apps.oauthStatus === "error" ? (
            <Alert variant="destructive" className="rounded-xl border-rose-200 bg-rose-50">
              <AlertTitle>OAuth connection failed</AlertTitle>
              <AlertDescription>
                {actions.apps.oauthDetail || "Unable to complete OAuth connection."}
              </AlertDescription>
            </Alert>
          ) : null}

          {actions.apps.error ? (
            <Alert variant="destructive" className="rounded-xl border-rose-200 bg-rose-50">
              <AlertTitle>Unable to load supported apps</AlertTitle>
              <AlertDescription>{actions.apps.error}</AlertDescription>
            </Alert>
          ) : null}

          {actions.apps.connectError ? (
            <Alert variant="destructive" className="rounded-xl border-rose-200 bg-rose-50">
              <AlertTitle>Could not continue</AlertTitle>
              <AlertDescription>{actions.apps.connectError}</AlertDescription>
            </Alert>
          ) : null}

          {actions.apps.isLoading ? (
            <div className={`grid gap-2.5 ${actions.apps.layout.gridClass}`}>
              {Array.from({ length: 4 }).map((_, index) => (
                <Button
                  key={`supported-app-placeholder-${index}`}
                  type="button"
                  variant="outline"
                  disabled
                  className="h-10 w-full justify-between rounded-xl border-[#d2d2d2] text-[#8e8e8e]"
                >
                  Loading...
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ))}
            </div>
          ) : (
            <div
              className={`${showScrollableApps ? "max-h-[18.5rem] overflow-y-auto pr-1" : ""} grid gap-2.5 ${actions.apps.layout.gridClass}`}
            >
              {actions.apps.items.map((app) => {
                const normalizedId = app.id.trim().toLowerCase();
                const isBrowser = normalizedId === "browser";
                const isConnected = isBrowser
                  ? actions.apps.browserCredentialSavedCount > 0
                  : actions.apps.connectedProviderAppIds.includes(normalizedId);

                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => actions.apps.onOpenApp(app)}
                    className="group flex min-h-[4rem] w-full items-center gap-3 rounded-xl border border-[#d2d2d2] bg-[#f6f6f3] px-3 py-2.5 text-left transition hover:bg-[#f1f1ee]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8d8d8] bg-white">
                      <img
                        src={resolveSupportedAppLogo(app)}
                        alt={`${app.display_name} logo`}
                        className="h-5 w-5 object-contain"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = DEFAULT_SUPPORTED_APP_LOGO;
                        }}
                      />
                    </span>

                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-sm font-semibold leading-tight text-[#1d1d1f]">
                        {app.display_name}
                      </span>
                      <span className="block text-xs leading-snug text-[#6e6e6e]">
                        {app.description}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-2">
                      {isConnected ? (
                        <span className="rounded-full border border-[#d2d2d2] bg-[#f5f5f2] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#3a3a3a]">
                          Connected
                        </span>
                      ) : null}
                      <span className="text-[#8e8e8e] transition group-hover:text-[#4f4f4f]">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {actions.apps.error ? (
            <Button
              type="button"
              variant="outline"
              onClick={actions.apps.onRetry}
              className="h-10 w-full rounded-xl border-[#d2d2d2] text-[#1d1d1f]"
            >
              Retry loading apps
            </Button>
          ) : null}

          <p className="text-sm text-[#6e6e6e]">
            {actions.apps.isLoading
              ? "Loading supported apps for your workspace."
              : `Showing ${totalSupportedApps} supported app${
                  totalSupportedApps === 1 ? "" : "s"
                } on Omicron.`}
          </p>

          <Button
            type="button"
            onClick={actions.onNext}
            disabled={actions.apps.isCompletingOnboarding}
            className="omicron-cta h-10 w-full rounded-xl"
          >
            {actions.apps.isCompletingOnboarding ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              "Continue"
            )}
          </Button>
        </CardContent>

        <Dialog
          open={Boolean(selectedApp)}
          onOpenChange={(open) => {
            if (!open) {
              actions.apps.onCloseApp();
            }
          }}
        >
          <DialogContent
            className={`${selectedAppIsBrowser ? "max-w-3xl" : "max-w-md"} rounded-2xl border-[#d8d8d8] bg-white p-5 shadow-[0_34px_88px_rgba(17,17,17,0.12)]`}
          >
            {selectedApp ? (
              <div className="space-y-5">
                <DialogHeader className="gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[#d8d8d8] bg-white">
                      <img
                        src={resolveSupportedAppLogo(selectedApp)}
                        alt={`${selectedApp.display_name} logo`}
                        className="h-6 w-6 object-contain"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = DEFAULT_SUPPORTED_APP_LOGO;
                        }}
                      />
                    </span>
                    <div className="space-y-1">
                      <DialogTitle className="text-xl text-[#1d1d1f] font-[var(--font-display)]">
                        {selectedApp.display_name}
                      </DialogTitle>
                      <DialogDescription className="text-xs uppercase tracking-[0.12em] text-[#8e8e8e]">
                        {selectedApp.category}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <p className="text-sm leading-relaxed text-[#6e6e6e]">
                  {selectedApp.description}
                </p>

                {selectedAppIsBrowser ? (
                  <div className="space-y-4">
                    {actions.apps.browserCredentialFormError ? (
                      <Alert variant="destructive" className="rounded-xl border-rose-200 bg-rose-50">
                        <AlertDescription>
                          {actions.apps.browserCredentialFormError}
                        </AlertDescription>
                      </Alert>
                    ) : null}

                    {actions.apps.browserCredentialNotice ? (
                      <Alert className="omicron-notice rounded-xl">
                        <AlertDescription>
                          {actions.apps.browserCredentialNotice}
                        </AlertDescription>
                      </Alert>
                    ) : null}

                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#1d1d1f]">
                        Website credentials
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={actions.apps.onAddBrowserCredentialDraft}
                        className="h-8 w-8 rounded-full border-[#d2d2d2] p-0"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="max-h-[19rem] space-y-3 overflow-y-auto pr-1">
                      {actions.apps.browserCredentialDrafts.map((draft, index) => {
                        const rowErrors = actions.apps.browserCredentialDraftErrors[index] ?? {};

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
                                      actions.apps.onChangeBrowserCredentialDraft(
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
                                  onClick={() =>
                                    actions.apps.onRemoveBrowserCredentialDraft(index)
                                  }
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
                                      actions.apps.onChangeBrowserCredentialDraft(
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
                                      actions.apps.onChangeBrowserCredentialDraft(
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

                    {actions.apps.savedBrowserCredentials.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium tracking-[0.06em] text-[#7b7b7b] uppercase">
                          Saved websites
                        </p>
                        <div className="max-h-[8.5rem] space-y-2 overflow-y-auto pr-1">
                          {actions.apps.savedBrowserCredentials.map((credential) => (
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
                                  {credential.usernameMasked}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <DialogFooter className="sm:justify-between">
                      <span className="text-xs text-[#8e8e8e]">
                        {actions.apps.browserCredentialSavedCount > 0
                          ? `${actions.apps.browserCredentialSavedCount} website credential${
                              actions.apps.browserCredentialSavedCount === 1 ? "" : "s"
                            } saved.`
                          : "Add websites for browser automation."}
                      </span>
                      <Button
                        type="button"
                        onClick={actions.apps.onSaveBrowserCredentials}
                        disabled={actions.apps.isSavingBrowserCredentials}
                        className="h-9 rounded-full px-5"
                      >
                        {actions.apps.isSavingBrowserCredentials ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          "Save websites"
                        )}
                      </Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <DialogFooter className="sm:justify-between">
                    <span className="text-xs text-[#8e8e8e]">
                      {selectedAppConnected
                        ? "This app is already connected."
                        : selectedApp.runtime_available
                          ? selectedApp.requires_user_connection
                            ? "OAuth is required to connect."
                            : "No account connection required."
                          : "This app is currently offline."}
                    </span>
                    <Button
                      type="button"
                      onClick={() => actions.apps.onConnect(selectedApp)}
                      disabled={!selectedAppConnectable || selectedAppConnecting}
                      className="h-9 rounded-full px-5"
                    >
                      {selectedAppActionLabel}
                    </Button>
                  </DialogFooter>
                )}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  return null;
};

export function OnboardingWizardShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authErrors, setAuthErrors] = useState<AuthFormErrors>({});
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [profileValues, setProfileValues] = useState<ProfileFormValues>({
    name: "",
    city: "",
    age: "",
    gender: "",
  });
  const [profileErrors, setProfileErrors] = useState<ProfileFormErrors>({});
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);
  const [supportedApps, setSupportedApps] = useState<SupportedAppSummary[]>([]);
  const [isSupportedAppsLoading, setIsSupportedAppsLoading] = useState(false);
  const [supportedAppsError, setSupportedAppsError] = useState<string | null>(null);
  const [supportedAppsConnectError, setSupportedAppsConnectError] = useState<
    string | null
  >(null);
  const [persistedConnectedProviderAppIds, setPersistedConnectedProviderAppIds] =
    useState<string[]>([]);
  const [connectingSupportedAppId, setConnectingSupportedAppId] = useState<
    string | null
  >(null);
  const [selectedSupportedApp, setSelectedSupportedApp] =
    useState<SupportedAppSummary | null>(null);
  const [browserCredentialDrafts, setBrowserCredentialDrafts] = useState<
    BrowserCredentialDraft[]
  >([createEmptyBrowserCredentialDraft()]);
  const [browserCredentialDraftErrors, setBrowserCredentialDraftErrors] = useState<
    BrowserCredentialDraftErrors[]
  >([]);
  const [browserCredentialFormError, setBrowserCredentialFormError] = useState<
    string | null
  >(null);
  const [browserCredentialNotice, setBrowserCredentialNotice] = useState<
    string | null
  >(null);
  const [savedBrowserCredentials, setSavedBrowserCredentials] = useState<
    SavedBrowserCredential[]
  >([]);
  const [isSavingBrowserCredentials, setIsSavingBrowserCredentials] =
    useState(false);
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);
  const [hasLoadedSupportedApps, setHasLoadedSupportedApps] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<
    "forward" | "backward"
  >("forward");
  const onboardingBootstrapRef = useRef(false);

  const activeStep = useMemo(
    () => clampStep(Number(searchParams.get("step") ?? "1")),
    [searchParams]
  );

  const currentStep = ONBOARDING_STEPS.find((step) => step.id === activeStep);
  const isLastStep = activeStep >= ONBOARDING_STEPS.length;
  const isSignupStep = activeStep === 1;
  const requestedAuthMode = searchParams.get("mode");
  const oauthProvider = searchParams.get("provider");
  const oauthStatus = searchParams.get("status");
  const oauthDetail = searchParams.get("detail");
  const callbackConnectedProviderAppId = useMemo(() => {
    if ((oauthStatus ?? "").trim().toLowerCase() !== "connected") return null;
    return resolveConnectedProviderAppId(oauthProvider);
  }, [oauthProvider, oauthStatus]);
  const connectedProviderAppIds = useMemo(() => {
    const normalized = new Set<string>(persistedConnectedProviderAppIds);
    if (callbackConnectedProviderAppId) {
      normalized.add(callbackConnectedProviderAppId);
    }
    return Array.from(normalized);
  }, [callbackConnectedProviderAppId, persistedConnectedProviderAppIds]);
  const browserCredentialSavedCount = savedBrowserCredentials.length;
  const supportedAppsCountForSizing =
    supportedApps.length > 0 ? supportedApps.length : isSupportedAppsLoading ? 4 : 3;
  const supportedAppsLayout = getSupportedAppsLayout(supportedAppsCountForSizing);

  const setStep = useCallback((step: number) => {
    const nextStep = clampStep(step);
    if (nextStep !== activeStep) {
      setTransitionDirection(nextStep > activeStep ? "forward" : "backward");
    }
    const params = new URLSearchParams(searchParams.toString());

    if (nextStep === 1) {
      params.delete("step");
    } else {
      params.set("step", String(nextStep));
      params.delete("mode");
    }

    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    router.replace(href, { scroll: false });
  }, [activeStep, pathname, router, searchParams]);

  const fetchOnboardingState = useCallback(
    async (accessToken: string): Promise<OnboardingStateSnapshot> => {
      const response = await fetch(buildOnboardingApiUrl("/onboarding/state"), {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const payload = (await response.json()) as {
        is_complete?: unknown;
        current_step?: unknown;
        profile?: {
          name?: unknown;
          city?: unknown;
          age?: unknown;
          gender?: unknown;
        } | null;
        connections?: {
          gmail?: unknown;
          google_drive?: unknown;
          whatsapp?: unknown;
          connected_app_ids?: unknown;
        };
        website_credentials?: unknown;
        requirements?: {
          profile_complete?: unknown;
          app_connected?: unknown;
          browser_credentials_added?: unknown;
        };
      };

      const profilePayload = payload.profile;
      let parsedProfileAge: number | null = null;
      if (
        profilePayload &&
        typeof profilePayload === "object" &&
        typeof profilePayload.age === "number" &&
        Number.isInteger(profilePayload.age)
      ) {
        parsedProfileAge = profilePayload.age;
      } else if (
        profilePayload &&
        typeof profilePayload === "object" &&
        typeof profilePayload.age === "string"
      ) {
        const parsedAge = Number(profilePayload.age);
        if (Number.isInteger(parsedAge)) {
          parsedProfileAge = parsedAge;
        }
      }
      const profile =
        profilePayload && typeof profilePayload === "object"
          ? {
              name:
                typeof profilePayload.name === "string"
                  ? profilePayload.name
                  : "",
              city:
                typeof profilePayload.city === "string"
                  ? profilePayload.city
                  : null,
              age: parsedProfileAge,
              gender:
                typeof profilePayload.gender === "string"
                  ? profilePayload.gender
                  : null,
            }
          : null;

      const connectedProviderAppIds = new Set<string>();
      if (payload.connections && typeof payload.connections === "object") {
        const connectionIds = Array.isArray(payload.connections.connected_app_ids)
          ? payload.connections.connected_app_ids
          : [];

        for (const rawId of connectionIds) {
          if (typeof rawId !== "string") continue;
          const normalizedRaw = rawId.trim().toLowerCase();
          if (!normalizedRaw) continue;
          const normalizedProvider =
            resolveConnectedProviderAppId(normalizedRaw) ?? normalizedRaw;
          connectedProviderAppIds.add(normalizedProvider);
        }

        if (connectedProviderAppIds.size === 0) {
          if (Boolean(payload.connections.gmail)) {
            connectedProviderAppIds.add("gmail");
          }
          if (Boolean(payload.connections.google_drive)) {
            connectedProviderAppIds.add("drive");
          }
          if (Boolean(payload.connections.whatsapp)) {
            connectedProviderAppIds.add("whatsapp");
          }
        }
      }

      const websiteCredentials: SavedBrowserCredential[] = [];
      if (Array.isArray(payload.website_credentials)) {
        for (const credential of payload.website_credentials) {
          const parsedCredential = parseSavedBrowserCredential(credential);
          if (!parsedCredential) continue;
          websiteCredentials.push(parsedCredential);
        }
      }

      return {
        isComplete: Boolean(payload.is_complete),
        resumeStep: resolveResumeStep(payload.current_step),
        profile,
        connectedProviderAppIds: Array.from(connectedProviderAppIds),
        websiteCredentials,
        requirements: {
          profileComplete: Boolean(payload.requirements?.profile_complete),
          appConnected: Boolean(payload.requirements?.app_connected),
          browserCredentialsAdded: Boolean(
            payload.requirements?.browser_credentials_added
          ),
        },
      };
    },
    []
  );

  const hydrateOnboardingState = useCallback((state: OnboardingStateSnapshot) => {
    setProfileValues({
      name: state.profile?.name ?? "",
      city: state.profile?.city ?? "",
      age:
        typeof state.profile?.age === "number" ? String(state.profile.age) : "",
      gender: state.profile?.gender ?? "",
    });
    setPersistedConnectedProviderAppIds(state.connectedProviderAppIds);
    setSavedBrowserCredentials(state.websiteCredentials);
  }, []);

  const routeFromOnboardingState = useCallback(
    async (accessToken: string, navigation: "push" | "replace" = "replace") => {
      const state = await fetchOnboardingState(accessToken);
      hydrateOnboardingState(state);
      if (state.isComplete) {
        if (navigation === "push") {
          router.push("/chat");
        } else {
          router.replace("/chat");
        }
        router.refresh();
        return;
      }

      setStep(state.resumeStep);
    },
    [fetchOnboardingState, hydrateOnboardingState, router, setStep]
  );

  const clearRequestedMode = useCallback(() => {
    if (!searchParams.has("mode")) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("mode");

    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    router.replace(href, { scroll: false });
  }, [pathname, router, searchParams]);

  const goToPreviousStep = useCallback(() => {
    if (activeStep <= 1) {
      router.push("/");
      return;
    }
    setStep(activeStep - 1);
  }, [activeStep, router, setStep]);

  const goToNextStep = async () => {
    if (!isLastStep) {
      setStep(activeStep + 1);
      return;
    }

    setSupportedAppsConnectError(null);
    setIsCompletingOnboarding(true);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setSupportedAppsConnectError(error.message);
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setSupportedAppsConnectError(
          "Session expired. Sign in again to continue."
        );
        return;
      }

      const state = await fetchOnboardingState(accessToken);
      if (!state.requirements.profileComplete) {
        setSupportedAppsConnectError("Complete your profile before continuing.");
        setStep(2);
        return;
      }

      if (
        !state.requirements.appConnected &&
        !state.requirements.browserCredentialsAdded
      ) {
        setSupportedAppsConnectError(
          "Connect at least one app and save at least one website credential to continue."
        );
        return;
      }

      if (!state.requirements.appConnected) {
        setSupportedAppsConnectError(
          "Connect at least one app before continuing."
        );
        return;
      }

      if (!state.requirements.browserCredentialsAdded) {
        setSupportedAppsConnectError(
          "Save at least one website credential before continuing."
        );
        return;
      }

      const response = await fetch(buildOnboardingApiUrl("/onboarding/complete"), {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const message = await extractErrorMessage(response);
        setSupportedAppsConnectError(message);
        return;
      }

      router.push("/chat");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to complete onboarding right now.";
      setSupportedAppsConnectError(message);
    } finally {
      setIsCompletingOnboarding(false);
    }
  };

  const stepTransitionClass =
    transitionDirection === "forward"
      ? "animate-step-in-forward"
      : "animate-step-in-backward";

  const handleProfileFieldChange = (
    field: keyof ProfileFormValues,
    value: string
  ) => {
    setProfileValues((prev) => ({ ...prev, [field]: value }));
    setProfileErrors((prev) => ({ ...prev, [field]: undefined, form: undefined }));
    setProfileNotice(null);
  };

  const handleAuthModeChange = (nextMode: AuthMode) => {
    if (nextMode === authMode) return;
    setAuthMode(nextMode);
    setAuthPassword("");
    setAuthErrors({});
    setAuthNotice(null);
    clearRequestedMode();
  };

  const handleOpenSupportedApp = (app: SupportedAppSummary) => {
    setSelectedSupportedApp(app);
    setSupportedAppsConnectError(null);
    if (app.id.trim().toLowerCase() === "browser") {
      setBrowserCredentialFormError(null);
      setBrowserCredentialNotice(null);
      if (browserCredentialDrafts.length === 0) {
        setBrowserCredentialDrafts([createEmptyBrowserCredentialDraft()]);
      }
    }
  };

  const handleCloseSupportedAppDialog = () => {
    setSelectedSupportedApp(null);
  };

  const loadSupportedApps = useCallback(async () => {
    setIsSupportedAppsLoading(true);
    setSupportedAppsError(null);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setSupportedAppsError("Unable to validate your session right now.");
        return;
      }
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setSupportedAppsError("Session expired. Sign in again to continue.");
        return;
      }

      const response = await fetch(buildOnboardingApiUrl("/apps/supported"), {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const message = await extractErrorMessage(response);
        setSupportedAppsError(message);
        return;
      }

      const payload = (await response.json()) as { apps?: unknown };
      const rawApps = Array.isArray(payload.apps) ? payload.apps : [];
      const normalizedApps: SupportedAppSummary[] = [];

      for (const rawApp of rawApps) {
        if (!rawApp || typeof rawApp !== "object") continue;

        const app = rawApp as Record<string, unknown>;
        const id = typeof app.id === "string" ? app.id : "";
        const displayName =
          typeof app.display_name === "string" ? app.display_name : "";
        if (!id || !displayName) continue;
        if (id.trim().toLowerCase() === "whatsapp") continue;

        normalizedApps.push({
          id,
          display_name: displayName,
          description:
            typeof app.description === "string" ? app.description : "",
          category: typeof app.category === "string" ? app.category : "integration",
          requires_user_connection: Boolean(app.requires_user_connection),
          runtime_available: Boolean(app.runtime_available),
        });
      }

      setSupportedApps(normalizedApps);
      setHasLoadedSupportedApps(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load supported apps right now.";
      setSupportedAppsError(message);
    } finally {
      setIsSupportedAppsLoading(false);
    }
  }, []);

  const loadSavedBrowserCredentials = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) return;
      const accessToken = data.session?.access_token;
      if (!accessToken) return;

      const response = await fetch(
        buildOnboardingApiUrl("/onboarding/browser-credentials"),
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
      const savedCredentials: SavedBrowserCredential[] = [];
      if (Array.isArray(payload.credentials)) {
        for (const credential of payload.credentials) {
          const parsedCredential = parseSavedBrowserCredential(credential);
          if (!parsedCredential) continue;
          savedCredentials.push(parsedCredential);
        }
      }
      setSavedBrowserCredentials(savedCredentials);
    } catch {
      // Keep UI usable even if credential lookup fails.
    }
  }, []);

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
      if (prev.length <= 1) {
        return [];
      }
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

    setBrowserCredentialDraftErrors(
      browserCredentialDrafts.map(() => ({}))
    );
    setBrowserCredentialFormError(null);
    setIsSavingBrowserCredentials(true);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setBrowserCredentialFormError(error.message);
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setBrowserCredentialFormError(
          "Session expired. Sign in again to continue."
        );
        return;
      }

      for (const draft of browserCredentialDrafts) {
        const websiteUrl = draft.websiteUrl.trim();
        const response = await fetch(
          buildOnboardingApiUrl("/onboarding/browser-credentials"),
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
      setBrowserCredentialDrafts([createEmptyBrowserCredentialDraft()]);
      setBrowserCredentialDraftErrors([]);
      setBrowserCredentialNotice(
        `Saved ${browserCredentialDrafts.length} website credential${
          browserCredentialDrafts.length === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save browser credentials.";
      setBrowserCredentialFormError(message);
    } finally {
      setIsSavingBrowserCredentials(false);
    }
  }, [browserCredentialDrafts, loadSavedBrowserCredentials]);

  const handleConnectSupportedApp = useCallback(
    async (app: SupportedAppSummary) => {
      if (!app.requires_user_connection) return;
      if (!app.runtime_available) {
        setSupportedAppsConnectError(`${app.display_name} is currently offline.`);
        return;
      }

      const connectConfig = resolveSupportedAppOAuthConfig(app);
      if (!connectConfig) {
        setSupportedAppsConnectError(
          `OAuth connect is not configured for ${app.display_name}.`
        );
        return;
      }

      setSupportedAppsConnectError(null);
      setConnectingSupportedAppId(app.id);

      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          throw new Error(error.message);
        }

        const accessToken = data.session?.access_token;
        if (!accessToken) {
          throw new Error("Session expired. Sign in again to continue.");
        }

        const startUrl = new URL(buildOnboardingApiUrl(connectConfig.startPath));
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

        const redirectTo = (url?: string | null) => {
          if (!url) return false;
          localStorage.setItem(connectConfig.pendingKey, "true");
          window.location.href = url;
          return true;
        };

        let dataPayload: Record<string, unknown> | null = null;
        try {
          dataPayload = (await response.json()) as Record<string, unknown>;
        } catch {
          const text = await response.text();
          if (redirectTo(text.match(/https?:\/\/[^\s"]+/)?.[0])) return;
        }

        const redirectUrl =
          (dataPayload?.authorization_url as string | undefined) ??
          (dataPayload?.authorizationUrl as string | undefined) ??
          (dataPayload?.authUrl as string | undefined) ??
          (dataPayload?.redirectUrl as string | undefined) ??
          (dataPayload?.url as string | undefined) ??
          (dataPayload?.location as string | undefined);

        if (redirectTo(redirectUrl)) return;

        throw new Error(`Unable to start ${app.display_name} connection.`);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Unable to start ${app.display_name} connection.`;
        setSupportedAppsConnectError(message);
      } finally {
        setConnectingSupportedAppId(null);
      }
    },
    []
  );

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthNotice(null);

    const nextErrors: AuthFormErrors = {};
    const trimmedEmail = authEmail.trim();
    const isSignUpMode = authMode === "sign-up";

    if (!trimmedEmail) {
      nextErrors.email = "Enter your email.";
    } else if (!emailPattern.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!authPassword) {
      nextErrors.password = isSignUpMode
        ? "Create a password with at least 8 characters."
        : "Enter your password.";
    } else if (isSignUpMode && authPassword.length < 8) {
      nextErrors.password = "Use at least 8 characters.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setAuthErrors(nextErrors);
      return;
    }

    setIsAuthSubmitting(true);
    setAuthErrors({});

    try {
      const supabase = getSupabaseClient();

      if (isSignUpMode) {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: authPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding?step=2`,
          },
        });

        const existingAccount = isExistingAccountSignUpOutcome({
          error,
          user: data.user,
          hasSession: Boolean(data.session),
        });
        if (existingAccount) {
          setAuthMode("sign-in");
          setAuthErrors({});
          setAuthNotice("This account already exists. Sign in to continue.");
          return;
        }

        if (error) {
          setAuthErrors({ form: error.message });
          return;
        }

        if (data.session) {
          await routeFromOnboardingState(data.session.access_token, "push");
          return;
        }

        setAuthMode("sign-in");
        setAuthNotice("Confirm your email, then sign in to continue onboarding.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: authPassword,
      });

      if (error) {
        setAuthErrors({ form: error.message });
        return;
      }

      if (!data.session) {
        setAuthErrors({ form: "Unable to start a session. Try again." });
        return;
      }

      await routeFromOnboardingState(data.session.access_token, "push");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to connect to Supabase.";
      setAuthErrors({ form: message });
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileNotice(null);

    const nextErrors: ProfileFormErrors = {};
    const trimmedName = profileValues.name.trim();
    const trimmedCity = profileValues.city.trim();
    const trimmedAge = profileValues.age.trim();
    const trimmedGender = profileValues.gender.trim();

    if (!trimmedName) {
      nextErrors.name = "Enter your name.";
    }

    if (!trimmedCity) {
      nextErrors.city = "Enter your city.";
    }

    let parsedAge: number | null = null;
    if (!trimmedAge) {
      nextErrors.age = "Enter your age.";
    } else {
      const value = Number(trimmedAge);
      if (!Number.isInteger(value)) {
        nextErrors.age = "Enter a whole number.";
      } else if (value < 13 || value > 120) {
        nextErrors.age = "Age must be between 13 and 120.";
      } else {
        parsedAge = value;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setProfileErrors(nextErrors);
      return;
    }

    setProfileErrors({});
    setIsProfileSubmitting(true);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setProfileErrors({ form: error.message });
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setProfileErrors({ form: "Session expired. Sign in again to continue." });
        return;
      }

      const response = await fetch(buildOnboardingApiUrl("/onboarding/profile"), {
        method: "PUT",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          city: trimmedCity || null,
          age: parsedAge,
          gender: trimmedGender || null,
        }),
      });

      if (!response.ok) {
        const message = await extractErrorMessage(response);
        setProfileErrors({ form: message });
        return;
      }

      setProfileNotice("Profile saved.");
      goToNextStep();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save your profile right now.";
      setProfileErrors({ form: message });
    } finally {
      setIsProfileSubmitting(false);
    }
  };

  useEffect(() => {
    if (requestedAuthMode !== "sign-in" && requestedAuthMode !== "sign-up") {
      return;
    }
    if (requestedAuthMode === authMode) return;

    setAuthMode(requestedAuthMode);
    setAuthErrors({});
    setAuthNotice(null);
    setAuthPassword("");
  }, [requestedAuthMode]);

  useEffect(() => {
    if (onboardingBootstrapRef.current) return;
    onboardingBootstrapRef.current = true;

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const syncFromSession = async (session: Session | null) => {
      if (!isMounted) return;

      if (!session) {
        setProfileValues({
          name: "",
          city: "",
          age: "",
          gender: "",
        });
        setPersistedConnectedProviderAppIds([]);
        setSavedBrowserCredentials([]);
        setBrowserCredentialDrafts([createEmptyBrowserCredentialDraft()]);
        setBrowserCredentialDraftErrors([]);
        setSelectedSupportedApp(null);
        if (activeStep !== 1) {
          setStep(1);
        }
        return;
      }

      try {
        await routeFromOnboardingState(session.access_token, "replace");
      } catch (error) {
        if (!isMounted) return;

        const message =
          error instanceof Error
            ? error.message
            : "Unable to load onboarding state.";
        if (activeStep === 1) {
          setAuthErrors({ form: message });
        } else {
          setSupportedAppsConnectError(message);
        }
      }
    };

    const init = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          setAuthErrors({ form: error.message });
        }

        await syncFromSession(data.session ?? null);

        const { data: listener } = supabase.auth.onAuthStateChange(
          (event, nextSession) => {
            if (event === "TOKEN_REFRESHED") {
              return;
            }
            void syncFromSession(nextSession ?? null);
          }
        );
        unsubscribe = () => listener.subscription.unsubscribe();
      } catch (error) {
        if (!isMounted) return;

        const message =
          error instanceof Error
            ? error.message
            : "Unable to resolve onboarding state.";
        setAuthErrors({ form: message });
      }
    };

    void init();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [activeStep, routeFromOnboardingState, setStep]);

  useEffect(() => {
    if (activeStep !== 3) return;
    void loadSavedBrowserCredentials();

    if (!hasLoadedSupportedApps && !isSupportedAppsLoading && !supportedAppsError) {
      void loadSupportedApps();
    }
  }, [
    activeStep,
    hasLoadedSupportedApps,
    isSupportedAppsLoading,
    supportedAppsError,
    loadSupportedApps,
    loadSavedBrowserCredentials,
  ]);

  useEffect(() => {
    if (activeStep !== 3) {
      setSelectedSupportedApp(null);
      return;
    }
    setSupportedAppsConnectError(null);
  }, [activeStep, oauthProvider, oauthStatus, oauthDetail]);

  return (
    <div className="omicron-canvas">
      {isSignupStep ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[52%] lg:block">
          <div className="absolute inset-0 omicron-split-gradient" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.48),transparent_42%),radial-gradient(circle_at_82%_76%,rgba(174,174,170,0.2),transparent_46%)]" />
        </div>
      ) : (
        <div className="omicron-canvas-overlay">
          <div className="absolute inset-0 omicron-canvas-gradient" />
          <div className="pointer-events-none absolute inset-0 flowing-dots-bg opacity-70" />
        </div>
      )}

      <div
        className={`relative z-10 ${
          isSignupStep
            ? "grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]"
            : "flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-10"
        }`}
      >
        {isSignupStep ? (
          <section className="hidden px-8 py-10 text-[#1d1d1f] lg:flex lg:flex-col lg:justify-between xl:px-14">
            <div>
              <Badge className="rounded-full border border-[#d2d2d2] bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[#6e6e6e] shadow-none">
                Omicron
              </Badge>
              <h1 className="mt-7 max-w-xl text-5xl leading-tight font-[var(--font-display)]">
                Stay ahead on what matters most.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#6e6e6e]">
                Onboarding is designed to be fast, clear, and delightful. Users set
                up once and start getting value right away.
              </p>
              <div className="mt-10 space-y-4">
                {LEFT_FEATURES.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Card
                      key={item.text}
                      className="gap-0 rounded-2xl border-[#d8d8d8] bg-white/72 py-0 shadow-[0_14px_30px_rgba(17,17,17,0.1)] backdrop-blur"
                    >
                      <CardContent className="flex items-center gap-3 px-4 py-3">
                        <span className="rounded-full border border-[#d8d8d8] bg-[#f5f5f5] p-2">
                          <Icon className="h-4 w-4 text-[#6e6e6e]" />
                        </span>
                        <p className="text-sm text-[#3a3a3a]">{item.text}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-fit rounded-full px-0 text-sm text-[#6e6e6e] hover:bg-transparent hover:text-[#1d1d1f]"
            >
              Learn more about Omicron
              <ChevronRight className="h-4 w-4" />
            </Button>
          </section>
        ) : null}

        <section
          className={
            isSignupStep
              ? "flex min-h-screen items-center justify-center px-4 py-6 sm:px-8 lg:px-10"
              : "w-full max-w-[36rem]"
          }
        >
          <Tabs
            value={String(activeStep)}
            onValueChange={(value) => setStep(Number(value))}
            className={`w-full ${isSignupStep ? "max-w-[28rem]" : "max-w-[36rem]"}`}
          >
            {ONBOARDING_STEPS.map((step) => {
              const previousStepLabel =
                step.id === 1
                  ? "Home"
                  : ONBOARDING_STEPS.find((candidate) => candidate.id === step.id - 1)
                      ?.label ?? "Back";

              if (step.id === 1) {
                return (
                  <TabsContent key={step.id} value={String(step.id)}>
                    <div className={`space-y-3 ${stepTransitionClass}`}>
                      {renderAuthSurface({
                        mode: authMode,
                        email: authEmail,
                        password: authPassword,
                        remember,
                        isSubmitting: isAuthSubmitting,
                        errors: authErrors,
                        notice: authNotice,
                        onModeChange: handleAuthModeChange,
                        onEmailChange: setAuthEmail,
                        onPasswordChange: setAuthPassword,
                        onRememberChange: () => setRemember((prev) => !prev),
                        onSubmit: handleAuthSubmit,
                      })}
                      <p className="px-1 text-xs leading-relaxed text-[#8e8e8e]">
                        By continuing, you agree to the Omicron terms and acknowledge
                        the privacy policy.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={goToPreviousStep}
                        className="h-9 rounded-full px-2 text-sm text-[#6e6e6e] hover:bg-[#f3f3f1] hover:text-[#1d1d1f]"
                      >
                        <ChevronLeft className="mr-0.5 h-4 w-4" />
                        {previousStepLabel}
                      </Button>
                    </div>
                  </TabsContent>
                );
              }

              const Icon = step.icon;
              const isProfileStep = step.id === 2;
              const isAppsStep = step.id === 3;
              const isCompactFormStep = isProfileStep || isAppsStep;
              const compactOuterWidthClass = isProfileStep
                ? "max-w-[30.75rem]"
                : isAppsStep
                  ? supportedAppsLayout.outerMaxWidthClass
                  : "";
              const compactHeaderWidthClass = isProfileStep
                ? "max-w-[21.5rem]"
                : isAppsStep
                  ? supportedAppsLayout.headerMaxWidthClass
                  : "";

              return (
                <TabsContent key={step.id} value={String(step.id)}>
                  <Card
                    className={`${stepTransitionClass} mx-auto w-full gap-0 rounded-3xl border-[#d8d8d8] bg-white py-0 shadow-[0_34px_88px_rgba(17,17,17,0.12)] ring-1 ring-[#ececec]/90 ${
                      isCompactFormStep ? compactOuterWidthClass : ""
                    }`}
                  >
                    <CardHeader
                      className={`space-y-4 border-b border-[#e0e0e0] text-center ${
                        isCompactFormStep ? "pb-4 pt-4" : "pb-6"
                      }`}
                    >
                      <div
                        className={`flex flex-col items-center ${
                          isCompactFormStep ? "gap-1.5" : "gap-3"
                        }`}
                      >
                        {isProfileStep ? null : (
                          <span className="rounded-2xl border border-[#d8d8d8] bg-[#f5f5f5] p-2">
                            <Icon className="h-5 w-5 text-[#6e6e6e]" />
                          </span>
                        )}
                        <div className={`space-y-2 ${isCompactFormStep ? compactHeaderWidthClass : ""}`}>
                          <CardTitle className="text-2xl text-[#1d1d1f] font-[var(--font-display)]">
                            {step.title}
                          </CardTitle>
                          <CardDescription className="text-sm leading-relaxed text-[#6e6e6e]">
                            {step.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent
                      className={`space-y-4 ${isCompactFormStep ? "pt-4 pb-4" : "pt-6"}`}
                    >
                      {renderStepSurface(step, {
                        onNext: goToNextStep,
                        profile: {
                          values: profileValues,
                          errors: profileErrors,
                          notice: profileNotice,
                          isSubmitting: isProfileSubmitting,
                          onFieldChange: handleProfileFieldChange,
                          onSubmit: handleProfileSubmit,
                        },
                        apps: {
                          items: supportedApps,
                          isLoading: isSupportedAppsLoading,
                          error: supportedAppsError,
                          connectError: supportedAppsConnectError,
                          connectingAppId: connectingSupportedAppId,
                          connectedProviderAppIds,
                          connectedProviderAppId: callbackConnectedProviderAppId,
                          oauthStatus,
                          oauthDetail,
                          selectedApp: selectedSupportedApp,
                          browserCredentialDrafts,
                          browserCredentialDraftErrors,
                          browserCredentialFormError,
                          browserCredentialNotice,
                          savedBrowserCredentials,
                          browserCredentialSavedCount,
                          isSavingBrowserCredentials,
                          isCompletingOnboarding,
                          layout: supportedAppsLayout,
                          onOpenApp: handleOpenSupportedApp,
                          onCloseApp: handleCloseSupportedAppDialog,
                          onConnect: (app) => {
                            void handleConnectSupportedApp(app);
                          },
                          onAddBrowserCredentialDraft: handleAddBrowserCredentialDraft,
                          onRemoveBrowserCredentialDraft:
                            handleRemoveBrowserCredentialDraft,
                          onChangeBrowserCredentialDraft:
                            handleChangeBrowserCredentialDraft,
                          onSaveBrowserCredentials: () => {
                            void handleSaveBrowserCredentials();
                          },
                          onRetry: () => {
                            void loadSupportedApps();
                          },
                        },
                      })}
                    </CardContent>
                  </Card>
                  <div
                    className={`mx-auto mt-3 w-full ${
                      isCompactFormStep ? compactOuterWidthClass : ""
                    }`}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={goToPreviousStep}
                      className="h-9 rounded-full px-2 text-sm text-[#6e6e6e] hover:bg-[#f3f3f1] hover:text-[#1d1d1f]"
                    >
                      <ChevronLeft className="mr-0.5 h-4 w-4" />
                      {previousStepLabel}
                    </Button>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </section>
      </div>

      {currentStep ? (
        <div className="sr-only" aria-live="polite">
          Active onboarding step: {currentStep.title}
        </div>
      ) : null}
    </div>
  );
}
