'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import {
  generateAvatarDataURL,
  generateInitialsAvatar,
  type AvatarOptions,
} from '@/lib/avatarGenerator';
import type { RoleName } from '@/lib/engine/interfaces/IRole';

interface DynamicAvatarProps {
  name: string;
  role?: RoleName;
  imageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  style?: AvatarOptions['style'];
  className?: string;
  showRole?: boolean;
  animate?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24',
};

const roleBadgeClasses = {
  sm: 'w-3 h-3 -bottom-0.5 -right-0.5',
  md: 'w-4 h-4 -bottom-1 -right-1',
  lg: 'w-6 h-6 -bottom-1.5 -right-1.5',
  xl: 'w-8 h-8 -bottom-2 -right-2',
};

const roleEmojis: Record<RoleName, string> = {
  Villager: '👨‍🌾',
  Mafia: '🐺',
  Seer: '🔮',
  Doctor: '⚕️',
};

export function DynamicAvatar({
  name,
  role,
  imageUrl,
  size = 'md',
  style = 'abstract',
  className,
  showRole = false,
  animate = false,
}: DynamicAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const generatedAvatar = useMemo(() => {
    if (imageUrl && !imageError) {
      return null;
    }

    const options: AvatarOptions = {
      seed: name,
      role,
      style,
    };

    return generateAvatarDataURL(options);
  }, [name, role, style, imageUrl, imageError]);

  const fallbackAvatar = useMemo(() => {
    return generateInitialsAvatar(name);
  }, [name]);

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-full',
          sizeClasses[size],
          animate && 'transition-transform hover:scale-110'
        )}
      >
        {imageUrl && !imageError ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover"
            onError={handleImageError}
            sizes={
              size === 'xl'
                ? '96px'
                : size === 'lg'
                ? '64px'
                : size === 'md'
                ? '40px'
                : '32px'
            }
          />
        ) : generatedAvatar ? (
          <div
            className="w-full h-full"
            dangerouslySetInnerHTML={{
              __html: generatedAvatar.replace('data:image/svg+xml;base64,', ''),
            }}
            style={{
              backgroundImage: `url("${generatedAvatar}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `url("${fallbackAvatar}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
      </div>

      {/* Role Badge */}
      {showRole && role && (
        <div
          className={cn(
            'absolute rounded-full bg-background border-2 border-background flex items-center justify-center',
            roleBadgeClasses[size]
          )}
        >
          <span
            className={cn(
              'text-xs',
              size === 'xl' && 'text-base',
              size === 'lg' && 'text-sm'
            )}
          >
            {roleEmojis[role]}
          </span>
        </div>
      )}

      {/* Pulse Animation for Active Players */}
      {animate && (
        <div className="absolute inset-0 rounded-full">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        </div>
      )}
    </div>
  );
} 