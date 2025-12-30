import { Link, useLocation } from 'react-router';
import { Shield, LogOut, User, Menu, X, Play, Layers } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '~/contexts/auth';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '~/lib/utils';

export function Header() {
  const { pathname } = useLocation();
  const { authenticated, user, loading, logout, getLoginUrl } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const navLinks = [
    { href: '/games', label: 'Games', match: (p: string) => p.startsWith('/games') },
  ];

  const rightNavLinks = [
    { href: '/blog', label: 'Blog', match: (p: string) => p.startsWith('/blog') },
    { href: '/faq', label: 'FAQ', match: (p: string) => p === '/faq' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-4 md:gap-6">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-base tracking-tight hover:opacity-90 transition-opacity">
            <img src="/logo.jpeg" alt="" className="h-8 w-8 rounded-lg shadow-sm" />
            <span className="font-display">Mafia Arena</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-4 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  'transition-colors hover:text-foreground',
                  link.match(pathname)
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                )}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/games/new"
              className={cn(
                'transition-colors hover:text-foreground',
                pathname === '/games/new'
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground'
              )}
            >
              Start a New Game
            </Link>
            {authenticated && (
              <Link
                to="/batches"
                className={cn(
                  'transition-colors hover:text-foreground',
                  pathname.startsWith('/batches')
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                )}
              >
                Batch Games
              </Link>
            )}
            {user?.isAdmin && (
              <Link
                to="/admin"
                className={cn(
                  'transition-colors hover:text-foreground flex items-center gap-1',
                  pathname.startsWith('/admin')
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                )}
              >
                <Shield className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {/* Right-side Navigation Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-4 text-sm mr-2">
            {rightNavLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  'transition-colors hover:text-foreground',
                  link.match(pathname)
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile Menu Button */}
          <div className="relative md:hidden" ref={mobileMenuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMobileMenuOpen(!mobileMenuOpen);
              }}
              className="p-2 -ml-2 hover:bg-accent rounded-md transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Mobile Navigation Overlay */}
            {mobileMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 py-2 bg-background border rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {[...navLinks, ...rightNavLinks].map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={cn(
                      'block px-4 py-2.5 text-sm transition-colors hover:bg-muted',
                      link.match(pathname)
                        ? 'text-foreground font-medium bg-muted/50'
                        : 'text-muted-foreground'
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  to="/games/new"
                  className={cn(
                    'block px-4 py-2.5 text-sm transition-colors hover:bg-muted',
                    pathname === '/games/new'
                      ? 'text-foreground font-medium bg-muted/50'
                      : 'text-muted-foreground'
                  )}
                >
                  Start a New Game
                </Link>
                {authenticated && (
                  <Link
                    to="/batches"
                    className={cn(
                      'block px-4 py-2.5 text-sm transition-colors hover:bg-muted',
                      pathname.startsWith('/batches')
                        ? 'text-foreground font-medium bg-muted/50'
                        : 'text-muted-foreground'
                    )}
                  >
                    Batch Games
                  </Link>
                )}
                {user?.isAdmin && (
                  <Link
                    to="/admin"
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-muted',
                      pathname.startsWith('/admin')
                        ? 'text-foreground font-medium bg-muted/50'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Auth Button */}
          <div className="relative" ref={dropdownRef}>
            {loading ? (
              <div className="w-8 h-8 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              </div>
            ) : authenticated && user ? (
              <div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen(!dropdownOpen);
                  }}
                  className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent transition-colors"
                >
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-6 h-6 rounded-full bg-muted object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        e.currentTarget.nextElementSibling?.classList.add('flex');
                      }}
                    />
                  ) : null}
                  <div className="hidden w-6 h-6 rounded-full bg-muted items-center justify-center">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium max-w-[100px] truncate">
                    {user.name?.split(' ')[0] || 'User'}
                  </span>
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 py-1 bg-background border rounded-md shadow-lg z-50">
                    <div className="px-3 py-2 border-b">
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <Link
                      to="/account"
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <User className="h-4 w-4" />
                      <span>Account</span>
                    </Link>
                    <Link
                      to="/games/new"
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <Play className="h-4 w-4" />
                      <span>Start a New Game</span>
                    </Link>
                    <Link
                      to="/batches"
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <Layers className="h-4 w-4" />
                      <span>Batch Games</span>
                    </Link>
                    {user.isAdmin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <Shield className="h-4 w-4" />
                        <span>Admin Panel</span>
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-muted transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <a
                href={getLoginUrl(pathname)}
                className="inline-flex items-center px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign in
              </a>
            )}
          </div>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

