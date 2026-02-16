import ChatThread from "@/components/chat/ChatThread";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatThread conversationId={id} />;
}
