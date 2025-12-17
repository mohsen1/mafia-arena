import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle, Info, CheckCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

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
    className: 'border-yellow-500/50 text-yellow-700 dark:text-yellow-500',
  },
  info: {
    icon: Info,
    className: 'border-blue-500/50 text-blue-700 dark:text-blue-500',
  },
  success: {
    icon: CheckCircle,
    className: 'border-green-500/50 text-green-700 dark:text-green-500',
  },
};

export function ErrorAlert({
  type = 'error',
  title,
  message,
  className,
  onClose,
}: ErrorAlertProps) {
  const { t } = useTranslation();
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
          className="absolute top-3 right-3 opacity-70 hover:opacity-100 transition-opacity"
          aria-label={t('errorAlert.closeAlert')}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </Alert>
  );
}
