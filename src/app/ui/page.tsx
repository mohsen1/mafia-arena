'use client';

import React, { useState } from 'react';
import { SpeakText } from '@/components/SpeakText';
import { SpokenTextProvider } from '@/context/SpokenTextContext';
import { GameProvider } from '@/context/GameContext';
import { Button } from '@/components/ui/button';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';

// Minimal game state for UI playground
const mockGameState = {
  id: 'ui-playground',
  gameId: 'ui-playground',
  phase: 'Day' as const,
  round: 1,
  players: {},
  log: [],
  humanPlayerId: null,
  pendingHumanAction: null,
  winner: null,
  title: 'UI Playground',
  createdAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
  language: 'en' as const,
  themeKey: 'UK_VILLAGE_1900S' as const,
};

const mockAdvanceAction = async (): Promise<FilteredGameState | { error: string }> => 
  mockGameState as FilteredGameState;

const mockSubmitAction = async (
  _payload: HumanActionPayload
): Promise<FilteredGameState | { error: string }> => 
  mockGameState as FilteredGameState;

export default function UI() {
  return (
    <GameProvider
      initialGameState={mockGameState}
      boundRunGameTurnAction={mockAdvanceAction}
      boundSubmitHumanAction={mockSubmitAction}
    >
      <div className="min-h-screen bg-background p-8">
        <div className="w-full">
          <h1 className="text-4xl font-bold mb-8">UI Component Playground</h1>

          <section>
            <h2 className="text-2xl font-semibold mb-6">SpeakText</h2>
            <div className="rounded-lg border bg-card p-6">
              <SpokenTextProvider isAudioGloballyEnabled={true}>
                <SpeakText text="Hello world!" className="text-card-foreground" />
              </SpokenTextProvider>
            </div>
            <div>
              <p>
                Example of automatically playing multiple SpeakText automatically
                one after another
              </p>
              <SpokenTextProvider isAudioGloballyEnabled={true}>
                <PlayMultipleSpeak />
              </SpokenTextProvider>
            </div>
          </section>
          <section>
            <h2>Example </h2>
          </section>
        </div>
      </div>
    </GameProvider>
  );
}

const messages = [
  'First message: Hello from the sequential player!',
  'Second message: This should play after the first one finishes.',
  'Third and final message: Playback complete.',
];

function PlayMultipleSpeak() {
  // State to control rendering of the messages
  const [showMessages, setShowMessages] = useState<boolean>(false);

  const addMessagesToQueue = () => {
    setShowMessages(true);
  };

  return (
    <div className="space-y-4">
      <Button onClick={addMessagesToQueue} disabled={showMessages}>
        {showMessages ? 'Messages Added/Queued' : 'Add Messages & Auto-Queue'}
      </Button>
              {showMessages &&
        messages.map((text, index) => (
          <div key={`message-${index}-${text.slice(0, 20)}`}>
            <SpokenTextProvider isAudioGloballyEnabled={true}>
              <SpeakText
                text={text}
                autoPlay={true}
                className="text-card-foreground"
              />
            </SpokenTextProvider>
          </div>
        ))}
    </div>
  );
}
