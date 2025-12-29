/**
 * ThemeIcon - Renders the appropriate icon for a game theme.
 */

import { Feather, Scroll, Building2, Sparkles } from 'lucide-react';

interface ThemeIconProps {
  type: string;
  size?: number;
  className?: string;
}

export function ThemeIcon({ type, size = 10, className }: ThemeIconProps) {
  switch (type) {
    case 'feather':
      return <Feather size={size} className={className} />;
    case 'scroll':
      return <Scroll size={size} className={className} />;
    case 'building':
      return <Building2 size={size} className={className} />;
    case 'sparkles':
      return <Sparkles size={size} className={className} />;
    default:
      return null;
  }
}

