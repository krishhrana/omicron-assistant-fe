import Image from "next/image";
import { Check, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AppRowModel = {
  slug: string;
  name: string;
  description: string;
  logo: string;
  logoBg: string;
  connected?: boolean;
};

export function AppRow({
  app,
  className,
  onSelect,
}: {
  app: AppRowModel;
  className?: string;
  onSelect?: (app: AppRowModel) => void;
}) {
  const isWhatsApp = app.slug === "whatsapp";

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => onSelect?.(app)}
      className={cn(
        "group h-auto w-full min-w-0 items-center justify-between gap-4 rounded-2xl border-[#d8d8d8] bg-transparent px-5 py-4 text-left shadow-none transition hover:border-[#c8c8c8] hover:bg-transparent",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d8d8d8] bg-transparent shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
          <Image
            src={app.logo}
            alt={`${app.name} logo`}
            width={28}
            height={28}
            className={cn(
              "object-contain",
              isWhatsApp ? "h-6 w-6" : "h-7 w-7"
            )}
          />
          {app.connected ? (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
              <Check className="h-3 w-3" />
            </span>
          ) : null}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[#1d1d1f]">
            {app.name}
          </p>
          <p className="truncate text-sm text-[#7a7a7a]">{app.description}</p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 self-center text-[#8e8e8e] transition group-hover:text-[#6e6e6e]" />
    </Button>
  );
}
