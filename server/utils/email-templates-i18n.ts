// Multi-language email templates. D15: the closing name is the company name setting; callers pass it
// (services/company-name.ts), the default keeps a call without it the way it always read.
import { DEFAULT_COMPANY_NAME } from '../../shared/company-name';
import { toSupportedLanguage, type SupportedLanguage } from '../../shared/languages';

/** The name goes into HTML; it is admin-typed text, so it is escaped there. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

type Language = SupportedLanguage;

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * The wording of the three customer mails in every supported language. `{plate}` in a subject or
 * an intro is the licence plate; in `intro` the HTML version wraps it in <strong> where the Dutch
 * original does. Only nl and en were written by the office; the other languages are translations
 * that a native speaker should read once (see the hand-over note of the i18n work).
 */
interface MailWording {
  greeting: (name: string) => string;
  closing: string;
  questions: string;
  apk: { subject: string; heading: string; intro: string; expiryLabel: string; action: string };
  maintenance: { subject: string; heading: string; intro: string; typeLabel: string; action: string };
  custom: { subject: string; heading: string; intro: string };
  /** The maintenance type when the caller has none of its own. */
  regularService: string;
  /** An APK date the vehicle record does not have. */
  unknownDate: string;
}

const WORDING: Record<Language, MailWording> = {
  nl: {
    greeting: (name) => `Beste ${name},`,
    closing: 'Met vriendelijke groet,',
    questions: 'Als u vragen heeft, aarzel dan niet om contact met ons op te nemen.',
    apk: {
      subject: 'APK Herinnering - {plate} verloopt binnenkort',
      heading: 'APK Keuringsherinnering',
      intro: 'Dit is een vriendelijke herinnering dat uw voertuig {plate} een APK-keuring nodig heeft.',
      expiryLabel: 'APK Vervaldatum:',
      action: 'Plan uw APK-keuring zo snel mogelijk in om ervoor te zorgen dat uw voertuig veilig en legaal blijft.',
    },
    maintenance: {
      subject: 'Onderhoudsherinnering - {plate}',
      heading: 'Onderhoudsherinnering',
      intro: 'Uw voertuig {plate} heeft onderhoud nodig.',
      typeLabel: 'Type Onderhoud:',
      action: 'Neem contact met ons op om zo spoedig mogelijk een afspraak in te plannen.',
    },
    custom: {
      subject: 'Belangrijke Update - {plate}',
      heading: 'Belangrijke Update',
      intro: 'We hebben een belangrijke update met betrekking tot uw voertuig {plate}:',
    },
    regularService: 'Regulier onderhoud',
    unknownDate: 'onbekend',
  },
  en: {
    greeting: (name) => `Dear ${name},`,
    closing: 'Best regards,',
    questions: "If you have any questions, please don't hesitate to contact us.",
    apk: {
      subject: 'APK Reminder - {plate} expires soon',
      heading: 'APK Inspection Reminder',
      intro: 'This is a friendly reminder that your vehicle {plate} requires an APK inspection.',
      expiryLabel: 'APK Expiry Date:',
      action: 'Please schedule your APK inspection as soon as possible to ensure your vehicle remains roadworthy and legal.',
    },
    maintenance: {
      subject: 'Maintenance Reminder - {plate}',
      heading: 'Maintenance Reminder',
      intro: 'Your vehicle {plate} requires maintenance.',
      typeLabel: 'Maintenance Type:',
      action: 'Please contact us to schedule an appointment at your earliest convenience.',
    },
    custom: {
      subject: 'Important Update - {plate}',
      heading: 'Important Update',
      intro: 'We have an important update regarding your vehicle {plate}:',
    },
    regularService: 'Regular Service',
    unknownDate: 'Unknown',
  },
  es: {
    greeting: (name) => `Estimado/a ${name}:`,
    closing: 'Atentamente,',
    questions: 'Si tiene alguna pregunta, no dude en ponerse en contacto con nosotros.',
    apk: {
      subject: 'Recordatorio de APK - {plate} caduca pronto',
      heading: 'Recordatorio de inspección APK',
      intro: 'Le recordamos que su vehículo {plate} debe pasar la inspección APK (inspección técnica periódica neerlandesa).',
      expiryLabel: 'Fecha de caducidad de la APK:',
      action: 'Programe la inspección APK lo antes posible para que su vehículo siga siendo seguro y cumpla la ley.',
    },
    maintenance: {
      subject: 'Recordatorio de mantenimiento - {plate}',
      heading: 'Recordatorio de mantenimiento',
      intro: 'Su vehículo {plate} necesita mantenimiento.',
      typeLabel: 'Tipo de mantenimiento:',
      action: 'Póngase en contacto con nosotros para concertar una cita lo antes posible.',
    },
    custom: {
      subject: 'Información importante - {plate}',
      heading: 'Información importante',
      intro: 'Tenemos información importante sobre su vehículo {plate}:',
    },
    regularService: 'Mantenimiento periódico',
    unknownDate: 'desconocida',
  },
  pt: {
    greeting: (name) => `Caro(a) ${name},`,
    closing: 'Com os melhores cumprimentos,',
    questions: 'Se tiver alguma questão, não hesite em contactar-nos.',
    apk: {
      subject: 'Lembrete APK - {plate} expira em breve',
      heading: 'Lembrete de inspeção APK',
      intro: 'Lembramos que o seu veículo {plate} tem de fazer a inspeção APK (inspeção periódica obrigatória nos Países Baixos).',
      expiryLabel: 'Data de validade da APK:',
      action: 'Agende a inspeção APK o mais rapidamente possível, para que o seu veículo continue seguro e dentro da lei.',
    },
    maintenance: {
      subject: 'Lembrete de manutenção - {plate}',
      heading: 'Lembrete de manutenção',
      intro: 'O seu veículo {plate} precisa de manutenção.',
      typeLabel: 'Tipo de manutenção:',
      action: 'Contacte-nos para marcar uma data o mais rapidamente possível.',
    },
    custom: {
      subject: 'Informação importante - {plate}',
      heading: 'Informação importante',
      intro: 'Temos uma informação importante sobre o seu veículo {plate}:',
    },
    regularService: 'Manutenção periódica',
    unknownDate: 'desconhecida',
  },
  it: {
    greeting: (name) => `Gentile ${name},`,
    closing: 'Cordiali saluti,',
    questions: 'Per qualsiasi domanda, non esiti a contattarci.',
    apk: {
      subject: 'Promemoria APK - {plate} in scadenza',
      heading: 'Promemoria revisione APK',
      intro: 'Le ricordiamo che il Suo veicolo {plate} deve essere sottoposto alla revisione APK (revisione periodica obbligatoria nei Paesi Bassi).',
      expiryLabel: 'Scadenza APK:',
      action: 'Prenoti la revisione APK il prima possibile, così il Suo veicolo resta sicuro e in regola.',
    },
    maintenance: {
      subject: 'Promemoria manutenzione - {plate}',
      heading: 'Promemoria manutenzione',
      intro: 'Il Suo veicolo {plate} necessita di manutenzione.',
      typeLabel: 'Tipo di manutenzione:',
      action: 'La preghiamo di contattarci per fissare un appuntamento il prima possibile.',
    },
    custom: {
      subject: 'Aggiornamento importante - {plate}',
      heading: 'Aggiornamento importante',
      intro: 'Abbiamo un aggiornamento importante riguardante il Suo veicolo {plate}:',
    },
    regularService: 'Manutenzione ordinaria',
    unknownDate: 'sconosciuta',
  },
  ro: {
    greeting: (name) => `Bună ziua, ${name},`,
    closing: 'Cu stimă,',
    questions: 'Dacă aveți întrebări, nu ezitați să ne contactați.',
    apk: {
      subject: 'Reamintire APK - {plate} expiră în curând',
      heading: 'Reamintire inspecție APK',
      intro: 'Vă reamintim că vehiculul dumneavoastră {plate} trebuie să treacă inspecția APK (inspecția tehnică periodică din Țările de Jos).',
      expiryLabel: 'Data expirării APK:',
      action: 'Vă rugăm să programați inspecția APK cât mai curând, pentru ca vehiculul să rămână sigur și în conformitate cu legea.',
    },
    maintenance: {
      subject: 'Reamintire întreținere - {plate}',
      heading: 'Reamintire întreținere',
      intro: 'Vehiculul dumneavoastră {plate} are nevoie de întreținere.',
      typeLabel: 'Tipul întreținerii:',
      action: 'Vă rugăm să ne contactați pentru a stabili o programare cât mai curând.',
    },
    custom: {
      subject: 'Informație importantă - {plate}',
      heading: 'Informație importantă',
      intro: 'Avem o informație importantă despre vehiculul dumneavoastră {plate}:',
    },
    regularService: 'Revizie periodică',
    unknownDate: 'necunoscută',
  },
  pl: {
    greeting: (name) => `Dzień dobry, ${name},`,
    closing: 'Z poważaniem,',
    questions: 'W razie pytań prosimy o kontakt.',
    apk: {
      subject: 'Przypomnienie o APK - {plate} wkrótce traci ważność',
      heading: 'Przypomnienie o przeglądzie APK',
      intro: 'Przypominamy, że pojazd {plate} wymaga przeglądu APK (okresowe badanie techniczne w Holandii).',
      expiryLabel: 'Data ważności APK:',
      action: 'Prosimy jak najszybciej umówić przegląd APK, aby pojazd pozostał bezpieczny i zgodny z przepisami.',
    },
    maintenance: {
      subject: 'Przypomnienie o serwisie - {plate}',
      heading: 'Przypomnienie o serwisie',
      intro: 'Pojazd {plate} wymaga serwisu.',
      typeLabel: 'Rodzaj serwisu:',
      action: 'Prosimy o kontakt w celu umówienia terminu.',
    },
    custom: {
      subject: 'Ważna informacja - {plate}',
      heading: 'Ważna informacja',
      intro: 'Mamy ważną informację dotyczącą pojazdu {plate}:',
    },
    regularService: 'Przegląd okresowy',
    unknownDate: 'nieznana',
  },
};

/** The wording for a stored or requested language; anything unknown is Dutch. */
function wordingFor(language: string | null | undefined): MailWording {
  return WORDING[toSupportedLanguage(language)];
}

const withPlate = (text: string, plate: string) => text.split('{plate}').join(plate);

/** The maintenance type a mail names when the caller has no specific one, in the mail's language. */
export function defaultMaintenanceType(language: string | null | undefined): string {
  return wordingFor(language).regularService;
}

/** What the APK mail says when the vehicle has no APK date, in the mail's language. */
export function unknownApkDate(language: string | null | undefined): string {
  return wordingFor(language).unknownDate;
}

/** One mail in the house layout: heading, greeting, intro, a highlighted box, closing lines. */
function buildMail(w: MailWording, parts: {
  subject: string;
  heading: string;
  customerName: string;
  introHtml: string;
  introText: string;
  box: { color: string; border: string; html: string; text: string };
  linesAfter: string[];
  companyName: string;
}): EmailTemplate {
  const after = parts.linesAfter.map((line) => `          <p>${line}</p>`).join('\n');
  return {
    subject: parts.subject,
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">${parts.heading}</h2>
          <p>${w.greeting(escapeHtml(parts.customerName))}</p>
          <p>${parts.introHtml}</p>
          <div style="background-color: ${parts.box.color}; border-left: 4px solid ${parts.box.border}; padding: 16px; margin: 16px 0;">
            <p style="margin: 0;">${parts.box.html}</p>
          </div>
${after}
          <p>${w.closing}<br>${escapeHtml(parts.companyName)}</p>
        </div>
      `,
    text: `${w.greeting(parts.customerName)}

${parts.introText}

${parts.box.text}

${parts.linesAfter.join('\n\n')}

${w.closing}
${parts.companyName}`,
  };
}

// APK Reminder Template
export function getApkReminderTemplate(
  customerName: string,
  vehiclePlate: string,
  expiryDate: string,
  language: Language = 'nl',
  companyName: string = DEFAULT_COMPANY_NAME
): EmailTemplate {
  const w = wordingFor(language);
  return buildMail(w, {
    subject: withPlate(w.apk.subject, vehiclePlate),
    heading: w.apk.heading,
    customerName,
    introHtml: withPlate(w.apk.intro, `<strong>${vehiclePlate}</strong>`),
    introText: withPlate(w.apk.intro, vehiclePlate),
    box: {
      color: '#fee2e2', border: '#ef4444',
      html: `<strong>${w.apk.expiryLabel}</strong> ${expiryDate}`,
      text: `${w.apk.expiryLabel} ${expiryDate}`,
    },
    linesAfter: [w.apk.action, w.questions],
    companyName,
  });
}

// Maintenance Reminder Template
export function getMaintenanceReminderTemplate(
  customerName: string,
  vehiclePlate: string,
  maintenanceType: string,
  language: Language = 'nl',
  companyName: string = DEFAULT_COMPANY_NAME
): EmailTemplate {
  const w = wordingFor(language);
  return buildMail(w, {
    subject: withPlate(w.maintenance.subject, vehiclePlate),
    heading: w.maintenance.heading,
    customerName,
    introHtml: withPlate(w.maintenance.intro, `<strong>${vehiclePlate}</strong>`),
    introText: withPlate(w.maintenance.intro, vehiclePlate),
    box: {
      color: '#fef3c7', border: '#f59e0b',
      html: `<strong>${w.maintenance.typeLabel}</strong> ${maintenanceType}`,
      text: `${w.maintenance.typeLabel} ${maintenanceType}`,
    },
    linesAfter: [w.maintenance.action],
    companyName,
  });
}


// Custom Message Template
export function getCustomMessageTemplate(
  customerName: string,
  vehiclePlate: string,
  message: string,
  language: Language = 'nl',
  customSubject?: string,
  companyName: string = DEFAULT_COMPANY_NAME,
  /** The HTML version of `message` (placeholder values escaped); `message` itself stays the plain text. */
  messageHtml?: string
): EmailTemplate {
  const w = wordingFor(language);
  return buildMail(w, {
    subject: customSubject || withPlate(w.custom.subject, vehiclePlate),
    heading: w.custom.heading,
    customerName,
    introHtml: withPlate(w.custom.intro, vehiclePlate),
    introText: withPlate(w.custom.intro, vehiclePlate),
    box: { color: '#f3f4f6', border: '#2563eb', html: messageHtml ?? message, text: message },
    linesAfter: [w.questions],
    companyName,
  });
}
