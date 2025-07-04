'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Globe, Github, FileText, HelpCircle, Gamepad2 } from 'lucide-react';
import LanguageSelector from '@/components/LanguageSelector';
import type { LanguageCode } from '@/lib/i18n/settings';

interface FooterProps {
  currentLang: LanguageCode;
}

export function Footer({ currentLang }: FooterProps) {
  const { t } = useTranslation();

  return (
    <footer className="bg-card/50 backdrop-blur-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center mb-4">
              <span className="text-xl font-bold text-foreground">
                🐺 Werewolf AI
              </span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t('footer.description')}
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">
              {t('footer.quickLinks')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href={`/${currentLang}/new`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Gamepad2 className="inline w-4 h-4 me-1" />
                  {t('footer.playGame')}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${currentLang}/games`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('footer.myGames')}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${currentLang}/profile`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('footer.profile')}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${currentLang}/help`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HelpCircle className="inline w-4 h-4 me-1" />
                  {t('footer.help')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">
              {t('footer.resources')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://github.com/mohsen1/werewolf-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Github className="inline w-4 h-4 me-1" />
                  {t('footer.github')}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/mohsen1/werewolf-ai/blob/main/README.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <FileText className="inline w-4 h-4 me-1" />
                  {t('footer.documentation')}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              {t('footer.language')}
            </h3>
            <LanguageSelector
              currentLang={currentLang}
              id="footer-language-selector"
            />
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-border/50 text-center">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} Werewolf AI. {t('footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
