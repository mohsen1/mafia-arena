'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface DialogContentProps {
  className?: string;
  children: React.ReactNode;
}

interface DialogHeaderProps {
  className?: string;
  children: React.ReactNode;
}

interface DialogTitleProps {
  className?: string;
  children: React.ReactNode;
}

interface DialogDescriptionProps {
  className?: string;
  children: React.ReactNode;
}

interface DialogFooterProps {
  className?: string;
  children: React.ReactNode;
}

interface DialogTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog content */}
      <div className="relative z-50">{children}</div>
    </div>
  );
}

export function DialogTrigger({
  asChild = false,
  children,
}: DialogTriggerProps) {
  if (asChild) {
    return <>{children}</>;
  }

  return <div>{children}</div>;
}

export function DialogContent({ className, children }: DialogContentProps) {
  return (
    <div
      className={cn(
        'bg-background border rounded-lg shadow-lg p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DialogHeader({ className, children }: DialogHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5 text-center sm:text-left mb-4',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DialogTitle({ className, children }: DialogTitleProps) {
  return (
    <h3
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className
      )}
    >
      {children}
    </h3>
  );
}

export function DialogDescription({
  className,
  children,
}: DialogDescriptionProps) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
  );
}

export function DialogFooter({ className, children }: DialogFooterProps) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6',
        className
      )}
    >
      {children}
    </div>
  );
}
