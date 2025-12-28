import { Link } from 'react-router';

export function Footer() {
  return (
    <footer className="border-t py-6 mt-auto">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>© 2025 Mohsen Azimi</p>
        <nav className="flex items-center gap-4">
          <Link to="/privacy-policy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link to="/tos" className="hover:text-foreground transition-colors">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}

