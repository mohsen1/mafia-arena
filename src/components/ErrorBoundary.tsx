'use client';

import React, { Component, ReactNode } from 'react';
import { GameErrorDisplay } from './GameErrorDisplay';
import { GameError } from '@/lib/errors/GameError';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  lang?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to error reporting service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // In production, you might want to send this to an error tracking service
    if (process.env.NODE_ENV === 'production') {
      // Example: logErrorToService(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      // Convert regular errors to GameError for consistent display
      const gameError = this.state.error instanceof GameError 
        ? this.state.error 
        : GameError.fromUnknown(this.state.error);

      // Default error display
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <GameErrorDisplay
            error={gameError}
            onRetry={this.handleReset}
            lang={this.props.lang}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook to use with error boundaries in functional components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  const resetError = () => setError(null);
  const captureError = (error: Error) => setError(error);

  return { resetError, captureError };
} 