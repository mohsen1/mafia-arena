'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Music2,
  Music3,
  Music4,
  Headphones,
  Radio,
  Disc,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { toast } from 'sonner';

interface GameSoundtrackManagerProps {
  gameState: FilteredGameState;
  className?: string;
  onVolumeChange?: (volume: number) => void;
}

interface Track {
  id: string;
  name: string;
  category: 'ambient' | 'tension' | 'action' | 'victory' | 'defeat';
  mood: 'calm' | 'mysterious' | 'intense' | 'triumphant' | 'somber';
  phases: Array<'Day' | 'Night' | 'Voting' | 'GameOver'>;
  duration: number; // in seconds
  bpm?: number;
}

interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  isDefault?: boolean;
}

const DEFAULT_TRACKS: Track[] = [
  {
    id: 'village-morning',
    name: 'Village Morning',
    category: 'ambient',
    mood: 'calm',
    phases: ['Day'],
    duration: 180,
    bpm: 70,
  },
  {
    id: 'whispers-dark',
    name: 'Whispers in the Dark',
    category: 'tension',
    mood: 'mysterious',
    phases: ['Night'],
    duration: 150,
    bpm: 80,
  },
  {
    id: 'final-verdict',
    name: 'Final Verdict',
    category: 'action',
    mood: 'intense',
    phases: ['Voting'],
    duration: 120,
    bpm: 120,
  },
  {
    id: 'town-triumph',
    name: 'Town Triumph',
    category: 'victory',
    mood: 'triumphant',
    phases: ['GameOver'],
    duration: 90,
    bpm: 140,
  },
  {
    id: 'mafia-rises',
    name: 'Mafia Rises',
    category: 'defeat',
    mood: 'somber',
    phases: ['GameOver'],
    duration: 90,
    bpm: 60,
  },
];

const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'default',
    name: 'Classic Werewolf',
    tracks: DEFAULT_TRACKS,
    isDefault: true,
  },
  {
    id: 'cinematic',
    name: 'Cinematic Experience',
    tracks: DEFAULT_TRACKS.map((t) => ({ ...t, name: `Epic ${t.name}` })),
  },
  {
    id: 'minimal',
    name: 'Minimal Ambience',
    tracks: DEFAULT_TRACKS.filter((t) => t.category === 'ambient'),
  },
];

export function GameSoundtrackManager({
  gameState,
  className,
  onVolumeChange,
}: GameSoundtrackManagerProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('all');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist>(
    DEFAULT_PLAYLISTS[0]
  );
  const [dynamicMode, setDynamicMode] = useState(true);
  const [crossfade, setCrossfade] = useState(true);
  const [adaptiveVolume, setAdaptiveVolume] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout>();

  // Handle track end logic
  const handleTrackEnd = useCallback(() => {
    switch (repeatMode) {
      case 'one':
        setCurrentTime(0);
        break;
      case 'all':
        if (currentTrackIndex < selectedPlaylist.tracks.length - 1) {
          setCurrentTrackIndex((prev) => prev + 1);
        } else {
          setCurrentTrackIndex(0);
        }
        break;
      case 'none':
        if (currentTrackIndex < selectedPlaylist.tracks.length - 1) {
          setCurrentTrackIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
        }
        break;
    }
  }, [repeatMode, currentTrackIndex, selectedPlaylist.tracks.length]);

  // Get appropriate tracks for current game phase
  const getPhaseAppropriateTrack = useCallback(() => {
    const phaseTracks = selectedPlaylist.tracks.filter((track) =>
      track.phases.includes(gameState.phase as any)
    );

    if (phaseTracks.length === 0) return selectedPlaylist.tracks[0];

    // Additional filtering based on game state
    if (gameState.phase === 'GameOver') {
      const winnerTracks = phaseTracks.filter((track) => {
        if (gameState.winner === 'Town') return track.mood === 'triumphant';
        if (gameState.winner === 'Mafia') return track.mood === 'somber';
        return true;
      });
      return winnerTracks[0] || phaseTracks[0];
    }

    // For night phase, prefer mysterious tracks
    if (gameState.phase === 'Night') {
      const mysteriousTracks = phaseTracks.filter(
        (t) => t.mood === 'mysterious'
      );
      return mysteriousTracks[0] || phaseTracks[0];
    }

    // For day phase during voting, prefer intense tracks
    if (
      gameState.phase === 'Day' &&
      phaseTracks.some((t) => t.category === 'action')
    ) {
      const intenseTracks = phaseTracks.filter((t) => t.mood === 'intense');
      return intenseTracks[0] || phaseTracks[0];
    }

    return phaseTracks[0];
  }, [gameState, selectedPlaylist]);

  // Handle dynamic track switching
  useEffect(() => {
    if (!dynamicMode || !isPlaying) return;

    const appropriateTrack = getPhaseAppropriateTrack();
    const currentTrack = selectedPlaylist.tracks[currentTrackIndex];

    if (appropriateTrack.id !== currentTrack.id) {
      const newIndex = selectedPlaylist.tracks.findIndex(
        (t) => t.id === appropriateTrack.id
      );
      if (newIndex !== -1) {
        if (crossfade) {
          // Simulate crossfade
          toast(`Crossfading to: ${appropriateTrack.name}`);
        }
        setCurrentTrackIndex(newIndex);
        setCurrentTime(0);
      }
    }
  }, [
    gameState.phase,
    dynamicMode,
    isPlaying,
    getPhaseAppropriateTrack,
    currentTrackIndex,
    selectedPlaylist,
    crossfade,
  ]);

  // Simulate playback progress
  useEffect(() => {
    if (isPlaying && !isMuted) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const track = selectedPlaylist.tracks[currentTrackIndex];
          if (prev >= track.duration) {
            // Track ended
            handleTrackEnd();
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, isMuted, currentTrackIndex, selectedPlaylist, handleTrackEnd]);

  // Adaptive volume based on game intensity
  useEffect(() => {
    if (!adaptiveVolume || isMuted) return;

    let targetVolume = volume;

    // Increase volume during intense moments
    if (gameState.phase === 'Day') {
      targetVolume = Math.min(volume + 20, 100);
    } else if (gameState.phase === 'Night') {
      targetVolume = Math.max(volume - 10, 30);
    }

    onVolumeChange?.(targetVolume);
  }, [gameState.phase, adaptiveVolume, volume, isMuted, onVolumeChange]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    if (!isPlaying) {
      toast(`Now playing: ${selectedPlaylist.tracks[currentTrackIndex].name}`);
    }
  };

  const handlePrevious = () => {
    if (currentTime > 5) {
      setCurrentTime(0);
    } else {
      setCurrentTrackIndex((prev) =>
        prev > 0 ? prev - 1 : selectedPlaylist.tracks.length - 1
      );
      setCurrentTime(0);
    }
  };

  const handleNext = () => {
    if (isShuffled) {
      const nextIndex = Math.floor(
        Math.random() * selectedPlaylist.tracks.length
      );
      setCurrentTrackIndex(nextIndex);
    } else {
      setCurrentTrackIndex((prev) =>
        prev < selectedPlaylist.tracks.length - 1 ? prev + 1 : 0
      );
    }
    setCurrentTime(0);
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    onVolumeChange?.(isMuted ? 0 : newVolume);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    onVolumeChange?.(isMuted ? volume : 0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentTrack = selectedPlaylist.tracks[currentTrackIndex];
  const progress = (currentTime / currentTrack.duration) * 100;

  const getMoodIcon = (mood: Track['mood']) => {
    switch (mood) {
      case 'calm':
        return <Music2 className="w-3 h-3" />;
      case 'mysterious':
        return <Music3 className="w-3 h-3" />;
      case 'intense':
        return <Music4 className="w-3 h-3" />;
      case 'triumphant':
        return <Disc className="w-3 h-3" />;
      case 'somber':
        return <Radio className="w-3 h-3" />;
    }
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Music className="w-4 h-4" />
            {t('SoundtrackManager', 'Soundtrack Manager')}
          </span>
          <div className="flex items-center gap-2">
            {isPlaying && (
              <Badge variant="secondary" className="text-xs">
                {currentTrack.name}
              </Badge>
            )}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-4 p-4">
              {/* Now Playing */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getMoodIcon(currentTrack.mood)}
                    <div>
                      <p className="text-sm font-medium">{currentTrack.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(currentTrack.category)} •{' '}
                        {currentTrack.bpm && `${currentTrack.bpm} BPM`}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {formatTime(currentTime)} /{' '}
                    {formatTime(currentTrack.duration)}
                  </Badge>
                </div>
                <Progress value={progress} className="h-1" />
              </div>

              {/* Playback Controls */}
              <div className="flex items-center justify-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsShuffled(!isShuffled)}
                        className={cn(
                          'h-8 w-8 p-0',
                          isShuffled && 'text-primary'
                        )}
                      >
                        <Shuffle className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{t('Shuffle', 'Shuffle')}</p>
                    </TooltipContent>
                  </Tooltip>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePrevious}
                    className="h-8 w-8 p-0"
                  >
                    <SkipBack className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={handlePlayPause}
                    className="h-10 w-10 p-0"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ms-0.5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNext}
                    className="h-8 w-8 p-0"
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const modes: Array<typeof repeatMode> = [
                            'none',
                            'one',
                            'all',
                          ];
                          const currentIndex = modes.indexOf(repeatMode);
                          setRepeatMode(
                            modes[(currentIndex + 1) % modes.length]
                          );
                        }}
                        className={cn(
                          'h-8 w-8 p-0',
                          repeatMode !== 'none' && 'text-primary'
                        )}
                      >
                        <Repeat className="w-4 h-4" />
                        {repeatMode === 'one' && (
                          <span className="absolute text-xs -bottom-1 -right-1">
                            1
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        {t(`Repeat.${repeatMode}`, repeatMode)}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Volume Control */}
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleMute}
                  className="h-8 w-8 p-0"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={handleVolumeChange}
                  min={0}
                  max={100}
                  step={5}
                  className="flex-1"
                  disabled={isMuted}
                />
                <span className="text-xs font-medium w-10 text-end">
                  {isMuted ? '0' : volume}%
                </span>
              </div>

              {/* Playlist Selection */}
              <div className="space-y-2">
                <Label className="text-xs">{t('Playlist', 'Playlist')}</Label>
                <Select
                  value={selectedPlaylist.id}
                  onValueChange={(value) => {
                    const playlist = DEFAULT_PLAYLISTS.find(
                      (p) => p.id === value
                    );
                    if (playlist) {
                      setSelectedPlaylist(playlist);
                      setCurrentTrackIndex(0);
                      setCurrentTime(0);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_PLAYLISTS.map((playlist) => (
                      <SelectItem
                        key={playlist.id}
                        value={playlist.id}
                        className="text-xs"
                      >
                        {playlist.name}
                        {playlist.isDefault && (
                          <Badge variant="secondary" className="ms-2 text-xs">
                            {t('Default', 'Default')}
                          </Badge>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Advanced Settings */}
              <div className="space-y-2 pt-2 border-t">
                <p className="text-xs font-medium">
                  {t('AdvancedSettings', 'Advanced Settings')}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1">
                      <Headphones className="w-3 h-3" />
                      {t('DynamicMode', 'Dynamic Mode')}
                    </Label>
                    <Switch
                      checked={dynamicMode}
                      onCheckedChange={setDynamicMode}
                      className="scale-75"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      {t('Crossfade', 'Crossfade Tracks')}
                    </Label>
                    <Switch
                      checked={crossfade}
                      onCheckedChange={setCrossfade}
                      className="scale-75"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      {t('AdaptiveVolume', 'Adaptive Volume')}
                    </Label>
                    <Switch
                      checked={adaptiveVolume}
                      onCheckedChange={setAdaptiveVolume}
                      className="scale-75"
                    />
                  </div>
                </div>
              </div>

              {/* Track List */}
              <div className="space-y-2">
                <p className="text-xs font-medium">
                  {t('TrackList', 'Track List')}
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {selectedPlaylist.tracks.map((track, index) => (
                    <div
                      key={track.id}
                      className={cn(
                        'flex items-center justify-between p-1.5 rounded text-xs cursor-pointer transition-colors',
                        index === currentTrackIndex
                          ? 'bg-accent'
                          : 'hover:bg-muted'
                      )}
                      onClick={() => {
                        setCurrentTrackIndex(index);
                        setCurrentTime(0);
                        if (!isPlaying) setIsPlaying(true);
                      }}
                    >
                      <span className="flex items-center gap-1">
                        {index === currentTrackIndex && isPlaying && (
                          <Music className="w-3 h-3 animate-pulse" />
                        )}
                        {track.name}
                      </span>
                      <span className="text-muted-foreground">
                        {formatTime(track.duration)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
