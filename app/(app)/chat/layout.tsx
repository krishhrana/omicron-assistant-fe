import { Fraunces, Space_Grotesk } from "next/font/google";
import ChatShell from "@/components/chat/ChatShell";

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

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${bodyFont.className} ${displayFont.variable}`}>
      <ChatShell>{children}</ChatShell>
    </div>
  );
}
