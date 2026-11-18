// Sends each request in benchmarks/ to RPC_URL and prints the duration of each page and the sum. See README.
import { readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.RPC_URL;
if (!url) throw new Error("Set RPC_URL to the JSON-RPC endpoint to benchmark.");

/** The maximum number of pages for one benchmark. */
const MAX_PAGES = 3;

const root = join(import.meta.dir, "benchmarks");
for (const file of readdirSync(root).filter((f) => f.endsWith(".json")).sort()) {
  const { description, request } = await Bun.file(join(root, file)).json();
  console.log(`${file} ${request.method}: ${description}`);
  const params = request.params[0];
  let total = 0;
  let next = params;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const start = performance.now();
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, params: [next] }) });
    const body = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    const ms = performance.now() - start;
    total += ms;
    console.log(`  page ${page}: ${ms.toFixed(0)} ms${body.result ? "" : ` (${body.error?.message ?? "no result"})`}`);
    const result = body.result;
    if (!result || result.cursorBlock.number === result.toBlock.number) break;
    const cursor = BigInt(result.cursorBlock.number);
    next = { ...params, fromBlock: `0x${(params.order === "desc" ? cursor - 1n : cursor + 1n).toString(16)}`, toBlock: result.toBlock.number };
  }
  console.log(`  total: ${total.toFixed(0)} ms`);
}
