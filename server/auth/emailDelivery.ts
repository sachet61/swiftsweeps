import type { ServerConfig } from '../config/env.js';
import type { Logger } from '../logging/logger.js';

export type OtpEmailPurpose =
  | 'sign-in'
  | 'email-verification'
  | 'forget-password'
  | 'change-email';

export interface SendVerificationEmailPayload {
  to: string;
  recipientName: string;
  url: string;
}

export interface SendOtpEmailPayload {
  to: string;
  otp: string;
  purpose: OtpEmailPurpose;
}

export interface SendPasswordResetEmailPayload {
  to: string;
  recipientName: string;
  url: string;
}

export interface EmailDeliveryAdapter {
  readonly providerName: string;
  isConfigured(): boolean;
  sendVerificationEmail(payload: SendVerificationEmailPayload): Promise<void>;
  sendOtpEmail(payload: SendOtpEmailPayload): Promise<void>;
  sendPasswordResetEmail(payload: SendPasswordResetEmailPayload): Promise<void>;
}

export class EmailDeliveryUnavailableError extends Error {
  constructor(message = 'Transactional email delivery provider is not configured.') {
    super(message);
    this.name = 'EmailDeliveryUnavailableError';
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildOtpCopy(purpose: OtpEmailPurpose, otp: string): {
  subject: string;
  heading: string;
  instruction: string;
} {
  switch (purpose) {
    case 'email-verification':
      return {
        subject: 'Verify your SwiftSweeps email address',
        heading: 'Email Verification Code',
        instruction: `Use the 6-digit verification code below to confirm your email address: ${otp}. This code expires in 5 minutes.`,
      };
    case 'forget-password':
      return {
        subject: 'SwiftSweeps password reset verification code',
        heading: 'Password Reset Code',
        instruction: `Use the 6-digit security code below to reset your SwiftSweeps password: ${otp}. This code expires in 5 minutes.`,
      };
    case 'change-email':
      return {
        subject: 'Confirm your SwiftSweeps email change',
        heading: 'Email Change Verification Code',
        instruction: `Use the 6-digit code below to confirm your email address update: ${otp}. This code expires in 5 minutes.`,
      };
    case 'sign-in':
      return {
        subject: 'Your SwiftSweeps sign-in verification code',
        heading: 'Sign-In Security Code',
        instruction: `Use the 6-digit code below to complete sign-in: ${otp}. This code expires in 5 minutes.`,
      };
  }
}

export function createEmailDeliveryAdapter(
  config: ServerConfig,
  logger: Logger,
): EmailDeliveryAdapter {
  if (
    config.emailProvider === 'brevo' &&
    config.brevoApiKey &&
    config.emailFromAddress
  ) {
    const apiKey = config.brevoApiKey;
    const sender = {
      email: config.emailFromAddress,
      name: config.emailFromName,
    };

    const dispatchBrevo = async (args: {
      to: string;
      subject: string;
      htmlContent: string;
      textContent: string;
    }): Promise<void> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      timeout.unref();

      try {
        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({
            sender,
            to: [{ email: args.to }],
            subject: args.subject,
            htmlContent: args.htmlContent,
            textContent: args.textContent,
          }),
        });

        if (!resp.ok) {
          logger.error('email_delivery_provider_rejected', {
            provider: 'brevo',
            statusCode: resp.status,
          });
          throw new EmailDeliveryUnavailableError(
            'Email delivery provider rejected the message.',
          );
        }
      } catch (err) {
        if (err instanceof EmailDeliveryUnavailableError) {
          throw err;
        }
        logger.error('email_delivery_request_failed', {
          provider: 'brevo',
          error: err,
        });
        throw new EmailDeliveryUnavailableError(
          'Unable to reach email delivery provider.',
        );
      } finally {
        clearTimeout(timeout);
      }
    };

    return {
      providerName: 'brevo',
      isConfigured: () => true,
      async sendVerificationEmail(payload) {
        const safeName = escapeHtml(payload.recipientName || 'Player');
        const safeUrl = escapeHtml(payload.url);
        await dispatchBrevo({
          to: payload.to,
          subject: 'Verify your SwiftSweeps email address',
          textContent: `Hello ${payload.recipientName || 'Player'}, verify your email address using this link: ${payload.url}`,
          htmlContent: `<p>Hello ${safeName},</p><p>Please verify your email address by opening the link below:</p><p><a href="${safeUrl}">Verify Email</a></p>`,
        });
      },
      async sendOtpEmail(payload) {
        const copy = buildOtpCopy(payload.purpose, payload.otp);
        const safeOtp = escapeHtml(payload.otp);
        await dispatchBrevo({
          to: payload.to,
          subject: copy.subject,
          textContent: copy.instruction,
          htmlContent: `<p><strong>${escapeHtml(copy.heading)}</strong></p><p>${escapeHtml(copy.instruction)}</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${safeOtp}</p>`,
        });
      },
      async sendPasswordResetEmail(payload) {
        const safeName = escapeHtml(payload.recipientName || 'Player');
        const safeUrl = escapeHtml(payload.url);
        await dispatchBrevo({
          to: payload.to,
          subject: 'Reset your SwiftSweeps password',
          textContent: `Hello ${payload.recipientName || 'Player'}, reset your password using this link: ${payload.url}`,
          htmlContent: `<p>Hello ${safeName},</p><p>Reset your password using the link below:</p><p><a href="${safeUrl}">Reset Password</a></p>`,
        });
      },
    };
  }

  return {
    providerName: 'disabled',
    isConfigured: () => false,
    async sendVerificationEmail() {
      logger.warn('email_delivery_not_configured', {
        flow: 'email_verification',
      });
      throw new EmailDeliveryUnavailableError();
    },
    async sendOtpEmail(payload) {
      logger.warn('email_delivery_not_configured', {
        flow: payload.purpose,
      });
      throw new EmailDeliveryUnavailableError();
    },
    async sendPasswordResetEmail() {
      logger.warn('email_delivery_not_configured', {
        flow: 'password_reset',
      });
      throw new EmailDeliveryUnavailableError();
    },
  };
}
