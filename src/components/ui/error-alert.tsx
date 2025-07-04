import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertType = 'error' | 'warning' | 'info' | 'success';

interface ErrorAlertProps {
  type?: AlertType;
  title?: string;
  message: string;
  className?: string;
  onClose?: () => void;
}

const alertConfig = {
  error: {
    icon: AlertCircle,
    className: 'border-destructive/50 text-destructive',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-yellow-500/50 text-yellow-700 dark:text-yellow-400',
  },
  info: {
    icon: Info,
    className: 'border-blue-500/50 text-blue-700 dark:text-blue-400',
  },
  success: {
    icon: CheckCircle,
    className: 'border-green-500/50 text-green-700 dark:text-green-400',
  },
};

export function ErrorAlert({
  type = 'error',
  title,
  message,
  className,
  onClose,
}: ErrorAlertProps) {
  const config = alertConfig[type];
  const Icon = config.icon;

  return (
    <Alert className={cn(config.className, className)}>
      <Icon className="h-4 w-4" />
      <AlertDescription>
        {title && <span className="font-medium">{title}: </span>}
        {message}
      </AlertDescription>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 rounded-md hover:bg-secondary/50 transition-colors"
          aria-label="Close alert"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </Alert>
  );
}
