/**
 * The mails that carry a contract and/or a damage check to the customer: one subject and message
 * per document kind and per language, edited by staff in Settings > Document e-mails and stored in
 * the app setting `document_email_templates`. A language the stored setting does not have yet
 * (every language added after nl and en) starts from the default below.
 *
 * Placeholders use single braces: {customerName}, {vehiclePlate}, {startDate}, {endDate},
 * {checkDate}, {mileage}, {fuelLevel}. The defaults for es/pt/it/ro/pl are translations a native
 * speaker should read once.
 */
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@shared/languages";

export const DOCUMENT_EMAIL_KINDS = ["contract", "damage_check", "combined"] as const;
export type DocumentEmailKind = (typeof DOCUMENT_EMAIL_KINDS)[number];

export interface DocumentEmailText {
  subject: string;
  message: string;
}

export type DocumentEmailTemplates = Record<DocumentEmailKind, Record<SupportedLanguage, DocumentEmailText>>;

export const DEFAULT_DOCUMENT_EMAIL_TEMPLATES: DocumentEmailTemplates = {
  contract: {
    en: {
      subject: "Your Rental Contract - {vehiclePlate}",
      message: "Dear {customerName},\n\nPlease find attached your rental agreement for {vehiclePlate}.\n\nRental Period: {startDate} to {endDate}\n\nPlease review and keep this document for your records.\n\nBest regards,\nCar Rental Team",
    },
    nl: {
      subject: "Uw Huurcontract - {vehiclePlate}",
      message: "Beste {customerName},\n\nBijgevoegd vindt u uw huurovereenkomst voor {vehiclePlate}.\n\nHuurperiode: {startDate} tot {endDate}\n\nGelieve dit document te bewaren voor uw administratie.\n\nMet vriendelijke groet,\nAutoverhuur Team",
    },
    es: {
      subject: "Su contrato de alquiler - {vehiclePlate}",
      message: "Estimado/a {customerName}:\n\nAdjunto encontrará su contrato de alquiler del vehículo {vehiclePlate}.\n\nPeriodo de alquiler: del {startDate} al {endDate}\n\nLe rogamos que revise este documento y lo conserve para sus archivos.\n\nAtentamente,\nEquipo de alquiler",
    },
    pt: {
      subject: "O seu contrato de aluguer - {vehiclePlate}",
      message: "Caro(a) {customerName},\n\nEm anexo encontra o seu contrato de aluguer do veículo {vehiclePlate}.\n\nPeríodo de aluguer: de {startDate} a {endDate}\n\nPedimos que reveja este documento e o guarde para os seus registos.\n\nCom os melhores cumprimentos,\nEquipa de aluguer",
    },
    it: {
      subject: "Il Suo contratto di noleggio - {vehiclePlate}",
      message: "Gentile {customerName},\n\nin allegato trova il contratto di noleggio per il veicolo {vehiclePlate}.\n\nPeriodo di noleggio: dal {startDate} al {endDate}\n\nLa preghiamo di verificare il documento e di conservarlo per i Suoi archivi.\n\nCordiali saluti,\nIl team noleggi",
    },
    ro: {
      subject: "Contractul dumneavoastră de închiriere - {vehiclePlate}",
      message: "Bună ziua, {customerName},\n\nAtașat găsiți contractul de închiriere pentru vehiculul {vehiclePlate}.\n\nPerioada închirierii: {startDate} - {endDate}\n\nVă rugăm să verificați documentul și să îl păstrați pentru evidența dumneavoastră.\n\nCu stimă,\nEchipa de închirieri",
    },
    pl: {
      subject: "Umowa najmu - {vehiclePlate}",
      message: "Dzień dobry, {customerName},\n\nw załączniku przesyłamy umowę najmu pojazdu {vehiclePlate}.\n\nOkres najmu: od {startDate} do {endDate}\n\nProsimy o zapoznanie się z dokumentem i zachowanie go w swojej dokumentacji.\n\nZ poważaniem,\nZespół wynajmu",
    },
  },
  damage_check: {
    en: {
      subject: "Vehicle Inspection Report - {vehiclePlate}",
      message: "Dear {customerName},\n\nPlease find attached the vehicle inspection report for {vehiclePlate}.\n\nRental Period: {startDate} to {endDate}\n\nPlease review the document carefully and contact us if you have any questions.\n\nBest regards,\nCar Rental Team",
    },
    nl: {
      subject: "Schade Inspectierapport - {vehiclePlate}",
      message: "Beste {customerName},\n\nBijgevoegd vindt u het schade inspectierapport voor {vehiclePlate}.\n\nHuurperiode: {startDate} tot {endDate}\n\nGelieve het document zorgvuldig door te nemen en contact op te nemen bij vragen.\n\nMet vriendelijke groet,\nAutoverhuur Team",
    },
    es: {
      subject: "Informe de inspección del vehículo - {vehiclePlate}",
      message: "Estimado/a {customerName}:\n\nAdjunto encontrará el informe de inspección del vehículo {vehiclePlate}.\n\nPeriodo de alquiler: del {startDate} al {endDate}\n\nLe rogamos que revise el documento con atención y que se ponga en contacto con nosotros si tiene alguna pregunta.\n\nAtentamente,\nEquipo de alquiler",
    },
    pt: {
      subject: "Relatório de inspeção do veículo - {vehiclePlate}",
      message: "Caro(a) {customerName},\n\nEm anexo encontra o relatório de inspeção do veículo {vehiclePlate}.\n\nPeríodo de aluguer: de {startDate} a {endDate}\n\nPedimos que leia o documento com atenção e que nos contacte se tiver alguma questão.\n\nCom os melhores cumprimentos,\nEquipa de aluguer",
    },
    it: {
      subject: "Verbale di ispezione del veicolo - {vehiclePlate}",
      message: "Gentile {customerName},\n\nin allegato trova il verbale di ispezione del veicolo {vehiclePlate}.\n\nPeriodo di noleggio: dal {startDate} al {endDate}\n\nLa preghiamo di leggere attentamente il documento e di contattarci per qualsiasi domanda.\n\nCordiali saluti,\nIl team noleggi",
    },
    ro: {
      subject: "Raport de inspecție a vehiculului - {vehiclePlate}",
      message: "Bună ziua, {customerName},\n\nAtașat găsiți raportul de inspecție pentru vehiculul {vehiclePlate}.\n\nPerioada închirierii: {startDate} - {endDate}\n\nVă rugăm să citiți cu atenție documentul și să ne contactați dacă aveți întrebări.\n\nCu stimă,\nEchipa de închirieri",
    },
    pl: {
      subject: "Protokół oględzin pojazdu - {vehiclePlate}",
      message: "Dzień dobry, {customerName},\n\nw załączniku przesyłamy protokół oględzin pojazdu {vehiclePlate}.\n\nOkres najmu: od {startDate} do {endDate}\n\nProsimy o dokładne zapoznanie się z dokumentem, a w razie pytań o kontakt.\n\nZ poważaniem,\nZespół wynajmu",
    },
  },
  combined: {
    en: {
      subject: "Rental Documents - {vehiclePlate}",
      message: "Dear {customerName},\n\nPlease find attached your rental documents for {vehiclePlate}:\n- Rental Contract\n- Vehicle Inspection Report\n\nRental Period: {startDate} to {endDate}\n\nPlease review all documents carefully and keep them for your records.\n\nBest regards,\nCar Rental Team",
    },
    nl: {
      subject: "Huurdocumenten - {vehiclePlate}",
      message: "Beste {customerName},\n\nBijgevoegd vindt u uw huurdocumenten voor {vehiclePlate}:\n- Huurovereenkomst\n- Schade Inspectierapport\n\nHuurperiode: {startDate} tot {endDate}\n\nGelieve alle documenten zorgvuldig door te nemen en te bewaren voor uw administratie.\n\nMet vriendelijke groet,\nAutoverhuur Team",
    },
    es: {
      subject: "Documentos del alquiler - {vehiclePlate}",
      message: "Estimado/a {customerName}:\n\nAdjunto encontrará los documentos del alquiler del vehículo {vehiclePlate}:\n- Contrato de alquiler\n- Informe de inspección del vehículo\n\nPeriodo de alquiler: del {startDate} al {endDate}\n\nLe rogamos que revise todos los documentos con atención y los conserve para sus archivos.\n\nAtentamente,\nEquipo de alquiler",
    },
    pt: {
      subject: "Documentos do aluguer - {vehiclePlate}",
      message: "Caro(a) {customerName},\n\nEm anexo encontra os documentos do aluguer do veículo {vehiclePlate}:\n- Contrato de aluguer\n- Relatório de inspeção do veículo\n\nPeríodo de aluguer: de {startDate} a {endDate}\n\nPedimos que leia todos os documentos com atenção e os guarde para os seus registos.\n\nCom os melhores cumprimentos,\nEquipa de aluguer",
    },
    it: {
      subject: "Documenti di noleggio - {vehiclePlate}",
      message: "Gentile {customerName},\n\nin allegato trova i documenti di noleggio per il veicolo {vehiclePlate}:\n- Contratto di noleggio\n- Verbale di ispezione del veicolo\n\nPeriodo di noleggio: dal {startDate} al {endDate}\n\nLa preghiamo di leggere attentamente tutti i documenti e di conservarli per i Suoi archivi.\n\nCordiali saluti,\nIl team noleggi",
    },
    ro: {
      subject: "Documentele închirierii - {vehiclePlate}",
      message: "Bună ziua, {customerName},\n\nAtașat găsiți documentele închirierii pentru vehiculul {vehiclePlate}:\n- Contractul de închiriere\n- Raportul de inspecție a vehiculului\n\nPerioada închirierii: {startDate} - {endDate}\n\nVă rugăm să citiți cu atenție toate documentele și să le păstrați pentru evidența dumneavoastră.\n\nCu stimă,\nEchipa de închirieri",
    },
    pl: {
      subject: "Dokumenty najmu - {vehiclePlate}",
      message: "Dzień dobry, {customerName},\n\nw załączniku przesyłamy dokumenty najmu pojazdu {vehiclePlate}:\n- Umowa najmu\n- Protokół oględzin pojazdu\n\nOkres najmu: od {startDate} do {endDate}\n\nProsimy o dokładne zapoznanie się ze wszystkimi dokumentami i zachowanie ich w swojej dokumentacji.\n\nZ poważaniem,\nZespół wynajmu",
    },
  },
};

/**
 * The stored setting with every kind and language filled in: what staff saved wins, a language or
 * kind they never saved reads as its default. Anything that is not a {subject, message} pair is
 * ignored.
 */
export function withDocumentEmailDefaults(stored: unknown): DocumentEmailTemplates {
  const source = (stored && typeof stored === "object" ? stored : {}) as Record<string, Record<string, Partial<DocumentEmailText>> | undefined>;
  const result = {} as DocumentEmailTemplates;
  for (const kind of DOCUMENT_EMAIL_KINDS) {
    result[kind] = {} as Record<SupportedLanguage, DocumentEmailText>;
    for (const lang of SUPPORTED_LANGUAGES) {
      const saved = source[kind]?.[lang];
      result[kind][lang] = saved && typeof saved.subject === "string" && typeof saved.message === "string"
        ? { subject: saved.subject, message: saved.message }
        : { ...DEFAULT_DOCUMENT_EMAIL_TEMPLATES[kind][lang] };
    }
  }
  return result;
}
