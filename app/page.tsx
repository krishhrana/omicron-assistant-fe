import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="omicron-canvas">
      <div className="omicron-canvas-overlay">
        <div className="absolute inset-0 omicron-canvas-gradient" />
        <div className="absolute inset-0 flowing-dots-bg opacity-70" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16 sm:px-10">
        <Card className="omicron-surface-xl w-full rounded-3xl py-0">
          <CardContent className="space-y-8 p-8 sm:p-12">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#6e6e6e]">
                Omicron
              </p>
              <h1 className="max-w-2xl text-4xl leading-tight font-[var(--font-display)] sm:text-5xl">
                Everyday agents, thoughtfully simple.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-[#6e6e6e] sm:text-lg">
                Start onboarding when you are ready. We will guide you from sign-in to
                your first connected app.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="omicron-cta h-11 rounded-full px-6 text-sm font-semibold"
              >
                <Link href="/onboarding?step=1&mode=sign-in">Login</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="omicron-secondary h-11 rounded-full px-6 text-sm font-semibold"
              >
                <Link href="/onboarding?step=1&mode=sign-up" className="inline-flex items-center gap-2">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
