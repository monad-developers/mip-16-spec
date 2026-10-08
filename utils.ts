// Helpers for the MIP-16 conformance runner: schemas, checks, pagination, and comparison.

export type Order = "asc" | "desc";
export type BlockRef = { number: string; hash: string; parentHash: string };
export type QueryParams = {
  fromBlock?: string;
  toBlock?: string;
  order?: Order;
  target?: string;
  filter?: Record<string, unknown>;
  fields?: Record<string, string[] | "all">;
};
export type QueryResult = {
  data: Record<string, Record<string, unknown>[]>;
  fromBlock: BlockRef;
  toBlock: BlockRef;
  cursorBlock: BlockRef;
};
export type RpcRequest = { jsonrpc: "2.0"; id: number | string; method: string; params: unknown };
export type RpcResponse = {
  jsonrpc?: unknown;
  id?: unknown;
  result?: QueryResult;
  error?: { code: number; message?: string; data?: unknown };
};
export type Fixture = { description: string; request: RpcRequest; response: RpcResponse };

// Value types. See MIP-16 Value types.

type ValueType =
  | "quantity"
  | "data"
  | "hash"
  | "address"
  | "addressOrNull"
  | "boolean"
  | "string"
  | "stringOrNull"
  | "parity"
  | "hashArray"
  | "dataArray"
  | "numberArray"
  | "accessList"
  | "authorizationList";

type Availability = "required" | "fork" | "type";
type FieldSpec = [ValueType, Availability];

// Hex in a response must be lowercase. The patterns do not accept uppercase letters.
const QUANTITY = /^0x(0|[1-9a-f][0-9a-f]*)$/;
const DATA = /^0x([0-9a-f]{2})*$/;
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;

function isValue(type: ValueType, v: unknown): boolean {
  const str = typeof v === "string";
  switch (type) {
    case "quantity":
      return str && QUANTITY.test(v);
    case "data":
      return str && DATA.test(v);
    case "hash":
      return str && HASH.test(v);
    case "address":
      return str && ADDRESS.test(v);
    case "addressOrNull":
      return v === null || (str && ADDRESS.test(v));
    case "boolean":
      return typeof v === "boolean";
    case "string":
      return str;
    case "stringOrNull":
      return v === null || str;
    case "parity":
      return v === "0x0" || v === "0x1";
    case "hashArray":
      return Array.isArray(v) && v.every((x) => isValue("hash", x));
    case "dataArray":
      return Array.isArray(v) && v.every((x) => isValue("data", x));
    case "numberArray":
      return Array.isArray(v) && v.every((x) => Number.isSafeInteger(x) && x >= 0);
    case "accessList":
      return (
        Array.isArray(v) &&
        v.every(
          (e) =>
            typeof e === "object" &&
            e !== null &&
            isValue("address", (e as any).address) &&
            isValue("hashArray", (e as any).storageKeys),
        )
      );
    case "authorizationList":
      return (
        Array.isArray(v) &&
        v.every(
          (e) =>
            typeof e === "object" &&
            e !== null &&
            isValue("quantity", (e as any).chainId) &&
            isValue("address", (e as any).address) &&
            isValue("quantity", (e as any).nonce) &&
            isValue("parity", (e as any).yParity) &&
            isValue("quantity", (e as any).r) &&
            isValue("quantity", (e as any).s),
        )
      );
  }
}

// Object schemas. See MIP-16 Appendix: Monad Response Schemas. A field that is not in a schema is not supported, and
// a request that selects it fails with -32602.

const traceShape = {
  type: ["string", "required"],
  from: ["address", "required"],
  // to is null if a CREATE or CREATE2 frame failed.
  to: ["addressOrNull", "required"],
  value: ["quantity", "required"],
  gas: ["quantity", "required"],
  gasUsed: ["quantity", "required"],
  input: ["data", "required"],
  output: ["data", "required"],
  error: ["stringOrNull", "required"],
  reverted: ["boolean", "required"],
  blockHash: ["hash", "required"],
  blockNumber: ["quantity", "required"],
  transactionHash: ["hash", "required"],
  transactionIndex: ["quantity", "required"],
  traceAddress: ["numberArray", "required"],
} satisfies Record<string, FieldSpec>;

export const SCHEMAS: Record<string, Record<string, FieldSpec>> = {
  blocks: {
    number: ["quantity", "required"],
    hash: ["hash", "required"],
    parentHash: ["hash", "required"],
    timestamp: ["quantity", "required"],
    miner: ["address", "required"],
    nonce: ["data", "required"],
    mixHash: ["hash", "required"],
    sha3Uncles: ["hash", "required"],
    logsBloom: ["data", "required"],
    transactionsRoot: ["hash", "required"],
    stateRoot: ["hash", "required"],
    receiptsRoot: ["hash", "required"],
    difficulty: ["quantity", "required"],
    totalDifficulty: ["quantity", "required"],
    extraData: ["data", "required"],
    size: ["quantity", "required"],
    gasLimit: ["quantity", "required"],
    gasUsed: ["quantity", "required"],
    baseFeePerGas: ["quantity", "required"],
    withdrawalsRoot: ["hash", "required"],
    blobGasUsed: ["quantity", "required"],
    excessBlobGas: ["quantity", "required"],
    parentBeaconBlockRoot: ["hash", "required"],
    // requestsHash is present only in blocks from MONAD_FOUR.
    requestsHash: ["hash", "fork"],
  },
  transactions: {
    hash: ["hash", "required"],
    blockHash: ["hash", "required"],
    blockNumber: ["quantity", "required"],
    blockTimestamp: ["quantity", "required"],
    transactionIndex: ["quantity", "required"],
    type: ["quantity", "required"],
    from: ["address", "required"],
    to: ["addressOrNull", "required"],
    nonce: ["quantity", "required"],
    input: ["data", "required"],
    value: ["quantity", "required"],
    gas: ["quantity", "required"],
    // For types 0x2 and 0x4, gasPrice is the effective gas price.
    gasPrice: ["quantity", "required"],
    maxFeePerGas: ["quantity", "type"],
    maxPriorityFeePerGas: ["quantity", "type"],
    chainId: ["quantity", "type"],
    accessList: ["accessList", "type"],
    authorizationList: ["authorizationList", "type"],
    v: ["quantity", "required"],
    yParity: ["parity", "type"],
    r: ["quantity", "required"],
    s: ["quantity", "required"],
    status: ["quantity", "required"],
    gasUsed: ["quantity", "required"],
    cumulativeGasUsed: ["quantity", "required"],
    effectiveGasPrice: ["quantity", "required"],
    contractAddress: ["addressOrNull", "required"],
    logsBloom: ["data", "required"],
  },
  logs: {
    address: ["address", "required"],
    blockHash: ["hash", "required"],
    blockNumber: ["quantity", "required"],
    blockTimestamp: ["quantity", "required"],
    transactionHash: ["hash", "required"],
    transactionIndex: ["quantity", "required"],
    logIndex: ["quantity", "required"],
    topics: ["hashArray", "required"],
    data: ["data", "required"],
    removed: ["boolean", "required"],
  },
  traces: traceShape,
  transfers: traceShape,
};

// Methods. See MIP-16 Fields and the Ordering section of each method.

export const METHODS: Record<string, { primary: string; relations: string[] }> = {
  eth_queryBlocks: { primary: "blocks", relations: [] },
  eth_queryTransactions: { primary: "transactions", relations: ["blocks"] },
  eth_queryLogs: { primary: "logs", relations: ["transactions", "blocks"] },
  eth_queryTraces: { primary: "traces", relations: ["transactions", "blocks"] },
  eth_queryTransfers: { primary: "transfers", relations: ["transactions", "blocks"] },
};

const ORDERING_KEYS: Record<string, string[]> = {
  blocks: ["number"],
  transactions: ["blockNumber", "transactionIndex"],
  logs: ["blockNumber", "logIndex"],
  traces: ["blockNumber", "transactionIndex", "traceAddress"],
  transfers: ["blockNumber", "transactionIndex", "traceAddress"],
};

// The field of a related object that identifies it, and the field of a primary object that refers to it.
// See MIP-16 Joining relations.
const JOIN_KEYS: Record<string, { related: string; primary: string }> = {
  blocks: { related: "number", primary: "blockNumber" },
  transactions: { related: "hash", primary: "transactionHash" },
};

// Values

export const toBigInt = (q: string): bigint => BigInt(q);
export const toQuantity = (n: bigint): string => `0x${n.toString(16)}`;

/** Gives the block number of an object, or undefined if the request did not select it. */
function blockNumberOf(type: string, o: Record<string, unknown>): bigint | undefined {
  const v = type === "blocks" ? o.number : o.blockNumber;
  return typeof v === "string" ? toBigInt(v) : undefined;
}

/** Compares two values of an ordering key. Quantities compare as numbers. Arrays compare element-wise. */
function compareKey(a: unknown, b: unknown): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = compareKey(a[i], b[i]);
      if (c !== 0) return c;
    }
    return a.length - b.length;
  }
  const x = typeof a === "string" ? toBigInt(a) : BigInt(a as number);
  const y = typeof b === "string" ? toBigInt(b) : BigInt(b as number);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Gives the ordering key of an object as text, for example "blockNumber 0x2faf08b, logIndex 0x2". */
function keyText(keys: string[], o: Record<string, unknown>): string {
  return keys.map((k) => `${k} ${JSON.stringify(o[k])?.replace(/"/g, "")}`).join(", ");
}

function compareObjects(type: string, a: Record<string, unknown>, b: Record<string, unknown>): number {
  for (const k of ORDERING_KEYS[type]!) {
    const c = compareKey(a[k], b[k]);
    if (c !== 0) return c;
  }
  return 0;
}

/** Tells if a value contains a hex string with an uppercase letter, so that a problem message can say why it is invalid. */
function hasUppercaseHex(v: unknown): boolean {
  if (typeof v === "string") return /^0x/i.test(v) && v !== v.toLowerCase();
  if (Array.isArray(v)) return v.some(hasUppercaseHex);
  if (v !== null && typeof v === "object") return Object.values(v).some(hasUppercaseHex);
  return false;
}

// Transport

let nextId = 1;

/** The duration of one fetch request. `fromBlock` and `toBlock` are the values that the request sent. */
export type RequestTiming = { request: number; fromBlock?: string; toBlock?: string; ms: number; outcome: string };

/** Receives the duration of each fetch request when the request completes. */
export type OnRequest = (timing: Omit<RequestTiming, "request">) => void;

/** The maximum time for one fetch request. Set it with REQUEST_TIMEOUT_MS. */
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000);

/** Sends one JSON-RPC request without change and gives the raw response. */
export async function send(url: string, request: unknown, onRequest?: OnRequest): Promise<RpcResponse> {
  const params = ((request as RpcRequest).params as QueryParams[] | undefined)?.[0];
  const start = performance.now();
  const report = (outcome: string) =>
    onRequest?.({ fromBlock: params?.fromBlock, toBlock: params?.toBlock, ms: performance.now() - start, outcome });
  let res: Response;
  let text: string;
  try {
    // The signal stops the request at the timeout, so that a slow request does not continue into the next fixture.
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    const message = timedOut ? `request timed out after ${REQUEST_TIMEOUT_MS / 1000} s` : `fetch failed: ${e}`;
    report(message);
    throw new Error(message);
  }
  try {
    const body: RpcResponse = JSON.parse(text);
    report(body.error ? `error ${body.error.code}` : `HTTP ${res.status}`);
    return body;
  } catch {
    // An HTML error page from a proxy is long. Its title is sufficient, for example "504 Gateway Time-out".
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    const summary = title ?? short(text.trim(), 120);
    report(`HTTP ${res.status}, not JSON`);
    throw new Error(`HTTP ${res.status}: response is not JSON: ${summary}`);
  }
}

/** Sends a query with new params. The runner uses it for subsequent pages. */
export function query(url: string, method: string, params: QueryParams, onRequest?: OnRequest): Promise<RpcResponse> {
  return send(url, { jsonrpc: "2.0", id: `page-${nextId++}`, method, params: [params] }, onRequest);
}

// Checks. See README Checks. Each check gives a list of problems. An empty list is a pass.

export function checkEnvelope(request: RpcRequest, response: RpcResponse): string[] {
  const problems: string[] = [];
  if (response.jsonrpc !== "2.0") problems.push(`jsonrpc is ${JSON.stringify(response.jsonrpc)}, not "2.0"`);
  if (response.id !== request.id) problems.push(`id is ${JSON.stringify(response.id)}, not ${JSON.stringify(request.id)}`);
  const hasResult = "result" in response;
  const hasError = "error" in response;
  if (hasResult === hasError) problems.push("response must contain exactly one of result and error");
  if (hasError && !Number.isInteger(response.error?.code)) problems.push("error.code is not an integer");
  return problems;
}

/** Checks that each object contains only known fields, with valid encodings, and only the selected fields. */
export function checkFields(method: string, params: QueryParams, result: QueryResult): string[] {
  const problems: string[] = [];
  const { primary, relations } = METHODS[method]!;
  const fields = params.fields;
  const expectedKeys = [...new Set([primary, ...Object.keys(fields ?? {})])];
  const receivedKeys = Object.keys(result.data ?? {});
  if (expectedKeys.some((k) => !receivedKeys.includes(k)) || receivedKeys.some((k) => !expectedKeys.includes(k))) {
    problems.push(`data has the wrong keys.${keyReport(expectedKeys, [], receivedKeys)}`);
  }
  for (const key of expectedKeys) {
    if (key !== primary && !relations.includes(key)) continue;
    const rows = result.data?.[key];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      problems.push(`data.${key} is not an array`);
      continue;
    }
    const schema = SCHEMAS[key]!;
    const selection = fields?.[key] ?? "all";
    // Each selected Required field must be present. A selected Type- or Fork-dependent field can be absent, because
    // it is absent on the transaction types and blocks that do not have it. See MIP-16 Appendix: Monad Response Schemas.
    const selected = selection === "all" ? Object.keys(schema) : selection;
    const required = selected.filter((n) => schema[n]?.[1] !== "type" && schema[n]?.[1] !== "fork");
    const permitted = selected.filter((n) => !required.includes(n));
    rows.forEach((row, i) => {
      const at = `data.${key}[${i}]`;
      const received = Object.keys(row);
      const missing = required.filter((n) => !received.includes(n));
      const extra = received.filter((n) => !required.includes(n) && !permitted.includes(n));
      if (missing.length || extra.length) problems.push(`${at} has the wrong keys.${keyReport(required, permitted, received)}`);
      for (const [name, value] of Object.entries(row)) {
        const spec = schema[name];
        if (spec && !isValue(spec[0], value)) problems.push(`${at}.${name} is not a valid ${spec[0]}${hasUppercaseHex(value) ? " (hex must be lowercase)" : ""}: ${short(value)}`);
      }
    });
  }
  return problems;
}

/** Describes a key mismatch: the expected keys, the received keys, and the difference. */
function keyReport(required: string[], permitted: string[], received: string[]): string {
  const missing = required.filter((n) => !received.includes(n));
  const extra = received.filter((n) => !required.includes(n) && !permitted.includes(n));
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "(none)");
  return [
    `Expected: ${list(required)}${permitted.length ? `. Can also have: ${list(permitted)}` : ""}.`,
    `Received: ${list(received)}.`,
    `Missing: ${list(missing)}.`,
    `Not expected: ${list(extra)}.`,
  ]
    .map((line) => `\n  ${line}`)
    .join("");
}

export function checkBlockRefs(result: QueryResult): string[] {
  const problems: string[] = [];
  for (const k of ["fromBlock", "toBlock", "cursorBlock"] as const) {
    const ref = result[k];
    if (!ref || !isValue("quantity", ref.number) || !isValue("hash", ref.hash) || !isValue("hash", ref.parentHash)) {
      problems.push(`${k} is not a valid block reference${hasUppercaseHex(ref) ? " (hex must be lowercase)" : ""}: ${JSON.stringify(ref)}`);
    }
  }
  return problems;
}

/** Checks that each data array is sorted by its ordering key in the request direction, without duplicates. */
export function checkOrdering(params: QueryParams, result: QueryResult): string[] {
  const problems: string[] = [];
  const sign = params.order === "desc" ? -1 : 1;
  for (const [type, rows] of Object.entries(result.data ?? {})) {
    const keys = ORDERING_KEYS[type];
    if (!keys || !Array.isArray(rows)) continue;
    // The runner can check the order only when the request selects all fields of the ordering key.
    if (!rows.every((r) => keys.every((k) => k in r))) continue;
    for (let i = 1; i < rows.length; i++) {
      const c = sign * compareObjects(type, rows[i - 1]!, rows[i]!);
      const a = `data.${type}[${i}] (${keyText(keys, rows[i]!)})`;
      const b = `data.${type}[${i - 1}] (${keyText(keys, rows[i - 1]!)})`;
      if (c === 0) problems.push(`${a} has the same ordering key as ${b}, so it is a duplicate`);
      else if (c > 0) problems.push(`${a} is not after ${b} in ${params.order ?? "asc"} order`);
    }
  }
  return problems;
}

/** Checks that each related object is referenced by a primary object and occurs one time. */
export function checkRelations(method: string, result: QueryResult): string[] {
  const problems: string[] = [];
  const { primary, relations } = METHODS[method]!;
  const primaries = result.data?.[primary];
  for (const rel of relations) {
    const rows = result.data?.[rel];
    if (!Array.isArray(rows)) continue;
    const join = JOIN_KEYS[rel]!;
    const ids = rows.map((r) => r[join.related]);
    if (ids.some((id) => id === undefined)) continue;
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      const k = String(id);
      if (seen.has(k)) problems.push(`data.${rel}[${i}] occurs more than one time`);
      seen.add(k);
    });
    // checkFields reports a missing primary array.
    if (!Array.isArray(primaries) || !primaries.every((p) => join.primary in p)) continue;
    const refs = new Set(primaries.map((p) => String(p[join.primary])));
    ids.forEach((id, i) => {
      if (!refs.has(String(id))) problems.push(`data.${rel}[${i}] is not referenced by a primary object`);
    });
    for (const r of refs) {
      if (!seen.has(r)) problems.push(`data.${rel} has no object for the reference ${r}`);
    }
  }
  return problems;
}

/** Checks that cursorBlock is in the range, and each object is in a block from fromBlock through cursorBlock. */
export function checkBlockAlignment(params: QueryParams, result: QueryResult): string[] {
  const problems: string[] = [];
  const desc = params.order === "desc";
  const from = toBigInt(result.fromBlock.number);
  const to = toBigInt(result.toBlock.number);
  const cursor = toBigInt(result.cursorBlock.number);
  const inPage = (n: bigint) => (desc ? n <= from && n >= cursor : n >= from && n <= cursor);
  if (desc ? cursor > from || cursor < to : cursor < from || cursor > to) {
    problems.push(`cursorBlock ${cursor} is not in the range ${from} to ${to}`);
  }
  for (const [type, rows] of Object.entries(result.data ?? {})) {
    if (!Array.isArray(rows)) continue;
    rows.forEach((row, i) => {
      const n = blockNumberOf(type, row);
      if (n !== undefined && !inPage(n)) problems.push(`data.${type}[${i}] is in block ${n}, which is not in the page (${from} to ${cursor})`);
    });
  }
  return problems;
}

/** Checks that the page did not continue after the block that reached target. See MIP-16 Block-aligned pagination. */
export function checkTarget(method: string, params: QueryParams, result: QueryResult): string[] {
  if (params.target === undefined) return [];
  const { primary } = METHODS[method]!;
  const rows = result.data?.[primary] ?? [];
  const numbers = rows.map((r) => blockNumberOf(primary, r));
  if (numbers.some((n) => n === undefined)) return [];
  const cursor = toBigInt(result.cursorBlock.number);
  const before = numbers.filter((n) => n !== cursor).length;
  const target = toBigInt(params.target);
  return BigInt(before) < target
    ? []
    : [`${before} primary objects are before cursorBlock, so the page continued after it reached target ${target}`];
}

/**
 * Calculates the block where a page that starts at `pageFrom` must end because of target. The calculation uses
 * the expected result of the complete range: it counts `target` primary objects from `pageFrom` in the direction
 * of `order`, and gives the block of the last one. If fewer objects remain, the page ends at `toBlock`.
 * Gives undefined if the request has no target, or the fixture does not select the block number of the primary objects.
 */
export function targetCursor(method: string, params: QueryParams, expected: QueryResult, pageFrom: bigint): bigint | undefined {
  if (params.target === undefined) return undefined;
  const { primary } = METHODS[method]!;
  const numbers = (expected.data?.[primary] ?? []).map((r) => blockNumberOf(primary, r));
  if (numbers.some((n) => n === undefined)) return undefined;
  const desc = params.order === "desc";
  const remaining = (numbers as bigint[]).filter((n) => (desc ? n <= pageFrom : n >= pageFrom));
  const target = Number(toBigInt(params.target));
  return remaining.length < target ? toBigInt(expected.toBlock.number) : remaining[target - 1]!;
}

/**
 * Compares the cursorBlock of a page with the block that target gives. A page that ends after that block fails.
 * A page that ends before it is permitted, because the server can reach its budget. Then `onNote` receives a note.
 */
export function checkTargetCursor(
  method: string,
  params: QueryParams,
  expected: QueryResult,
  page: QueryResult,
  onNote?: (note: string) => void,
): string[] {
  const from = toBigInt(page.fromBlock.number);
  const end = targetCursor(method, params, expected, from);
  if (end === undefined) return [];
  const cursor = toBigInt(page.cursorBlock.number);
  const desc = params.order === "desc";
  if (desc ? cursor < end : cursor > end) {
    return [`page from ${from} ended at ${cursor}, but target ${toBigInt(params.target!)} ends it at ${end}`];
  }
  if (cursor !== end) onNote?.(`page from ${from} ended at ${cursor}, before ${end} where target ends it. The server reached its budget, or it did not apply target correctly`);
  return [];
}

/**
 * Checks rules between the values of one trace or transfer. A frame with a non-null error has reverted true.
 * A transfer has a value more than zero and is not a DELEGATECALL or CALLCODE frame. See MIP-16 eth_queryTraces Response
 * and eth_queryTransfers.
 */
export function checkFrames(result: QueryResult): string[] {
  const problems: string[] = [];
  for (const type of ["traces", "transfers"]) {
    const rows = result.data?.[type];
    if (!Array.isArray(rows)) continue;
    rows.forEach((row, i) => {
      if (typeof row.error === "string" && row.reverted === false) problems.push(`data.${type}[${i}] has error ${short(row.error)}, but reverted is false`);
      if (type === "transfers" && row.value === "0x0") problems.push(`data.${type}[${i}] has value 0x0, but a transfer has a value more than zero`);
      if (type === "transfers" && (row.type === "DELEGATECALL" || row.type === "CALLCODE")) problems.push(`data.${type}[${i}] has type ${row.type}, but this frame type does not move value`);
    });
  }
  return problems;
}

/** Does all the checks on one successful page. */
export function checkPage(method: string, params: QueryParams, result: QueryResult): string[] {
  const refs = checkBlockRefs(result);
  if (refs.length) return refs;
  return [
    ...checkFields(method, params, result),
    ...checkOrdering(params, result),
    ...checkRelations(method, result),
    ...checkBlockAlignment(params, result),
    ...checkTarget(method, params, result),
    ...checkFrames(result),
  ];
}

// Pagination. See README Pages and Budget, and MIP-16 Usage Pagination.

/** Gives the fromBlock of the page after cursorBlock. */
export function nextFromBlock(order: Order | undefined, cursorBlock: BlockRef): string {
  const n = toBigInt(cursorBlock.number);
  return toQuantity(order === "desc" ? n - 1n : n + 1n);
}

/** Merges consecutive pages into one result. Related objects that occur on more than one page occur one time. */
export function mergePages(method: string, pages: QueryResult[]): QueryResult {
  const first = pages[0]!;
  const last = pages[pages.length - 1]!;
  const { primary } = METHODS[method]!;
  const data: QueryResult["data"] = {};
  for (const key of Object.keys(first.data)) {
    const rows = pages.flatMap((p) => p.data[key] ?? []);
    const join = key === primary ? undefined : JOIN_KEYS[key];
    if (!join) {
      data[key] = rows;
      continue;
    }
    const seen = new Set<string>();
    data[key] = rows.filter((r) => {
      const id = String(r[join.related]);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  return { data, fromBlock: first.fromBlock, toBlock: first.toBlock, cursorBlock: last.cursorBlock };
}

export type PagedResult = { result: QueryResult; pages: number; problems: string[] };

/** Tells if a block parameter is a tag. An omitted block parameter has a default tag. See MIP-16 Block range. */
export function isTag(block: string | undefined): boolean {
  return block === undefined || !block.startsWith("0x");
}

/** Gives the tag of a block parameter. An omitted parameter has the default tag for its order. See MIP-16 Block range. */
function tagOf(params: QueryParams, k: "fromBlock" | "toBlock"): string | undefined {
  const v = params[k];
  if (v !== undefined) return isTag(v) ? v : undefined;
  const desc = params.order === "desc";
  return (k === "fromBlock") === desc ? "latest" : "earliest";
}

/**
 * Checks how the server resolved fromBlock and toBlock. A block number resolves to the same number. Two equal tags
 * in one request resolve to the same block, because the server resolves tags one time, at query execution time.
 * "earliest" resolves to block 0x0.
 */
export function checkResolvedRange(params: QueryParams, result: QueryResult): string[] {
  const problems: string[] = [];
  for (const k of ["fromBlock", "toBlock"] as const) {
    const requested = params[k];
    if (!isTag(requested) && result[k].number !== requested) problems.push(`${k}.number is ${result[k].number}, but the request has ${requested}`);
    if (tagOf(params, k) === "earliest" && result[k].number !== "0x0") problems.push(`${k} is "earliest", but it resolved to ${result[k].number}, not 0x0`);
  }
  const fromTag = tagOf(params, "fromBlock");
  if (fromTag !== undefined && fromTag === tagOf(params, "toBlock") && result.fromBlock.hash !== result.toBlock.hash) {
    problems.push(`fromBlock and toBlock are both "${fromTag}", but they resolved to different blocks: ${result.fromBlock.number} and ${result.toBlock.number}`);
  }
  return problems;
}

/** The maximum number of pages for one fixture. It stops a server that does not advance. */
export const MAX_PAGES = 1000;

/**
 * Starts from the first page and requests subsequent pages until cursorBlock is toBlock, so that the query is complete.
 * Each subsequent request repeats the params without change, except fromBlock. See MIP-16 Usage Pagination.
 */
export async function collectPages(
  url: string,
  method: string,
  params: QueryParams,
  first: QueryResult,
  onRequest?: OnRequest,
  checkExtra?: (page: QueryResult) => string[],
): Promise<PagedResult> {
  const desc = params.order === "desc";
  const end = toBigInt(first.toBlock.number);
  const pages = [first];
  const problems: string[] = [];
  let page = first;
  while (toBigInt(page.cursorBlock.number) !== end) {
    if (pages.length >= MAX_PAGES) {
      problems.push(`the query is not complete after ${MAX_PAGES} pages`);
      break;
    }
    const at = `page ${pages.length + 1}`;
    // A tag such as "latest" can resolve to a different block on each request. Thus each later page uses the
    // toBlock number that the first page resolved, so that the runner does not follow the chain tip.
    const toBlock = isTag(params.toBlock) ? first.toBlock.number : params.toBlock;
    const nextParams: QueryParams = { ...params, fromBlock: nextFromBlock(params.order, page.cursorBlock), toBlock };
    const res = await query(url, method, nextParams, onRequest);
    if (!res.result) {
      problems.push(`${at} failed with ${describeError(res.error, nextParams)}`);
      break;
    }
    const next = res.result;
    const pageProblems = [...checkPage(method, nextParams, next), ...(checkExtra?.(next) ?? [])];
    problems.push(...pageProblems.map((p) => `${at}: ${p}`));
    if (pageProblems.length) break;
    if (next.fromBlock.number !== nextParams.fromBlock) {
      problems.push(`${at} fromBlock is ${next.fromBlock.number}, not the requested ${nextParams.fromBlock}`);
    }
    if (toBigInt(next.toBlock.number) !== end) {
      problems.push(`${at} toBlock is ${next.toBlock.number}, not ${first.toBlock.number} as on page 1`);
    }
    if (!desc && next.fromBlock.parentHash !== page.cursorBlock.hash) {
      problems.push(`${at} fromBlock.parentHash does not link to the previous cursorBlock.hash`);
    }
    if (desc && page.cursorBlock.parentHash !== next.fromBlock.hash) {
      problems.push(`${at} fromBlock.hash does not link to the previous cursorBlock.parentHash`);
    }
    if (problems.length) break;
    pages.push(next);
    page = next;
  }
  return { result: mergePages(method, pages), pages: pages.length, problems };
}

// Comparison

/** Gives the paths where the actual value is different from the expected value. */
export function diff(expected: unknown, actual: unknown, path = "result", out: string[] = [], limit = 20): string[] {
  if (out.length >= limit) return out;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      const objects = [...expected, ...actual].every((v) => v !== null && typeof v === "object" && !Array.isArray(v));
      out.push(...(objects ? diffLength(expected, actual, path) : [`${path}: ${short(actual)}, expected ${short(expected)}`]));
      return out;
    }
    for (let i = 0; i < expected.length; i++) diff(expected[i], actual[i], `${path}[${i}]`, out, limit);
    return out;
  }
  if (expected !== null && actual !== null && typeof expected === "object" && typeof actual === "object") {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const k of keys) {
      if (!(k in expected)) out.push(`${path}.${k}: not expected`);
      else if (!(k in actual)) out.push(`${path}.${k}: absent`);
      else diff((expected as any)[k], (actual as any)[k], `${path}.${k}`, out, limit);
    }
    return out;
  }
  if (expected !== actual) out.push(`${path}: ${short(actual)}, expected ${short(expected)}`);
  return out;
}

/** Describes a JSON-RPC error and the params of the request that caused it. */
function describeError(error: RpcResponse["error"], params: unknown): string {
  const data = error?.data === undefined ? "" : ` (data: ${short(error.data, 200)})`;
  return `error ${error?.code}: ${error?.message}${data}\n  params: ${short(params, 400)}`;
}

/**
 * Describes arrays of different length. A comparison index by index is not useful, because one extra or missing
 * object moves all subsequent objects. Thus this compares the arrays as sets, and also counts duplicates.
 */
function diffLength(expected: unknown[], actual: unknown[], path: string): string[] {
  const key = stableJson;
  const expectedKeys = new Set(expected.map(key));
  const actualKeys = actual.map(key);
  const distinct = new Set(actualKeys);
  const missing = expected.filter((v) => !distinct.has(key(v)));
  const extra = actual.filter((v, i) => !expectedKeys.has(actualKeys[i]!) && actualKeys.indexOf(actualKeys[i]!) === i);
  const lines = [`${path}: length is ${actual.length}, expected ${expected.length}`];
  if (distinct.size < actual.length) lines.push(`  ${actual.length - distinct.size} objects are duplicates. There are ${distinct.size} distinct objects`);
  if (missing.length) lines.push(`  ${missing.length} expected objects are absent. First: ${short(missing[0], 200)}`);
  if (extra.length) lines.push(`  ${extra.length} distinct objects are not expected. First: ${short(extra[0], 200)}`);
  return [lines.join("\n")];
}

/**
 * Replaces the text of each non-null trace and transfer error with one value, so that the comparison checks only
 * if error is null. MIP-16 does not specify the text, so different correct servers can use different text.
 */
export function maskErrorText(result: QueryResult): QueryResult {
  const data: QueryResult["data"] = { ...result.data };
  for (const type of ["traces", "transfers"]) {
    const rows = data[type];
    if (Array.isArray(rows)) data[type] = rows.map((r) => (typeof r.error === "string" ? { ...r, error: "(error text is not compared)" } : r));
  }
  return { ...result, data };
}

/** Gives JSON with sorted object keys, so that two equal objects give the same text. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v !== null && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as any)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Gives a short JSON form of a value for a problem message. A long value is cut, and its length is shown. */
function short(v: unknown, max = 80): string {
  const s = JSON.stringify(v) ?? String(v);
  return s.length <= max ? s : `${s.slice(0, max - 14)}… (${s.length} chars)`;
}

// Problem summary

/**
 * Makes a long list of problems short. Problems that are the same except for array indexes become one line,
 * with the number of times and the first example. After `limit` lines, one line gives the number of other problems.
 */
export function summarizeProblems(problems: string[], limit = 20): string[] {
  const groups = new Map<string, { first: string; count: number }>();
  for (const p of problems) {
    const key = p.replace(/\[\d+\]/g, "[*]");
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { first: p, count: 1 });
  }
  const lines = [...groups.entries()].map(([key, g]) => {
    if (g.count === 1) return g.first;
    const [head, ...rest] = key.split("\n");
    return [`${head} (${g.count} times, first: ${g.first.match(/\S+/)?.[0]})`, ...rest].join("\n");
  });
  return lines.length <= limit ? lines : [...lines.slice(0, limit), `... and ${lines.length - limit} more kinds of problems`];
}

// Fixtures

export type Outcome = { status: "passed" | "failed"; problems: string[]; pages?: number };

/**
 * Runs one fixture: sends the request, does the checks, requests pages until the query is complete, and compares.
 * `onRequest` receives the duration of each fetch request, in the order of the requests.
 * `onNote` receives information that is not a failure, such as a page that ended early.
 */
export async function runFixture(
  url: string,
  fixture: Fixture,
  onRequest?: (timing: RequestTiming) => void,
  onNote?: (note: string) => void,
): Promise<Outcome> {
  const { request, response: expected } = fixture;
  let count = 0;
  const report: OnRequest = (t) => onRequest?.({ request: ++count, ...t });
  try {
    return await runChecked(url, fixture, report, onNote);
  } catch (e) {
    return { status: "failed", problems: [`request ${count}: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

async function runChecked(url: string, fixture: Fixture, report: OnRequest, onNote?: (note: string) => void): Promise<Outcome> {
  const { request, response: expected } = fixture;
  const actual = await send(url, request, report);
  const envelope = checkEnvelope(request, actual);
  if (envelope.length) return { status: "failed", problems: envelope };

  if (expected.error) {
    if (!actual.error) return { status: "failed", problems: [`expected error ${expected.error.code}, but got a result`] };
    if (actual.error.code !== expected.error.code) {
      return { status: "failed", problems: [`error.code is ${actual.error.code}, expected ${expected.error.code}. ${describeError(actual.error, (request.params as unknown[])?.[0])}`] };
    }
    return { status: "passed", problems: [] };
  }

  if (actual.error) return { status: "failed", problems: [describeError(actual.error, (request.params as unknown[])[0])] };

  const method = request.method;
  const params = (request.params as QueryParams[])[0]!;
  const first = actual.result!;
  const checkTargetPage = (page: QueryResult) => (expected.result ? checkTargetCursor(method, params, expected.result, page, onNote) : []);
  const problems = [...checkPage(method, params, first), ...checkResolvedRange(params, first), ...checkTargetPage(first)];
  if (problems.length) return { status: "failed", problems };

  const paged = await collectPages(url, method, params, first, report, checkTargetPage);
  if (paged.problems.length) return { status: "failed", problems: paged.problems, pages: paged.pages };

  // A fixture without an expected result tests a request that depends on the server state, such as a tag.
  // The request must succeed and pass all checks, but the runner does not compare the result.
  if (!expected.result) return { status: "passed", problems: [], pages: paged.pages };

  const differences = diff(maskErrorText(expected.result), maskErrorText(paged.result));
  return { status: differences.length ? "failed" : "passed", problems: differences, pages: paged.pages };
}
