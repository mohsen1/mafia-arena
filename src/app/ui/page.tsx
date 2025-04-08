"use client";

import React, { useRef, useState, useEffect } from "react";
import { SpeakText, SpeakTextHandle } from "@/components/SpeakText";
import { SpokenTextProvider, useSpokenText } from "@/context/SpokenTextContext";
import { Button } from "@/components/ui/button";

export default function UI() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">UI Component Playground</h1>

        <section>
          <h2 className="text-2xl font-semibold mb-6">SpeakText</h2>
          <div className="rounded-lg border bg-card p-6">
            <SpokenTextProvider>
              <SpeakText className="text-card-foreground">
                Hello world!
              </SpeakText>
            </SpokenTextProvider>
          </div>
          <div>
            <p>
              Example of automatically playing multiple SpeakText automatically
              one after another
            </p>
            <SpokenTextProvider>
              <PlayMultipleSpeak />
            </SpokenTextProvider>
          </div>
        </section>
        <section>
          <h2>Example </h2>
        </section>
      </div>
    </div>
  );
}

const messages = [
  "First message: Hello from the sequential player!",
  "Second message: This should play after the first one finishes.",
  "Third and final message: Playback complete."
];

function PlayMultipleSpeak() {
  // State to control rendering of the messages
  const [showMessages, setShowMessages] = useState<boolean>(false);

  const addMessagesToQueue = () => {
      console.log("PlayMultiple: Add Messages button clicked.");
      setShowMessages(true);
      // Note: The actual queuing happens when SpeakText mounts with autoQueue=true
  };

  // Maybe add a button to remove them too for testing unmount?
  // const removeMessages = () => setShowMessages(false);

  return (
    <div className="space-y-4">
      <Button onClick={addMessagesToQueue} disabled={showMessages}>
         {showMessages ? "Messages Added/Queued" : "Add Messages & Auto-Queue"}
      </Button>
      {/* Conditionally render the messages based on state */}
      {showMessages && messages.map((text, index) => (
        <div key={index}> {/* Key moved to the wrapper div */}
            <SpeakText
            // Removed ref and onEnd
            autoQueue={true} // Tell component to register itself with the context queue
            className="text-card-foreground"
            >
            {text}
            </SpeakText>
        </div>
      ))}
    </div>
  );
}
