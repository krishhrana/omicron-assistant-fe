import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { APPS, getAppBySlug } from "@/components/apps/app-data";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OmicronBackdrop } from "@/components/layout/OmicronBackdrop";
import { cn } from "@/lib/utils";

export default function AppDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const app = getAppBySlug(params.slug);

  if (!app) {
    notFound();
  }

  return (
    <OmicronBackdrop>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6">
        <Card className="flex flex-1 flex-col gap-0 rounded-3xl border-white/60 bg-white/80 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <CardContent className="flex flex-1 flex-col gap-10 p-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              <Button
                asChild
                variant="link"
                className="h-auto px-0 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 hover:text-slate-900"
              >
                <Link href="/apps">Apps</Link>
              </Button>
              <ChevronRight className="h-4 w-4" />
              <span>{app.name}</span>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"
                  style={{ backgroundColor: app.logoBg }}
                >
                  <Image
                    src={app.logo}
                    alt={`${app.name} logo`}
                    width={32}
                    height={32}
                    className="h-8 w-8 object-contain"
                  />
                </span>
                <div>
                  <h1 className="text-3xl font-semibold sm:text-4xl font-[var(--font-display)]">
                    {app.name}
                  </h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {app.description}
                  </p>
                </div>
              </div>
              <Button className="h-10 rounded-full px-6 text-sm font-semibold">
                Connect
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {app.examples.map((example, index) => (
                <Card
                  key={`${app.slug}-${example.title}-${index}`}
                  className={cn(
                    "gap-0 rounded-3xl border-slate-200/70 bg-gradient-to-br py-0 shadow-[0_20px_60px_rgba(15,23,42,0.12)]",
                    example.surface
                  )}
                >
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Example {index + 1}
                    </CardDescription>
                    <CardTitle className="text-base text-slate-900">
                      {example.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-slate-600">
                    {example.body}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="max-w-3xl gap-0 rounded-2xl border-slate-200/70 py-0 shadow-none">
              <CardContent className="border-t border-slate-200/70 pt-6">
                <h2 className="text-lg font-semibold">Information</h2>
                <p className="mt-3 text-sm text-slate-600">{app.longDescription}</p>
                <div className="mt-6 grid gap-3 text-sm text-slate-500">
                  <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                    <span>Data access</span>
                    <span className="text-slate-700">Read & write</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                    <span>Setup time</span>
                    <span className="text-slate-700">2-3 minutes</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                    <span>Permissions</span>
                    <span className="text-slate-700">Admin approved</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </OmicronBackdrop>
  );
}

export function generateStaticParams() {
  return APPS.map((app) => ({ slug: app.slug }));
}
