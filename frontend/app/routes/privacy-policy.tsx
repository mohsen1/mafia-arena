import type { Route } from "./+types/privacy-policy";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Privacy Policy | Mafia Arena" },
  ];
}

export default function PrivacyPolicy() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mt-1">Last updated: December 2024</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">What We Collect</h2>
        <div className="text-sm text-muted-foreground space-y-3">
          <p><strong className="text-foreground">Account Information</strong><br/>
          If you sign in with Google, we store your Google ID, email, name, and profile picture URL.</p>
          
          <p><strong className="text-foreground">API Keys (Optional)</strong><br/>
          If you contribute API keys, they are encrypted (AES-GCM) before storage and only decrypted during game execution.</p>
          
          <p><strong className="text-foreground">Game Data</strong><br/>
          AI-generated game transcripts, statistics, and model performance metrics. This contains no personal information.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Cookies</h2>
        <p className="text-sm text-muted-foreground">
          We use a single session cookie (<code className="text-xs bg-muted px-1 py-0.5 rounded">mafia_session</code>) for authentication. 
          It's HttpOnly, Secure, expires after 7 days, and contains only a random session ID.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Third Parties</h2>
        <div className="text-sm text-muted-foreground space-y-3">
          <p><strong className="text-foreground">Google</strong><br/>Used for authentication via OAuth.</p>
          <p><strong className="text-foreground">AI Providers</strong><br/>Game prompts are sent to OpenAI, Anthropic, Google, and other AI providers.</p>
          <p><strong className="text-foreground">Cloudflare</strong><br/>The site runs on Cloudflare infrastructure.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="text-sm text-muted-foreground">
          Questions? Reach out on <a href="https://twitter.com/mohsen____" target="_blank" rel="noreferrer" className="text-primary hover:underline">Twitter</a> or <a href="https://github.com/mohsen1" target="_blank" rel="noreferrer" className="text-primary hover:underline">GitHub</a>.
        </p>
      </section>
    </div>
  );
}

