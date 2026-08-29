import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server-session";
import {
  findOwnedConversation,
  listMessages,
} from "@/modules/home/server/conversations";
import { HomeView } from "@/modules/home/ui/views/home-view";

type PageProps = { params: Promise<{ conversationId: string }> };

export default async function Page({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { conversationId } = await params;
  const ownedConversation = await findOwnedConversation(conversationId, user.id);
  if (!ownedConversation) notFound();

  const messages = await listMessages(conversationId);

  return (
    <HomeView
      conversationId={conversationId}
      initialMessages={messages.items}
      initialMessageCursor={messages.nextCursor}
    />
  );
}
