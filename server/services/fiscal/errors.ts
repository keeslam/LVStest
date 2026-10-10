/**
 * The errors the fiscal services throw. Each knows its HTTP status and its
 * safe body, in the shape server/utils/route-errors.ts sends.
 */
import type { ParameterValidationIssue } from "./parameters";

/** A transition or change the rules refuse (409). */
export class FiscalStateError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "FiscalStateError";
  }
  toBody() {
    return { message: this.message };
  }
}

/**
 * One problem with a field. `reason` is an optional stable code (for example
 * "replacementReasonRequired") a screen can word in its own language; `message`
 * stays the server's text.
 */
export type FiscalValidationIssue = ParameterValidationIssue & { reason?: string };

/** Input that does not fit (400), with every problem listed. */
export class FiscalValidationError extends Error {
  readonly status = 400;
  readonly issues: FiscalValidationIssue[];
  constructor(message: string, issues: FiscalValidationIssue[] = []) {
    super(message);
    this.name = "FiscalValidationError";
    this.issues = issues;
  }
  toBody() {
    return {
      message: this.message,
      errors: this.issues.map((i) => ({ field: i.key, ...(i.reason ? { reason: i.reason } : {}), message: i.message })),
    };
  }
}

export class FiscalNotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Niet gevonden") {
    super(message);
    this.name = "FiscalNotFoundError";
  }
  toBody() {
    return { message: this.message };
  }
}
