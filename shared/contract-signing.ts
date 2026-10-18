/**
 * Signing a contract or a damage form in the customer portal (Kees, 2026-10-18): the rules client
 * and server share.
 *
 * Kees's choices: the customer draws a signature on screen, types a name and ticks "ik ga akkoord";
 * only portal administrators sign; every current unsigned contract or damage form can be signed as
 * soon as staff make it; the customer gets a mail with a link, never the PDF itself. The office sees
 * what came back signed on the Klantenportaal dashboard.
 */
import { z } from "zod";

/** The document types staff already use for a signed copy they upload; the portal writes the same. */
export const DOCUMENT_TYPE_CONTRACT_SIGNED = "Contract (Signed)";
export const DOCUMENT_TYPE_DAMAGE_CHECK_SIGNED = "Damage Check (Signed)";

/** What can be signed in the portal. */
export type SignableKind = "contract" | "damage_check";
export const SIGNABLE_KINDS: readonly SignableKind[] = ["contract", "damage_check"];

/** Bumped when the statement the signer agrees to changes; stored on every signature. */
export const CONSENT_VERSION = "2026-10-18";

/** The statement on the signature page (Dutch, the language of the documents). */
export const CONSENT_STATEMENT_NL: Record<SignableKind, string> = {
  contract: "De ondertekenaar verklaart het contract te hebben gelezen en gaat akkoord met de inhoud ervan.",
  damage_check: "De ondertekenaar verklaart het schadeformulier te hebben gelezen en gaat akkoord met de vastgelegde staat van het voertuig.",
};

/** What the document is called on the signature page and in staff notices. */
export const SIGNABLE_LABEL_NL: Record<SignableKind, string> = { contract: "Contract", damage_check: "Schadeformulier" };

/** A drawn signature as a PNG data URL; small on purpose (a signature pad of a few hundred pixels). */
export const MAX_SIGNATURE_BYTES = 200 * 1024;
/** Below this a PNG cannot hold a stroke: an empty canvas is refused. */
export const MIN_SIGNATURE_BYTES = 200;

export const signContractSchema = z.object({
  name: z.string().trim().min(2).max(200),
  agree: z.literal(true),
  signature: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 32),
  /** SHA-256 of the document the signer was shown; a different file on the server means it changed in between. */
  documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SignContractInput = z.infer<typeof signContractSchema>;

/** Where a contract or damage form stands for the customer. */
export type ContractSigningStatus =
  | "to_sign"      // current unsigned document, can be signed
  | "signed"       // signed in the portal
  | "superseded"   // an older or stale version; a newer one replaces it
  | "signed_copy"; // the signed PDF itself (or a signed scan staff uploaded)

const normalize = (documentType?: string | null) => (documentType ?? "").toLowerCase().replace(/[\s_-]+/g, "");

/** `Contract (Unsigned)` / `Damage Check (Unsigned)` in any spelling: the kind that can be signed, else null. */
export function unsignedKindOf(documentType?: string | null): SignableKind | null {
  const n = normalize(documentType);
  if (n === "contract(unsigned)") return "contract";
  if (n === "damagecheck(unsigned)") return "damage_check";
  return null;
}

/** `Contract (Signed)` / `Damage Check (Signed)` in any spelling: the kind of signed copy, else null. */
export function signedKindOf(documentType?: string | null): SignableKind | null {
  const n = normalize(documentType);
  if (n === "contract(signed)") return "contract";
  if (n === "damagecheck(signed)") return "damage_check";
  return null;
}

export function signedTypeFor(kind: SignableKind): string {
  return kind === "contract" ? DOCUMENT_TYPE_CONTRACT_SIGNED : DOCUMENT_TYPE_DAMAGE_CHECK_SIGNED;
}

/** `Contract (Unsigned)` in any spelling. */
export function isUnsignedContractType(documentType?: string | null): boolean {
  return unsignedKindOf(documentType) === "contract";
}

/** `Contract (Signed)` in any spelling. */
export function isSignedContractType(documentType?: string | null): boolean {
  return signedKindOf(documentType) === "contract";
}

/** File integrity of a signed document as staff see it. */
export type SignatureIntegrity = "intact" | "changed" | "missing";

export interface ContractSignatureDto {
  id: number;
  documentKind: SignableKind;
  documentId: number | null;
  signedDocumentId: number | null;
  reservationId: number;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  ip: string | null;
  userAgent: string | null;
  consentVersion: string;
  originalFileName: string;
  originalVersion: number | null;
  originalSha256: string;
  signedSha256: string;
  integrity: { original: SignatureIntegrity; signed: SignatureIntegrity };
}

/** One row of the dashboard's "Getekend" list: a document that came back signed. */
export interface SignedDocumentRow {
  id: number;
  documentKind: SignableKind;
  reservationId: number;
  customerId: number;
  customerName: string;
  licensePlate: string | null;
  signerName: string;
  signedAt: string;
  signedDocumentId: number | null;
  seenAt: string | null;
  seenBy: string | null;
}

/** One row of the dashboard's "Wacht op handtekening" list. */
export interface AwaitingSignatureRow {
  documentId: number;
  documentKind: SignableKind;
  reservationId: number;
  customerId: number;
  customerName: string;
  licensePlate: string | null;
  since: string;
}
