'use server';

import { db } from '@/lib/db/config';
import { users, verificationTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { hashPassword, validatePassword } from '@/lib/auth/utils';
import { sendEmail } from '@/lib/email';

export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean }> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    return { success: true };
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, email));
  await db
    .insert(verificationTokens)
    .values({ identifier: email, token, expires });

  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset/${token}`;
  await sendEmail({
    to: email,
    subject: 'Reset your Werewolf AI password',
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
  });
  return { success: true };
}

export async function resetPassword(
  token: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const [entry] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, token))
    .limit(1);

  if (!entry || entry.expires < new Date()) {
    return { success: false, error: 'Invalid or expired token' };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, entry.identifier))
    .limit(1);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    return { success: false, error: passwordValidation.error };
  }

  const hashed = await hashPassword(password);
  await db
    .update(users)
    .set({ password: hashed, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.token, token));
  return { success: true };
}
