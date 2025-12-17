import { redirect } from 'next/navigation';
import { fallbackLng } from '@/lib/i18n/settings';

/**
 * Root page that redirects to the fallback language
 * This is needed because Cloudflare Pages middleware doesn't always
 * handle redirects correctly for the root path
 */
export default function RootPage() {
  redirect(`/${fallbackLng}`);
}
