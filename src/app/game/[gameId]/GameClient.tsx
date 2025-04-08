'use client';

import { GameProvider, useGameContext } from '@/context/GameContext';
import { FilteredGameState } from '@/lib/types/game';
import { GameSidebar } from "@/components/GameSidebar";
import { GameHeader } from "@/components/GameHeader";
import { ConversationLog } from "@/components/ConversationLog";
import { ReactNode } from 'react';

interface GameClientProps {
    initialGameState: FilteredGameState;
    gameId: string;
    boundRunGameTurnAction: () => Promise<void>; // Pass the bound action
}

// Inner component to consume context easily after provider is set up
function GameLayout() {
    // Example of consuming context if needed directly here, but children will consume it
    const { gameState } = useGameContext();

    if (!gameState) {
        return <div>Loading game state...</div>; // Or some loading indicator
    }

    return (
        <div className="grid grid-cols-[280px_1fr] h-screen">
            {/* Left Column (Sidebar): Player List */}
            <GameSidebar />

            {/* Right Column: Game Info & Conversation */}
            <main className="flex flex-col h-screen overflow-hidden">
                {/* Top Row: Game Info & Actions */}
                <GameHeader />

                {/* Bottom Row: Conversation Log */}
                <ConversationLog />
            </main>
        </div>
    );
}


export default function GameClient({ initialGameState, gameId, boundRunGameTurnAction }: GameClientProps) {
    return (
        <GameProvider
            initialGameState={initialGameState}
            gameId={gameId}
            boundRunGameTurnAction={boundRunGameTurnAction}
        >
           <GameLayout />
        </GameProvider>
    );
}
