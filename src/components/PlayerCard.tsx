'use client';

import type { FilteredPlayer } from '@/lib/interfaces/client.types';
import { cn } from '@/lib/utils';
import {
  PersonStanding,
  Skull,
  Bot,
  Shield,
  Sword,
  Eye,
  Heart,
} from 'lucide-react';
// Import from react-i18next
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { DynamicAvatar } from '@/components/ui/dynamic-avatar';

interface PlayerCardProps {
  player: FilteredPlayer;
}

export function PlayerCard({ player }: PlayerCardProps) {
  const { t } = useTranslation();
  const isAlive = player.status === 'Alive';
  const isDead = player.status === 'Dead';

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
        'flex items-center gap-3 p-3 rounded-lg transition-all',
        'bg-card hover:bg-accent/50',
        isDead && 'opacity-60',
        player.isMafia && 'bg-danger/10 hover:bg-danger/20'
      )}
    >
      <div className="relative flex-shrink-0">
        <DynamicAvatar
          name={player.name}
          role={player.roleName}
          imageUrl={player.imageUrl}
          size="md"
          showRole={!!player.roleName}
          animate={isAlive}
        />
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
