"use client";

import { SpeakText } from "@/components/SpeakText";
import { SpokenTextProvider } from "@/context/SpokenTextContext";

export default function UI() {
  return (
    <SpokenTextProvider>
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold mb-8">UI Component Playground</h1>
          
          <section>
            <h2 className="text-2xl font-semibold mb-6">SpeakText</h2>
            <div className="rounded-lg border bg-card p-6">
              <SpeakText className="text-card-foreground">
                Hello world! This is a test of the spoken text component.
              </SpeakText>
            </div>
          </section>
        </div>
      </div>
    </SpokenTextProvider>
  );
}
