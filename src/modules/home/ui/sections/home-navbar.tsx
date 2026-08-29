"use client";

import { UserButton } from "@/components/auth/user-button";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Image from "next/image";

export const HomeNavbar = () => {
  const { toggleSidebar, open } = useSidebar();
  return (
    <div className="h-16 flex items-center px-4 justify-between">
      <div className="flex items-center gap-5">
        <Button size="icon" variant="ghost" onClick={toggleSidebar}>
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <Image
          src="/icons/logo-light.svg"
          alt="logo"
          width={120}
          height={20}
          className="dark:hidden"
        />
        <Image
          src="/icons/logo-dark.svg"
          alt="logo"
          width={120}
          height={20}
          className="hidden dark:block"
        />
      </div>

      <UserButton />
    </div>
  );
};
