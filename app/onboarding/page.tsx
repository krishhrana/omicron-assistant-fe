import { Suspense } from "react";

import { OnboardingWizardShell } from "@/components/onboarding/OnboardingWizardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingPage() {
  return (
    <main>
      <Suspense fallback={<OnboardingLoadingFallback />}>
        <OnboardingWizardShell />
      </Suspense>
    </main>
  );
}

function OnboardingLoadingFallback() {
  return (
    <div className="omicron-canvas">
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[52%] lg:block">
        <div className="absolute inset-0 omicron-split-gradient" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.48),transparent_42%),radial-gradient(circle_at_82%_76%,rgba(174,174,170,0.2),transparent_46%)]" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden lg:block" />
        <div className="flex min-h-screen items-center justify-center px-4 py-6 sm:px-8 lg:px-10">
          <div className="w-full max-w-xl space-y-4">
            <Card className="rounded-3xl border-[#d8d8d8] bg-white/88 py-0 shadow-[0_26px_64px_rgba(17,17,17,0.12)]">
              <CardContent className="space-y-4 p-6">
                <Skeleton className="h-5 w-36 rounded-full" />
                <Skeleton className="h-11 w-full rounded-2xl" />
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-[#d8d8d8] bg-white py-0 shadow-[0_34px_88px_rgba(17,17,17,0.12)] ring-1 ring-[#ececec]/90">
              <CardContent className="space-y-4 p-6">
                <Skeleton className="h-7 w-40 rounded-full" />
                <Skeleton className="h-9 w-3/5 rounded-xl" />
                <Skeleton className="h-4 w-full rounded-xl" />
                <Skeleton className="h-44 w-full rounded-2xl" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-10 w-24 rounded-full" />
                  <Skeleton className="h-10 w-28 rounded-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
