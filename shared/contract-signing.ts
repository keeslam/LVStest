/**
 * Signing a contract in the customer portal (Kees, 2026-10-18): the rules client and server share.
 *
 * Kees's choices: the customer draws a signature on screen, types a name and ticks "ik ga akkoord";
 * only portal administrators sign; every current unsigned contract can be signed as soon as staff
 * make it; the customer gets a mail with a link, never the PDF itself.
 */
import { z } from "zod";

/** The document type staff already use for a signed contract they upload; the portal writes the same. */
export const DOCUMENT_TYPE_CONTRACT_SIGNED = "Contract (Signed)";

/** Bumped when the statement the signer agrees to changes; stored on every signature. */
export const CONSENT_VERSION = "2026-10-18";

/** The statement on the signature page (Dutch, the language of the contract). */
export const CONSENT_STATEMENT_NL =
  "De ondertekenaar verklaart het contract te hebben gelezen en gaat akkoord met de inhoud ervan.";

/** A drawn signature as a PNG data URL; small on purpose (a signature pad of a few hundred pixels). */
export const MAX_SIGNATURE_BYTES = 200 * 1024;
/** Below this a PNG cannot hold a stroke: an empty canvas is refused. */
export const MIN_SIGNATURE_BYTES = 200;

export const signContractSchema = z.object({
  name: z.string().trim().min(2).max(200),
  agree: z.literal(true),
  signature: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 32),
  /** SHA-256 of the contract the signer was shown; a different file on the server means it changed in between. */
  documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SignContractInput = z.infer<typeof signContractSchema>;

/** Where a contract stands for the customer. */
export type ContractSigningStatus =
  | "to_sign"      // current unsigned contract, can be signed
  | "signed"       // signed in the portal
  | "superseded"   // an older or stale version; a newer one replaces it
  | "signed_copy"; // the signed PDF itself (or a signed scan staff uploaded)

/** `Contract (Unsigned)` in any spelling. */
export function isUnsignedContractType(documentType?: string | null): boolean {
  return (documentType ?? "").toLowerCase().replace(/[\s_-]+/g, "") === "contract(unsigned)";
}

/** `Contract (Signed)` in any spelling. */
export function isSignedContractType(documentType?: string | null): boolean {
  return (documentType ?? "").toLowerCase().replace(/[\s_-]+/g, "") === "contract(signed)";
}

/** File integrity of a signed contract as staff see it. */
export type SignatureIntegrity = "intact" | "changed" | "missing";

export interface ContractSignatureDto {
  id: number;
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
