import { storage } from "../storage";
import nodemailer from "nodemailer";

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
}

export interface EmailError {
  success: false;
  error: string;
  userMessage: string;
  suggestion?: string;
}

interface EmailConfig {
  provider: string;
  fromEmail: string;
  fromName: string;
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
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

    const config: EmailConfig = {
      provider: value.provider || 'smtp',
      fromEmail: value.fromEmail || '',
      fromName: value.fromName || 'Autolease Lam',
      apiKey: value.apiKey,
      smtpHost: value.smtpHost,
      smtpPort: value.smtpPort ? parseInt(value.smtpPort) : 587,
      smtpUser: value.smtpUser,
      smtpPassword: value.smtpPassword,
      smtpSecure: value.smtpPort === '465'
    };

    // Validate config
    if (!config.fromEmail) {
      console.error('❌ Email configuration missing fromEmail');
      return null;
    }

    if (config.provider === 'smtp') {
      if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) {
        console.error('❌ SMTP configuration incomplete');
        return null;
      }
    } else if (config.provider === 'mailersend' || config.provider === 'sendgrid') {
      if (!config.apiKey) {
        console.error(`❌ ${config.provider} configuration missing API key`);
        return null;
      }
    }

    cachedConfigs.set(cacheKey, { config, timestamp: now });
    console.log(`✅ Email config loaded for ${purpose || 'default'}: ${config.provider} (from: ${config.fromEmail})`);
    
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

  // Connection refused
  if (errorCode === 'ECONNREFUSED') {
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

  // DNS errors
  if (errorCode === 'ENOTFOUND') {
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

async function sendViaSmtp(config: EmailConfig, options: EmailOptions): Promise<boolean> {
  try {
    const transportOptions: any = {
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPassword,
      },
      tls: {
        rejectUnauthorized: false // Allow certificate validation bypass for servers with certificate mismatches
      }
    };

    const transporter = nodemailer.createTransport(transportOptions);

    const mailOptions: any = {
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    if (options.attachments && options.attachments.length > 0) {
      mailOptions.attachments = options.attachments;
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ SMTP email sent:', info.messageId);
    return true;
  } catch (error: any) {
    const { userMessage, suggestion } = getSmtpErrorMessage(error);
    console.error('❌ SMTP email error:', error);
    console.error('💡 User message:', userMessage);
    if (suggestion) {
      console.error('💡 Suggestion:', suggestion);
    }
    return false;
  }
}

async function sendViaMailerSend(config: EmailConfig, options: EmailOptions): Promise<boolean> {
  try {
    const { MailerSend, EmailParams, Sender, Recipient, Attachment } = await import("mailersend");
    
    const mailerSend = new MailerSend({ apiKey: config.apiKey! });
    const sentFrom = new Sender(config.fromEmail, config.fromName);
    const recipients = [new Recipient(options.to, options.toName || "Customer")];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject(options.subject);

    if (options.html) {
      emailParams.setHtml(options.html);
    }
    if (options.text) {
      emailParams.setText(options.text);
    }

    if (options.attachments && options.attachments.length > 0) {
      const mailerSendAttachments = options.attachments.map(att => {
        const content = att.encoding === 'base64' 
          ? att.content.toString() 
          : Buffer.from(att.content).toString('base64');
        return new Attachment(content, att.filename, "attachment");
      });
      emailParams.setAttachments(mailerSendAttachments);
    }

    await mailerSend.email.send(emailParams);
    console.log('✅ MailerSend email sent successfully');
    return true;
  } catch (error) {
    console.error('❌ MailerSend email error:', error);
    return false;
  }
}

async function sendViaSendGrid(config: EmailConfig, options: EmailOptions): Promise<boolean> {
  try {
    const sgMail = await import('@sendgrid/mail');
    const mailService = sgMail.default;
    
    mailService.setApiKey(config.apiKey!);

    const emailData: any = {
      to: options.to,
      from: {
        email: config.fromEmail,
        name: config.fromName
      },
      subject: options.subject,
    };

    if (options.text) {
      emailData.text = options.text;
    }
    if (options.html) {
      emailData.html = options.html;
    }

    if (options.attachments && options.attachments.length > 0) {
      emailData.attachments = options.attachments.map(att => ({
        content: att.encoding === 'base64' 
          ? att.content.toString() 
          : Buffer.from(att.content).toString('base64'),
        filename: att.filename,
        type: 'application/pdf',
        disposition: 'attachment'
      }));
    }

    await mailService.send(emailData);
    console.log('✅ SendGrid email sent successfully');
    return true;
  } catch (error) {
    console.error('❌ SendGrid email error:', error);
    return false;
  }
}

export async function sendEmail(options: EmailOptions, purpose?: 'apk' | 'maintenance' | 'gps' | 'documents' | 'custom'): Promise<boolean> {
  const config = await getEmailConfig(purpose);
  
  if (!config) {
    console.error(`❌ Cannot send email: No valid email configuration found for purpose: ${purpose || 'default'}`);
    return false;
  }

  switch (config.provider) {
    case 'smtp':
      return sendViaSmtp(config, options);
    case 'mailersend':
      return sendViaMailerSend(config, options);
    case 'sendgrid':
      return sendViaSendGrid(config, options);
    default:
      console.error(`❌ Unknown email provider: ${config.provider}`);
      return false;
  }
}

// Clear the cache - useful when settings are updated
export function clearEmailConfigCache(): void {
  cachedConfigs.clear();
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
