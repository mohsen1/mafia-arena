'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { LogIn, LogOut, User, Gamepad2, HelpCircle, Menu } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useEffect, useState } from 'react';
import { MobileMenu } from '@/components/MobileMenu';
import type { LanguageCode } from '@/lib/i18n/settings';

interface HeaderProps {
  currentLang: LanguageCode;
}

export function Header({ currentLang }: HeaderProps) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Debug session status in production
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      console.log('[Header] Session status:', status);
      console.log('[Header] Session data:', session);
    }
  }, [status, session]);

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  // Validate and sanitize image URL
  const getValidImageUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;

    try {
      // Parse URL to validate it
      const parsedUrl = new URL(url);

      // Check if it's from allowed domains
      const allowedDomains = [
        'lh3.googleusercontent.com',
        'googleusercontent.com',
        'avatars.githubusercontent.com',
      ];

      const isAllowedDomain = allowedDomains.some((domain) =>
        parsedUrl.hostname.includes(domain)
      );

      if (!isAllowedDomain && process.env.NODE_ENV === 'production') {
        console.warn(
          '[Header] Image URL from untrusted domain:',
          parsedUrl.hostname
        );
        return null;
      }

      return url;
    } catch (error) {
      console.error('[Header] Invalid image URL:', url, error);
      return null;
    }
  };

  const validImageUrl = getValidImageUrl(session?.user?.image);

  return (
    <nav
      className={`sticky top-0 z-50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 transition-shadow duration-300 ${
        isScrolled ? 'shadow-md' : ''
      }`}
    >
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

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center space-x-2"
                    >
                      {validImageUrl && !imageError ? (
                        <Image
                          src={validImageUrl}
                          alt={session.user.name || 'User'}
                          width={24}
                          height={24}
                          className="w-6 h-6 rounded-full"
                          onError={(e) => {
                            console.error(
                              'Profile image failed to load:',
                              validImageUrl
                            );
                            console.error('Image error event:', e);
                            setImageError(true);
                          }}
                          unoptimized={validImageUrl.includes(
                            'googleusercontent.com'
                          )}
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
              // Guest User Buttons - Show when not loading AND no session
              <div className="flex items-center space-x-2">
                <ThemeToggle />
                <Button
                  variant="outline"
                  onClick={handleSignIn}
                  className="flex items-center"
                >
                  <LogIn className="w-4 h-4 me-2" />
                  <span className="hidden sm:inline">{t('common.signIn')}</span>
                  <span className="sm:hidden">{t('common.signIn')}</span>
                </Button>
                <Button asChild className="hidden sm:flex items-center">
                  <Link href={`/${currentLang}/auth/signup`}>
                    <User className="w-4 h-4 me-2" />
                    {t('common.signUp')}
                  </Link>
                </Button>
              </div>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        currentLang={currentLang}
      />
    </nav>
  );
}
