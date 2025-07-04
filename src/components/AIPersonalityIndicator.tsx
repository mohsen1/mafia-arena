'use client';

import { useState } from 'react';
import { Brain, Heart, Zap, Shield, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import type { Persona } from '@/lib/engine/interfaces/Persona';

interface AIPersonalityIndicatorProps {
  persona?: Persona;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

interface PersonalityTrait {
  trait: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const TRAIT_MAPPINGS: Record<string, PersonalityTrait> = {
  // Analytical traits
  analytical: {
    trait: 'Analytical',
    icon: <Brain className="w-full h-full" />,
    color: 'text-blue-500',
    description: 'Logical thinker, focuses on evidence',
  },
  observant: {
    trait: 'Observant',
    icon: <Eye className="w-full h-full" />,
    color: 'text-purple-500',
    description: 'Notices details others might miss',
  },

  // Emotional traits
  emotional: {
    trait: 'Emotional',
    icon: <Heart className="w-full h-full" />,
    color: 'text-pink-500',
    description: 'Driven by feelings and empathy',
  },
  passionate: {
    trait: 'Passionate',
    icon: <Heart className="w-full h-full" />,
    color: 'text-red-500',
    description: 'Strong convictions and enthusiasm',
  },

  // Action traits
  aggressive: {
    trait: 'Aggressive',
    icon: <Zap className="w-full h-full" />,
    color: 'text-orange-500',
    description: 'Quick to act and confront',
  },
  impulsive: {
    trait: 'Impulsive',
    icon: <Zap className="w-full h-full" />,
    color: 'text-yellow-500',
    description: 'Acts on instinct without hesitation',
  },

  // Defensive traits
  cautious: {
    trait: 'Cautious',
    icon: <Shield className="w-full h-full" />,
    color: 'text-green-500',
    description: 'Careful and risk-averse',
  },
  defensive: {
    trait: 'Defensive',
    icon: <Shield className="w-full h-full" />,
    color: 'text-teal-500',
    description: 'Protective of self and allies',
  },
};

export function AIPersonalityIndicator({
  persona,
  className,
  size = 'md',
}: AIPersonalityIndicatorProps) {
  const [showAll, setShowAll] = useState(false);

  if (!persona?.personalityTraits || persona.personalityTraits.length === 0) {
    return null;
  }

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  // Map personality traits to visual indicators
  const mappedTraits = persona.personalityTraits
    .map((trait) => {
      const lowerTrait = trait.toLowerCase();
      // Find matching trait mapping
      for (const [key, mapping] of Object.entries(TRAIT_MAPPINGS)) {
        if (lowerTrait.includes(key)) {
          return mapping;
        }
      }
      // Default mapping for unmapped traits
      return {
        trait,
        icon: <Brain className="w-full h-full" />,
        color: 'text-gray-500',
        description: trait,
      };
    })
    .slice(0, showAll ? undefined : 3); // Show max 3 traits unless expanded

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <TooltipProvider>
        {mappedTraits.map((traitInfo, index) => (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'rounded-full p-1 bg-background border',
                  sizeClasses[size],
                  traitInfo.color
                )}
              >
                {traitInfo.icon}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-semibold">{traitInfo.trait}</p>
                <p className="text-xs text-muted-foreground">
                  {traitInfo.description}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>

      {persona.personalityTraits.length > 3 && !showAll && (
        <Badge
          variant="secondary"
          className="text-xs cursor-pointer"
          onClick={() => setShowAll(true)}
        >
          +{persona.personalityTraits.length - 3}
        </Badge>
      )}

      {persona.quirk && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs">
                Quirk
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{persona.quirk}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
