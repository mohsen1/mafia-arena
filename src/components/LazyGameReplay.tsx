import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Loading component shown while GameReplay is being loaded
const GameReplayLoader = () => (
  <div className="space-y-4">
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
        </div>
        <Skeleton className="h-2 w-full" />
      </CardContent>
    </Card>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Skeleton className="h-64" />
      <Skeleton className="h-64 lg:col-span-2" />
    </div>
  </div>
);

// Lazy load the GameReplay component
export const LazyGameReplay = dynamic(
  () => import('./GameReplay').then((mod) => mod.GameReplay),
  {
    loading: () => <GameReplayLoader />,
    ssr: false, // Disable SSR for this interactive component
  }
);

export default LazyGameReplay; 