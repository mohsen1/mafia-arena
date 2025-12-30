/**
 * DiscountPricingDialog - Modal explaining discount pricing / batch API mode.
 */

import { X, Clock, DollarSign, Zap, AlertCircle } from 'lucide-react';

interface DiscountPricingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  estimatedWaitHours?: number;
  pendingRequests?: number;
}

export function DiscountPricingDialog({ 
  isOpen, 
  onClose, 
  estimatedWaitHours,
  pendingRequests,
}: DiscountPricingDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2 px-2 py-1 rounded-full text-sm font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <DollarSign size={14} />
            Discount Pricing
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            This game uses <span className="text-foreground font-medium">Batch API</span> mode, 
            which provides <span className="text-emerald-600 dark:text-emerald-400 font-medium">50% cost savings</span> on 
            AI inference.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <DollarSign size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-foreground">50% Savings</div>
                <div className="text-[10px] text-muted-foreground">Half the cost of real-time</div>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <Clock size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-foreground">24-48h Processing</div>
                <div className="text-[10px] text-muted-foreground">Results arrive later</div>
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-amber-600 dark:text-amber-400">How it works: </span>
              AI requests are queued and processed in batches by providers (OpenAI, Anthropic, Google). 
              Results typically arrive within 24 hours.
            </div>
          </div>

          {(estimatedWaitHours !== undefined || pendingRequests !== undefined) && (
            <div className="pt-2 border-t border-border/50">
              <div className="text-xs font-medium text-muted-foreground mb-2">Current Status</div>
              <div className="flex items-center gap-4 text-sm">
                {estimatedWaitHours !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="text-amber-500" />
                    <span className="text-foreground">~{estimatedWaitHours}h remaining</span>
                  </div>
                )}
                {pendingRequests !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <Zap size={14} className="text-violet-500" />
                    <span className="text-foreground">{pendingRequests} requests pending</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

