import type { TestAgent } from "./app";

/**
 * /api/reports/execute answers { rows, truncated }. Most builder tests only look at the rows, so this
 * lets `res.body` be the rows list on that route (and `res.truncated` the flag); every other route,
 * and any answer that is not that shape (errors), stays as it is. The contract tests that check the
 * object itself use the plain agent.
 */
export function rowsFromExecute<T extends TestAgent>(agent: T): T {
  const post = agent.post.bind(agent);
  (agent as any).post = (url: string, ...rest: unknown[]) => {
    const test = (post as any)(url, ...rest);
    if (url !== "/api/reports/execute") return test;
    const then = test.then.bind(test);
    test.then = (ok: any, fail: any) => then((res: any) => {
      if (res?.body && Array.isArray(res.body.rows) && typeof res.body.truncated === "boolean") {
        res.truncated = res.body.truncated;
        res.body = res.body.rows;
      }
      return ok ? ok(res) : res;
    }, fail);
    return test;
  };
  return agent;
}
