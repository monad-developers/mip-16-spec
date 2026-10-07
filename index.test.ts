// Runs each fixture in fixtures/ against the server at RPC_URL, one at a time. See README.
import { test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { type Fixture, type RequestTiming, runFixture, summarizeProblems } from "./utils";

const url = process.env.RPC_URL;
if (!url) throw new Error("Set RPC_URL to the JSON-RPC endpoint to test.");

// The timeout for one fixture. A fixture can need many pages. REQUEST_TIMEOUT_MS in utils.ts limits each request.
const TIMEOUT_MS = 600_000;

/** Prints the duration of one fetch request. A fixture that paginates prints one line for each page. */
function printTiming(file: string, t: RequestTiming) {
  const range = t.fromBlock === undefined && t.toBlock === undefined ? "" : ` ${t.fromBlock ?? "-"}..${t.toBlock ?? "-"}`;
  console.log(`${file} request ${t.request}${range}: ${t.ms.toFixed(0)} ms (${t.outcome})`);
}

const root = join(import.meta.dir, "fixtures");
for (const file of readdirSync(root).filter((f) => f.endsWith(".json")).sort()) {
  const fixture: Fixture = await Bun.file(join(root, file)).json();
  test(
    `${file} ${fixture.request.method}: ${fixture.undecided ? "[undecided] " : ""}${fixture.description}`,
    async () => {
      const outcome = await runFixture(url, fixture, (t) => printTiming(file, t), (note) => console.log(`${file} note: ${note}`));
      if (fixture.undecided) {
        for (const problem of summarizeProblems(outcome.problems)) console.log(`${file} note (undecided): ${problem}`);
        return;
      }
      // Throw instead of expect(...).toEqual([]), so that Bun prints each problem one time, without an array diff.
      if (outcome.problems.length) throw new Error(summarizeProblems(outcome.problems).join("\n"));
    },
    TIMEOUT_MS,
  );
}
