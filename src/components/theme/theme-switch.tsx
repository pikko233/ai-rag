import { ReactNode } from "react";
import { Button } from "../ui/button";

interface Props {
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
}

export const ThemeSwitch = ({ icon, isActive, onClick }: Props) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  return (
    <Button
      size="icon"
      onClick={handleClick}
      variant={isActive ? "default" : "ghost"}
      className="rounded-full h-6 w-6"
    >
      {icon}
    </Button>
  );
};
