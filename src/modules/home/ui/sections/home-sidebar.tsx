"use client";

import { UserButton } from "@/components/auth/user-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type {
  ConversationPage,
  ConversationSummary,
} from "@/modules/home/types";
import {
  FileUp,
  MessageSquare,
  MessageSquarePlus,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type HomeSidebarProps = {
  initialConversations: ConversationSummary[];
  initialCursor: string | null;
};

export const HomeSidebar = ({
  initialConversations,
  initialCursor,
}: HomeSidebarProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState(initialConversations);
  const [cursor, setCursor] = useState(initialCursor);
  const [pendingDelete, setPendingDelete] =
    useState<ConversationSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const addConversation = (event: Event) => {
      const created = (event as CustomEvent<ConversationSummary>).detail;
      setItems((current) => [created, ...current]);
    };
    const removeFailedConversation = (event: Event) => {
      const conversationId = (event as CustomEvent<string>).detail;
      setItems((current) =>
        current.filter((conversation) => conversation.id !== conversationId),
      );
    };
    window.addEventListener("conversation-created", addConversation);
    window.addEventListener(
      "conversation-creation-failed",
      removeFailedConversation,
    );
    return () => {
      window.removeEventListener("conversation-created", addConversation);
      window.removeEventListener(
        "conversation-creation-failed",
        removeFailedConversation,
      );
    };
  }, []);

  const loadMore = async () => {
    if (!cursor) return;
    const response = await fetch(
      `/api/conversations?cursor=${encodeURIComponent(cursor)}`,
    );
    if (!response.ok) return;
    const page = (await response.json()) as ConversationPage;
    setItems((current) => [...current, ...page.items]);
    setCursor(page.nextCursor);
  };

  const deleteConversation = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/conversations/${pendingDelete.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "删除失败，请稍后重试");
      }

      setItems((current) =>
        current.filter((item) => item.id !== pendingDelete.id),
      );
      if (pathname === `/home/${pendingDelete.id}`) {
        router.replace("/home");
      }
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="h-16 justify-center px-4">
        <Link href="/home" aria-label="返回首页">
          <Image
            src="/icons/logo-light.svg"
            alt="AI RAG"
            width={120}
            height={20}
            className="dark:hidden"
          />
          <Image
            src="/icons/logo-dark.svg"
            alt="AI RAG"
            width={120}
            height={20}
            className="hidden dark:block"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/home" />}
                  tooltip="新对话"
                  isActive={pathname === "/home"}
                >
                  <MessageSquarePlus />
                  <span>新对话</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/rag" />}
                  tooltip="上传 PDF"
                  isActive={pathname === "/rag"}
                >
                  <FileUp />
                  <span>RAG 文档</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>历史对话</SidebarGroupLabel>
          <SidebarGroupContent>
            {items.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                暂无历史对话
              </p>
            ) : (
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      render={<Link href={`/home/${item.id}`} />}
                      tooltip={item.title}
                      isActive={pathname === `/home/${item.id}`}
                    >
                      <MessageSquare />
                      <span className="truncate">{item.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      aria-label={`删除对话：${item.title}`}
                      className="hover:text-destructive"
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDelete(item);
                      }}
                    >
                      <Trash2 />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
            {cursor && (
              <button
                type="button"
                className="mt-2 w-full px-2 text-left text-xs text-muted-foreground hover:text-foreground"
                onClick={loadMore}
              >
                加载更多
              </button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserButton isCompacted={false} />
      </SidebarFooter>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除这条对话？"
        description={`“${pendingDelete?.title}”及其中的消息将被永久删除，此操作无法撤销。`}
        error={deleteError}
        confirmText="确认删除"
        pendingText="正在删除..."
        confirmVariant="destructive"
        isPending={isDeleting}
        onConfirm={deleteConversation}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      />
    </Sidebar>
  );
};
