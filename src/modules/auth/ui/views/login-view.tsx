"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";

export const LoginView = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });
    setIsLoading(false);
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      {/* 登录卡片 */}
      <div className="flex min-w-[25%] flex-col items-center gap-5 rounded-lg bg-card p-10 text-card-foreground shadow-2xl">
        <h1 className="text-2xl font-bold">欢迎回来</h1>
        <span className="text-sm text-muted-foreground">
          登录你的账户以继续
        </span>
        <Button
          type="button"
          onClick={() => handleLogin()}
          variant="outline"
          className="w-full py-5"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FcGoogle />
          )}
          {isLoading ? "加载中" : "使用 Google 登录"}
        </Button>
      </div>
    </div>
  );
};
