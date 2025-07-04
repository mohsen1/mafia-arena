'use client'; // Ensure this is a client component

import React, { useState, useCallback, useMemo } from 'react';
import type { ConfigCharacterSlot } from '@/hooks/useGameConfig';
import type { RoleName } from '@/lib/engine/interfaces/IRole';
import { useTranslation } from 'react-i18next'; // Import hook
import { cn } from '@/lib/utils';
import { TableCell, TableRow } from '@/components/ui/table';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ServerCrash, Bot, X, Loader2, User, ImagePlus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProviderModelSelector } from '../ProviderModelSelector';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input'; // Import Input
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'; // Import Popover components
import { CharacterPreview } from '@/components/ui/character-preview';
import type { CharacterPreferences } from '@/components/ui/character-preview';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

// Hardcoded image paths (consider fetching dynamically later)
const characterImagePaths = [
  // Special
  '/images/characters/mod.png',
  // Female - Old
  '/images/characters/female/old/unnamed.png',
  '/images/characters/female/old/unnamed-1.png',
  '/images/characters/female/old/unnamed-8.png',
  '/images/characters/female/old/unnamed-12.png',
  '/images/characters/female/old/unnamed-13.png',
  '/images/characters/female/old/unnamed-14.png',
  // Female - Young
  '/images/characters/female/young/unnamed.png',
  '/images/characters/female/young/unnamed-1.png',
  '/images/characters/female/young/unnamed-3.png',
  '/images/characters/female/young/unnamed-4.png',
  '/images/characters/female/young/unnamed-5.png',
  '/images/characters/female/young/unnamed-6.png',
  '/images/characters/female/young/unnamed-7.png',
  '/images/characters/female/young/unnamed-8.png',
  '/images/characters/female/young/unnamed-9.png',
  // Male - Old
  '/images/characters/male/old/unnamed-2.png',
  '/images/characters/male/old/unnamed-3.png',
  '/images/characters/male/old/unnamed-7.png',
  '/images/characters/male/old/unnamed-9.png',
  '/images/characters/male/old/unnamed-10.png',
  '/images/characters/male/old/unnamed-11.png',
  // Male - Young
  '/images/characters/male/young/unnamed.png',
  '/images/characters/male/young/unnamed-0.png',
  '/images/characters/male/young/unnamed-1.png',
  '/images/characters/male/young/unnamed-2.png',
  '/images/characters/male/young/unnamed-3.png',
  '/images/characters/male/young/unnamed-4.png',
  '/images/characters/male/young/unnamed-6.png',
];

interface CharacterSlotItemProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  index: number;
  availableRoles: RoleName[];
  isSubmitting: boolean;
  canRemove: boolean;
  onUpdateRole: (clientId: string, newRole: RoleName) => void;
  onUpdateProviderAndModel: (
    clientId: string,
    provider: string,
    newModel: string
  ) => void;
  onRemove: (clientId: string) => void;
  onUpdateName: (clientId: string, newName: string) => void;
  onUpdateImageUrl: (clientId: string, newImageUrl: string | null) => void;
  onUpdatePreferences?: (
    clientId: string,
    preferences: CharacterPreferences
  ) => void;
  gameTheme?: string;
}

// --- Helper Component for Character Info (reusable for both layouts) ---
interface CharacterInfoProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  isSubmitting: boolean;
  onUpdateName: (clientId: string, newName: string) => void;
  onUpdateImageUrl: (clientId: string, newImageUrl: string | null) => void;
  onUpdatePreferences?: (
    clientId: string,
    preferences: CharacterPreferences
  ) => void;
  gameTheme?: string;
}

const CharacterInfo: React.FC<CharacterInfoProps> = React.memo(
  ({
    slot,
    isHuman,
    isSubmitting,
    onUpdateName,
    onUpdateImageUrl,
    onUpdatePreferences,
    gameTheme,
  }) => {
    const { t } = useTranslation();
    const [isImagePopoverOpen, setIsImagePopoverOpen] = useState(false);

    const handleNameChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onUpdateName(slot.clientId, event.target.value);
      },
      [onUpdateName, slot.clientId]
    );

    const handleImageSelect = useCallback(
      (selectedImage: string | null) => {
        onUpdateImageUrl(slot.clientId, selectedImage);
        setIsImagePopoverOpen(false);
      },
      [onUpdateImageUrl, slot.clientId]
    );

    // Memoize computed values
    const currentName = useMemo(
      () =>
        slot.profile?.characterName ||
        (isHuman ? t('HumanPlayerLabel', 'You') : t('AIPlayerLabel', 'AI')),
      [slot.profile?.characterName, isHuman, t]
    );

    const currentImageUrl = slot.imageUrl;

    return (
      <div className="flex items-center gap-3 min-w-0">
        {/* Image/Icon Section */}
        <div className="relative flex-shrink-0">
          {currentImageUrl ? (
            <Image
              src={currentImageUrl}
              alt={currentName}
              width={40}
              height={40}
              className="rounded-full object-cover w-10 h-10 border"
            />
          ) : isHuman ? (
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border">
              <Bot className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          {/* Image Selection Popover */}
          <Popover
            open={isImagePopoverOpen}
            onOpenChange={setIsImagePopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background bg-muted hover:bg-muted/80 p-0.5"
                disabled={isSubmitting}
                aria-label={t(
                  'SelectPlayerImageAriaLabel',
                  'Select player image'
                )}
              >
                <ImagePlus className="h-3 w-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-96 overflow-y-auto p-2">
              <div className="grid grid-cols-5 gap-2">
                {characterImagePaths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className={cn(
                      'rounded-md overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border border-transparent',
                      currentImageUrl === path
                        ? 'ring-2 ring-primary ring-offset-2 border-primary'
                        : 'hover:border-muted-foreground'
                    )}
                    onClick={() => handleImageSelect(path)}
                    aria-label={`${t('SelectImageAriaLabel', 'Select Image')} ${path.split('/').pop()}`}
                  >
                    <Image
                      src={path}
                      alt={`Character ${path.split('/').pop()}`}
                      width={48}
                      height={48}
                      className="object-cover w-12 h-12"
                    />
                  </button>
                ))}
                {/* Optional: Button to clear selection */}
                <button
                  key="clear"
                  type="button"
                  className={cn(
                    'flex items-center justify-center rounded-md border border-dashed text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-12 h-12',
                    !currentImageUrl
                      ? 'ring-2 ring-primary ring-offset-2 border-primary'
                      : 'hover:border-muted-foreground'
                  )}
                  onClick={() => handleImageSelect(null)}
                  aria-label={t(
                    'ClearImageSelectionAriaLabel',
                    'Clear image selection'
                  )}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Name Input Section */}
        <div className="flex-grow min-w-0">
          {slot.isGenerated &&
          !slot.generationError &&
          slot.profile?.characterName ? (
            // Display generated name if available (non-editable for now)
            <span
              className="font-medium truncate block text-sm text-foreground"
              title={slot.profile.characterName}
            >
              {slot.profile.characterName}
            </span>
          ) : slot.generationError ? (
            <div className="flex items-center text-destructive text-sm gap-2">
              <ServerCrash className="h-5 w-5 text-destructive flex-shrink-0" />
              <span className="truncate" title={slot.generationError}>
                {t('GenerationErrorPrefix', 'Error')}: {slot.generationError}
              </span>
            </div>
          ) : (
            // Editable Name Input
            <div className="flex items-center gap-2 w-full">
              <Input
                type="text"
                value={slot.profile?.characterName || ''}
                onChange={handleNameChange}
                className="text-xs h-9 flex-1"
                placeholder={t('CharacterNamePlaceholder', 'Character name')}
                disabled={isSubmitting}
                required
              />
            </div>
          )}

          {isHuman && (
            <span className="text-xs text-primary font-semibold block mt-0.5">
              {t('HumanPlayerLabel', '(You)')}
            </span>
          )}

          {/* Add Character Preview button for AI characters */}
          {!isHuman && onUpdatePreferences && gameTheme && (
            <div className="mt-1">
              <CharacterPreview
                characterName={slot.profile?.characterName || ''}
                imageUrl={slot.imageUrl || null}
                role={slot.roleSelection}
                gameTheme={gameTheme}
                onPreferencesUpdate={(preferences) =>
                  onUpdatePreferences(slot.clientId, preferences)
                }
                className="h-7 text-xs px-2"
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);

CharacterInfo.displayName = 'CharacterInfo';

// --- End Helper Component ---

// Role descriptions
const ROLE_DESCRIPTIONS: Record<string, string> = {
  Villager:
    'A regular townsperson trying to identify and eliminate the Mafia members during day discussions.',
  Mafia:
    'A secret villain who eliminates players at night and tries to blend in during the day.',
  Seer: 'A mystical villager who can investigate one player each night to learn their true role.',
  Doctor:
    'A protective villager who can save one player from elimination each night.',
};

export const CharacterSlotMobile = React.memo(function CharacterSlotMobile({
  slot,
  isHuman,
  index,
  availableRoles,
  isSubmitting,
  canRemove,
  onUpdateRole,
  onUpdateProviderAndModel,
  onRemove,
  onUpdateName,
  onUpdateImageUrl,
  onUpdatePreferences,
  gameTheme,
}: CharacterSlotItemProps) {
  const { t } = useTranslation();

  const handleRemoveClick = useCallback(() => {
    onRemove(slot.clientId);
  }, [onRemove, slot.clientId]);

  const handleSlotProviderModelChange = useCallback(
    (provider: string, model: string) => {
      onUpdateProviderAndModel(slot.clientId, provider, model);
    },
    [onUpdateProviderAndModel, slot.clientId]
  );

  const handleRoleChange = useCallback(
    (newRole: string) => {
      onUpdateRole(slot.clientId, newRole as RoleName);
    },
    [onUpdateRole, slot.clientId]
  );

  // Common props for ProviderModelSelector
  const providerModelSelectorProps = useMemo(
    () => ({
      selectedModel: slot.aiModel,
      selectedProviderValue: slot.provider,
      onProviderModelChange: handleSlotProviderModelChange,
      disabled: isSubmitting,
      className: 'flex-col !items-start w-full !gap-1',
      labelClassName: 'hidden',
      selectTriggerClassName: 'w-full text-xs h-9',
    }),
    [slot.aiModel, slot.provider, handleSlotProviderModelChange, isSubmitting]
  );

  // Remove Button
  const removeButton = canRemove && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleRemoveClick}
      disabled={isSubmitting}
      className="p-1 text-muted-foreground hover:text-destructive h-9 w-auto"
      aria-label={`${t('RemovePlayerSlotAriaLabel', 'Remove player slot')} ${index + 1}`}
    >
      {isSubmitting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <X className="h-5 w-5" />
          <span className="ms-1 text-xs">
            {t('DeleteButtonLabel', 'Delete')}
          </span>
        </>
      )}
    </Button>
  );

  return (
    <div
      className={cn(
        'p-4 border-b space-y-3',
        slot.generationError ? 'bg-destructive/10' : 'bg-card',
        isHuman
          ? 'border border-primary/30 data-[state=selected]:bg-primary/10'
          : ''
      )}
      data-state={isHuman ? 'selected' : undefined}
    >
      {/* Character Info & Remove Button */}
      <div className="flex justify-between items-start">
        <CharacterInfo
          slot={slot}
          isHuman={isHuman}
          isSubmitting={isSubmitting}
          onUpdateName={onUpdateName}
          onUpdateImageUrl={onUpdateImageUrl}
          onUpdatePreferences={onUpdatePreferences}
          gameTheme={gameTheme}
        />
        {/* Move remove button here for mobile next to character info */}
        <div className="ms-2 flex-shrink-0">{removeButton}</div>
      </div>

      {/* Role Selector */}
      <div>
        <Label
          htmlFor={`role-${slot.clientId}-mobile`}
          className="text-xs font-medium text-muted-foreground mb-1 block"
        >
          {t('TableHeader_Role', 'Role')}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 inline-block ms-1 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  {ROLE_DESCRIPTIONS[slot.roleSelection] ||
                    'Select a role to see its description'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <Select
          value={slot.roleSelection}
          onValueChange={handleRoleChange}
          required
          disabled={isSubmitting}
        >
          <SelectTrigger
            className="w-full text-xs h-9 text-left"
            id={`role-${slot.clientId}-mobile`}
          >
            <SelectValue
              className="truncate"
              placeholder={t('SelectRolePlaceholder', 'Select role')}
            />
          </SelectTrigger>
          <SelectContent>
            {availableRoles.map((roleId) => (
              <SelectItem key={roleId} value={roleId} className="text-xs">
                {t(roleId, roleId)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* AI Provider & Model Selectors (Conditional) */}
      {isHuman ? (
        <div className="text-muted-foreground italic text-center text-sm py-2">
          {t('HumanControlledLabel', 'Human Controlled')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Provider */}
          <div>
            <Label
              htmlFor={`slot-${slot.clientId}-pv-mobile-trigger`}
              className="text-xs font-medium text-muted-foreground mb-1 block"
            >
              {t('TableHeader_Provider', 'AI Provider')}
            </Label>
            <ProviderModelSelector
              {...providerModelSelectorProps}
              idPrefix={`slot-${slot.clientId}-pv-mobile`}
              mode="provider"
            />
          </div>
          {/* Model */}
          <div>
            <Label
              htmlFor={`slot-${slot.clientId}-md-mobile-trigger`}
              className="text-xs font-medium text-muted-foreground mb-1 block"
            >
              {t('TableHeader_Model', 'AI Model')}
            </Label>
            <ProviderModelSelector
              {...providerModelSelectorProps}
              idPrefix={`slot-${slot.clientId}-md-mobile`}
              mode="model"
            />
          </div>
        </div>
      )}
    </div>
  );
});

export const CharacterSlotItem: React.FC<CharacterSlotItemProps> = React.memo(
  function CharacterSlotItem({
    slot,
    isHuman,
    index,
    availableRoles,
    isSubmitting,
    canRemove,
    onUpdateRole,
    onUpdateProviderAndModel,
    onRemove,
    onUpdateName,
    onUpdateImageUrl,
    onUpdatePreferences,
    gameTheme,
  }) {
    const { t } = useTranslation();
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: slot.clientId });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const handleRoleChange = useCallback(
      (newRole: string) => {
        onUpdateRole(slot.clientId, newRole as RoleName);
      },
      [onUpdateRole, slot.clientId]
    );

    const handleProviderModelChange = useCallback(
      (provider: string, model: string) => {
        onUpdateProviderAndModel(slot.clientId, provider, model);
      },
      [onUpdateProviderAndModel, slot.clientId]
    );

    const handleRemove = useCallback(() => {
      onRemove(slot.clientId);
    }, [onRemove, slot.clientId]);

    // Common props for ProviderModelSelector
    const providerModelSelectorProps = useMemo(
      () => ({
        selectedModel: slot.aiModel,
        selectedProviderValue: slot.provider,
        onProviderModelChange: handleProviderModelChange,
        disabled: isSubmitting,
        className: 'flex-col !items-start w-full !gap-1',
        labelClassName: 'hidden',
        selectTriggerClassName: 'w-full text-xs h-9',
      }),
      [slot.aiModel, slot.provider, handleProviderModelChange, isSubmitting]
    );

    return (
      <TableRow
        ref={setNodeRef}
        style={style}
        className={cn('transition-colors', isDragging && 'bg-muted/50')}
      >
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {!isHuman && (
              <button
                className="cursor-grab touch-none p-1 hover:bg-accent rounded"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <CharacterInfo
              slot={slot}
              isHuman={isHuman}
              isSubmitting={isSubmitting}
              onUpdateName={onUpdateName}
              onUpdateImageUrl={onUpdateImageUrl}
              onUpdatePreferences={onUpdatePreferences}
              gameTheme={gameTheme}
            />
          </div>
        </TableCell>

        {/* Role Cell */}
        <TableCell>
          <div className="flex items-center gap-1">
            <Select
              value={slot.roleSelection}
              onValueChange={handleRoleChange}
              required
              disabled={isSubmitting}
            >
              <SelectTrigger
                className="w-[150px] text-xs h-9 text-left"
                id={`role-${slot.clientId}-desktop`}
              >
                <SelectValue
                  className="truncate"
                  placeholder={t('SelectRolePlaceholder', 'Select role')}
                />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((roleId) => (
                  <SelectItem key={roleId} value={roleId} className="text-xs">
                    {t(roleId, roleId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    {ROLE_DESCRIPTIONS[slot.roleSelection] ||
                      'Select a role to see its description'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </TableCell>

        {/* AI Provider & Model Cells (Conditional) */}
        {isHuman ? (
          <TableCell
            colSpan={2}
            className="text-muted-foreground italic text-center"
          >
            {t('HumanControlledLabel', 'Human Controlled')}
          </TableCell>
        ) : (
          <>
            <TableCell>
              <ProviderModelSelector
                {...providerModelSelectorProps}
                idPrefix={`slot-${slot.clientId}-pv-desktop`}
                mode="provider"
              />
            </TableCell>
            <TableCell>
              <ProviderModelSelector
                {...providerModelSelectorProps}
                idPrefix={`slot-${slot.clientId}-md-desktop`}
                mode="model"
              />
            </TableCell>
          </>
        )}

        {/* Action Cell */}
        <TableCell className="text-right">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isSubmitting}
            className="p-1 text-muted-foreground hover:text-destructive h-9 w-auto"
            aria-label={`${t('RemovePlayerSlotAriaLabel', 'Remove player slot')} ${index + 1}`}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <X className="h-5 w-5" />
                <span className="ms-1 text-xs">
                  {t('DeleteButtonLabel', 'Delete')}
                </span>
              </>
            )}
          </Button>
        </TableCell>
      </TableRow>
    );
  }
);
