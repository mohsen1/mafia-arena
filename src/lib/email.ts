import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface EmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendEmail(
  options: SendEmailOptions
): Promise<EmailResult> {
  try {
    if (!resend) {
      console.log('📧 Email service not configured - RESEND_API_KEY missing');
      console.log('📧 Email content would be:', options);
      return {
        success: false,
        error: 'Email service not configured',
      };
    }

    const emailFrom =
      process.env.EMAIL_FROM || 'Werewolf AI <noreply@werewolf-ai.com>';

    console.log('📧 Sending email:', {
      to: options.to,
      subject: options.subject,
      from: emailFrom,
    });

    const result = await resend.emails.send({
      from: emailFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (result.error) {
      console.error('❌ Resend email error:', result.error);
      return {
        success: false,
        error: result.error.message || 'Email send failed',
      };
    }

    console.log('✅ Email sent successfully:', result.data?.id);
    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('❌ Email service error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email error',
    };
  }
}
