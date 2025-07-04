'use client';

import { use, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  Users,
  Play,
  Trash2,
  Filter,
  Plus,
  GamepadIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LanguageCode } from '@/lib/i18n/settings';
import {
  getUserGamesAction,
  deleteGameAction,
  type GameListItem,
} from '@/app/actions/games';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { GameStatsDashboard } from '@/components/GameStatsDashboard';

interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
}

function LoadingView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />

      <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh]">
        <div className="text-center">
          <div className="w-12 h-12 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">{t('games.loading')}</p>
        </div>
      </main>
      <Footer currentLang={lang} />
    </div>
  );
}

function UnauthenticatedView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />

      <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh] space-y-8">
        <div className="text-center max-w-2xl">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
              <GamepadIcon className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-4 text-foreground">
              {t('games.signInRequired')}
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              {t('games.signInRequiredDescription')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link href={`/${lang}/auth/signin`}>{t('common.signIn')}</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href={`/${lang}`}>{t('common.backToHome')}</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer currentLang={lang} />
    </div>
  );
}

function EmptyGamesView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();

  return (
    <div className="text-center py-16">
      <div className="w-24 h-24 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
        <GamepadIcon className="w-12 h-12 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-4">
        {t('games.noGamesYet')}
      </h2>
      <p className="text-muted-foreground mb-8 max-w-md mx-auto">
        {t('games.noGamesDescription')}
      </p>
      <Button asChild size="lg">
        <Link href={`/${lang}/new`}>
          <Plus className="w-4 h-4 me-2" />
          {t('games.createFirstGame')}
        </Link>
      </Button>
    </div>
  );
}

function GameCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GameCard({
  game,
  lang,
  onDelete,
}: {
  game: GameListItem;
  lang: LanguageCode;
  onDelete: (gameId: string) => void;
}) {
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return game.round === 0 ? 'secondary' : 'default';
      case 'completed':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusText = (status: string) => {
    if (status === 'active') {
      return game.round === 0
        ? t('games.status.waiting')
        : t('games.status.inProgress');
    }
    return t('games.status.completed');
  };

  const handleDelete = async () => {
    if (!confirm(t('games.confirmDelete'))) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteGameAction(game.id);
      onDelete(game.id);
    } catch (error) {
      console.error('Failed to delete game:', error);
      alert(t('games.deleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg line-clamp-1">{game.title}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Users className="w-4 h-4" />
              {t('games.playerCount', { count: game.playerCount })}
              <span className="text-muted-foreground/60">•</span>
              <span className="capitalize">
                {t(`themes.${game.themeKey}.name`, game.themeKey)}
              </span>
            </CardDescription>
          </div>
          <Badge variant={getStatusColor(game.status)}>
            {getStatusText(game.status)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {game.phase && game.status === 'active' && game.round > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              {t('games.currentPhase')}: {game.phase}
            </div>
          )}

          {game.winCondition && game.status === 'completed' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {t('games.winner')}:
              </span>
              <Badge variant="default">
                {(() => {
                  const winCondition = game.winCondition as {
                    outcome?: string;
                    message?: string;
                  } | null;
                  const outcome = winCondition?.outcome;

                  if (
                    outcome === 'Town Victory' ||
                    outcome === 'Town Wins' ||
                    outcome === 'Town'
                  ) {
                    return t('games.townWins');
                  } else if (
                    outcome === 'Mafia Victory' ||
                    outcome === 'Mafia Wins' ||
                    outcome === 'Mafia'
                  ) {
                    return t('games.mafiaWins');
                  } else if (outcome === 'Stalemate') {
                    return t('games.stalemate');
                  } else {
                    return t('games.gameComplete');
                  }
                })()}
              </Badge>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            {t('games.lastPlayed')}:{' '}
            {formatDistanceToNow(game.updatedAt, { addSuffix: true })}
          </div>

          <div className="flex gap-2 pt-2">
            <Button asChild className="flex-1">
              <Link href={`/${lang}/game/${game.id}`}>
                <Play className="w-4 h-4 me-2" />
                {game.status === 'completed'
                  ? t('games.viewGame')
                  : t('games.continueGame')}
              </Link>
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GamesContent({ lang }: { lang: LanguageCode }) {
  const { data: session } = useSession();
  const { t } = useTranslation();
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    'all' | 'waiting' | 'in_progress' | 'completed'
  >('all');

  useEffect(() => {
    const loadGames = async () => {
      if (!session?.user?.id) return;

      try {
        setLoading(true);
        const gamesList = await getUserGamesAction();
        setGames(gamesList);
      } catch (error) {
        console.error('Failed to load games:', error);
      } finally {
        setLoading(false);
      }
    };

    loadGames();
  }, [session?.user?.id]);

  const handleGameDeleted = (gameId: string) => {
    setGames((prevGames) => prevGames.filter((g) => g.id !== gameId));
  };

  if (!session?.user) {
    return <UnauthenticatedView lang={lang} />;
  }

  const filteredGames = (() => {
    switch (filter) {
      case 'all':
        return games;
      case 'waiting':
        return games.filter((g) => g.status === 'active' && g.round === 0);
      case 'in_progress':
        return games.filter((g) => g.status === 'active' && g.round > 0);
      case 'completed':
        return games.filter((g) => g.status === 'completed');
      default:
        return games;
    }
  })();

  const gamesByStatus = {
    waiting: games.filter((g) => g.status === 'active' && g.round === 0).length,
    in_progress: games.filter((g) => g.status === 'active' && g.round > 0)
      .length,
    completed: games.filter((g) => g.status === 'completed').length,
  };

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />

      <main className="max-w-6xl mx-auto p-4 space-y-8">
        <div className="mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                {t('games.title')}
              </h1>
              <p className="text-muted-foreground">{t('games.description')}</p>
            </div>

            <Button asChild size="lg">
              <Link href={`/${lang}/new`}>
                <Plus className="w-4 h-4 me-2" />
                {t('games.newGame')}
              </Link>
            </Button>
          </div>

          {/* Statistics Dashboard */}
          {!loading && games.length > 0 && <GameStatsDashboard games={games} />}
        </div>

        {loading ? (
          <div className="space-y-6">
            {/* Statistics Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-8 w-12 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Games Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <GameCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : games.length === 0 ? (
          <EmptyGamesView lang={lang} />
        ) : (
          <div className="space-y-6">
            {/* Filter Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground me-2">
                {t('games.filterBy')}:
              </span>

              {[
                { key: 'all', label: t('games.allGames') },
                { key: 'waiting', label: t('games.status.waiting') },
                { key: 'in_progress', label: t('games.status.inProgress') },
                { key: 'completed', label: t('games.status.completed') },
              ].map(({ key, label }) => (
                <Button
                  key={key}
                  variant={filter === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(key as typeof filter)}
                >
                  {label}
                  {key !== 'all' && (
                    <Badge variant="secondary" className="ms-2">
                      {gamesByStatus[key as keyof typeof gamesByStatus]}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>

            {/* Games Grid */}
            {filteredGames.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-lg text-muted-foreground">
                  {t('games.noGamesInFilter')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    lang={lang}
                    onDelete={handleGameDeleted}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer currentLang={lang} />
    </div>
  );
}

export default function GamesPage({ params: paramsPromise }: PageProps) {
  const params = use(paramsPromise);
  const { lang } = params;
  const { status } = useSession();

  if (status === 'loading') {
    return <LoadingView lang={lang} />;
  }

  return <GamesContent lang={lang} />;
}
