// Multi-language email templates
type Language = 'nl' | 'en';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// APK Reminder Template
export function getApkReminderTemplate(
  customerName: string,
  vehiclePlate: string,
  expiryDate: string,
  language: Language = 'nl'
): EmailTemplate {
  if (language === 'en') {
    return {
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
          <p>If you have any questions, please don't hesitate to contact us.</p>
          <p>Best regards,<br>Autolease Lam</p>
        </div>
      `,
      text: `Dear ${customerName},

This is a friendly reminder that your vehicle ${vehiclePlate} requires an APK inspection.

APK Expiry Date: ${expiryDate}

Please schedule your APK inspection as soon as possible to ensure your vehicle remains roadworthy and legal.

If you have any questions, please don't hesitate to contact us.

Best regards,
Autolease Lam`
    };
  }

  // Dutch version
  return {
    subject: `APK Herinnering - ${vehiclePlate} verloopt binnenkort`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">APK Keuringsherinnering</h2>
        <p>Beste ${customerName},</p>
        <p>Dit is een vriendelijke herinnering dat uw voertuig <strong>${vehiclePlate}</strong> een APK-keuring nodig heeft.</p>
        <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;"><strong>APK Vervaldatum:</strong> ${expiryDate}</p>
        </div>
        <p>Plan uw APK-keuring zo snel mogelijk in om ervoor te zorgen dat uw voertuig veilig en legaal blijft.</p>
        <p>Als u vragen heeft, aarzel dan niet om contact met ons op te nemen.</p>
        <p>Met vriendelijke groet,<br>Autolease Lam</p>
      </div>
    `,
    text: `Beste ${customerName},

Dit is een vriendelijke herinnering dat uw voertuig ${vehiclePlate} een APK-keuring nodig heeft.

APK Vervaldatum: ${expiryDate}

Plan uw APK-keuring zo snel mogelijk in om ervoor te zorgen dat uw voertuig veilig en legaal blijft.

Als u vragen heeft, aarzel dan niet om contact met ons op te nemen.

Met vriendelijke groet,
Autolease Lam`
  };
}

// Maintenance Reminder Template
export function getMaintenanceReminderTemplate(
  customerName: string,
  vehiclePlate: string,
  maintenanceType: string,
  language: Language = 'nl'
): EmailTemplate {
  if (language === 'en') {
    return {
      subject: `Maintenance Reminder - ${vehiclePlate}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Maintenance Reminder</h2>
          <p>Dear ${customerName},</p>
          <p>Your vehicle <strong>${vehiclePlate}</strong> requires maintenance.</p>
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0;">
            <p style="margin: 0;"><strong>Maintenance Type:</strong> ${maintenanceType}</p>
          </div>
          <p>Please contact us to schedule an appointment at your earliest convenience.</p>
          <p>Best regards,<br>Autolease Lam</p>
        </div>
      `,
      text: `Dear ${customerName},

Your vehicle ${vehiclePlate} requires maintenance.

Maintenance Type: ${maintenanceType}

Please contact us to schedule an appointment at your earliest convenience.

Best regards,
Autolease Lam`
    };
  }

  // Dutch version
  return {
    subject: `Onderhoudsherinnering - ${vehiclePlate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Onderhoudsherinnering</h2>
        <p>Beste ${customerName},</p>
        <p>Uw voertuig <strong>${vehiclePlate}</strong> heeft onderhoud nodig.</p>
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Type Onderhoud:</strong> ${maintenanceType}</p>
        </div>
        <p>Neem contact met ons op om zo spoedig mogelijk een afspraak in te plannen.</p>
        <p>Met vriendelijke groet,<br>Autolease Lam</p>
      </div>
    `,
    text: `Beste ${customerName},

Uw voertuig ${vehiclePlate} heeft onderhoud nodig.

Type Onderhoud: ${maintenanceType}

Neem contact met ons op om zo spoedig mogelijk een afspraak in te plannen.

Met vriendelijke groet,
Autolease Lam`
  };
}


// Custom Message Template
export function getCustomMessageTemplate(
  customerName: string,
  vehiclePlate: string,
  message: string,
  language: Language = 'nl',
  customSubject?: string
): EmailTemplate {
  if (language === 'en') {
    return {
      subject: customSubject || `Important Update - ${vehiclePlate}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Important Update</h2>
          <p>Dear ${customerName},</p>
          <p>We have an important update regarding your vehicle ${vehiclePlate}:</p>
          <div style="background-color: #f3f4f6; border-left: 4px solid #2563eb; padding: 16px; margin: 16px 0;">
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
    };
  }

  // Dutch version
  return {
    subject: customSubject || `Belangrijke Update - ${vehiclePlate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Belangrijke Update</h2>
        <p>Beste ${customerName},</p>
        <p>We hebben een belangrijke update met betrekking tot uw voertuig ${vehiclePlate}:</p>
        <div style="background-color: #f3f4f6; border-left: 4px solid #2563eb; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;">${message}</p>
        </div>
        <p>Als u vragen heeft, aarzel dan niet om contact met ons op te nemen.</p>
        <p>Met vriendelijke groet,<br>Autolease Lam</p>
      </div>
    `,
    text: `Beste ${customerName},

We hebben een belangrijke update met betrekking tot uw voertuig ${vehiclePlate}:

${message}

Als u vragen heeft, aarzel dan niet om contact met ons op te nemen.

Met vriendelijke groet,
Autolease Lam`
  };
}
