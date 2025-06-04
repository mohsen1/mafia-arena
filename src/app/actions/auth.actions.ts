"use server";

import {
  createUser,
  validateEmail,
  validatePassword,
  createPasswordResetToken,
  resetPasswordWithToken,
} from "@/lib/auth/utils";
import type { AuthResponse } from "@/lib/auth/utils";

export interface SignUpFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export async function signUpAction(
  formData: SignUpFormData,
): Promise<AuthResponse> {
  try {
    const { name, email, password, confirmPassword } = formData;

    // Validate input
    if (!name.trim()) {
      return { success: false, error: "Name is required" };
    }

    if (name.trim().length < 2) {
      return {
        success: false,
        error: "Name must be at least 2 characters long",
      };
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return { success: false, error: emailValidation.error };
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return { success: false, error: passwordValidation.error };
    }

    if (password !== confirmPassword) {
      return { success: false, error: "Passwords do not match" };
    }

    // Create user
    const result = await createUser({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
    });

    return result;
  } catch (error) {
    console.error("Sign up error:", error);
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
    };
  }
}
export async function requestPasswordResetAction(
  email: string,
): Promise<AuthResponse> {
  try {
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return { success: false, error: emailValidation.error };
    }
    const result = await createPasswordResetToken(email.toLowerCase().trim());
    if (!result.success || !("token" in result)) {
      return {
        success: false,
        error: result.error || "Unable to generate reset token",
      };
    }
    const resetUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3099"}/auth/reset-password/${result.token}`;
    console.log("Password reset link:", resetUrl);
    return { success: true };
  } catch (error) {
    console.error("Password reset request error:", error);
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
    };
  }
}

export async function resetPasswordAction(
  token: string,
  password: string,
  confirmPassword: string,
): Promise<AuthResponse> {
  try {
    if (password !== confirmPassword) {
      return { success: false, error: "Passwords do not match" };
    }
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }
    const result = await resetPasswordWithToken(token, password);
    return result;
  } catch (error) {
    console.error("Reset password error:", error);
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
    };
  }
}
