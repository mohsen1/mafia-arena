'use client'

import { memo } from 'react'
import ReactMarkdown, { type Options } from 'react-markdown'

// Explicitly define props including className for comparison
interface MemoizedProps extends Options {
  className?: string;
}

// Create the memoized version of ReactMarkdown
export const MemoizedReactMarkdown: React.FC<MemoizedProps> = memo(
  ReactMarkdown as React.FC<MemoizedProps>, // Cast to satisfy memo
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className
);

// Set display name for debugging
MemoizedReactMarkdown.displayName = 'MemoizedReactMarkdown'; 