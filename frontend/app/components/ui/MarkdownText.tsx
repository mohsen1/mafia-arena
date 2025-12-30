/**
 * MarkdownText - Safe markdown renderer.
 * 
 * Variants:
 * - "compact" (default): For AI messages, downgrades headers to bold
 * - "prose": For documentation pages, renders proper headings with typography
 */

import ReactMarkdown from 'react-markdown';
import { cn } from '~/lib/utils';

interface MarkdownTextProps {
  content: string;
  className?: string;
  variant?: 'compact' | 'prose';
}

export function MarkdownText({ content, className, variant = 'compact' }: MarkdownTextProps) {
  if (variant === 'prose') {
    return (
      <div className={cn("markdown-prose", className)}>
        <ReactMarkdown
          components={{
            // Proper heading hierarchy for documentation
            h1: ({ children }) => (
              <h1 className="text-4xl font-display font-bold mb-3 text-foreground">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-2xl font-display font-semibold mt-12 mb-4 pb-2 border-b border-border/50 text-foreground">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-display font-medium mt-8 mb-3 text-foreground">{children}</h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-base font-display font-medium mt-4 mb-2 text-foreground">{children}</h4>
            ),
            h5: ({ children }) => (
              <h5 className="text-sm font-display font-medium mt-3 mb-1 text-foreground">{children}</h5>
            ),
            h6: ({ children }) => (
              <h6 className="text-sm font-display font-medium mt-2 mb-1 text-foreground/80">{children}</h6>
            ),

            // Horizontal rules as section dividers
            hr: () => <hr className="my-8 border-border/30" />,

            // Strip images
            img: () => null,

            // Paragraphs with good reading spacing
            p: ({ children }) => <p className="mb-4 leading-7 text-foreground/80">{children}</p>,

            // Lists with proper spacing
            ul: ({ children }) => <ul className="list-disc pl-6 my-4 space-y-2">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-6 my-4 space-y-2">{children}</ol>,
            li: ({ children }) => <li className="leading-7 text-foreground/80">{children}</li>,

            // Code blocks
            code: ({ className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !String(children).includes('\n');
              
              return isInline ? (
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-sm text-foreground" {...props}>
                  {children}
                </code>
              ) : (
                <div className="w-full overflow-x-auto my-4 rounded-lg bg-muted p-4 border border-border/50">
                  <code className="font-mono text-sm block whitespace-pre text-foreground" {...props}>
                    {children}
                  </code>
                </div>
              );
            },
            pre: ({ children }) => <>{children}</>,

            // Blockquotes
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary/30 pl-4 italic my-4 text-foreground/70">
                {children}
              </blockquote>
            ),

            // Links - internal links stay in tab, external open new tab
            a: ({ href, children }) => {
              const isExternal = href?.startsWith('http');
              return (
                <a 
                  href={href} 
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                  className="text-primary font-medium hover:underline underline-offset-2"
                >
                  {children}
                </a>
              );
            },

            // Strong - used as sub-headings in FAQ answers
            strong: ({ children }) => (
              <strong className="block text-foreground font-semibold mt-4 mb-1 first:mt-0">{children}</strong>
            ),
            em: ({ children }) => <em className="italic text-foreground/70">{children}</em>,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  // Default compact variant for AI chat messages
  return (
    <div className={cn("markdown-content break-words leading-relaxed", className)}>
      <ReactMarkdown
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
    </div>
  );
}
