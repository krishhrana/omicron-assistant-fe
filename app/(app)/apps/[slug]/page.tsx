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
        <Card className="omicron-surface-xl flex flex-1 flex-col gap-0 rounded-3xl py-0">
          <CardContent className="flex flex-1 flex-col gap-10 p-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#8e8e8e]">
              <Button
                asChild
                variant="link"
                className="h-auto px-0 text-xs font-semibold uppercase tracking-[0.3em] text-[#8e8e8e] hover:text-[#1d1d1f]"
              >
                <Link href="/apps">Apps</Link>
              </Button>
              <ChevronRight className="h-4 w-4" />
              <span>{app.name}</span>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-[#d2d2d2] bg-white shadow-sm"
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
                  <p className="mt-2 text-sm text-[#7a7a7a]">
                    {app.description}
                  </p>
                </div>
              </div>
              <Button className="omicron-cta h-10 rounded-full px-6 text-sm font-semibold">
                Connect
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {app.examples.map((example, index) => (
                <Card
                  key={`${app.slug}-${example.title}-${index}`}
                  className={cn(
                    "gap-0 rounded-3xl border-[#d8d8d8] bg-gradient-to-br py-0 shadow-[0_20px_60px_rgba(17,17,17,0.12)]",
                    example.surface
                  )}
                >
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#8e8e8e]">
                      Example {index + 1}
                    </CardDescription>
                    <CardTitle className="text-base text-[#1d1d1f]">
                      {example.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-[#6e6e6e]">
                    {example.body}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="max-w-3xl gap-0 rounded-2xl border-[#d8d8d8] py-0 shadow-none">
              <CardContent className="border-t border-[#d8d8d8] pt-6">
                <h2 className="text-lg font-semibold">Information</h2>
                <p className="mt-3 text-sm text-[#6e6e6e]">{app.longDescription}</p>
                <div className="mt-6 grid gap-3 text-sm text-[#7a7a7a]">
                  <div className="flex items-center justify-between border-b border-[#d8d8d8] pb-2">
                    <span>Data access</span>
                    <span className="text-[#3a3a3a]">Read & write</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#d8d8d8] pb-2">
                    <span>Setup time</span>
                    <span className="text-[#3a3a3a]">2-3 minutes</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#d8d8d8] pb-2">
                    <span>Permissions</span>
                    <span className="text-[#3a3a3a]">Admin approved</span>
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
