import { auth } from '@/lib/auth/config';
import { Header } from '@/components/Header';
import type { LanguageCode } from '@/lib/i18n/settings';

interface ServerHeaderProps {
  currentLang: LanguageCode;
}

export async function ServerHeader({ currentLang }: ServerHeaderProps) {
  // Fetch session server-side
  const session = await auth();

  return <Header currentLang={currentLang} session={session} />;
}
