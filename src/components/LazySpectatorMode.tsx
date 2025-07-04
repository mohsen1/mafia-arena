import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Loading component shown while SpectatorMode is being loaded
const SpectatorModeLoader = () => (
  <div className="space-y-4">
    <Skeleton className="h-12 w-full" />
    <div className="flex gap-4">
      <Skeleton className="h-96 flex-1" />
      <Skeleton className="h-96 w-96" />
    </div>
  </div>
);

// Lazy load the SpectatorMode component
export const LazySpectatorMode = dynamic(
  () => import('./SpectatorMode').then((mod) => mod.default),
  {
    loading: () => <SpectatorModeLoader />,
    ssr: false, // Disable SSR for this component as it's interactive
  }
);

export default LazySpectatorMode; 