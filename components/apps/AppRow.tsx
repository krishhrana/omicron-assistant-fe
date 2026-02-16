import Image from "next/image";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppDefinition } from "@/components/apps/app-data";

export function AppRow({
  app,
  className,
  onSelect,
}: {
  app: AppDefinition;
  className?: string;
  onSelect?: (app: AppDefinition) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => onSelect?.(app)}
      className={cn(
        "group h-auto w-full justify-between gap-4 rounded-2xl border-slate-200/70 bg-white/90 px-5 py-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-white",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"
          style={{ backgroundColor: app.logoBg }}
        >
          <Image
            src={app.logo}
            alt={`${app.name} logo`}
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
        </span>
        <div>
          <p className="text-base font-semibold text-slate-900">{app.name}</p>
          <p className="text-sm text-slate-500">{app.description}</p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-slate-400 transition group-hover:text-slate-600" />
    </Button>
  );
}
