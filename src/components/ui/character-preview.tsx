/**
 * Character Preview Component
 *
 * Shows a preview of what the generated character persona might look like
 * and allows users to influence the character generation process.
 */

'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// Using Input instead of Textarea for better compatibility
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  User,
  Sparkles,
  Eye,
  Settings,
  Heart,
  Brain,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface PersonaPreview {
  name: string;
  backstory: string;
  personalityTraits: string[];
  occupation?: string;
  relationships?: string[];
  secrets?: string[];
}

export interface CharacterPreferences {
  personalityHints: string[];
  ageRange: 'young' | 'middle-aged' | 'old' | 'any';
  occupationPreference: string;
  personalityType:
    | 'friendly'
    | 'mysterious'
    | 'authoritative'
    | 'quirky'
    | 'any';
  backstoryElements: string[];
}

interface CharacterPreviewProps {
  characterName: string;
  imageUrl: string | null;
  role: string;
  gameTheme: string;
  onPreferencesUpdate?: (preferences: CharacterPreferences) => void;
  className?: string;
}

// Sample persona previews for different personality types
const SAMPLE_PERSONAS: Record<string, PersonaPreview[]> = {
  friendly: [
    {
      name: 'Margaret Brightwell',
      backstory:
        'The village baker who knows everyone&apos;s favorite treats and their secrets.',
      personalityTraits: ['Warm', 'Gossipy', 'Observant', 'Caring'],
      occupation: 'Baker',
      relationships: ['Friend to the elderly', 'Mentor to young bakers'],
      secrets: ['Knows about the mayor&apos;s debt', 'Has a secret recipe'],
    },
  ],
  mysterious: [
    {
      name: 'Professor Edwin Blackwood',
      backstory:
        'A reclusive scholar who recently arrived from the city with mysterious books.',
      personalityTraits: ['Secretive', 'Intelligent', 'Distant', 'Calculating'],
      occupation: 'Scholar',
      relationships: [
        'Distrusted by locals',
        'Corresponds with unknown parties',
      ],
      secrets: ['Real reason for coming to town', 'Hidden knowledge of occult'],
    },
  ],
  authoritative: [
    {
      name: 'Captain Samuel Morrison',
      backstory:
        'Retired military officer who now leads the town watch and keeps order.',
      personalityTraits: ['Commanding', 'Disciplined', 'Fair', 'Protective'],
      occupation: 'Town Watch Captain',
      relationships: ['Respected by citizens', 'Close to the mayor'],
      secrets: ['Haunted by war memories', 'Knows about illegal activities'],
    },
  ],
  quirky: [
    {
      name: 'Madame Petrina Oddweather',
      backstory:
        'An eccentric fortune teller who claims to speak with spirits and animals.',
      personalityTraits: [
        'Eccentric',
        'Intuitive',
        'Superstitious',
        'Dramatic',
      ],
      occupation: 'Fortune Teller',
      relationships: ['Feared by some', 'Beloved by children'],
      secrets: ['Actually quite perceptive', 'Feeds stray cats at night'],
    },
  ],
};

export function CharacterPreview({
  characterName,
  imageUrl,
  role,
  gameTheme,
  onPreferencesUpdate,
  className,
}: CharacterPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPersonality, setSelectedPersonality] = useState<string>('any');
  const [customPersonalityHints, setCustomPersonalityHints] = useState('');
  const [occupationPreference, setOccupationPreference] = useState('');
  const [previewPersona, setPreviewPersona] = useState<PersonaPreview | null>(
    null
  );
  const { t } = useTranslation();

  const generatePreview = useCallback(() => {
    if (selectedPersonality !== 'any' && SAMPLE_PERSONAS[selectedPersonality]) {
      const personas = SAMPLE_PERSONAS[selectedPersonality];
      const randomPersona =
        personas[Math.floor(Math.random() * personas.length)];

      // Customize the preview based on user inputs
      const customizedPersona = {
        ...randomPersona,
        name: characterName || randomPersona.name,
        occupation: occupationPreference || randomPersona.occupation,
      };

      setPreviewPersona(customizedPersona);
    } else {
      // Generate a generic preview
      setPreviewPersona({
        name: characterName || 'Village Resident',
        backstory: `A resident of the ${gameTheme.toLowerCase()} with their own secrets and motivations.`,
        personalityTraits: ['Unique', 'Complex', 'Interesting'],
        occupation: occupationPreference || 'Local Resident',
      });
    }
  }, [selectedPersonality, characterName, occupationPreference, gameTheme]);

  const handleSavePreferences = useCallback(() => {
    if (onPreferencesUpdate) {
      const preferences: CharacterPreferences = {
        personalityHints: customPersonalityHints
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean),
        ageRange: 'any',
        occupationPreference,
        personalityType:
          selectedPersonality as CharacterPreferences['personalityType'],
        backstoryElements: [],
      };
      onPreferencesUpdate(preferences);
    }
    setIsOpen(false);
  }, [
    customPersonalityHints,
    occupationPreference,
    selectedPersonality,
    onPreferencesUpdate,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-2', className)}>
          <Eye className="h-4 w-4" />
          Preview Character
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Character Preview & Customization
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Character Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Current Setup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={characterName}
                    width={60}
                    height={60}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-15 h-15 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h3 className="font-medium text-lg">
                    {characterName || 'Unnamed Character'}
                  </h3>
                  <Badge variant="secondary" className="mb-1">
                    {role}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    Theme: {gameTheme}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personality Customization */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Personality Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium">
                  {t('PersonalityType', 'Personality Type')}
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {[
                    'any',
                    'friendly',
                    'mysterious',
                    'authoritative',
                    'quirky',
                  ].map((type) => (
                    <Button
                      key={type}
                      variant={
                        selectedPersonality === type ? 'default' : 'outline'
                      }
                      size="sm"
                      onClick={() => setSelectedPersonality(type)}
                      className="justify-start"
                    >
                      {type === 'any'
                        ? 'Surprise Me'
                        : type.charAt(0).toUpperCase() + type.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="occupation" className="text-sm font-medium">
                  Preferred Occupation (optional)
                </Label>
                <Input
                  id="occupation"
                  placeholder="e.g., Baker, Scholar, Blacksmith..."
                  value={occupationPreference}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setOccupationPreference(e.target.value)
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label
                  htmlFor="personality-hints"
                  className="text-sm font-medium"
                >
                  Personality Hints (optional)
                </Label>
                <Input
                  id="personality-hints"
                  placeholder="e.g., loves books, suspicious of strangers, has a good sense of humor..."
                  value={customPersonalityHints}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCustomPersonalityHints(e.target.value)
                  }
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separate multiple hints with commas. These will influence the
                  AI character generation.
                </p>
              </div>

              <Button
                onClick={generatePreview}
                className="w-full gap-2"
                variant="secondary"
              >
                <Wand2 className="h-4 w-4" />
                Generate Preview
              </Button>
            </CardContent>
          </Card>

          {/* Character Preview */}
          {previewPersona && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Character Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    {previewPersona.name}
                  </h3>
                  {previewPersona.occupation && (
                    <Badge variant="outline" className="mb-2">
                      {previewPersona.occupation}
                    </Badge>
                  )}
                </div>

                <div>
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-1">
                    <Heart className="h-4 w-4" />
                    Backstory
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {previewPersona.backstory}
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-sm mb-2">
                    Personality Traits
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {previewPersona.personalityTraits.map((trait, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="text-xs"
                      >
                        {trait}
                      </Badge>
                    ))}
                  </div>
                </div>

                {previewPersona.relationships && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Relationships</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {previewPersona.relationships.map((rel, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-muted-foreground rounded-full"></span>
                          {rel}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-muted/30 p-3 rounded-md">
                  <p className="text-xs text-muted-foreground">
                    <strong>Note:</strong> This is just a preview. The actual
                    character will be generated by AI during the game setup and
                    may vary from this preview while following your preferences.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSavePreferences} className="flex-1 gap-2">
              <Sparkles className="h-4 w-4" />
              Save Preferences
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
