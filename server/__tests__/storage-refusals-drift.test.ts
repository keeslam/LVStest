/**
 * Drift guard for server/utils/storage-refusals.ts. The list of deliberate refusal
 * sentences is closed by hand; a new `throw new Error("...")` in one of the storage
 * methods behind the pickup, return, spare and placeholder routes that the list does
 * not accept would silently become the generic 500 `*_FAILED` answer. So every plain
 * Error sentence these methods really throw is checked against the list.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { isDeliberateStorageRefusal } from "../utils/storage-refusals";

const source = fs.readFileSync(path.join(__dirname, "../database-storage.ts"), "utf8").replace(/\r\n/g, "\n");

const METHODS = [
  "pickupReservation",
  "returnReservation",
  "createPlaceholderReservation",
  "assignVehicleToPlaceholder",
  "createReplacementReservation",
];

/** One class method: from its `async name(` line to the next method at the same indent. */
function bodyOf(name: string): string {
  const start = source.search(new RegExp(`\\n  async ${name}\\(`));
  expect(start, `${name} not found in database-storage.ts`).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}(?:async |private |public |protected )?[A-Za-z_]+\(/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe("storage-refusals follows the sentences the storage really throws", () => {
  for (const name of METHODS) {
    it(`${name}: every plain Error sentence is a deliberate refusal the routes recognise`, () => {
      const body = bodyOf(name);
      const throws = [...body.matchAll(/throw new Error\((['"`])((?:(?!\1)[^\\])*)\1\)/g)];
      expect(throws.length).toBeGreaterThan(0);
      for (const match of throws) {
        // A template placeholder stands for a status or a number in the real message.
        const sentence = match[2].replace(/\$\{[^}]*\}/g, "5");
        expect(isDeliberateStorageRefusal(new Error(sentence)), `not in the refusal list: ${sentence}`).toBe(true);
      }
    });
  }
});
