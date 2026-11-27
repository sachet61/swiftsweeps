import nodemailer from 'nodemailer';
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

export interface SmtpTransporterLike {
  sendMail(mailOptions: {
    from: { name: string; address: string };
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export interface EmailDeliveryAdapterOptions {
  smtpTransporter?: SmtpTransporterLike;
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

function sanitizeHeaderText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function sanitizeHttpUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Fall through to safe fallback
  }
  return '#';
}

function wrapEmailHtmlLayout(params: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  footerNotice: string;
}): string {
  const safePreheader = escapeHtml(params.preheader);
  const safeHeading = escapeHtml(params.heading);
  const safeFooter = escapeHtml(params.footerNotice);

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${safeHeading}</title>`,
    '</head>',
    '<body style="margin:0;padding:0;background-color:#0A0F1D;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#E2E8F0;">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0A0F1D;padding:32px 16px;">',
    '<tr>',
    '<td align="center">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#131C2E;border:1px solid #26324A;border-radius:16px;overflow:hidden;">',
    '<tr>',
    '<td style="padding:24px 28px 18px 28px;border-bottom:1px solid #1E293B;background-color:#0E1726;">',
    '<div style="font-size:18px;font-weight:800;letter-spacing:0.6px;color:#FFFFFF;">SWIFT <span style="color:#F59E0B;">SWEEPS</span></div>',
    '<div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#94A3B8;margin-top:4px;">Account Security</div>',
    '</td>',
    '</tr>',
    '<tr>',
    '<td style="padding:28px 28px 24px 28px;">',
    `<h2 style="margin:0 0 14px 0;font-size:22px;line-height:1.3;font-weight:700;color:#FFFFFF;">${safeHeading}</h2>`,
    params.bodyHtml,
    `<p style="margin:20px 0 0 0;padding-top:16px;border-top:1px solid #1E293B;font-size:12px;line-height:1.6;color:#94A3B8;">${safeFooter}</p>`,
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');
}

function buildOtpCopy(purpose: OtpEmailPurpose, otp: string): {
  subject: string;
  heading: string;
  lead: string;
  expiryText: string;
  ignoreNotice: string;
  textInstruction: string;
} {
  const cleanOtp = sanitizeHeaderText(otp);
  switch (purpose) {
    case 'email-verification':
      return {
        subject: `${cleanOtp} is your SwiftSweeps verification code`,
        heading: 'Welcome to SwiftSweeps!',
        lead: 'Please enter the following 6-digit code in the app to verify your account:',
        expiryText: 'This code will expire in 5 minutes.',
        ignoreNotice:
          'This code will expire in 5 minutes. If you did not sign up for SwiftSweeps, please ignore this email.',
        textInstruction: `Welcome to SwiftSweeps! Enter the following 6-digit code in the app to verify your account: ${cleanOtp}. This code will expire in 5 minutes. If you did not sign up for SwiftSweeps, please ignore this email.`,
      };
    case 'forget-password':
      return {
        subject: `${cleanOtp} is your SwiftSweeps password reset code`,
        heading: 'Reset Your Password',
        lead: 'Please enter the following 6-digit security code in the app to reset your SwiftSweeps password:',
        expiryText: 'This code will expire in 5 minutes.',
        ignoreNotice:
          'This code will expire in 5 minutes. If you did not request a password reset, you can safely ignore this email.',
        textInstruction: `Reset Your SwiftSweeps Password: Enter the following 6-digit security code in the app: ${cleanOtp}. This code will expire in 5 minutes. If you did not request a password reset, please ignore this email.`,
      };
    case 'change-email':
      return {
        subject: `${cleanOtp} is your SwiftSweeps email change code`,
        heading: 'Confirm Your Email Change',
        lead: 'Please enter the following 6-digit code in the app to confirm your email address update:',
        expiryText: 'This code will expire in 5 minutes.',
        ignoreNotice:
          'This code will expire in 5 minutes. If you did not request an email change, please ignore this email and secure your account.',
        textInstruction: `Confirm Your SwiftSweeps Email Change: Enter the following 6-digit code in the app: ${cleanOtp}. This code will expire in 5 minutes. If you did not request an email change, please ignore this email.`,
      };
    case 'sign-in':
      return {
        subject: `${cleanOtp} is your SwiftSweeps sign-in code`,
        heading: 'Sign-In Security Code',
        lead: 'Please enter the following 6-digit code in the app to complete sign-in:',
        expiryText: 'This code will expire in 5 minutes.',
        ignoreNotice:
          'This code will expire in 5 minutes. If you did not attempt to sign in, please ignore this email.',
        textInstruction: `Your SwiftSweeps Sign-In Code: Enter the following 6-digit code in the app: ${cleanOtp}. This code will expire in 5 minutes. If you did not attempt to sign in, please ignore this email.`,
      };
  }
}

interface BuiltEmailMessage {
  to: string;
  subject: string;
  textContent: string;
  htmlContent: string;
}

function buildVerificationMessage(
  payload: SendVerificationEmailPayload,
): BuiltEmailMessage {
  const displayName = sanitizeHeaderText(payload.recipientName || 'Player') || 'Player';
  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(sanitizeHttpUrl(payload.url));
  const bodyHtml = [
    `<p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#CBD5E1;">Hello ${safeName},</p>`,
    '<p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#CBD5E1;">Please verify your SwiftSweeps email address by clicking the button below:</p>',
    '<div style="text-align:center;margin:24px 0;">',
    `<a href="${safeUrl}" style="display:inline-block;padding:13px 26px;background-color:#F59E0B;color:#0A0F1D;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">Verify Email Address</a>`,
    '</div>',
    `<p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8;word-break:break-all;">If the button does not work, copy and paste this link into your browser:<br><a href="${safeUrl}" style="color:#F59E0B;text-decoration:underline;">${safeUrl}</a></p>`,
  ].join('');

  return {
    to: payload.to,
    subject: 'Verify your SwiftSweeps email address',
    textContent: `Hello ${displayName}, verify your SwiftSweeps email address using this link (expires in 5 minutes): ${payload.url}`,
    htmlContent: wrapEmailHtmlLayout({
      preheader: 'Verify your SwiftSweeps email address.',
      heading: 'Welcome to SwiftSweeps!',
      bodyHtml,
      footerNotice:
        'This verification link will expire in 5 minutes. If you did not sign up for SwiftSweeps, please ignore this email.',
    }),
  };
}

function buildOtpMessage(payload: SendOtpEmailPayload): BuiltEmailMessage {
  const copy = buildOtpCopy(payload.purpose, payload.otp);
  const safeOtp = escapeHtml(sanitizeHeaderText(payload.otp));
  const bodyHtml = [
    `<p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#CBD5E1;">${escapeHtml(copy.lead)}</p>`,
    `<div style="font-size:32px;font-weight:bold;letter-spacing:6px;padding:18px 16px;background-color:#0A0F1D;color:#F59E0B;border:1px solid #334155;border-radius:10px;text-align:center;margin:20px 0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">${safeOtp}</div>`,
  ].join('');

  return {
    to: payload.to,
    subject: copy.subject,
    textContent: copy.textInstruction,
    htmlContent: wrapEmailHtmlLayout({
      preheader: `${copy.subject}. ${copy.expiryText}`,
      heading: copy.heading,
      bodyHtml,
      footerNotice: copy.ignoreNotice,
    }),
  };
}

function buildPasswordResetMessage(
  payload: SendPasswordResetEmailPayload,
): BuiltEmailMessage {
  const displayName = sanitizeHeaderText(payload.recipientName || 'Player') || 'Player';
  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(sanitizeHttpUrl(payload.url));
  const bodyHtml = [
    `<p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#CBD5E1;">Hello ${safeName},</p>`,
    '<p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#CBD5E1;">We received a request to reset your SwiftSweeps account password. Click the button below to choose a new password:</p>',
    '<div style="text-align:center;margin:24px 0;">',
    `<a href="${safeUrl}" style="display:inline-block;padding:13px 26px;background-color:#F59E0B;color:#0A0F1D;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">Reset Password</a>`,
    '</div>',
    `<p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8;word-break:break-all;">If the button does not work, copy and paste this link into your browser:<br><a href="${safeUrl}" style="color:#F59E0B;text-decoration:underline;">${safeUrl}</a></p>`,
  ].join('');

  return {
    to: payload.to,
    subject: 'Reset your SwiftSweeps password',
    textContent: `Hello ${displayName}, reset your SwiftSweeps password using this link (expires in 1 hour): ${payload.url}`,
    htmlContent: wrapEmailHtmlLayout({
      preheader: 'Reset your SwiftSweeps password.',
      heading: 'Reset Your Password',
      bodyHtml,
      footerNotice:
        'This password reset link will expire in 1 hour. If you did not request a password reset, please ignore this email.',
    }),
  };
}

function createConfiguredAdapter(
  providerName: string,
  dispatch: (msg: BuiltEmailMessage) => Promise<void>,
): EmailDeliveryAdapter {
  return {
    providerName,
    isConfigured: () => true,
    async sendVerificationEmail(payload) {
      await dispatch(buildVerificationMessage(payload));
    },
    async sendOtpEmail(payload) {
      await dispatch(buildOtpMessage(payload));
    },
    async sendPasswordResetEmail(payload) {
      await dispatch(buildPasswordResetMessage(payload));
    },
  };
}

export function createEmailDeliveryAdapter(
  config: ServerConfig,
  logger: Logger,
  options: EmailDeliveryAdapterOptions = {},
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

    const dispatchBrevo = async (msg: BuiltEmailMessage): Promise<void> => {
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
            to: [{ email: msg.to }],
            subject: msg.subject,
            htmlContent: msg.htmlContent,
            textContent: msg.textContent,
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

    return createConfiguredAdapter('brevo', dispatchBrevo);
  }

  if (
    config.emailProvider === 'smtp' &&
    config.smtpHost &&
    config.smtpUser &&
    config.smtpPass &&
    config.emailFromAddress
  ) {
    const sender = {
      name: config.emailFromName,
      address: config.emailFromAddress,
    };

    const transporter: SmtpTransporterLike =
      options.smtpTransporter ??
      nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        requireTLS:
          !config.smtpSecure &&
          (config.smtpPort === 587 || config.nodeEnv === 'production'),
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 10_000,
      });

    const dispatchSmtp = async (msg: BuiltEmailMessage): Promise<void> => {
      try {
        await transporter.sendMail({
          from: sender,
          to: msg.to,
          subject: msg.subject,
          text: msg.textContent,
          html: msg.htmlContent,
        });
      } catch (err) {
        logger.error('email_delivery_request_failed', {
          provider: 'smtp',
          host: config.smtpHost,
          port: config.smtpPort,
          error: err,
        });
        throw new EmailDeliveryUnavailableError(
          'Unable to reach SMTP email delivery provider.',
        );
      }
    };

    return createConfiguredAdapter('smtp', dispatchSmtp);
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
