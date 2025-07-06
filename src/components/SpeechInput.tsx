'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface SpeechInputProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  className?: string;
  mode?: 'push-to-talk' | 'continuous';
  placeholder?: string;
}

// Extend the Window interface to include webkitSpeechRecognition
declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
    SpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export function SpeechInput({
  onTranscript,
  onInterimTranscript,
  className,
  mode = 'push-to-talk',
  placeholder,
}: SpeechInputProps) {
  const { t } = useTranslation();
  const defaultPlaceholder = t(
    'speechInput.defaultPlaceholder',
    'Click microphone to speak...'
  );
  const actualPlaceholder = placeholder || defaultPlaceholder;
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSupported(true);
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = mode === 'continuous';
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US'; // Can be made configurable

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            setTranscript(finalTranscript);
            onTranscript(finalTranscript);
          } else if (interimTranscript && onInterimTranscript) {
            setTranscript(interimTranscript);
            onInterimTranscript(interimTranscript);
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);

          // Handle specific errors
          if (event.error === 'no-speech') {
            setTranscript(
              t(
                'speechInput.noSpeechDetected',
                'No speech detected. Please try again.'
              )
            );
          } else if (event.error === 'not-allowed') {
            setTranscript(
              t(
                'speechInput.microphoneAccessDenied',
                'Microphone access denied. Please enable microphone permissions.'
              )
            );
          } else {
            setTranscript(
              t('speechInput.errorOccurred', 'Error: {{error}}', {
                error: event.error,
              })
            );
          }
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
          if (mode === 'continuous' && isListening) {
            // Restart if in continuous mode
            recognitionRef.current.start();
          }
        };
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [mode, onTranscript, onInterimTranscript, isListening]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  if (!isSupported) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        Speech recognition is not supported in your browser. Please use Chrome,
        Edge, or Safari.
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        variant={isListening ? 'destructive' : 'outline'}
        size="icon"
        onClick={toggleListening}
        className="relative"
        title={isListening ? 'Stop recording' : 'Start recording'}
      >
        {isListening ? (
          <>
            <MicOff className="w-4 h-4" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          </>
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </Button>

      <div className="flex-1">
        {transcript ? (
          <p className="text-sm">{transcript}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {actualPlaceholder}
          </p>
        )}
      </div>

      {isListening && (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
