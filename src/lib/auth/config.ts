import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import { db } from '@/lib/db/config';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      id: 'credentials',
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, credentials.email))
            .limit(1);

          if (!user || !user.password) {
            return null;
          }

          const isValidPassword = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isValidPassword) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        } catch (error) {
          console.error('Error during authentication:', error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // Initial sign in
      if (account && user) {
        // For OAuth providers, we need to fetch the user from database to get the correct ID
        if (account.provider !== 'credentials' && user.email) {
          const [dbUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, user.email))
            .limit(1);

          if (dbUser) {
            token.id = dbUser.id;
            token.email = dbUser.email;
            token.name = dbUser.name;
            token.image = dbUser.image;
          }
        } else {
          // For credentials provider, use the user data directly
          token.id = user.id;
          token.email = user.email;
          token.name = user.name;
          token.image = user.image;
        }
      }

      // Return previous token if the user is already signed in
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.image as string;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // For OAuth providers, ensure user data is saved to database
      if (account?.provider && account.provider !== 'credentials') {
        try {
          const email = user.email;
          if (!email) return false;

          // Check if user exists
          const [existingUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

          if (!existingUser) {
            // Create new user
            const [newUser] = await db
              .insert(users)
              .values({
                email: email,
                name: user.name || profile?.name || null,
                image: user.image || profile?.image || null,
                emailVerified: new Date(),
              })
              .returning();

            // Set the database user ID on the user object
            user.id = newUser.id;
          } else {
            // Update existing user's image and name if they don't have one
            const updates: Record<string, string> = {};
            if (!existingUser.image && (user.image || profile?.image)) {
              updates.image = (user.image || profile?.image) as string;
            }
            if (!existingUser.name && (user.name || profile?.name)) {
              updates.name = (user.name || profile?.name) as string;
            }

            if (Object.keys(updates).length > 0) {
              await db
                .update(users)
                .set(updates)
                .where(eq(users.id, existingUser.id));
            }

            // Set the database user ID on the user object
            user.id = existingUser.id;
            // Also ensure we have the latest user data
            user.name = existingUser.name || user.name;
            user.image = updates.image || existingUser.image || user.image;
          }

          return true;
        } catch (error) {
          console.error('Error saving OAuth user:', error);
          return false;
        }
      }

      // For credentials provider, user validation is handled in authorize()
      return !!user;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  debug: process.env.NODE_ENV === 'development',
};
