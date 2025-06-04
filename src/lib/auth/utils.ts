import crypto from "crypto";
import bcrypt from "bcrypt";
import { db } from "@/lib/db/config";
import { users, verificationTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 12;

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  error?: string;
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
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function createUser(
  userData: CreateUserData,
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
      return {
        success: false,
        error: "A user with this email already exists",
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
    console.error("Error creating user:", error);
    return {
      success: false,
      error: "Failed to create user. Please try again.",
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
    console.error("Error fetching user:", error);
    return null;
  }
}

export function validatePassword(password: string): {
  isValid: boolean;
  error?: string;
} {
  if (password.length < 8) {
    return {
      isValid: false,
      error: "Password must be at least 8 characters long",
    };
  }

  if (!/(?=.*[a-z])/.test(password)) {
    return {
      isValid: false,
      error: "Password must contain at least one lowercase letter",
    };
  }

  if (!/(?=.*[A-Z])/.test(password)) {
    return {
      isValid: false,
      error: "Password must contain at least one uppercase letter",
    };
  }

  if (!/(?=.*\d)/.test(password)) {
    return {
      isValid: false,
      error: "Password must contain at least one number",
    };
  }

  return { isValid: true };
}

export function validateEmail(email: string): {
  isValid: boolean;
  error?: string;
} {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return { isValid: false, error: "Please enter a valid email address" };
  }

  return { isValid: true };
}
export async function createPasswordResetToken(email: string) {
  const user = await getUserByEmail(email);
  if (!user) {
    return { success: false, error: "User not found" } as AuthResponse & {
      token?: string;
    };
  }
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  // remove existing tokens for this email
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, email));
  await db
    .insert(verificationTokens)
    .values({ identifier: email, token, expires });
  return { success: true, token } as AuthResponse & { token: string };
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<AuthResponse> {
  const [record] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, token))
    .limit(1);
  if (!record || record.expires < new Date()) {
    return { success: false, error: "Invalid or expired token" };
  }
  const hashed = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.email, record.identifier));
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.token, token));
  return { success: true };
}
