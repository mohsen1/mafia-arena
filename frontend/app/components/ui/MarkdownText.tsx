/**
 * MarkdownText - Safe markdown renderer for AI messages.
 * Strips disruptive elements (large headers, images, hr) while preserving
 * useful formatting like bold, italic, lists, and code blocks.
 */

import ReactMarkdown from 'react-markdown';
import { cn } from '~/lib/utils';

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export function MarkdownText({ content, className }: MarkdownTextProps) {
  return (
    <ReactMarkdown
      className={cn("markdown-content break-words leading-relaxed", className)}
      components={{
        // Downgrade all headers to bold text to preserve UI layout
        h1: ({ children }) => <strong className="block mt-1.5 mb-0.5 font-bold">{children}</strong>,
        h2: ({ children }) => <strong className="block mt-1.5 mb-0.5 font-bold">{children}</strong>,
        h3: ({ children }) => <strong className="block mt-1.5 mb-0.5 font-bold">{children}</strong>,
        h4: ({ children }) => <strong className="block mt-1 mb-0.5 font-semibold">{children}</strong>,
        h5: ({ children }) => <strong className="block mt-1 mb-0.5 font-semibold">{children}</strong>,
        h6: ({ children }) => <strong className="block mt-1 mb-0.5 font-semibold">{children}</strong>,

        // Strip disruptive elements
        img: () => null,
        hr: () => null,

        // Style paragraphs to respect density
        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,

        // Compact lists
        ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="pl-0.5">{children}</li>,

        // Styled code blocks
        code: ({ className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !String(children).includes('\n');
          
          return isInline ? (
            <code className="bg-muted/50 px-1 py-0.5 rounded font-mono text-[0.9em]" {...props}>
              {children}
            </code>
          ) : (
            <div className="w-full overflow-x-auto my-1.5 rounded-md bg-muted/50 p-2 border border-border/50">
              <code className="font-mono text-[0.85em] block whitespace-pre" {...props}>
                {children}
              </code>
            </div>
          );
        },
        // Let code component handle the block styling, strip pre wrapper styling
        pre: ({ children }) => <>{children}</>,

        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted-foreground/30 pl-2 italic my-1 text-muted-foreground">
            {children}
          </blockquote>
        ),

        // Links (open in new tab for safety)
        a: ({ href, children }) => (
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {children}
          </a>
        ),

        // Strong and emphasis
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

