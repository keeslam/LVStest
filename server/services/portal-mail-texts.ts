/**
 * The portal mails in the languages besides Dutch, and the short phrases the mail code fills in
 * (request types, maintenance events, periods) in every language.
 *
 * Kees chose one stored template per language (2026-10-18): the Dutch row keeps its old name
 * (`portal_invite`), every other language is the same name with the language as suffix
 * (`portal_invite.es`). Each row is seeded once from this file and edited by staff afterwards in
 * Communicatie > E-mailsjablonen, like the Dutch ones. A language whose row is missing gets the
 * Dutch row.
 *
 * The Dutch templates stay in `portal-mail.ts` (DEFAULT_TEMPLATES), where the D15 company-name
 * step needs them. English was written alongside; es/pt/it/ro/pl are translations a native
 * speaker should read once. Formal address throughout (usted, Lei, dumneavoastră, Państwo),
 * pt = European Portuguese.
 */
import type { SupportedLanguage } from "../../shared/languages";

export type PortalMailLanguage = Exclude<SupportedLanguage, "nl">;

/** The maintenance news a customer can get by mail; the replacement car has no block event of its own. */
export type MaintenanceMailEvent =
  | "maintenance_planned" | "maintenance_moved" | "maintenance_in" | "maintenance_out" | "maintenance_cancelled"
  | "maintenance_unlinked" | "replacement_ready";

export type TemplateText = { subject: string; content: string };

/** Every customer-facing portal template. The staff notification stays Dutch only: it goes to the office. */
export const CUSTOMER_TEMPLATE_NAMES = [
  "portal_invite", "portal_password_reset", "portal_fine_linked", "portal_request_replied",
  "portal_email_change", "portal_new_device", "portal_email_changed", "portal_maintenance",
  "portal_reservation_changed", "portal_reservation_cancelled", "portal_document_available",
  "portal_contract_signed",
] as const;
export type CustomerTemplateName = (typeof CUSTOMER_TEMPLATE_NAMES)[number];

/** The sentences of the customer templates in one language; `{{…}}` are the same placeholders as in Dutch. */
interface TemplateWording {
  greeting: string;
  closing: string;
  invite: { subject: string; intro: string; action: string };
  emailChange: { subject: string; intro: string; action: string; ignore: string };
  emailChanged: { subject: string; intro: string; advice: string };
  newDevice: { subject: string; intro: string; time: string; browser: string; ip: string; advice: string };
  reset: { subject: string; action: string; ignore: string };
  fine: { subject: string; intro: string; plate: string; amount: string; view: string };
  requestReplied: { subject: string; intro: string; status: string; view: string };
  maintenance: { subject: string; intro: string; date: string; address: string; openingHours: string; view: string };
  reservationChanged: { subject: string; intro: string; car: string; period: string; view: string; wrong: string };
  reservationCancelled: { subject: string; intro: string; view: string; wrong: string };
  documentAvailable: { subject: string; intro: string; view: string };
  contractSigned: { subject: string; intro: string; view: string; notYou: string };
}

const LINK = `<a href="{{link}}">{{link}}</a>`;

/** The same layout as the Dutch templates: greeting, the body, the closing with the company name. */
function buildTemplates(w: TemplateWording): Record<CustomerTemplateName, TemplateText> {
  const mail = (...body: string[]) => [`<p>${w.greeting}</p>`, ...body, `<p>${w.closing}<br>{{companyName}}</p>`].join("\n");
  const p = (text: string) => `<p>${text}</p>`;
  const carAndPeriod = p(`${w.reservationChanged.car}: {{car}}<br>${w.reservationChanged.period}: {{period}}`);
  return {
    portal_invite: { subject: w.invite.subject, content: mail(p(w.invite.intro), p(w.invite.action), p(LINK)) },
    portal_email_change: {
      subject: w.emailChange.subject,
      content: mail(p(w.emailChange.intro), p(w.emailChange.action), p(LINK), p(w.emailChange.ignore)),
    },
    portal_email_changed: { subject: w.emailChanged.subject, content: mail(p(w.emailChanged.intro), p(w.emailChanged.advice)) },
    portal_new_device: {
      subject: w.newDevice.subject,
      content: mail(
        p(w.newDevice.intro),
        p(`${w.newDevice.time}: {{at}}<br>${w.newDevice.browser}: {{ua}}<br>${w.newDevice.ip}: {{ip}}`),
        p(w.newDevice.advice),
      ),
    },
    portal_password_reset: { subject: w.reset.subject, content: mail(p(w.reset.action), p(LINK), p(w.reset.ignore)) },
    portal_fine_linked: {
      subject: w.fine.subject,
      content: mail(
        p(w.fine.intro),
        p(`${w.fine.plate} {{plate}}, {{date}}<br>{{description}}<br>${w.fine.amount} <strong>€ {{amount}}</strong>`),
        p(`${w.fine.view}: ${LINK}`),
      ),
    },
    portal_request_replied: {
      subject: w.requestReplied.subject,
      content: mail(
        p(w.requestReplied.intro),
        "<blockquote>{{reply}}</blockquote>",
        p(`${w.requestReplied.status}: {{status}}. ${w.requestReplied.view}: ${LINK}`),
      ),
    },
    portal_maintenance: {
      subject: w.maintenance.subject,
      content: mail(
        p(w.maintenance.intro),
        p(`${w.maintenance.date}: {{date}}{{endDate}}`),
        p(`${w.maintenance.address}: {{pickupAddress}}<br>${w.maintenance.openingHours}: {{openingHours}}`),
        p(`${w.maintenance.view}: ${LINK}`),
      ),
    },
    portal_reservation_changed: {
      subject: w.reservationChanged.subject,
      content: mail(
        p(w.reservationChanged.intro), p("{{changes}}"), carAndPeriod,
        p(`${w.reservationChanged.view}: ${LINK}`), p(w.reservationChanged.wrong),
      ),
    },
    portal_reservation_cancelled: {
      subject: w.reservationCancelled.subject,
      content: mail(p(w.reservationCancelled.intro), carAndPeriod, p(`${w.reservationCancelled.view}: ${LINK}`), p(w.reservationCancelled.wrong)),
    },
    portal_document_available: {
      subject: w.documentAvailable.subject,
      content: mail(p(w.documentAvailable.intro), carAndPeriod, p(`${w.documentAvailable.view}: ${LINK}`)),
    },
    portal_contract_signed: {
      subject: w.contractSigned.subject,
      content: mail(p(w.contractSigned.intro), carAndPeriod, p(`${w.contractSigned.view}: ${LINK}`), p(w.contractSigned.notYou)),
    },
  };
}

const TEMPLATE_WORDING: Record<PortalMailLanguage, TemplateWording> = {
  en: {
    greeting: "Dear {{name}},",
    closing: "Kind regards,",
    invite: {
      subject: "Your account for the {{companyName}} customer portal",
      intro: "An account has been created for you in the {{companyName}} customer portal for {{company}}.",
      action: "Choose your password via this link (valid for 72 hours):",
    },
    emailChange: {
      subject: "Confirm your new e-mail address - {{companyName}} customer portal",
      intro: "You asked to change the e-mail address of your {{companyName}} customer portal account to {{newEmail}}.",
      action: "Please confirm this via this link (valid for 72 hours):",
      ignore: "If you did not request this, you can ignore this e-mail; your current address stays in use.",
    },
    emailChanged: {
      subject: "The e-mail address of your customer portal account has been changed",
      intro: "The e-mail address you use to log in to the {{companyName}} customer portal has just been changed to {{newEmail}}. All logged-in sessions of this account have been ended.",
      advice: "Was this you? Then you do not need to do anything. If it was not you, please contact {{companyName}} straight away.",
    },
    newDevice: {
      subject: "New sign-in to your customer portal account",
      intro: "Someone has just logged in to your {{companyName}} customer portal account from a browser or device we did not know yet.",
      time: "Time", browser: "Browser", ip: "IP address",
      advice: "Was this you? Then you do not need to do anything. If you do not recognise this, change your password in the portal straight away and contact {{companyName}}.",
    },
    reset: {
      subject: "Reset your password - {{companyName}} customer portal",
      action: "Use this link to set a new password (valid for 72 hours):",
      ignore: "If you did not request this, you can ignore this e-mail.",
    },
    fine: {
      subject: "Traffic fine {{plate}} of {{date}}",
      intro: "A traffic fine in the name of {{company}} has been processed:",
      plate: "Registration", amount: "Amount", view: "View the fine in the customer portal",
    },
    requestReplied: {
      subject: "Reply to your request ({{type}})",
      intro: "We have replied to your request ({{type}}):",
      status: "Status", view: "View the request in the customer portal",
    },
    maintenance: {
      subject: "Maintenance {{plate}}: {{event}}",
      intro: "{{event}} for {{car}} ({{plate}}).",
      date: "Date", address: "Address", openingHours: "Opening hours",
      view: "The customer portal shows the current status",
    },
    reservationChanged: {
      subject: "Your reservation has been changed ({{plate}})",
      intro: "{{companyName}} has changed your reservation.",
      car: "Car", period: "Period",
      view: "The customer portal shows the current details",
      wrong: "Is something not right? Please contact {{companyName}}.",
    },
    reservationCancelled: {
      subject: "Your reservation has been cancelled ({{plate}})",
      intro: "{{companyName}} has cancelled your reservation.",
      view: "The customer portal shows your other reservations",
      wrong: "Is this not right? Please contact {{companyName}}.",
    },
    documentAvailable: {
      subject: "New document available: {{document}}",
      intro: "A new document is waiting for you in the customer portal: {{document}} ({{fileName}}).",
      view: "View and download the document here",
    },
    contractSigned: {
      subject: "Contract signed: {{plate}}",
      intro: "{{signer}} signed the contract for {{company}} digitally on {{at}}.",
      view: "The signed contract is in the customer portal",
      notYou: "Did you not do this? Please contact {{companyName}} straight away.",
    },
  },
  es: {
    greeting: "Estimado/a {{name}}:",
    closing: "Atentamente,",
    invite: {
      subject: "Su cuenta en el portal de clientes de {{companyName}}",
      intro: "Se ha creado una cuenta para usted en el portal de clientes de {{companyName}} para {{company}}.",
      action: "Elija su contraseña mediante este enlace (válido durante 72 horas):",
    },
    emailChange: {
      subject: "Confirme su nueva dirección de correo electrónico - portal de clientes de {{companyName}}",
      intro: "Ha solicitado cambiar la dirección de correo electrónico de su cuenta en el portal de clientes de {{companyName}} a {{newEmail}}.",
      action: "Confírmelo mediante este enlace (válido durante 72 horas):",
      ignore: "Si no lo ha solicitado, puede ignorar este correo; su dirección actual seguirá en uso.",
    },
    emailChanged: {
      subject: "Se ha cambiado la dirección de correo electrónico de su cuenta del portal de clientes",
      intro: "La dirección de correo electrónico con la que inicia sesión en el portal de clientes de {{companyName}} acaba de cambiarse a {{newEmail}}. Se han cerrado todas las sesiones abiertas de esta cuenta.",
      advice: "¿Ha sido usted? Entonces no tiene que hacer nada. Si no ha sido usted, póngase en contacto con {{companyName}} de inmediato.",
    },
    newDevice: {
      subject: "Nuevo inicio de sesión en su cuenta del portal de clientes",
      intro: "Se acaba de iniciar sesión en su cuenta del portal de clientes de {{companyName}} desde un navegador o dispositivo que aún no conocíamos.",
      time: "Fecha y hora", browser: "Navegador", ip: "Dirección IP",
      advice: "¿Ha sido usted? Entonces no tiene que hacer nada. Si no lo reconoce, cambie su contraseña en el portal de inmediato y póngase en contacto con {{companyName}}.",
    },
    reset: {
      subject: "Restablecer la contraseña - portal de clientes de {{companyName}}",
      action: "Mediante este enlace puede establecer una nueva contraseña (válido durante 72 horas):",
      ignore: "Si no lo ha solicitado, puede ignorar este correo.",
    },
    fine: {
      subject: "Multa {{plate}} del {{date}}",
      intro: "Se ha tramitado una multa a nombre de {{company}}:",
      plate: "Matrícula", amount: "Importe", view: "Consulte la multa en el portal de clientes",
    },
    requestReplied: {
      subject: "Respuesta a su solicitud ({{type}})",
      intro: "Hemos respondido a su solicitud ({{type}}):",
      status: "Estado", view: "Consulte la solicitud en el portal de clientes",
    },
    maintenance: {
      subject: "Mantenimiento {{plate}}: {{event}}",
      intro: "{{event}} para {{car}} ({{plate}}).",
      date: "Fecha", address: "Dirección", openingHours: "Horario de apertura",
      view: "En el portal de clientes puede ver el estado actual",
    },
    reservationChanged: {
      subject: "Su reserva ha sido modificada ({{plate}})",
      intro: "{{companyName}} ha modificado su reserva.",
      car: "Vehículo", period: "Periodo",
      view: "En el portal de clientes puede ver los datos actuales",
      wrong: "¿Hay algo que no es correcto? Póngase en contacto con {{companyName}}.",
    },
    reservationCancelled: {
      subject: "Su reserva ha sido cancelada ({{plate}})",
      intro: "{{companyName}} ha cancelado su reserva.",
      view: "En el portal de clientes puede ver sus demás reservas",
      wrong: "¿No es correcto? Póngase en contacto con {{companyName}}.",
    },
    documentAvailable: {
      subject: "Nuevo documento disponible: {{document}}",
      intro: "Tiene un nuevo documento disponible en el portal de clientes: {{document}} ({{fileName}}).",
      view: "Consulte y descargue el documento aquí",
    },
    contractSigned: {
      subject: "Contrato firmado: {{plate}}",
      intro: "{{signer}} firmó digitalmente el contrato de {{company}} el {{at}}.",
      view: "El contrato firmado está en el portal de clientes",
      notYou: "¿No ha sido usted? Póngase en contacto con {{companyName}} de inmediato.",
    },
  },
  pt: {
    greeting: "Caro(a) {{name}},",
    closing: "Com os melhores cumprimentos,",
    invite: {
      subject: "A sua conta no portal de clientes de {{companyName}}",
      intro: "Foi criada uma conta para si no portal de clientes de {{companyName}} para {{company}}.",
      action: "Escolha a sua palavra-passe através desta ligação (válida durante 72 horas):",
    },
    emailChange: {
      subject: "Confirme o seu novo endereço de e-mail - portal de clientes de {{companyName}}",
      intro: "Pediu para alterar o endereço de e-mail da sua conta no portal de clientes de {{companyName}} para {{newEmail}}.",
      action: "Confirme através desta ligação (válida durante 72 horas):",
      ignore: "Se não fez este pedido, pode ignorar este e-mail; o seu endereço atual continua em uso.",
    },
    emailChanged: {
      subject: "O endereço de e-mail da sua conta do portal de clientes foi alterado",
      intro: "O endereço de e-mail com que inicia sessão no portal de clientes de {{companyName}} acabou de ser alterado para {{newEmail}}. Todas as sessões iniciadas desta conta foram terminadas.",
      advice: "Foi o(a) próprio(a)? Então não precisa de fazer nada. Se não foi, contacte imediatamente {{companyName}}.",
    },
    newDevice: {
      subject: "Novo início de sessão na sua conta do portal de clientes",
      intro: "Acabou de ser iniciada uma sessão na sua conta do portal de clientes de {{companyName}} a partir de um navegador ou dispositivo que ainda não conhecíamos.",
      time: "Data e hora", browser: "Navegador", ip: "Endereço IP",
      advice: "Foi o(a) próprio(a)? Então não precisa de fazer nada. Se não reconhece este acesso, altere imediatamente a sua palavra-passe no portal e contacte {{companyName}}.",
    },
    reset: {
      subject: "Redefinir a palavra-passe - portal de clientes de {{companyName}}",
      action: "Através desta ligação pode definir uma nova palavra-passe (válida durante 72 horas):",
      ignore: "Se não fez este pedido, pode ignorar este e-mail.",
    },
    fine: {
      subject: "Coima {{plate}} de {{date}}",
      intro: "Foi processada uma coima em nome de {{company}}:",
      plate: "Matrícula", amount: "Montante", view: "Consulte a coima no portal de clientes",
    },
    requestReplied: {
      subject: "Resposta ao seu pedido ({{type}})",
      intro: "Respondemos ao seu pedido ({{type}}):",
      status: "Estado", view: "Consulte o pedido no portal de clientes",
    },
    maintenance: {
      subject: "Manutenção {{plate}}: {{event}}",
      intro: "{{event}} para {{car}} ({{plate}}).",
      date: "Data", address: "Morada", openingHours: "Horário de funcionamento",
      view: "No portal de clientes pode ver o estado atual",
    },
    reservationChanged: {
      subject: "A sua reserva foi alterada ({{plate}})",
      intro: "{{companyName}} alterou a sua reserva.",
      car: "Veículo", period: "Período",
      view: "No portal de clientes pode ver os dados atuais",
      wrong: "Algo não está correto? Contacte {{companyName}}.",
    },
    reservationCancelled: {
      subject: "A sua reserva foi cancelada ({{plate}})",
      intro: "{{companyName}} cancelou a sua reserva.",
      view: "No portal de clientes pode ver as suas outras reservas",
      wrong: "Não está correto? Contacte {{companyName}}.",
    },
    documentAvailable: {
      subject: "Novo documento disponível: {{document}}",
      intro: "Tem um novo documento à sua espera no portal de clientes: {{document}} ({{fileName}}).",
      view: "Consulte e descarregue o documento aqui",
    },
    contractSigned: {
      subject: "Contrato assinado: {{plate}}",
      intro: "{{signer}} assinou digitalmente o contrato de {{company}} em {{at}}.",
      view: "O contrato assinado está no portal de clientes",
      notYou: "Não foi o senhor/a senhora? Contacte imediatamente {{companyName}}.",
    },
  },
  it: {
    greeting: "Gentile {{name}},",
    closing: "Cordiali saluti,",
    invite: {
      subject: "Il Suo account per il portale clienti di {{companyName}}",
      intro: "È stato creato per Lei un account nel portale clienti di {{companyName}} per {{company}}.",
      action: "Scelga la Sua password tramite questo link (valido 72 ore):",
    },
    emailChange: {
      subject: "Confermi il Suo nuovo indirizzo e-mail - portale clienti di {{companyName}}",
      intro: "Ha chiesto di modificare l'indirizzo e-mail del Suo account nel portale clienti di {{companyName}} in {{newEmail}}.",
      action: "Confermi tramite questo link (valido 72 ore):",
      ignore: "Se non ha fatto questa richiesta, può ignorare questa e-mail; il Suo indirizzo attuale resta in uso.",
    },
    emailChanged: {
      subject: "L'indirizzo e-mail del Suo account del portale clienti è stato modificato",
      intro: "L'indirizzo e-mail con cui accede al portale clienti di {{companyName}} è appena stato modificato in {{newEmail}}. Tutte le sessioni attive di questo account sono state chiuse.",
      advice: "È stato Lei? Allora non deve fare nulla. Se non è stato Lei, contatti subito {{companyName}}.",
    },
    newDevice: {
      subject: "Nuovo accesso al Suo account del portale clienti",
      intro: "È appena stato effettuato un accesso al Suo account del portale clienti di {{companyName}} da un browser o dispositivo che non conoscevamo ancora.",
      time: "Data e ora", browser: "Browser", ip: "Indirizzo IP",
      advice: "È stato Lei? Allora non deve fare nulla. Se non riconosce questo accesso, cambi subito la Sua password nel portale e contatti {{companyName}}.",
    },
    reset: {
      subject: "Reimpostazione della password - portale clienti di {{companyName}}",
      action: "Tramite questo link può impostare una nuova password (valido 72 ore):",
      ignore: "Se non ha fatto questa richiesta, può ignorare questa e-mail.",
    },
    fine: {
      subject: "Multa {{plate}} del {{date}}",
      intro: "È stata registrata una multa intestata a {{company}}:",
      plate: "Targa", amount: "Importo", view: "Visualizzi la multa nel portale clienti",
    },
    requestReplied: {
      subject: "Risposta alla Sua richiesta ({{type}})",
      intro: "Abbiamo risposto alla Sua richiesta ({{type}}):",
      status: "Stato", view: "Visualizzi la richiesta nel portale clienti",
    },
    maintenance: {
      subject: "Manutenzione {{plate}}: {{event}}",
      intro: "{{event}} per {{car}} ({{plate}}).",
      date: "Data", address: "Indirizzo", openingHours: "Orari di apertura",
      view: "Nel portale clienti trova lo stato attuale",
    },
    reservationChanged: {
      subject: "La Sua prenotazione è stata modificata ({{plate}})",
      intro: "{{companyName}} ha modificato la Sua prenotazione.",
      car: "Auto", period: "Periodo",
      view: "Nel portale clienti trova i dati aggiornati",
      wrong: "Qualcosa non è corretto? Contatti {{companyName}}.",
    },
    reservationCancelled: {
      subject: "La Sua prenotazione è stata annullata ({{plate}})",
      intro: "{{companyName}} ha annullato la Sua prenotazione.",
      view: "Nel portale clienti trova le Sue altre prenotazioni",
      wrong: "Non è corretto? Contatti {{companyName}}.",
    },
    documentAvailable: {
      subject: "Nuovo documento disponibile: {{document}}",
      intro: "Un nuovo documento La attende nel portale clienti: {{document}} ({{fileName}}).",
      view: "Visualizzi e scarichi il documento qui",
    },
    contractSigned: {
      subject: "Contratto firmato: {{plate}}",
      intro: "{{signer}} ha firmato digitalmente il contratto di {{company}} il {{at}}.",
      view: "Il contratto firmato si trova nel portale clienti",
      notYou: "Non è stato Lei? Contatti subito {{companyName}}.",
    },
  },
  ro: {
    greeting: "Stimate/Stimată {{name}},",
    closing: "Cu stimă,",
    invite: {
      subject: "Contul dumneavoastră pentru portalul clienților {{companyName}}",
      intro: "A fost creat un cont pentru dumneavoastră în portalul clienților {{companyName}} pentru {{company}}.",
      action: "Alegeți-vă parola prin acest link (valabil 72 de ore):",
    },
    emailChange: {
      subject: "Confirmați noua adresă de e-mail - portalul clienților {{companyName}}",
      intro: "Ați solicitat modificarea adresei de e-mail a contului dumneavoastră din portalul clienților {{companyName}} în {{newEmail}}.",
      action: "Confirmați prin acest link (valabil 72 de ore):",
      ignore: "Dacă nu ați solicitat acest lucru, puteți ignora acest e-mail; adresa dumneavoastră actuală rămâne în uz.",
    },
    emailChanged: {
      subject: "Adresa de e-mail a contului dumneavoastră din portalul clienților a fost modificată",
      intro: "Adresa de e-mail cu care vă conectați la portalul clienților {{companyName}} tocmai a fost modificată în {{newEmail}}. Toate sesiunile active ale acestui cont au fost închise.",
      advice: "Ați fost dumneavoastră? Atunci nu trebuie să faceți nimic. Dacă nu ați fost dumneavoastră, contactați imediat {{companyName}}.",
    },
    newDevice: {
      subject: "Conectare nouă la contul dumneavoastră din portalul clienților",
      intro: "Cineva tocmai s-a conectat la contul dumneavoastră din portalul clienților {{companyName}} de pe un browser sau dispozitiv pe care nu îl cunoșteam încă.",
      time: "Data și ora", browser: "Browser", ip: "Adresă IP",
      advice: "Ați fost dumneavoastră? Atunci nu trebuie să faceți nimic. Dacă nu recunoașteți această conectare, schimbați imediat parola în portal și contactați {{companyName}}.",
    },
    reset: {
      subject: "Resetarea parolei - portalul clienților {{companyName}}",
      action: "Prin acest link vă puteți seta o parolă nouă (valabil 72 de ore):",
      ignore: "Dacă nu ați solicitat acest lucru, puteți ignora acest e-mail.",
    },
    fine: {
      subject: "Amendă {{plate}} din {{date}}",
      intro: "A fost înregistrată o amendă pe numele {{company}}:",
      plate: "Număr de înmatriculare", amount: "Sumă", view: "Vedeți amenda în portalul clienților",
    },
    requestReplied: {
      subject: "Răspuns la solicitarea dumneavoastră ({{type}})",
      intro: "Am răspuns la solicitarea dumneavoastră ({{type}}):",
      status: "Stare", view: "Vedeți solicitarea în portalul clienților",
    },
    maintenance: {
      subject: "Mentenanță {{plate}}: {{event}}",
      intro: "{{event}} pentru {{car}} ({{plate}}).",
      date: "Data", address: "Adresă", openingHours: "Program",
      view: "În portalul clienților vedeți starea actuală",
    },
    reservationChanged: {
      subject: "Rezervarea dumneavoastră a fost modificată ({{plate}})",
      intro: "{{companyName}} a modificat rezervarea dumneavoastră.",
      car: "Mașină", period: "Perioadă",
      view: "În portalul clienților vedeți datele actuale",
      wrong: "Ceva nu este corect? Contactați {{companyName}}.",
    },
    reservationCancelled: {
      subject: "Rezervarea dumneavoastră a fost anulată ({{plate}})",
      intro: "{{companyName}} a anulat rezervarea dumneavoastră.",
      view: "În portalul clienților vedeți celelalte rezervări ale dumneavoastră",
      wrong: "Nu este corect? Contactați {{companyName}}.",
    },
    documentAvailable: {
      subject: "Document nou disponibil: {{document}}",
      intro: "Un document nou vă așteaptă în portalul clienților: {{document}} ({{fileName}}).",
      view: "Vedeți și descărcați documentul aici",
    },
    contractSigned: {
      subject: "Contract semnat: {{plate}}",
      intro: "{{signer}} a semnat digital contractul pentru {{company}} la {{at}}.",
      view: "Contractul semnat se află în portalul clienților",
      notYou: "Nu ați fost dumneavoastră? Contactați imediat {{companyName}}.",
    },
  },
  pl: {
    greeting: "Dzień dobry {{name}},",
    closing: "Z poważaniem,",
    invite: {
      subject: "Państwa konto w portalu klienta {{companyName}}",
      intro: "W portalu klienta {{companyName}} utworzono dla Państwa konto firmy {{company}}.",
      action: "Prosimy ustawić hasło, korzystając z tego linku (ważny przez 72 godziny):",
    },
    emailChange: {
      subject: "Prosimy potwierdzić nowy adres e-mail - portal klienta {{companyName}}",
      intro: "Otrzymaliśmy prośbę o zmianę adresu e-mail Państwa konta w portalu klienta {{companyName}} na {{newEmail}}.",
      action: "Prosimy potwierdzić zmianę, korzystając z tego linku (ważny przez 72 godziny):",
      ignore: "Jeśli to nie Państwo złożyli tę prośbę, można zignorować tę wiadomość; obecny adres pozostaje w użyciu.",
    },
    emailChanged: {
      subject: "Adres e-mail Państwa konta w portalu klienta został zmieniony",
      intro: "Adres e-mail, którym logują się Państwo do portalu klienta {{companyName}}, został właśnie zmieniony na {{newEmail}}. Wszystkie aktywne sesje tego konta zostały zakończone.",
      advice: "Jeśli to Państwo dokonali tej zmiany, nie trzeba nic robić. Jeśli nie, prosimy niezwłocznie skontaktować się z {{companyName}}.",
    },
    newDevice: {
      subject: "Nowe logowanie do Państwa konta w portalu klienta",
      intro: "Właśnie nastąpiło logowanie do Państwa konta w portalu klienta {{companyName}} z przeglądarki lub urządzenia, którego jeszcze nie znaliśmy.",
      time: "Data i godzina", browser: "Przeglądarka", ip: "Adres IP",
      advice: "Jeśli to byli Państwo, nie trzeba nic robić. Jeśli nie rozpoznają Państwo tego logowania, prosimy niezwłocznie zmienić hasło w portalu i skontaktować się z {{companyName}}.",
    },
    reset: {
      subject: "Ustawienie nowego hasła - portal klienta {{companyName}}",
      action: "Za pomocą tego linku mogą Państwo ustawić nowe hasło (ważny przez 72 godziny):",
      ignore: "Jeśli to nie Państwo złożyli tę prośbę, można zignorować tę wiadomość.",
    },
    fine: {
      subject: "Mandat {{plate}} z dnia {{date}}",
      intro: "Zarejestrowano mandat na firmę {{company}}:",
      plate: "Numer rejestracyjny", amount: "Kwota", view: "Szczegóły mandatu w portalu klienta",
    },
    requestReplied: {
      subject: "Odpowiedź na Państwa zgłoszenie ({{type}})",
      intro: "Odpowiedzieliśmy na Państwa zgłoszenie ({{type}}):",
      status: "Status", view: "Zgłoszenie można zobaczyć w portalu klienta",
    },
    maintenance: {
      subject: "Serwis {{plate}}: {{event}}",
      intro: "{{event}}: {{car}} ({{plate}}).",
      date: "Data", address: "Adres", openingHours: "Godziny otwarcia",
      view: "Aktualny status można zobaczyć w portalu klienta",
    },
    reservationChanged: {
      subject: "Państwa rezerwacja została zmieniona ({{plate}})",
      intro: "Państwa rezerwacja została zmieniona przez {{companyName}}.",
      car: "Samochód", period: "Okres",
      view: "Aktualne dane można zobaczyć w portalu klienta",
      wrong: "Coś się nie zgadza? Prosimy o kontakt z {{companyName}}.",
    },
    reservationCancelled: {
      subject: "Państwa rezerwacja została anulowana ({{plate}})",
      intro: "Państwa rezerwacja została anulowana przez {{companyName}}.",
      view: "Pozostałe rezerwacje można zobaczyć w portalu klienta",
      wrong: "Coś się nie zgadza? Prosimy o kontakt z {{companyName}}.",
    },
    documentAvailable: {
      subject: "Nowy dokument: {{document}}",
      intro: "W portalu klienta czeka na Państwa nowy dokument: {{document}} ({{fileName}}).",
      view: "Dokument można obejrzeć i pobrać tutaj",
    },
    contractSigned: {
      subject: "Umowa podpisana: {{plate}}",
      intro: "{{signer}} podpisał(a) elektronicznie umowę dla {{company}} w dniu {{at}}.",
      view: "Podpisana umowa jest dostępna w portalu klienta",
      notYou: "To nie Państwo? Prosimy o natychmiastowy kontakt z {{companyName}}.",
    },
  },
};

/** The seed text of every customer template in every language besides Dutch. */
export const TRANSLATED_TEMPLATES: Record<PortalMailLanguage, Record<CustomerTemplateName, TemplateText>> = {
  en: buildTemplates(TEMPLATE_WORDING.en),
  es: buildTemplates(TEMPLATE_WORDING.es),
  pt: buildTemplates(TEMPLATE_WORDING.pt),
  it: buildTemplates(TEMPLATE_WORDING.it),
  ro: buildTemplates(TEMPLATE_WORDING.ro),
  pl: buildTemplates(TEMPLATE_WORDING.pl),
};

/** The values the mail code fills into the templates, in the recipient's language. */
export interface PortalMailPhrases {
  requestType: Record<string, string>;
  requestStatus: Record<string, string>;
  maintenanceEvent: Record<MaintenanceMailEvent, string>;
  /** Appended to the maintenance date when the block runs over more days. */
  untilDate: (date: string) => string;
  periodFrom: (start: string) => string;
  periodRange: (start: string, end: string) => string;
  noCar: string;
  periodChanged: (now: string, was: string) => string;
  vehicleChanged: (now: string, was: string) => string;
  document: { contract: string; damageCheck: string };
}

export const PORTAL_MAIL_PHRASES: Record<SupportedLanguage, PortalMailPhrases> = {
  nl: {
    requestType: { extension: "verlenging", early_return: "eerder inleveren", damage: "schademelding", fine_question: "vraag over bekeuring", company_name_change: "wijziging bedrijfsnaam", other: "overig" },
    requestStatus: { new: "nieuw", in_progress: "in behandeling", done: "afgehandeld", rejected: "afgewezen" },
    maintenanceEvent: {
      maintenance_planned: "Onderhoud gepland", maintenance_moved: "Onderhoud verplaatst",
      maintenance_in: "Auto in onderhoud", maintenance_out: "Onderhoud klaar", maintenance_cancelled: "Onderhoud vervalt",
      maintenance_unlinked: "Onderhoud hoort niet meer bij uw huur", replacement_ready: "Vervangend vervoer staat klaar",
    },
    untilDate: (date) => ` tot en met ${date}`,
    periodFrom: (start) => `vanaf ${start}`,
    periodRange: (start, end) => `${start} t/m ${end}`,
    noCar: "nog geen auto toegewezen",
    periodChanged: (now, was) => `De periode is nu ${now} (was ${was}).`,
    vehicleChanged: (now, was) => `U rijdt nu in ${now} in plaats van ${was}.`,
    document: { contract: "Huurcontract", damageCheck: "Schadecontrole" },
  },
  en: {
    requestType: { extension: "extension", early_return: "early return", damage: "damage report", fine_question: "question about a fine", company_name_change: "company name change", other: "other" },
    requestStatus: { new: "new", in_progress: "in progress", done: "completed", rejected: "rejected" },
    maintenanceEvent: {
      maintenance_planned: "Maintenance scheduled", maintenance_moved: "Maintenance rescheduled",
      maintenance_in: "Car in for maintenance", maintenance_out: "Maintenance completed", maintenance_cancelled: "Maintenance cancelled",
      maintenance_unlinked: "Maintenance no longer part of your rental", replacement_ready: "Replacement vehicle ready",
    },
    untilDate: (date) => ` up to and including ${date}`,
    periodFrom: (start) => `from ${start}`,
    periodRange: (start, end) => `${start} to ${end}`,
    noCar: "no car assigned yet",
    periodChanged: (now, was) => `The period is now ${now} (was ${was}).`,
    vehicleChanged: (now, was) => `Your car is now ${now} (was ${was}).`,
    document: { contract: "Rental contract", damageCheck: "Damage check" },
  },
  es: {
    requestType: { extension: "prórroga", early_return: "devolución anticipada", damage: "parte de daños", fine_question: "pregunta sobre una multa", company_name_change: "cambio de nombre de la empresa", other: "otros" },
    requestStatus: { new: "nueva", in_progress: "en tramitación", done: "resuelta", rejected: "rechazada" },
    maintenanceEvent: {
      maintenance_planned: "Mantenimiento programado", maintenance_moved: "Mantenimiento reprogramado",
      maintenance_in: "Vehículo en mantenimiento", maintenance_out: "Mantenimiento finalizado", maintenance_cancelled: "Mantenimiento anulado",
      maintenance_unlinked: "El mantenimiento ya no corresponde a su alquiler", replacement_ready: "Vehículo de sustitución listo",
    },
    untilDate: (date) => ` hasta el ${date} inclusive`,
    periodFrom: (start) => `desde el ${start}`,
    periodRange: (start, end) => `del ${start} al ${end}`,
    noCar: "aún no se ha asignado ningún vehículo",
    periodChanged: (now, was) => `El periodo es ahora ${now} (antes: ${was}).`,
    vehicleChanged: (now, was) => `Su vehículo es ahora ${now} (antes: ${was}).`,
    document: { contract: "Contrato de alquiler", damageCheck: "Inspección de daños" },
  },
  pt: {
    requestType: { extension: "prolongamento", early_return: "devolução antecipada", damage: "participação de danos", fine_question: "pergunta sobre uma coima", company_name_change: "alteração do nome da empresa", other: "outro" },
    requestStatus: { new: "novo", in_progress: "em tratamento", done: "concluído", rejected: "recusado" },
    maintenanceEvent: {
      maintenance_planned: "Manutenção agendada", maintenance_moved: "Manutenção reagendada",
      maintenance_in: "Veículo em manutenção", maintenance_out: "Manutenção concluída", maintenance_cancelled: "Manutenção cancelada",
      maintenance_unlinked: "A manutenção já não diz respeito ao seu aluguer", replacement_ready: "Veículo de substituição pronto",
    },
    untilDate: (date) => ` até ${date}, inclusive`,
    periodFrom: (start) => `a partir de ${start}`,
    periodRange: (start, end) => `de ${start} a ${end}`,
    noCar: "ainda sem veículo atribuído",
    periodChanged: (now, was) => `O período é agora ${now} (antes: ${was}).`,
    vehicleChanged: (now, was) => `O seu veículo é agora ${now} (antes: ${was}).`,
    document: { contract: "Contrato de aluguer", damageCheck: "Inspeção de danos" },
  },
  it: {
    requestType: { extension: "proroga", early_return: "riconsegna anticipata", damage: "denuncia di danno", fine_question: "domanda su una multa", company_name_change: "modifica della ragione sociale", other: "altro" },
    requestStatus: { new: "nuova", in_progress: "in lavorazione", done: "evasa", rejected: "respinta" },
    maintenanceEvent: {
      maintenance_planned: "Manutenzione programmata", maintenance_moved: "Manutenzione spostata",
      maintenance_in: "Auto in manutenzione", maintenance_out: "Manutenzione completata", maintenance_cancelled: "Manutenzione annullata",
      maintenance_unlinked: "La manutenzione non riguarda più il Suo noleggio", replacement_ready: "Veicolo sostitutivo pronto",
    },
    untilDate: (date) => ` fino al ${date} incluso`,
    periodFrom: (start) => `dal ${start}`,
    periodRange: (start, end) => `dal ${start} al ${end}`,
    noCar: "nessuna auto ancora assegnata",
    periodChanged: (now, was) => `Il periodo ora è ${now} (prima: ${was}).`,
    vehicleChanged: (now, was) => `La Sua auto ora è ${now} (prima: ${was}).`,
    document: { contract: "Contratto di noleggio", damageCheck: "Controllo danni" },
  },
  ro: {
    requestType: { extension: "prelungire", early_return: "returnare anticipată", damage: "raportare daună", fine_question: "întrebare despre o amendă", company_name_change: "schimbarea denumirii firmei", other: "altele" },
    requestStatus: { new: "nouă", in_progress: "în lucru", done: "rezolvată", rejected: "respinsă" },
    maintenanceEvent: {
      maintenance_planned: "Mentenanță programată", maintenance_moved: "Mentenanță reprogramată",
      maintenance_in: "Mașina este în mentenanță", maintenance_out: "Mentenanță finalizată", maintenance_cancelled: "Mentenanța nu mai are loc",
      maintenance_unlinked: "Mentenanța nu mai ține de închirierea dumneavoastră", replacement_ready: "Vehiculul de înlocuire este pregătit",
    },
    untilDate: (date) => ` până la ${date} inclusiv`,
    periodFrom: (start) => `începând cu ${start}`,
    periodRange: (start, end) => `${start} – ${end}`,
    noCar: "încă nu a fost alocată nicio mașină",
    periodChanged: (now, was) => `Perioada este acum ${now} (înainte: ${was}).`,
    vehicleChanged: (now, was) => `Mașina dumneavoastră este acum ${now} (înainte: ${was}).`,
    document: { contract: "Contract de închiriere", damageCheck: "Verificare daune" },
  },
  pl: {
    requestType: { extension: "przedłużenie", early_return: "wcześniejszy zwrot", damage: "zgłoszenie szkody", fine_question: "pytanie o mandat", company_name_change: "zmiana nazwy firmy", other: "inne" },
    requestStatus: { new: "nowe", in_progress: "w realizacji", done: "zakończone", rejected: "odrzucone" },
    maintenanceEvent: {
      maintenance_planned: "Zaplanowano serwis", maintenance_moved: "Przesunięto termin serwisu",
      maintenance_in: "Samochód w serwisie", maintenance_out: "Serwis zakończony", maintenance_cancelled: "Serwis odwołany",
      maintenance_unlinked: "Serwis nie dotyczy już Państwa najmu", replacement_ready: "Pojazd zastępczy jest gotowy",
    },
    untilDate: (date) => ` do ${date} włącznie`,
    periodFrom: (start) => `od ${start}`,
    periodRange: (start, end) => `${start} – ${end}`,
    noCar: "samochód nie został jeszcze przydzielony",
    periodChanged: (now, was) => `Okres to teraz ${now} (wcześniej: ${was}).`,
    vehicleChanged: (now, was) => `Państwa samochód to teraz ${now} (wcześniej: ${was}).`,
    document: { contract: "Umowa najmu", damageCheck: "Protokół szkód" },
  },
};
