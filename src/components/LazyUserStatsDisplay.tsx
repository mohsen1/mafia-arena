import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Loading component shown while UserStatsDisplay is being loaded
const UserStatsLoader = () => (
  <div className="space-y-4">
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-48 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

// Lazy load the UserStatsDisplay component
export const LazyUserStatsDisplay = dynamic(
  () => import('./UserStatsDisplay').then((mod) => mod.UserStatsDisplay),
  {
    loading: () => <UserStatsLoader />,
    ssr: false, // Disable SSR as this component fetches user-specific data
  }
);

export default LazyUserStatsDisplay; 