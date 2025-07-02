/**
 * Enhanced Character Slot Component
 *
 * Combines improved image selection and character preview features
 * to provide a better user experience for character setup.
 */

'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EnhancedImageSelector } from './enhanced-image-selector';
import { CharacterPreview } from './character-preview';
import type { CharacterPreferences } from './character-preview';
import {
  User,
  Bot,
  Trash2,
  Eye,
  Crown,
  Shield,
  Heart,
  Stethoscope,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EnhancedCharacterSlotProps {
  id: string;
  name: string;
  role: string;
  imageUrl: string | null;
  aiProvider?: string;
  aiModel?: string;
  isHuman: boolean;
  gameTheme: string;
  availableRoles: string[];
  onNameChange: (id: string, name: string) => void;
  onRoleChange: (id: string, role: string) => void;
  onImageChange: (id: string, imageUrl: string | null) => void;
  onRemove: (id: string) => void;
  onPreferencesUpdate?: (id: string, preferences: CharacterPreferences) => void;
  className?: string;
}

// Role icons and descriptions
const ROLE_INFO = {
  Villager: {
    icon: Heart,
    description: 'Peaceful resident seeking to identify the werewolves',
    color: 'text-blue-500',
  },
  Mafia: {
    icon: Crown,
    description: 'Hidden enemy working to eliminate the villagers',
    color: 'text-red-500',
  },
  Seer: {
    icon: Eye,
    description: "Mystical character who can discover others' true nature",
    color: 'text-purple-500',
  },
  Doctor: {
    icon: Stethoscope,
    description: 'Healer who can protect others from harm',
    color: 'text-green-500',
  },
};

export function EnhancedCharacterSlot({
  id,
  name,
  role,
  imageUrl,
  aiProvider,
  aiModel,
  isHuman,
  gameTheme,
  availableRoles,
  onNameChange,
  onRoleChange,
  onImageChange,
  onRemove,
  onPreferencesUpdate,
  className,
}: EnhancedCharacterSlotProps) {
  const [localName, setLocalName] = useState(name);

  const handleNameBlur = useCallback(() => {
    if (localName !== name) {
      onNameChange(id, localName);
    }
  }, [id, localName, name, onNameChange]);

  const handleNameKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNameBlur();
      }
    },
    [handleNameBlur]
  );

  const handleRoleSelect = useCallback(
    (newRole: string) => {
      onRoleChange(id, newRole);
    },
    [id, onRoleChange]
  );

  const handleImageSelect = useCallback(
    (newImageUrl: string | null) => {
      onImageChange(id, newImageUrl);
    },
    [id, onImageChange]
  );

  const handleRemove = useCallback(() => {
    onRemove(id);
  }, [id, onRemove]);

  const handlePreferencesUpdate = useCallback(
    (preferences: CharacterPreferences) => {
      if (onPreferencesUpdate) {
        onPreferencesUpdate(id, preferences);
      }
    },
    [id, onPreferencesUpdate]
  );

  const roleInfo = ROLE_INFO[role as keyof typeof ROLE_INFO];
  const RoleIcon = roleInfo?.icon || Shield;

  return (
    <Card
      className={cn(
        'transition-all duration-200 hover:shadow-md',
        isHuman ? 'ring-2 ring-primary/30 bg-primary/5' : '',
        className
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-3">
            {/* Character Image with Enhanced Selector */}
            <div className="relative">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={name || 'Character'}
                  width={48}
                  height={48}
                  className="rounded-full object-cover border-2 border-border"
                />
              ) : isHuman ? (
                <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-muted border-2 border-border flex items-center justify-center">
                  <Bot className="h-6 w-6 text-muted-foreground" />
                </div>
              )}

              {/* Enhanced Image Selector */}
              <div className="absolute -bottom-1 -right-1">
                <EnhancedImageSelector
                  selectedImage={imageUrl}
                  onImageSelect={handleImageSelect}
                  triggerClassName="w-6 h-6"
                />
              </div>
            </div>

            {/* Character Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <RoleIcon
                  className={cn(
                    'h-4 w-4',
                    roleInfo?.color || 'text-muted-foreground'
                  )}
                />
                <Badge
                  variant={isHuman ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {isHuman ? 'Human' : 'AI'}
                </Badge>
              </div>
              <h3 className="font-medium text-sm text-muted-foreground">
                {isHuman ? 'You' : 'AI Character'}
              </h3>
            </div>
          </div>

          {/* Remove Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Character Name */}
        <div>
          <Label htmlFor={`name-${id}`} className="text-sm font-medium">
            Character Name
          </Label>
          <Input
            id={`name-${id}`}
            value={localName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setLocalName(e.target.value)
            }
            onBlur={handleNameBlur}
            onKeyPress={handleNameKeyPress}
            placeholder={isHuman ? 'Your character name' : 'AI character name'}
            className="mt-1"
          />
        </div>

        {/* Role Selection */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Role</Label>
          <Select value={role} onValueChange={handleRoleSelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {availableRoles.map((availableRole) => {
                const info = ROLE_INFO[availableRole as keyof typeof ROLE_INFO];
                const Icon = info?.icon || Shield;
                return (
                  <SelectItem key={availableRole} value={availableRole}>
                    <div className="flex items-center gap-2">
                      <Icon
                        className={cn(
                          'h-4 w-4',
                          info?.color || 'text-muted-foreground'
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{availableRole}</span>
                        {info && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {info.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* AI Provider Info (for AI characters) */}
        {!isHuman && (aiProvider || aiModel) && (
          <div className="bg-muted/30 rounded-md p-3">
            <div className="flex items-center gap-2 mb-1">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">AI Configuration</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              {aiProvider && <p>Provider: {aiProvider}</p>}
              {aiModel && <p>Model: {aiModel}</p>}
            </div>
          </div>
        )}

        {/* Character Preview (for AI characters) */}
        {!isHuman && (
          <div className="flex gap-2">
            <CharacterPreview
              characterName={name}
              imageUrl={imageUrl}
              role={role}
              gameTheme={gameTheme}
              onPreferencesUpdate={handlePreferencesUpdate}
              className="flex-1"
            />
          </div>
        )}

        {/* Human Player Info */}
        {isHuman && (
          <div className="bg-primary/10 rounded-md p-3">
            <div className="flex items-center gap-2 mb-1">
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                Human Player
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              You&apos;ll control this character during the game. Create a
              persona that fits the game theme.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
