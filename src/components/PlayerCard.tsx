import Image from "next/image";
import type { FilteredGameState } from "@/lib/types/game";
// import { Player, /* PlayerStatus, Role */ } from "@/lib/types/game";
// import { Bot, User, Skull } from "lucide-react";
// import { cn } from "@/lib/utils";
import { useGameContext } from "@/context/GameContext";
// import { useTranslation } from "@/hooks/useTranslation";
// import { motion } from "framer-motion";
// import { getContrastColor } from "@/lib/utils/colorUtils";

// Define the props for PlayerCard using the type from FilteredGameState
type FilteredPlayer = FilteredGameState["players"][string];

interface PlayerCardProps {
  player: FilteredPlayer; // Use the filtered type
  // Removed status prop as it seems redundant with player.status
}

// Player Card Component with Dark Mode
export function PlayerCard({ player }: PlayerCardProps) {
  const { t, gameState } = useGameContext();

  // Determine player role visibility based on game phase or if player is dead
  const showRole = gameState?.phase === "GameOver" || player.status === "dead";

  // Construct metadata string based on visibility
  // Use player.status for the status display
  const meta = [];
  meta.push(t(player.status));
  if (showRole && player.role) {
    meta.push(t(player.role));
  }
  meta.push(player.aiModel);

  // Filter metadata based on availability
  const metadata = meta.filter(Boolean); // Ensure only non-empty values are added
  const metadataString = metadata.join(" • ");

  // Get the translated alt text template
  const altTextTemplate = t("PlayerImageAltText", "Image of {{name}}");
  // Format the alt text
  const altText = altTextTemplate.replace("{{name}}", player.name);

  return (
    <div
      className={`p-2 flex items-center transition-colors duration-200 ${
        player.status === "dead" ? "opacity-25" : ""
      }`}
    >
      {player.imageUrl ? (
        <Image
          src={player.imageUrl}
          alt={altText}
          width={48} // Smaller size
          height={48}
          className="rounded-full me-3 object-cover border-2 border-border flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-muted me-3 flex items-center justify-center text-muted-foreground text-xs flex-shrink-0">
          {player.name.substring(0, 2)}
        </div>
      )}
      <div className="flex-grow">
        <h3 className="text-md font-semibold text-foreground truncate">
          {player.name}
        </h3>
        <p className="text-xs text-muted-foreground capitalize">
          {metadataString}
        </p>
      </div>
    </div>
  );
}
