/**
 * BUG-057 — "Malformed JSON geeft een volledige Node-stack trace (dev-gated)."
 *
 * The audit's conclusion was that the code is right: `server/index.ts` only
 * adds `err.stack` and the raw message to an error response when
 * `NODE_ENV !== 'production'`, and the audit server deliberately ran in dev
 * mode. What it asked for was not a code change but a guard against the one
 * way this becomes a real leak — a deployed environment that is not in
 * production mode, where every 400 and 500 would hand out absolute Windows
 * paths, library versions and a call stack.
 *
 * So this is a start-up assertion, not a fix: it says so loudly, once, at
 * boot, and it says it louder when the process also looks deployed.
 * Deliberately pure and exported, so the wording is under test.
 */
export interface StartupWarning {
  code: string;
  lines: string[];
}

/** Signals that this process is running somewhere other than a laptop. */
export function looksDeployed(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.COOLIFY_URL ||
      env.COOLIFY_FQDN ||
      env.COOLIFY_CONTAINER_NAME ||
      env.KUBERNETES_SERVICE_HOST ||
      env.DYNO ||
      env.RENDER ||
      env.FLY_APP_NAME,
  );
}

/**
 * What is wrong with this environment, in the order it should be printed.
 * An empty array means there is nothing to say.
 */
export function startupWarnings(env: NodeJS.ProcessEnv = process.env): StartupWarning[] {
  const warnings: StartupWarning[] = [];
  const nodeEnv = env.NODE_ENV;

  // The test suite sets NODE_ENV=test on purpose; it is not a deployment.
  if (nodeEnv !== "production" && nodeEnv !== "test") {
    const lines = [
      "=========================================================",
      `⚠️  NODE_ENV is "${nodeEnv ?? "(not set)"}", not "production".`,
      "   Error responses will contain the exception message, the full",
      "   stack trace and absolute server paths (BUG-057), the Vite dev",
      "   server is mounted, and the security headers are relaxed.",
      "   That is correct on a developer machine and a disclosure hole",
      "   anywhere else. Set NODE_ENV=production for any deployment.",
      "=========================================================",
    ];
    if (looksDeployed(env)) {
      lines.splice(
        2,
        0,
        "   THIS PROCESS LOOKS DEPLOYED (a hosting platform's environment",
        "   variables are present). Fix this before anyone uses it.",
      );
    }
    warnings.push({ code: "NODE_ENV_NOT_PRODUCTION", lines });
  }

  return warnings;
}

/** Prints what `startupWarnings` found. Returns the number printed. */
export function logStartupWarnings(
  env: NodeJS.ProcessEnv = process.env,
  log: (line: string) => void = console.warn,
): number {
  const warnings = startupWarnings(env);
  for (const warning of warnings) {
    for (const line of warning.lines) log(line);
  }
  return warnings.length;
}
