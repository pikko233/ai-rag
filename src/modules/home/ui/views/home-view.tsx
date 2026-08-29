import { HomeMain } from "../sections/home-main";
import type { UIMessage } from "ai";

type HomeViewProps = {
  conversationId?: string;
  initialMessages?: UIMessage[];
  initialMessageCursor?: string | null;
};

export const HomeView = ({
  conversationId,
  initialMessages,
  initialMessageCursor,
}: HomeViewProps) => {
  return (
    <HomeMain
      conversationId={conversationId}
      initialMessages={initialMessages}
      initialMessageCursor={initialMessageCursor}
    />
  );
};
