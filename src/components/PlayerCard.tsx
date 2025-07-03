'use client';

import type { FilteredPlayer } from '@/lib/interfaces/client.types';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import {
  PersonStanding,
  Skull,
  User,
  Bot,
  Shield,
  Sword,
  Eye,
  Heart,
} from 'lucide-react';
// Import from react-i18next
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

interface PlayerCardProps {
  player: FilteredPlayer;
}

export function PlayerCard({ player }: PlayerCardProps) {
  // Use standard hook
  const { t } = useTranslation('translation'); // Keep namespace for now

  const isAlive = player.status === 'Alive';
  const roleToDisplay = player.roleName
    ? t(player.roleName, player.roleName)
    : t('RoleUnknown', 'Unknown Role');

  const getRoleIcon = (role?: string) => {
    switch (role) {
      case 'Villager':
        return <Shield className="h-3 w-3" />;
      case 'Mafia':
        return <Sword className="h-3 w-3" />;
      case 'Seer':
        return <Eye className="h-3 w-3" />;
      case 'Doctor':
        return <Heart className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const roleIcon = getRoleIcon(player.roleName);

  return (
    <div
      className={cn(
        'flex items-center space-x-2 rtl:space-x-reverse p-2 rounded-md transition-all duration-200',
        isAlive ? 'opacity-100 hover:bg-accent/50' : 'opacity-60',
        player.isMafia && 'bg-danger/10 hover:bg-danger/20'
      )}
    >
      <div className="relative flex-shrink-0 w-10 h-10">
        {/* Note: isHuman is not available in FilteredPlayer, so checking if imageUrl exists */}
        {player.imageUrl ? (
          <Image
            src={player.imageUrl}
            alt={t('PlayerImageAltText', { name: player.name })}
            width={40}
            height={40}
            className="rounded-full w-10 h-10 object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
        )}
        <div
          className={cn(
            'absolute -bottom-1 -right-1 transform',
            'rounded-full p-0.5 border-2 border-background',
            isAlive ? 'bg-success' : 'bg-muted-foreground'
          )}
        >
          {isAlive ? (
            <PersonStanding size={10} className="text-success-foreground" />
          ) : (
            <Skull size={10} className="text-muted" />
          )}
        </div>
      </div>
      <div className="flex-grow min-w-0 ms-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate text-card-foreground">
            {player.name}
          </p>
          {player.isHuman && (
            <Badge variant="outline" className="text-xs px-1 py-0 h-4">
              {t('You', 'You')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {roleIcon && (
            <span className="flex items-center gap-1">
              {roleIcon}
              <span>{roleToDisplay}</span>
            </span>
          )}
          {!isAlive && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span className="text-destructive">
                {t('PlayerStatusDead', 'Dead')}
              </span>
            </>
          )}
        </div>
      </div>
      {/* AI indicator for non-human players */}
      {!player.isHuman && isAlive && (
        <Bot className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
      )}
    </div>
  );
}
