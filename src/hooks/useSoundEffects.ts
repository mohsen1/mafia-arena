'use client';

import { useEffect, useRef, useCallback } from 'react';

export type SoundEffect = 
  | 'vote'
  | 'elimination'
  | 'phaseChange'
  | 'dayStart'
  | 'nightStart'
  | 'victory'
  | 'defeat'
  | 'notification'
  | 'suspense';

interface SoundConfig {
  volume: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: SoundConfig = {
  volume: 0.5,
  enabled: true,
};

// Sound file paths - using simple web audio for now
const SOUND_URLS: Record<SoundEffect, string> = {
  vote: '/sounds/vote.mp3',
  elimination: '/sounds/elimination.mp3',
  phaseChange: '/sounds/phase-change.mp3',
  dayStart: '/sounds/day-start.mp3',
  nightStart: '/sounds/night-start.mp3',
  victory: '/sounds/victory.mp3',
  defeat: '/sounds/defeat.mp3',
  notification: '/sounds/notification.mp3',
  suspense: '/sounds/suspense.mp3',
};

export function useSoundEffects(config: Partial<SoundConfig> = {}) {
  const audioRefs = useRef<Map<SoundEffect, HTMLAudioElement>>(new Map());
  const configRef = useRef<SoundConfig>({ ...DEFAULT_CONFIG, ...config });

  // Update config
  useEffect(() => {
    configRef.current = { ...DEFAULT_CONFIG, ...config };
  }, [config]);

  // Preload sounds
  useEffect(() => {
    if (!configRef.current.enabled) return;

    const loadSound = (effect: SoundEffect, url: string) => {
      const audio = new Audio();
      audio.src = url;
      audio.volume = configRef.current.volume;
      audio.preload = 'auto';
      audioRefs.current.set(effect, audio);
    };

    // Load all sounds
    Object.entries(SOUND_URLS).forEach(([effect, url]) => {
      loadSound(effect as SoundEffect, url);
    });

    return () => {
      // Cleanup
      audioRefs.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioRefs.current.clear();
    };
  }, []);

  const playSound = useCallback((effect: SoundEffect) => {
    if (!configRef.current.enabled) return;

    const audio = audioRefs.current.get(effect);
    if (!audio) {
      console.warn(`Sound effect "${effect}" not loaded`);
      return;
    }

    // Reset and play
    audio.currentTime = 0;
    audio.volume = configRef.current.volume;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.warn(`Failed to play sound effect "${effect}":`, error);
      });
    }
  }, []);

  const stopSound = useCallback((effect: SoundEffect) => {
    const audio = audioRefs.current.get(effect);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  const stopAllSounds = useCallback(() => {
    audioRefs.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
  }, []);

  const setVolume = useCallback((volume: number) => {
    configRef.current.volume = Math.max(0, Math.min(1, volume));
    audioRefs.current.forEach(audio => {
      audio.volume = configRef.current.volume;
    });
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    configRef.current.enabled = enabled;
    if (!enabled) {
      stopAllSounds();
    }
  }, [stopAllSounds]);

  return {
    playSound,
    stopSound,
    stopAllSounds,
    setVolume,
    setEnabled,
    config: configRef.current,
  };
} 