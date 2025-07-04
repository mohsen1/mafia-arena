import bcrypt from 'bcryptjs';
import { db } from '@/lib/db/config';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const SALT_ROUNDS = 12;

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  error?: string;
  message?: string;
  user?: {
    id: string;
    email: string;
    name: string | null;
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function createUser(
  userData: CreateUserData
): Promise<AuthResponse> {
  try {
    const { name, email, password } = userData;

    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      // If user exists but has no password (OAuth user), allow setting password
      if (!existingUser.password) {
        const hashedPassword = await hashPassword(password);
        
        await db
          .update(users)
          .set({
            password: hashedPassword,
            name: existingUser.name || name, // Keep existing name if present
          })
          .where(eq(users.id, existingUser.id));
        
        return {
          success: true,
          message: 'signUp.passwordAddedToOAuthAccount',
          user: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name || name,
          },
        };
      }
      
      // User exists with password already
      return {
        success: false,
        error: 'signUp.emailExists',
      };
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create the user
    const [newUser] = await db
      .insert(users)
      .values({
        name,
        email,
        password: hashedPassword,
        emailVerified: null,
        image: null,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    return {
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
    };
  } catch (error) {
    console.error('Error creating user:', error);
    return {
      success: false,
      error: 'signUp.unexpectedError',
    };
  }
}

export async function getUserByEmail(email: string) {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user || null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export function validatePassword(password: string): {
  isValid: boolean;
  error?: string;
} {
  if (password.length < 8) {
    return { isValid: false, error: 'signUp.passwordRequirements' };
  }

  if (!/(?=.*[a-z])/.test(password)) {
    return { isValid: false, error: 'signUp.passwordRequirements' };
  }

  if (!/(?=.*[A-Z])/.test(password)) {
    return { isValid: false, error: 'signUp.passwordRequirements' };
  }

  if (!/(?=.*\d)/.test(password)) {
    return { isValid: false, error: 'signUp.passwordRequirements' };
  }

  return { isValid: true };
}

export function validateEmail(email: string): {
  isValid: boolean;
  error?: string;
} {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'signUp.invalidEmail' };
  }

  return { isValid: true };
}
