'use server';

import { db } from '@/lib/db/config';
import { users, verificationTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { hashPassword, validatePassword } from '@/lib/auth/utils';
import { sendEmail } from '@/lib/email';

export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always return success for security reasons (prevent email enumeration)
    // but only send email if user exists
    if (!user) {
      console.log('🔍 Password reset requested for non-existent email:', email);
      return { success: true };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing tokens for this email
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, email));

    // Create new verification token
    await db
      .insert(verificationTokens)
      .values({ identifier: email, token, expires });

    const resetUrl = `${process.env.NEXTAUTH_URL}/en/auth/reset/${token}`;

    console.log('🔐 Sending password reset email to:', email);

    const emailResult = await sendEmail({
      to: email,
      subject: 'Reset your Werewolf AI password',
      html: `
        <h2>Reset Your Password</h2>
        <p>You requested a password reset for your Werewolf AI account.</p>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>Or copy and paste this URL into your browser:</p>
        <p>${resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this password reset, you can safely ignore this email.</p>
        <hr>
        <p style="color: #666; font-size: 14px;">Werewolf AI Team</p>
      `,
    });

    if (!emailResult.success) {
      console.error(
        '❌ Failed to send password reset email:',
        emailResult.error
      );
      // Log the error but still return success for security
      // In production, you might want to alert admins about email failures
      return { success: true }; // Don't expose email service errors to users
    }

    console.log('✅ Password reset email sent successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error in password reset request:', error);
    return {
      success: false,
      error:
        'An error occurred while processing your request. Please try again.',
    };
  }
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
