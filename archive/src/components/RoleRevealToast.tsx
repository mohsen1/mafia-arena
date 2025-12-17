'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { Skull } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RoleRevealToastProps {
  playerName: string;
  role: string;
  isEvil: boolean;
  reason: 'voted' | 'killed';
}

export function RoleRevealToast({
  playerName,
  role,
  isEvil,
  reason,
}: RoleRevealToastProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const getRoleIcon = (roleName: string) => {
      switch (roleName.toLowerCase()) {
        case 'mafia':
          return '🗡️';
        case 'villager':
          return '👥';
        case 'seer':
          return '👁️';
        case 'doctor':
          return '❤️';
        default:
          return '🛡️';
      }
    };

    const icon = getRoleIcon(role);
    const reasonText =
      reason === 'voted'
        ? t('WasVotedOut', 'was voted out')
        : t('WasKilledAtNight', 'was killed');

    // Create a custom toast with role reveal
    toast.custom(
      () => (
        <div className="flex items-center gap-3 p-4 bg-background border rounded-lg shadow-lg">
          <div className="flex-shrink-0">
            <Skull className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">
              {playerName} {reasonText}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              {t('TheyWere', 'They were')}
              <span
                className={`font-bold ${isEvil ? 'text-red-500' : 'text-blue-500'}`}
              >
                {icon} {t(role, role)}
              </span>
            </p>
          </div>
        </div>
      ),
      {
        duration: 6000,
        position: 'top-center',
      }
    );
  }, [playerName, role, isEvil, reason, t]);

  return null;
}
