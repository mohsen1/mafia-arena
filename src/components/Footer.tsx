'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Globe, Github, FileText, HelpCircle, Gamepad2, Brain, Users, Sparkles, Volume2, Star, Cpu, Languages } from 'lucide-react';
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
        <div className="grid md:grid-cols-5 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center mb-4">
              <span className="text-xl font-bold text-foreground">
                🐺 Werewolf AI
              </span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              {t('footer.description')}
            </p>
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Play with unlimited AI characters</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                <span>Multiple AI providers (OpenAI, Claude, Gemini, Groq)</span>
              </div>
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4" />
                <span>Available in 25+ languages</span>
              </div>
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                <span>Text-to-speech integration</span>
              </div>
            </div>
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
                  <Star className="inline w-4 h-4 me-1" />
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
                  href={`/${currentLang}/character-setup`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Sparkles className="inline w-4 h-4 me-1" />
                  Character Setup
                </Link>
              </li>
              <li>
                <Link
                  href={`/${currentLang}/voice-test`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Volume2 className="inline w-4 h-4 me-1" />
                  Voice Test
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">
              {t('footer.help')} & Support
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href={`/${currentLang}/help`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HelpCircle className="inline w-4 h-4 me-1" />
                  Game Rules & Help
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/mohsen1/werewolf-ai/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Github className="inline w-4 h-4 me-1" />
                  Report Issues
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/mohsen1/werewolf-ai/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Community Discussions
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
                  Documentation
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
            
            <div className="mt-6">
              <h4 className="font-semibold text-foreground mb-2 text-sm">
                Open Source
              </h4>
              <a
                href="https://github.com/mohsen1/werewolf-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                <Github className="inline w-4 h-4 me-1" />
                View on GitHub
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border/50">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} Werewolf AI. {t('footer.copyright')}
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Cpu className="w-4 h-4" />
                Powered by AI
              </span>
              <span className="flex items-center gap-1">
                <Languages className="w-4 h-4" />
                25+ Languages
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                Unlimited Players
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
