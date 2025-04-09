import Image from "next/image";
import type { FilteredGameState, PlayerStatus, Role } from "@/lib/types/game";
// Removed: import type { Player } from '@/lib/types/game';
import { useGameContext } from "@/context/GameContext";

// Define the props for PlayerCard using the type from FilteredGameState
type FilteredPlayer = FilteredGameState['players'][string];

interface PlayerCardProps {
  player: FilteredPlayer; // Use the filtered type
  status: PlayerStatus;
  role?: Role;
}

// Player Card Component with Dark Mode
export function PlayerCard({ player, status, role }: PlayerCardProps) {
  const { t, gameState } = useGameContext();

  // Determine player role visibility based on game phase
  const showRole = gameState?.phase === 'GameOver';
  // Determine voice ID based on game phase or player data
  const voiceId = showRole ? player.voiceId : undefined; // Example: only show voiceId if role is visible

  // Construct metadata string based on visibility
  let metadataString = `Status: ${t(`PlayerStatus${status.charAt(0).toUpperCase() + status.slice(1)}`, status)}`;
  if (showRole && role) {
    metadataString += ` | Role: ${t(role, role)}`;
  }

  const metadata = [];
  metadata.push(player.aiModel);
  metadataString = metadata.join(" • ");

  // Get the translated alt text template
  const altTextTemplate = t(
    'PlayerImageAltText', 
    "Image of {{name}}"
  );
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
