import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function OmicronBackdrop({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden bg-[#f5f1e8] text-slate-900",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-[-10%] h-[520px] w-[520px] rounded-full bg-[#fde2b9] blur-3xl opacity-70" />
        <div className="absolute top-16 right-[-10%] h-[420px] w-[420px] rounded-full bg-[#b7d8ff] blur-3xl opacity-70" />
        <div className="absolute bottom-[-30%] left-[15%] h-[520px] w-[520px] rounded-full bg-[#f1c4cf] blur-3xl opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(#d9c9b8_1px,transparent_1px)] [background-size:26px_26px] opacity-25" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
