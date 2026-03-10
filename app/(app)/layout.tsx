import { AuthenticatedApp } from "@/components/auth/AuthenticatedApp";
import ChatShell from "@/components/chat/ChatShell";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedApp>
      <ChatShell>{children}</ChatShell>
    </AuthenticatedApp>
  );
}
