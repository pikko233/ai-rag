import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/server-session";
import { listConversations } from "@/modules/home/server/conversations";
import { HomeNavbar } from "@/modules/home/ui/sections/home-navbar";
import { HomeSidebar } from "@/modules/home/ui/sections/home-sidebar";

export default async function PrivateLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const conversations = await listConversations(user.id);

  return (
    <SidebarProvider className="h-screen w-screen overflow-hidden">
      <HomeSidebar
        initialConversations={conversations.items}
        initialCursor={conversations.nextCursor}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <HomeNavbar />
        {children}
      </div>
    </SidebarProvider>
  );
}
