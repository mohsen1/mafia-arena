'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Home,
  User,
  HelpCircle,
  LogIn,
  LogOut,
  Plus,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useSession, signIn, signOut } from 'next-auth/react';
import type { LanguageCode } from '@/lib/i18n/settings';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentLang: LanguageCode;
}

export function MobileMenu({ isOpen, onClose, currentLang }: MobileMenuProps) {
  const { t } = useTranslation();
  const { data: session } = useSession();

  const handleSignIn = () => {
    signIn(undefined, { callbackUrl: `/${currentLang}` });
    onClose();
  };

  const handleSignOut = () => {
    signOut({ callbackUrl: `/${currentLang}` });
    onClose();
  };

  const menuItems = session
    ? [
        {
          icon: <Home className="w-5 h-5" />,
          label: t('common.home'),
          href: `/${currentLang}`,
        },
        {
          icon: <Plus className="w-5 h-5" />,
          label: t('common.newGame'),
          href: `/${currentLang}/new`,
        },
        {
          icon: <List className="w-5 h-5" />,
          label: t('common.myGames'),
          href: `/${currentLang}/games`,
        },
        {
          icon: <User className="w-5 h-5" />,
          label: t('common.profile'),
          href: `/${currentLang}/profile`,
        },
        {
          icon: <HelpCircle className="w-5 h-5" />,
          label: t('common.help'),
          href: `/${currentLang}/help`,
        },
      ]
    : [
        {
          icon: <Home className="w-5 h-5" />,
          label: t('common.home'),
          href: `/${currentLang}`,
        },
        {
          icon: <HelpCircle className="w-5 h-5" />,
          label: t('common.help'),
          href: `/${currentLang}/help`,
        },
      ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          />

          {/* Menu Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 20 }}
            className="fixed right-0 top-0 h-full w-80 max-w-[85vw] bg-background border-s z-50 md:hidden"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">{t('common.menu')}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* User Info */}
              {session && (
                <div className="p-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {session.user?.name || session.user?.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {session.user?.email}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Items */}
              <nav className="flex-1 overflow-y-auto p-4">
                <ul className="space-y-2">
                  {menuItems.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors"
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Auth Actions */}
              <div className="p-4 border-t">
                {session ? (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleSignOut}
                  >
                    <LogOut className="w-4 h-4 me-2" />
                    {t('common.signOut')}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      className="w-full justify-start"
                      onClick={handleSignIn}
                    >
                      <LogIn className="w-4 h-4 me-2" />
                      {t('common.signIn')}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      asChild
                    >
                      <Link href={`/${currentLang}/auth/signup`}>
                        <User className="w-4 h-4 me-2" />
                        {t('common.signUp')}
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
