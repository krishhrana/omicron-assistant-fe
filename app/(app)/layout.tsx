import { AuthenticatedApp } from "@/components/auth/AuthenticatedApp";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedApp>{children}</AuthenticatedApp>;
}
