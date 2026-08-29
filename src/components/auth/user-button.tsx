"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { LaptopMinimal, LogOut, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import { ThemeSwitch } from "../theme/theme-switch";
import { useRouter } from "next/navigation";
import { toast } from "../ui/toast";

interface Props {
  isCompacted?: boolean;
}

export const UserButton = ({ isCompacted = true }: Props) => {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { data } = authClient.useSession();

  const themes = useMemo(() => {
    return [
      { icon: <Sun />, isActive: theme === "light", value: "light" },
      { icon: <Moon />, isActive: theme === "dark", value: "dark" },
      {
        icon: <LaptopMinimal />,
        isActive: theme === "system",
        value: "system",
      },
    ];
  }, [theme]);

  const handleLogout = () => {
    toast.promise(
      authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/login");
          },
        },
      }),
      {
        loading: "正在退出登录...",
        success: "退出登录成功",
        error: (error) => `退出登录失败, ${error}`,
      },
    );
  };

  if (!data?.user) {
    return <Skeleton className="rounded-full h-8 w-8 m-2" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {isCompacted ? (
          <div className="p-2 hover:bg-muted rounded-md">
            <Avatar>
              <AvatarImage src={data.user.image ?? ""} alt="user avatar" />
              <AvatarFallback>{data.user.name}</AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 hover:bg-muted rounded-md">
            <Avatar>
              <AvatarImage src={data.user.image ?? ""} alt="user avatar" />
              <AvatarFallback>{data.user.name}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start">
              <span className="text-sm">{data.user.name}</span>
              <span className="text-sm text-muted-foreground">
                {data.user.email}
              </span>
            </div>
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-2 p-2">
          <Avatar>
            <AvatarImage src={data.user.image ?? ""} alt="user avatar" />
            <AvatarFallback>{data.user.name}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm">{data.user.name}</span>
            <span className="text-sm text-muted-foreground">
              {data.user.email}
            </span>
          </div>
        </div>
        <DropdownMenuGroup>
          <DropdownMenuItem className="flex justify-between">
            <div className="flex items-center gap-1.5">
              <Palette />
              <span>切换主题</span>
            </div>
            <div className="flex items-center gap-2 border rounded-full px-0.5 py-0.5">
              {themes.map((theme, index) => (
                <ThemeSwitch
                  key={index}
                  icon={theme.icon}
                  isActive={theme.isActive}
                  onClick={() => setTheme(theme.value)}
                />
              ))}
            </div>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span>退出登录</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
