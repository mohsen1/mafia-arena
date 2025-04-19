'use client';

import type { Player } from "@/lib/types/game";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { PersonStanding, Skull } from "lucide-react";
// Import from react-i18next
import { useTranslation } from "react-i18next"; 

interface PlayerCardProps {
  player: Player;
}

export function PlayerCard({ player }: PlayerCardProps) {
  // Use standard hook
  const { t } = useTranslation('translation'); // Keep namespace for now

  const isAlive = player.status === "alive";
  const roleToDisplay = player.role || t("RoleUnknown"); 

  return (
    <div
      className={cn(
        "flex items-center space-x-3 rtl:space-x-reverse p-2 rounded-md",
        isAlive ? "bg-card" : "bg-muted opacity-60",
      )}
    >
      <div className="relative flex-shrink-0">
        <Image
          src={player.imageUrl || "/images/placeholder.png"} 
          alt={t("PlayerImageAltText", { name: player.name })}
          width={40}
          height={40}
          className="rounded-full w-10 h-10 object-cover border"
        />
        <div
          className={cn(
            "absolute bottom-0 right-0 transform translate-x-1/4 translate-y-1/4",
            "rounded-full p-0.5 border-2 border-background",
            isAlive ? "bg-green-500" : "bg-gray-500",
          )}
        >
          {isAlive ? (
            <PersonStanding size={10} className="text-white" />
          ) : (
            <Skull size={10} className="text-white" />
          )}
        </div>
      </div>
      <div className="flex-grow min-w-0">
        <p className="text-sm font-medium truncate text-card-foreground">
          {player.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {isAlive ? roleToDisplay : t("PlayerStatusDead")}
        </p>
      </div>
    </div>
  );
}
