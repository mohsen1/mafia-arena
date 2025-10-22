import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/config';
import { getTranslation } from '@/lib/i18n/server';

import { Button } from '@/components/ui/button';
import { MagicalAIButton } from '@/components/ui/magical-ai-button';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowLeft,
  Brain,
  Globe,
  Sparkles,
  Volume2,
  Save,
  Gamepad2,
  Users,
  Languages,
  Cpu,
  Star,
  LogIn,
} from 'lucide-react';
import { ServerHeader } from '@/components/ServerHeader';
import { Footer } from '@/components/Footer';
import type { LanguageCode } from '@/lib/i18n/settings';
import { supportedLanguagesInfo } from '@/lib/i18n/settings';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="group relative card-hover bg-card/50 backdrop-blur-sm p-6 rounded-xl border border-border/50 transition-all duration-300">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative z-10">
        <div className="mb-4 text-primary group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <h3 className="text-lg font-semibold mb-2 text-foreground">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

interface AIProviderCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
}

function AIProviderCard({ name, description, icon }: AIProviderCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 transition-colors duration-200 hover:border-primary/50">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative z-10">
        <div className="mb-4 text-4xl">{icon}</div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{name}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

interface StepCardProps {
  number: string;
  title: string;
  description: string;
}

function StepCard({ number, title, description }: StepCardProps) {
  return (
    <div className="text-center group">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4 group-hover:scale-110 transition-transform duration-300">
        {number}
      </div>
      <h3 className="text-lg font-semibold mb-2 text-foreground">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}

interface RoleCardProps {
  name: string;
  description: string;
  icon: string;
}

function RoleCard({ name, description, icon }: RoleCardProps) {
  return (
    <div className="bg-card/30 backdrop-blur-sm p-6 rounded-lg hover:bg-card/60 transition-colors duration-200">
      <div className="text-lg font-semibold mb-4 text-center text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2 text-center text-foreground">
        {name}
      </h3>
      <p className="text-muted-foreground text-sm text-center leading-relaxed">
        {description}
      </p>
    </div>
  );
}

interface StatCardProps {
  number: string;
  label: string;
  icon: React.ReactNode;
}

function StatCard({ number, label, icon }: StatCardProps) {
  return (
    <div className="text-center bg-card/50 backdrop-blur-sm rounded-lg p-6 border border-border/50 hover:border-primary/50 transition-colors duration-200">
      <div className="mb-4 text-muted-foreground">{icon}</div>
      <div className="text-3xl font-bold text-foreground mb-2">{number}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

interface AuthCTAButtonProps {
  currentLang: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outline' | 'magical';
  size?: 'default' | 'sm' | 'lg';
  magical?: boolean;
  session: any;
  t: (key: string) => string;
}

function AuthCTAButton({
  currentLang,
  children,
  className = '',
  variant = 'magical',
  size = 'lg',
  magical = true,
  session,
  t,
}: AuthCTAButtonProps) {

  if (session) {
    if (magical) {
      return (
        <MagicalAIButton
          glowIntensity="medium"
          asChild
          size={size}
          className={`group ${className}`}
          variant={variant === 'magical' ? 'magical' : 'default'}
        >
          <Link href={`/${currentLang}/new`}>{children}</Link>
        </MagicalAIButton>
      );
    }
    return (
      <Button
        asChild
        size={size}
        className={`group ${className}`}
        variant={variant === 'magical' ? 'default' : variant}
      >
        <Link href={`/${currentLang}/new`}>{children}</Link>
      </Button>
    );
  }

  if (magical) {
    return (
      <MagicalAIButton
        asChild
        size={size}
        className={`group ${className}`}
        variant={variant === 'magical' ? 'magical' : 'default'}
      >
        <Link href={`/${currentLang}/auth/signin`}>
          <LogIn className="w-5 h-5 me-2" />
          {t('landingSignInToPlay')}
        </Link>
      </MagicalAIButton>
    );
  }

  return (
    <Button
      asChild
      size={size}
      className={`group ${className}`}
      variant={variant === 'magical' ? 'default' : variant}
    >
      <Link href={`/${currentLang}/auth/signin`}>
        <LogIn className="w-5 h-5 me-2" />
        {t('landingSignInToPlay')}
      </Link>
    </Button>
  );
}

interface LandingPageProps {
  params: Promise<{ lang: LanguageCode }>;
}

export default async function LandingPage({ params }: LandingPageProps) {
  const { lang: currentLang } = await params;
  const session = await getServerSession(authOptions);
  const { t } = await getTranslation(currentLang);
  const isRTL = supportedLanguagesInfo[currentLang]?.dir === 'rtl';
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;



  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <ServerHeader currentLang={currentLang} />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-pattern" />
        <div className="absolute inset-0 hero-gradient animate-glow" />

        {/* Animated background shapes */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div
          className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '1.5s' }}
        />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-secondary/5 rounded-full blur-3xl animate-pulse" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 sm:pt-24 sm:pb-20">
          <div className="text-center">
            <div className="mb-8 animate-scale-in">
              <span className="inline-flex items-center px-4 py-2 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 backdrop-blur-sm">
                <Sparkles className="w-3 h-3 me-2 animate-pulse" />
                {t('landingHeroBadge')}
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
              <span className="block text-foreground animate-slide-up">
                {t('landingHeroTitle')}
              </span>
              <span
                className="block text-3xl sm:text-4xl lg:text-5xl mt-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient animate-slide-up"
                style={{ animationDelay: '0.2s' }}
              >
                {t('Werewolf AI')}
              </span>
            </h1>

            <p
              className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed animate-slide-up"
              style={{ animationDelay: '0.4s' }}
            >
              {t('landingHeroSubtitle')}
            </p>

            <div
              className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-slide-up"
              style={{ animationDelay: '0.6s' }}
            >
              <AuthCTAButton currentLang={currentLang} magical={true} session={session} t={t}>
                {t('landingHeroCTA')}
                <ArrowIcon
                  className={`${isRTL ? 'me-2' : 'ms-2'} w-5 h-5 group-hover:${isRTL ? '-translate-x-1' : 'translate-x-1'} transition-transform duration-200`}
                />
              </AuthCTAButton>
              <Button variant="outline" size="lg" asChild className="group">
                <Link href="#features">
                  {t('landingHeroSecondary')}
                  <Sparkles className="ms-2 w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-gradient-to-b from-background to-card/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCard
              number="25+"
              label={t('landingStatsLanguages')}
              icon={<Languages className="w-8 h-8 mx-auto text-primary" />}
            />
            <StatCard
              number="4+"
              label={t('landingStatsProviders')}
              icon={<Cpu className="w-8 h-8 mx-auto text-primary" />}
            />
            <StatCard
              number="∞"
              label={t('landingStatsPlayers')}
              icon={<Users className="w-8 h-8 mx-auto text-primary" />}
            />
            <StatCard
              number="4"
              label={t('landingStatsRoles')}
              icon={<Star className="w-8 h-8 mx-auto text-primary" />}
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {t('landingFeaturesTitle')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landingFeaturesSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Brain className="w-8 h-8" />}
              title={t('landingFeatureIntelligentAI')}
              description={t('landingFeatureIntelligentAIDesc')}
            />
            <FeatureCard
              icon={<Globe className="w-8 h-8" />}
              title={t('landingFeatureMultilingual')}
              description={t('landingFeatureMultilingualDesc')}
            />
            <FeatureCard
              icon={<Sparkles className="w-8 h-8" />}
              title={t('landingFeatureDynamic')}
              description={t('landingFeatureDynamicDesc')}
            />
            <FeatureCard
              icon={<Volume2 className="w-8 h-8" />}
              title={t('landingFeatureImmersive')}
              description={t('landingFeatureImmersiveDesc')}
            />
            <FeatureCard
              icon={<Gamepad2 className="w-8 h-8" />}
              title={t('landingFeatureModern')}
              description={t('landingFeatureModernDesc')}
            />
            <FeatureCard
              icon={<Save className="w-8 h-8" />}
              title={t('landingFeaturePersistent')}
              description={t('landingFeaturePersistentDesc')}
            />
          </div>

          <div className="mt-12 text-center">
            <MagicalAIButton
              asChild
              variant="magical"
              size="lg"
              animationSpeed="fast"
              glowIntensity="medium"
              className="group"
            >
              <Link href={`/${currentLang}/new`}>
                {t('landingFeaturesButton')}
                <Sparkles
                  className={`${isRTL ? 'me-2' : 'ms-2'} w-5 h-5 group-hover:rotate-12 transition-transform duration-300`}
                />
              </Link>
            </MagicalAIButton>
          </div>
        </div>
      </section>

      {/* AI Providers Section */}
      <section className="py-20 bg-card/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {t('landingAITitle')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landingAISubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <AIProviderCard
              name={t('landingAIOpenAI')}
              description={t('landingAIOpenAIDesc')}
              icon={<Brain className="w-8 h-8" />}
            />
            <AIProviderCard
              name={t('landingAIClaude')}
              description={t('landingAIClaudeDesc')}
              icon={<Sparkles className="w-8 h-8" />}
            />
            <AIProviderCard
              name={t('landingAIGemini')}
              description={t('landingAIGeminiDesc')}
              icon="✨"
            />
            <AIProviderCard
              name={t('landingAIGroq')}
              description={t('landingAIGroqDesc')}
              icon={<Cpu className="w-8 h-8" />}
            />
          </div>

          <div className="mt-12 text-center">
            <MagicalAIButton
              asChild
              size="lg"
              animationSpeed="slow"
              className="group hover:scale-105 transition-transform duration-300"
            >
              <Link href={`/${currentLang}/new`}>
                {t('landingAITryNow')}
                <ArrowIcon
                  className={`${isRTL ? 'me-2' : 'ms-2'} w-5 h-5 group-hover:${isRTL ? '-translate-x-1' : 'translate-x-1'} transition-transform duration-200`}
                />
              </Link>
            </MagicalAIButton>
          </div>
        </div>
      </section>

      {/* Game Roles Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {t('landingRolesTitle')}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <RoleCard
              name={t('landingRoleWerewolf')}
              description={t('landingRoleWerewolfDesc')}
              icon="🐺"
            />
            <RoleCard
              name={t('landingRoleVillager')}
              description={t('landingRoleVillagerDesc')}
              icon="👨‍🌾"
            />
            <RoleCard
              name={t('landingRoleSeer')}
              description={t('landingRoleSeerDesc')}
              icon="🔮"
            />
            <RoleCard
              name={t('landingRoleDoctor')}
              description={t('landingRoleDoctorDesc')}
              icon="⚕️"
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-card/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {t('landingHowItWorksTitle')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landingHowItWorksSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <StepCard
              number="1"
              title={t('landingStep1Title')}
              description={t('landingStep1Desc')}
            />
            <StepCard
              number="2"
              title={t('landingStep2Title')}
              description={t('landingStep2Desc')}
            />
            <StepCard
              number="3"
              title={t('landingStep3Title')}
              description={t('landingStep3Desc')}
            />
            <StepCard
              number="4"
              title={t('landingStep4Title')}
              description={t('landingStep4Desc')}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            {t('landingCtaTitle')}
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            {t('landingCtaSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <AuthCTAButton
              currentLang={currentLang}
              magical={true}
              className="animate-pulse"
              session={session}
              t={t}
            >
              🚀 {t('landingCtaButton')}
              <ArrowIcon
                className={`${isRTL ? 'me-2' : 'ms-2'} w-5 h-5 group-hover:${isRTL ? '-translate-x-1' : 'translate-x-1'} transition-transform duration-200`}
              />
            </AuthCTAButton>
            <Button variant="outline" size="lg" asChild>
              <a
                href="https://github.com/mohsen1/werewolf-ai"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('landingCtaSecondary')}
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer currentLang={currentLang} />
    </div>
  );
}
