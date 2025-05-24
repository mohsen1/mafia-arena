import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface Props {
  params: Promise<{
    lang: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function AuthErrorPage({ params, searchParams }: Props) {
  const { lang } = await params;
  const { error } = await searchParams;

  let errorMessage = 'An unexpected error occurred during authentication.';
  
  switch (error) {
    case 'Configuration':
      errorMessage = 'Server configuration error. Please contact support.';
      break;
    case 'AccessDenied':
      errorMessage = 'Access denied. You do not have permission to sign in.';
      break;
    case 'Verification':
      errorMessage = 'The verification token has expired or is invalid.';
      break;
    case 'OAuthSignin':
    case 'OAuthCallback':
    case 'OAuthCreateAccount':
    case 'EmailCreateAccount':
    case 'Callback':
      errorMessage = 'Error during sign in process. Please try again.';
      break;
    case 'OAuthAccountNotLinked':
      errorMessage = 'This account is already linked to another user.';
      break;
    case 'EmailSignin':
      errorMessage = 'Unable to send sign in email. Please try again.';
      break;
    case 'CredentialsSignin':
      errorMessage = 'Invalid credentials. Please check your details and try again.';
      break;
    case 'SessionRequired':
      errorMessage = 'You must be signed in to access this page.';
      break;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-destructive">🚫 Authentication Error</h1>
          <p className="text-muted-foreground">
            {errorMessage}
          </p>
        </div>
        
        <div className="bg-card border rounded-lg p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Error Code: {error || 'Unknown'}
          </p>
          
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href={`/${lang}/auth/signin`}>
                Try Again
              </Link>
            </Button>
            
            <Button variant="outline" asChild className="w-full">
              <Link href={`/${lang}`}>
                Go Home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 