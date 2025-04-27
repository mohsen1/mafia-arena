'use client';

import type { FilteredPlayer } from "@/lib/interfaces/client.types";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { PersonStanding, Skull, User } from "lucide-react";
// Import from react-i18next
import { useTranslation } from "react-i18next"; 

interface PlayerCardProps {
  player: FilteredPlayer;
}

export function PlayerCard({ player }: PlayerCardProps) {
  // Use standard hook
  const { t } = useTranslation('translation'); // Keep namespace for now

  const isAlive = player.status === "Alive";
  const roleToDisplay = player.role ? t(player.role, player.role) : t("RoleUnknown", "Unknown Role"); 

  return (
    <div
      className={cn(
        "flex items-center space-x-2 rtl:space-x-reverse p-2 rounded-md",
        isAlive ? "bg-card" : "opacity-60",
      )}
    >
      <div className="relative flex-shrink-0 w-10 h-10">
        {player.isHuman ? (
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border">
            <User className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <Image
            src={player.imageUrl || "/images/placeholder.png"}
            alt={t("PlayerImageAltText", { name: player.name })}
            width={40}
            height={40}
            className="rounded-full w-10 h-10 object-cover border"
          />
        )}
        <div
          className={cn(
            "absolute bottom-0 right-0 transform translate-x-1/4 translate-y-1/4",
            "rounded-full p-0.5 border-2 border-background",
            isAlive ? "bg-success" : "bg-muted-foreground",
          )}
        >
          {isAlive ? (
            <PersonStanding size={10} className="text-success-foreground" />
          ) : (
            <Skull size={10} className="text-muted" />
          )}
        </div>
      </div>
      <div className="flex-grow min-w-0 ms-1">
        <p className="text-sm font-medium truncate text-card-foreground">
          {player.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {roleToDisplay}
          {!isAlive && ` · ${t("PlayerStatusDead", "Dead")}`}
        </p>
      </div>
    </div>
  );
}
