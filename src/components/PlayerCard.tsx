import Image from "next/image";
import { FilteredGameState } from "@/lib/types/game";
import { Role } from "@/lib/types/game"; // Assuming Role type exists
// Import the context hook to get the t function
import { useGameContext } from "@/context/GameContext";

// Player Card Component with Dark Mode
export function PlayerCard({
  player,
  role,
}: {
  player: FilteredGameState["players"][string];
  role?: Role;
}) {
  // Get t function from context
  const { t } = useGameContext();

  const metadata = [];
  if (role) metadata.push(t(role, role));
  if (player.status === "dead") metadata.push(t('PlayerStatusDead', 'Dead'));
  metadata.push(player.aiModel);
  const metadataString = metadata.join(" • ");

  // Get the translated alt text template
  const altTextTemplate = t('PlayerImageAlt', `Image of {name}`);
  // Replace the placeholder with the actual player name
  const altText = altTextTemplate.replace("{name}", player.name);
  

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
          className="rounded-full me-3 object-cover border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" 
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 me-3 flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs flex-shrink-0">
          {player.name.substring(0, 2)}
        </div>
      )}
      <div className="flex-grow">
        <h3 className="text-md font-semibold text-gray-800 dark:text-gray-100 truncate">
          {player.name}
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 capitalize">
          {metadataString}
        </p>
      </div>
    </div>
  );
}
