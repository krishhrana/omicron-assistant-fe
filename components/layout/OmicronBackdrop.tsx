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
        "omicron-canvas",
        className
      )}
    >
      <div className="omicron-canvas-overlay">
        <div className="absolute inset-0 omicron-canvas-gradient" />
        <div className="absolute inset-0 flowing-dots-bg opacity-70" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
