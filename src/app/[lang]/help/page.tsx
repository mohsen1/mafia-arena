import { HelpPageContent } from '@/components/common/HelpPageContent';
import type { LanguageCode } from '@/lib/i18n/settings';

interface HelpPageProps {
  params: Promise<{
    lang: LanguageCode;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars
export default async function HelpPage({ params }: HelpPageProps) {
  return <HelpPageContent />;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars
export async function generateMetadata({ params }: HelpPageProps) {
  // You can customize the metadata based on the language if needed
  return {
    title: 'How to Play - Werewolf AI',
    description:
      'Learn how to play Werewolf AI - master the art of deduction and deception in this social strategy game.',
  };
}
