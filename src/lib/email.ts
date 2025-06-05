import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendEmail(options: SendEmailOptions) {
  if (resend) {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Werewolf AI <noreply@werewolf-ai.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return;
  }

  console.log('📧 Email content:', options);
}
