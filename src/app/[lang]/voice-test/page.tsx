'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2, VolumeX } from 'lucide-react';

export default function VoiceTestPage() {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [showMessages, setShowMessages] = useState(false);

  const testMessages = [
    {
      id: '1',
      sender: 'Moderator',
      content:
        'Welcome to the village meeting. Strange things have been happening at night.',
      voiceId: 'EXAVITQu4vr4xnSDxMaL', // Narrator voice
    },
    {
      id: '2',
      sender: 'John',
      content:
        'I heard howling last night near the old mill. We must find out who among us is the werewolf!',
      voiceId: '21m00Tcm4TlvDq8ikWAM', // Default voice
    },
    {
      id: '3',
      sender: 'Sarah',
      content:
        'I agree. We cannot let fear divide us. We must work together to uncover the truth.',
      voiceId: 'ThT5KcBeYPX3keUQqHPh', // Female voice
    },
  ];

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Voice Mode Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setIsAudioEnabled(!isAudioEnabled)}
              variant={isAudioEnabled ? 'default' : 'outline'}
            >
              {isAudioEnabled ? (
                <>
                  <Volume2 className="w-4 h-4 mr-2" />
                  Audio Enabled
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4 mr-2" />
                  Audio Disabled
                </>
              )}
            </Button>

            <Button
              onClick={() => setShowMessages(!showMessages)}
              variant="secondary"
            >
              {showMessages ? 'Hide Messages' : 'Show Test Messages'}
            </Button>
          </div>

          {showMessages && (
            <div className="space-y-4">
              {testMessages.map((message) => (
                <Card key={message.id} className="p-4">
                  <div className="font-semibold mb-2">{message.sender}:</div>
                  <div className="text-sm">
                    <span>{message.content}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            <p>
              Click &quot;Show Test Messages&quot; to test the voice
              functionality.
            </p>
            <p>
              Messages will be spoken automatically with word-level
              highlighting.
            </p>
            <p>Toggle audio on/off to test both modes.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
