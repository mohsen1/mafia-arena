import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { SignInForm } from '@/components/auth/SignInForm';

interface Props {
  params: Promise<{
    lang: string;
  }>;
}

export default async function SignInPage({ params }: Props) {
  const { lang } = await params;
  const session = await getServerSession(authOptions);

  if (session) {
    redirect(`/${lang}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">🐺 Werewolf AI</h1>
          <p className="text-muted-foreground mt-2">
            Sign in to start playing with AI agents
          </p>
        </div>
        <SignInForm />
      </div>
    </div>
  );
} 