import type { Locator } from "@playwright/test";

/**
 * One workflow as a member of staff performs it. Every deliberate user action
 * goes through this class and is counted; Layer B tests touch the page in no
 * other way. The budget is the approved number of actions: more is a
 * regression, fewer is an improvement that should lower the budget.
 */
export class Story {
  readonly steps: string[] = [];
  constructor(readonly name: string, readonly budget: number) {}

  async click(target: Locator, label: string) { await target.click(); this.steps.push(`klik: ${label}`); }
  async fill(target: Locator, value: string, label: string) { await target.fill(value); this.steps.push(`typ: ${label}`); }
  /** A select, combobox option, radio or checkbox. */
  async choose(open: Locator, option: Locator, label: string) { await open.click(); await option.click(); this.steps.push(`kies: ${label}`); }

  finish() {
    const listing = this.steps.map((step, index) => `${String(index + 1).padStart(2)}. ${step}`).join("\n");
    console.log(`\n[werkstroom] ${this.name}: ${this.steps.length} handelingen (budget ${this.budget})\n${listing}\n`);
    if (this.steps.length > this.budget) throw new Error(`${this.name}: ${this.steps.length} handelingen, het budget is ${this.budget}.\n${listing}`);
    if (this.steps.length < this.budget) console.log(`[werkstroom] ${this.name}: budget kan omlaag naar ${this.steps.length}.`);
  }
}
