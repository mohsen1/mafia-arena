import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getApiUrl } from '~/lib/utils';

interface User {
  email: string;
  name: string;
  picture?: string;
  isAdmin: boolean;
}

interface AuthState {
  authenticated: boolean;
  user?: User;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  logout: () => Promise<void>;
  getLoginUrl: (redirect?: string) => string;
  apiUrl: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    loading: true,
  });

  const apiUrl = getApiUrl();

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch(`${apiUrl}/api/auth/me`, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json() as { authenticated?: boolean; user?: User };
          if (data.authenticated && data.user) {
            setState({
              authenticated: true,
              user: data.user,
              loading: false,
            });
            
            // Set localStorage flag for admin
            if (data.user.isAdmin) {
              localStorage.setItem('adminUnlocked', 'true');
            }
            return;
          }
        }
      } catch (e) {
        console.log('Auth check failed:', e);
      }

      setState({
        authenticated: false,
        loading: false,
      });
    }

    checkAuth();
  }, [apiUrl]);

  const logout = async () => {
    try {
      await fetch(`${apiUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (e) {
      // Ignore errors
    }

    localStorage.removeItem('adminUnlocked');
    sessionStorage.removeItem('adminCredentials');
    setState({ authenticated: false, loading: false });
    window.location.reload();
  };

  const getLoginUrl = (redirect = '/admin') => {
    return `${apiUrl}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
  };

  return (
    <AuthContext.Provider value={{ ...state, logout, getLoginUrl, apiUrl }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

