import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Werewolf AI - Experience Social Deduction Like Never Before',
  description: 'Play the classic Werewolf/Mafia game against intelligent AI characters with unique personas, rich backstories, and strategic thinking. Supports 25+ languages with modern web technology.',
  keywords: [
    'werewolf ai',
    'mafia game ai',
    'social deduction game',
    'ai characters',
    'party game',
    'artificial intelligence',
    'multiplayer game',
    'strategic game',
    'deduction game',
    'ai agents'
  ],
  authors: [{ name: 'Werewolf AI Team' }],
  creator: 'Werewolf AI',
  publisher: 'Werewolf AI',
  openGraph: {
    title: 'Werewolf AI - Experience Social Deduction Like Never Before',
    description: 'Play the classic Werewolf/Mafia game against intelligent AI characters with unique personas and strategic thinking.',
    url: 'https://werewolf-ai.com/landing',
    siteName: 'Werewolf AI',
    images: [
      {
        url: '/images/og-landing.png',
        width: 1200,
        height: 630,
        alt: 'Werewolf AI - AI-Powered Social Deduction Game',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Werewolf AI - Experience Social Deduction Like Never Before',
    description: 'Play the classic Werewolf/Mafia game against intelligent AI characters with unique personas and strategic thinking.',
    images: ['/images/og-landing.png'],
    creator: '@werewolfai',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  verification: {
    google: 'your-google-verification-code',
  },
  alternates: {
    canonical: 'https://werewolf-ai.com/landing',
    languages: {
      'en-US': 'https://werewolf-ai.com/en/landing',
      'es-ES': 'https://werewolf-ai.com/es/landing',
      'fr-FR': 'https://werewolf-ai.com/fr/landing',
      'de-DE': 'https://werewolf-ai.com/de/landing',
      'it-IT': 'https://werewolf-ai.com/it/landing',
      'pt-PT': 'https://werewolf-ai.com/pt/landing',
      'ja-JP': 'https://werewolf-ai.com/ja/landing',
      'ko-KR': 'https://werewolf-ai.com/ko/landing',
      'zh-CN': 'https://werewolf-ai.com/zh/landing',
    },
  },
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Werewolf AI',
            description: 'AI-powered social deduction game based on the classic Werewolf/Mafia party game',
            url: 'https://werewolf-ai.com',
            applicationCategory: 'Game',
            operatingSystem: 'Web Browser',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '4.8',
              ratingCount: '500',
            },
            features: [
              'AI-powered characters with unique personas',
              'Multilingual support (25+ languages)',
              'Text-to-speech integration',
              'Save and resume gameplay',
              'Multiple AI model providers',
              'Classic Werewolf/Mafia roles'
            ],
            author: {
              '@type': 'Organization',
              name: 'Werewolf AI Team',
            },
            publisher: {
              '@type': 'Organization',
              name: 'Werewolf AI',
            },
          }),
        }}
      />
      {children}
    </>
  );
} 