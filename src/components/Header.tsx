'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { LogIn, LogOut, User, Gamepad2, HelpCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useEffect, useState } from 'react';

interface HeaderProps {
  currentLang: string;
}

export function Header({ currentLang }: HeaderProps) {
  const { data: session, status, update } = useSession();
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);

  // Force session refresh on mount to ensure latest user data
  useEffect(() => {
    if (status === 'authenticated') {
      update();
      // Debug logging
      console.log('[Header] Session data:', {
        user: session?.user,
        image: session?.user?.image,
        name: session?.user?.name,
        email: session?.user?.email,
      });
    }
  }, [status, update, session]);

  // Reset image error state when session changes
  useEffect(() => {
    setImageError(false);
  }, [session?.user?.image]);

  const handleSignIn = () => {
    signIn(undefined, { callbackUrl: `/${currentLang}` });
  };

  const handleSignOut = () => {
    signOut({ callbackUrl: `/${currentLang}` });
  };

  return (
    <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link
            href={`/${currentLang}`}
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/images/logo.png"
              alt="Werewolf AI Logo"
              width={40}
              height={40}
              className="w-10 h-10 object-contain"
              priority
            />
            <span className="text-xl font-bold text-foreground">
              Werewolf AI
            </span>
          </Link>

          {/* Auth Section */}
          <div className="flex items-center space-x-4">
            {status === 'loading' ? (
              <div className="w-8 h-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : session ? (
              // Authenticated User Menu
              <div className="flex items-center space-x-2">
                <ThemeToggle />
                <Button asChild>
                  <Link href={`/${currentLang}/new`}>
                    <Gamepad2 className="w-4 h-4 me-2" />
                    {t('landingNavPlayNow')}
                  </Link>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center space-x-2"
                    >
                      {session.user?.image && !imageError ? (
                        <Image
                          src={session.user.image}
                          alt={session.user.name || 'User'}
                          width={24}
                          height={24}
                          className="w-6 h-6 rounded-full"
                          onError={(e) => {
                            console.error('Profile image failed to load:', session.user.image);
                            console.error('Image error event:', e);
                            setImageError(true);
                          }}
                        />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">
                        {session.user?.name || session.user?.email || 'User'}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/${currentLang}/profile`}
                        className="flex items-center"
                      >
                        <User className="w-4 h-4 me-2" />
                        {t('common.profile')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/${currentLang}/games`}
                        className="flex items-center"
                      >
                        <Gamepad2 className="w-4 h-4 me-2" />
                        {t('common.myGames')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/${currentLang}/help`}
                        className="flex items-center"
                      >
                        <HelpCircle className="w-4 h-4 me-2" />
                        {t('common.help')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="flex items-center"
                    >
                      <LogOut className="w-4 h-4 me-2" />
                      {t('common.signOut')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              // Guest User Buttons
              <div className="flex items-center space-x-2">
                <ThemeToggle />
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/${currentLang}/help`}>
                    <HelpCircle className="w-4 h-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSignIn}
                  className="flex items-center"
                >
                  <LogIn className="w-4 h-4 me-2" />
                  {t('common.signIn')}
                </Button>
                <Button asChild className="flex items-center">
                  <Link href={`/${currentLang}/auth/signup`}>
                    <User className="w-4 h-4 me-2" />
                    {t('common.signUp')}
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
