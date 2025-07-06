import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AISuggestion } from '@/hooks/useAISuggestions';

interface AISuggestionPillsProps {
  suggestions: AISuggestion[];
  isLoading: boolean;
  error: string | null;
  onSuggestionClick: (suggestion: string) => void;
  onRefresh?: () => void;
  className?: string;
}

export function AISuggestionPills({
  suggestions,
  isLoading,
  error,
  onSuggestionClick,
  onRefresh,
  className,
}: AISuggestionPillsProps) {
  if (error) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-xs text-muted-foreground',
          className
        )}
      >
        <Sparkles className="h-3 w-3" />
        <span>Suggestions unavailable</span>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            className="h-6 px-2 text-xs"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-xs text-muted-foreground',
          className
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Generating suggestions...</span>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span>AI suggests:</span>
      </div>
      {suggestions.map((suggestion) => (
        <Badge
          key={suggestion.id}
          variant="outline"
          className="cursor-pointer hover:bg-primary/10 hover:border-primary/20 transition-colors text-xs px-3 py-1 rounded-full max-w-[200px] truncate"
          onClick={() => onSuggestionClick(suggestion.content)}
          title={suggestion.content}
        >
          {suggestion.content}
        </Badge>
      ))}
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="h-6 px-2 text-xs"
          title="Refresh suggestions"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
