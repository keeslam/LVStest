import { storage } from "../storage";
import nodemailer from "nodemailer";
import { db } from "../db";
import { emailLogs } from "../../shared/schema";

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  encoding?: string;
}

export interface EmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  /**
   * FIX-M (BUG-196): transfer encoding for the body parts. Portal mail sends
   * base64 so a euro sign survives every hop and a `?request=12` deep link can
   * never be read back as a quoted-printable escape.
   */
  textEncoding?: "base64" | "quoted-printable";
  /** What the `email_logs` row is filed under; defaults to the purpose. */
  logTemplate?: string;
}

/**
 * FIX-M (BUG-100) — a header value may never carry CR or LF. Without this an
 * SMTP-settings save of `Lam Groep\r\nBcc: evil@example.com` became a real Bcc
 * header on every message the app sent.
 */
export function isSafeHeaderValue(value: unknown): boolean {
  return typeof value === "string" && !/[\r\n]/.test(value);
}

/**
 * One `email_logs` row per attempt — success and failure — written where the
 * attempt happens instead of once after a loop (BUG-155, BUG-185). Never
 * throws: logging a mail must not fail the mail.
 */
async function logEmailAttempt(entry: {
  template: string;
  subject: string;
  recipient: string;
  sent: boolean;
  failureReason?: string | null;
}): Promise<void> {
  try {
    await db.insert(emailLogs).values({
      template: entry.template.slice(0, 120),
      subject: entry.subject.slice(0, 500),
      recipients: 1,
      emailsSent: entry.sent ? 1 : 0,
      emailsFailed: entry.sent ? 0 : 1,
      failureReason: entry.sent ? null : (entry.failureReason ?? "unknown error").slice(0, 1000),
      vehicleIds: [],
      sentAt: new Date().toISOString(),
      recipient: entry.recipient.slice(0, 320),
      result: entry.sent ? "sent" : "failed",
    });
  } catch (error) {
    console.error("Failed to write email_logs row:", error);
  }
}

export interface EmailError {
  success: false;
  error: string;
  userMessage: string;
  suggestion?: string;
}

interface EmailConfig {
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  /** BUG-080: TLS certificate validation. On unless a setting turns it off. */
  rejectUnauthorized: boolean;
}

// Cache for email configs by purpose
const cachedConfigs: Map<string, { config: EmailConfig; timestamp: number }> = new Map();
const CONFIG_CACHE_TTL = 60000; // Cache for 1 minute

async function getEmailConfig(purpose?: 'apk' | 'maintenance' | 'gps' | 'documents' | 'custom'): Promise<EmailConfig | null> {
  const now = Date.now();
  const cacheKey = purpose || 'default';
  
  // Return cached config if still valid
  const cached = cachedConfigs.get(cacheKey);
  if (cached && (now - cached.timestamp < CONFIG_CACHE_TTL)) {
    return cached.config;
  }

  try {
    const emailSettings = await storage.getAppSettingsByCategory('email');
    
    if (emailSettings.length === 0) {
      console.warn('⚠️ No email settings configured in database');
      return null;
    }

    console.log(`🔍 Looking for email config with purpose: ${purpose || 'default'}`);
    console.log(`📧 Available email settings keys: ${emailSettings.map(s => s.key).join(', ')}`);

    // Try to find config for specific purpose first
    let setting = null;
    if (purpose) {
      setting = emailSettings.find(s => s.key === `email_${purpose}`);
      if (setting) {
        console.log(`✅ Found specific config for purpose: email_${purpose}`);
      } else {
        console.warn(`⚠️ No config found for email_${purpose}, falling back to default`);
      }
    }
    
    // Fall back to old email_config or default purpose
    if (!setting) {
      setting = emailSettings.find(s => s.key === 'email_config' || s.key === 'email_default');
      if (setting) {
        console.log(`📌 Using fallback config: ${setting.key}`);
      }
    }
    
    // If still not found, use first available
    if (!setting) {
      setting = emailSettings[0];
      console.log(`⚠️ Using first available config: ${setting.key}`);
    }
    
    const value = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;

    if (!value.fromEmail) {
      console.error('❌ Email configuration missing fromEmail');
      return null;
    }
    if (!value.smtpHost || !value.smtpUser || !value.smtpPassword) {
      console.error('❌ SMTP configuration incomplete');
      return null;
    }

    // BUG-100: a stored fromName/fromEmail with a CR or LF in it would become
    // extra headers on every message. Refuse the config outright rather than
    // sending with an attacker-chosen Bcc.
    if (!isSafeHeaderValue(value.fromEmail) || !isSafeHeaderValue(value.fromName ?? '')) {
      console.error('❌ Email configuration rejected: fromEmail/fromName contains a line break');
      return null;
    }

    const smtpPort = value.smtpPort ? parseInt(String(value.smtpPort)) : 587;
    // BUG-186: the stored `smtpSecure` flag was ignored — `secure` was derived
    // from a *string* comparison against '465', so a config saved as TLS on 465
    // with a numeric port went out in plain text and one saved as secure on 587
    // never used it. Honour the flag; fall back to the port convention only
    // when it was never stored.
    const smtpSecure = value.smtpSecure === undefined || value.smtpSecure === null
      ? smtpPort === 465
      : value.smtpSecure === true || value.smtpSecure === 'true';

    // BUG-080: certificate validation was switched off for every outgoing
    // connection, which makes the TLS meaningless. On by default; an explicit
    // setting can turn it off for a relay with a self-signed certificate, and
    // that choice is logged loudly every time a transporter is built.
    const rejectUnauthorized = !(value.smtpAllowInvalidCert === true || value.smtpAllowInvalidCert === 'true');

    const config: EmailConfig = {
      fromEmail: value.fromEmail,
      fromName: value.fromName || 'Autolease Lam',
      smtpHost: value.smtpHost,
      smtpPort,
      smtpUser: value.smtpUser,
      smtpPassword: value.smtpPassword,
      smtpSecure,
      rejectUnauthorized,
    };

    cachedConfigs.set(cacheKey, { config, timestamp: now });
    console.log(`✅ Email config loaded for ${purpose || 'default'} (from: ${config.fromEmail})`);

    return config;
  } catch (error) {
    console.error('Error loading email configuration:', error);
    return null;
  }
}

function getSmtpErrorMessage(error: any): { userMessage: string; suggestion?: string } {
  const errorString = error.message || error.toString();
  const errorCode = error.code;
  const responseCode = error.responseCode;

  // Microsoft/Outlook basic auth disabled
  if (errorString.includes('basic authentication is disabled') || responseCode === 535) {
    return {
      userMessage: 'Your email provider has disabled basic authentication (username + password).',
      suggestion: 'For Microsoft/Outlook accounts: Enable OAuth2 in settings or use an App Password. For other providers: Check if they require App Passwords or special authentication.'
    };
  }

  // Authentication failed
  if (errorCode === 'EAUTH' || responseCode === 535 || errorString.includes('Invalid login')) {
    return {
      userMessage: 'Email authentication failed. Your username or password is incorrect.',
      suggestion: 'Double-check your email address and password. For Gmail/Outlook, you may need to use an App Password instead of your regular password.'
    };
  }

  // Connection refused/failed - nodemailer wraps the underlying socket error
  // (ECONNREFUSED and friends) as its own 'ECONNECTION' code, verified against
  // node_modules/nodemailer/lib/smtp-connection/index.js; the raw 'ECONNREFUSED'
  // is kept here too in case a lower-level error ever surfaces unwrapped.
  if (errorCode === 'ECONNECTION' || errorCode === 'ECONNREFUSED') {
    return {
      userMessage: 'Cannot connect to the email server. The server refused the connection.',
      suggestion: 'Check if the SMTP host and port are correct. Common ports: 587 (TLS), 465 (SSL), 25 (unencrypted).'
    };
  }

  // Connection timeout
  if (errorCode === 'ETIMEDOUT' || errorCode === 'ESOCKET') {
    return {
      userMessage: 'Connection to email server timed out.',
      suggestion: 'Check your internet connection and firewall settings. The SMTP server may be temporarily unavailable.'
    };
  }

  // TLS/SSL errors
  if (errorString.includes('self signed certificate') || errorString.includes('certificate')) {
    return {
      userMessage: 'SSL/TLS certificate validation failed.',
      suggestion: 'The server may be using a self-signed certificate. Contact your email provider or system administrator.'
    };
  }

  // DNS errors (nodemailer re-codes any DNS lookup failure as 'EDNS', regardless
  // of the underlying Node error code - verified against node_modules/nodemailer/
  // lib/smtp-connection/index.js, which never actually surfaces 'ENOTFOUND' itself)
  if (errorCode === 'EDNS' || errorCode === 'ENOTFOUND') {
    return {
      userMessage: 'Email server not found. The hostname could not be resolved.',
      suggestion: 'Check if the SMTP host address is correct. Example: smtp.gmail.com'
    };
  }

  // Recipient/sender errors
  if (responseCode === 550 || responseCode === 553) {
    return {
      userMessage: 'Email was rejected by the server.',
      suggestion: 'Check if the recipient email address is valid and your sender email is authorized to send from this server.'
    };
  }

  // Generic error
  return {
    userMessage: 'Failed to send email due to an unexpected error.',
    suggestion: 'Check all your email settings and try again. Contact support if the problem persists.'
  };
}

export interface SmtpTestInput {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  /** BUG-080: only an explicit opt-out skips certificate validation. */
  smtpAllowInvalidCert?: boolean;
}

export interface SmtpTestResult {
  success: boolean;
  userMessage: string;
  suggestion?: string;
}

// Checks connectivity + authentication only (nodemailer's verify()) - never sends
// an actual message, so this is safe to call as often as needed while an admin
// is trying out credentials in the Settings UI.
export async function testSmtpConnection(input: SmtpTestInput): Promise<SmtpTestResult> {
  const transporter = nodemailer.createTransport({
    host: input.smtpHost,
    port: input.smtpPort,
    secure: input.smtpSecure,
    auth: {
      user: input.smtpUser,
      pass: input.smtpPassword,
    },
    tls: {
      // BUG-080: the connection test validates the certificate too, so an
      // admin finds out here rather than by trusting a relay that mail is
      // silently being handed to unverified.
      rejectUnauthorized: input.smtpAllowInvalidCert !== true,
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  try {
    await transporter.verify();
    return { success: true, userMessage: 'Connection successful. The SMTP server accepted the credentials.' };
  } catch (error: any) {
    const { userMessage, suggestion } = getSmtpErrorMessage(error);
    console.error('❌ SMTP connection test failed:', error.code || error.message);
    return { success: false, userMessage, suggestion };
  } finally {
    transporter.close();
  }
}

// Reuse one pooled SMTP connection per distinct set of credentials instead of
// opening/authenticating/closing a brand new connection for every single email.
// A bulk send (e.g. 200 APK reminders) previously did 200 separate SMTP logins
// in a row - a pattern several providers rate-limit or flag as abuse on its own,
// independent of whether each individual message was legitimate.
const cachedTransporters: Map<string, nodemailer.Transporter> = new Map();

function transporterKey(config: EmailConfig): string {
  return `${config.smtpHost}:${config.smtpPort}:${config.smtpUser}:${config.smtpSecure}:${config.rejectUnauthorized}`;
}

/**
 * FIX-M (BUG-171): 10 s on each of the three phases. Without them a mail
 * server that accepts the TCP connection and then says nothing holds a pooled
 * connection open forever; with `maxConnections: 2`, two such messages stop
 * *all* mail from the application — including password recovery — with no
 * error anywhere.
 */
export const SMTP_TIMEOUT_MS = 10000;

function getTransporter(config: EmailConfig): nodemailer.Transporter {
  const key = transporterKey(config);
  const cached = cachedTransporters.get(key);
  if (cached) {
    return cached;
  }

  if (!config.rejectUnauthorized) {
    console.warn(
      `⚠️ SMTP certificate validation is DISABLED for ${config.smtpHost}:${config.smtpPort} ` +
      `(smtpAllowInvalidCert). Mail to this relay can be intercepted; turn it back on as soon as the ` +
      `certificate is fixed.`,
    );
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword,
    },
    tls: {
      // BUG-080: validation is on unless the stored settings explicitly waive it.
      rejectUnauthorized: config.rejectUnauthorized,
    },
    // BUG-171: a hanging mail server must fail this send, not every send.
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
  });
  cachedTransporters.set(key, transporter);
  return transporter;
}

/** Exposed for the regression test: the options a transporter is built with. */
export function describeTransportOptions(config: EmailConfig): Record<string, unknown> {
  return {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    rejectUnauthorized: config.rejectUnauthorized,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  };
}

/** The resolved SMTP configuration for a purpose — for tests and diagnostics. */
export async function resolveEmailConfig(purpose?: 'apk' | 'maintenance' | 'gps' | 'documents' | 'custom') {
  return getEmailConfig(purpose);
}

async function sendViaSmtp(config: EmailConfig, options: EmailOptions): Promise<{ sent: boolean; failureReason?: string }> {
  try {
    const transporter = getTransporter(config);

    const mailOptions: any = {
      // BUG-100: the address is handed over in object form, so nodemailer
      // encodes the display name instead of us pasting it into a header.
      from: { name: config.fromName, address: config.fromEmail },
      to: options.toName && isSafeHeaderValue(options.toName)
        ? { name: options.toName, address: options.to }
        : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    // BUG-196: an explicit transfer encoding for the body parts. base64 is the
    // default now: quoted-printable is where the euro sign came out as `â¬`
    // and where a `?request=12` deep link could be read back as an escape
    // sequence. The charset stays UTF-8, declared per part by nodemailer.
    mailOptions.textEncoding = options.textEncoding ?? "base64";

    if (options.attachments && options.attachments.length > 0) {
      mailOptions.attachments = options.attachments;
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ SMTP email sent:', info.messageId);
    return { sent: true };
  } catch (error: any) {
    const { userMessage, suggestion } = getSmtpErrorMessage(error);
    console.error('❌ SMTP email error:', error);
    console.error('💡 User message:', userMessage);
    if (suggestion) {
      console.error('💡 Suggestion:', suggestion);
    }
    return { sent: false, failureReason: `${error?.code || error?.responseCode || 'ERROR'}: ${userMessage}` };
  }
}

export async function sendEmail(options: EmailOptions, purpose?: 'apk' | 'maintenance' | 'gps' | 'documents' | 'custom'): Promise<boolean> {
  // FIX-M (BUG-155, BUG-185): every attempt is accounted for — the send that
  // worked, the send that failed, and the send that never happened because the
  // configuration is missing. The row is written in a `finally`, so a throw on
  // the way out still leaves the trail.
  let sent = false;
  let failureReason: string | undefined;
  try {
    const config = await getEmailConfig(purpose);

    if (!config) {
      failureReason = `No valid email configuration for purpose: ${purpose || 'default'}`;
      console.error(`❌ Cannot send email: ${failureReason}`);
      return false;
    }

    if (!isSafeHeaderValue(options.to) || !isSafeHeaderValue(options.subject)) {
      failureReason = 'Recipient or subject contains a line break';
      console.error(`❌ Cannot send email: ${failureReason}`);
      return false;
    }

    const result = await sendViaSmtp(config, options);
    sent = result.sent;
    failureReason = result.failureReason;
    return sent;
  } finally {
    await logEmailAttempt({
      template: options.logTemplate || purpose || 'default',
      subject: options.subject,
      recipient: options.to,
      sent,
      failureReason,
    });
  }
}

// Clear the cache - useful when settings are updated. Also closes any pooled
// SMTP connections so a credential change can't leave an old connection
// authenticated under the previous password.
export function clearEmailConfigCache(): void {
  cachedConfigs.clear();
  for (const transporter of cachedTransporters.values()) {
    transporter.close();
  }
  cachedTransporters.clear();
  console.log('🔄 Email config cache cleared');
}

// Predefined email templates for common notifications
export const EmailTemplates = {
  apkReminder: (customerName: string, vehiclePlate: string, expiryDate: string) => ({
    subject: `APK Reminder - ${vehiclePlate} expires soon`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">APK Inspection Reminder</h2>
        <p>Dear ${customerName},</p>
        <p>This is a friendly reminder that your vehicle <strong>${vehiclePlate}</strong> requires an APK inspection.</p>
        <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;"><strong>APK Expiry Date:</strong> ${expiryDate}</p>
        </div>
        <p>Please schedule your APK inspection as soon as possible to ensure your vehicle remains roadworthy and legal.</p>
        <p>Best regards,<br>Autolease Lam</p>
      </div>
    `,
    text: `Dear ${customerName},

This is a friendly reminder that your vehicle ${vehiclePlate} requires an APK inspection.

APK Expiry Date: ${expiryDate}

Please schedule your APK inspection as soon as possible to ensure your vehicle remains roadworthy and legal.

Best regards,
Autolease Lam`
  }),
  
  maintenanceReminder: (customerName: string, vehiclePlate: string, maintenanceType: string) => ({
    subject: `Maintenance Reminder - ${vehiclePlate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Vehicle Maintenance Reminder</h2>
        <p>Dear ${customerName},</p>
        <p>Your vehicle <strong>${vehiclePlate}</strong> is due for maintenance.</p>
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Maintenance Type:</strong> ${maintenanceType}</p>
        </div>
        <p>Please contact us to schedule your maintenance appointment.</p>
        <p>Best regards,<br>Autolease Lam</p>
      </div>
    `,
    text: `Dear ${customerName},

Your vehicle ${vehiclePlate} is due for maintenance.

Maintenance Type: ${maintenanceType}

Please contact us to schedule your maintenance appointment.

Best regards,
Autolease Lam`
  }),
  
  customMessage: (customerName: string, vehiclePlate: string, message: string) => ({
    subject: `Important Update - ${vehiclePlate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Important Update</h2>
        <p>Dear ${customerName},</p>
        <p>We have an update regarding your vehicle <strong>${vehiclePlate}</strong>:</p>
        <div style="background-color: #e0f2fe; border-left: 4px solid #0284c7; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;">${message}</p>
        </div>
        <p>If you have any questions, please don't hesitate to contact us.</p>
        <p>Best regards,<br>Autolease Lam</p>
      </div>
    `,
    text: `Dear ${customerName},

We have an important update regarding your vehicle ${vehiclePlate}:

${message}

If you have any questions, please don't hesitate to contact us.

Best regards,
Autolease Lam`
  })
};
