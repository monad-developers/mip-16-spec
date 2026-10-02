# MIP-16 Conformance Tests

This suite tests a JSON-RPC server against [MIP-16: JSON-RPC Query Methods](https://github.com/monad-crypto/MIPs/pull/89). It covers these five methods:

- `eth_queryBlocks`
- `eth_queryTransactions`
- `eth_queryLogs`
- `eth_queryTraces`
- `eth_queryTransfers`

All fixture data comes from Monad mainnet (chain ID `143`, `0x8f`).

## Server Differences

MIP-16 lets each server make some decisions. Two correct servers can give different responses to the same request. The runner does not report these differences as failures, except for the availability window.

- **Block tags.** Each server resolves `latest`, `safe`, `finalized`, and `earliest` at query time, so the result is different between servers and between requests. A fixture that uses a tag, or that omits `fromBlock` or `toBlock`, has no expected result. The request must succeed and pass the checks, but the runner does not compare the result. Two equal tags in one request must resolve to the same block, and `earliest` must resolve to block `0x0`. Fixture `200` needs the node to serve block `0x0`.
- **Availability window.** Each node can serve a different range of blocks for each method. For example, a node can keep all blocks but only recent traces. If the server returns `-32001` (resource not found) or `-32004` (method not supported), the fixture fails. To pass all fixtures, the node must serve all the blocks in [Required Block Range](#required-block-range) for all five methods.
- **Error messages.** MIP-16 specifies only the error `code`. The runner compares only `error.code`. It does not compare `error.message` or `error.data`.
- **Budget.** Each server sets its own budget, such as a maximum execution time or response size. When the server reaches its budget, it ends the page at an earlier block. Thus the number of pages for a query is different between servers. The runner requests all pages until the query is complete, and compares the merged result. See [Pages and Budget](#pages-and-budget). The runner cannot cause a server to reach its budget, so this suite does not test the `-32005` (limit exceeded) error.

## Run the Tests

Install [Bun](https://bun.sh). Then run the suite against your server:

```sh
bun install
RPC_URL=http://127.0.0.1:8080 bun test
```

To run the fixtures for one method only, use a name filter:

```sh
RPC_URL=http://127.0.0.1:8080 bun test -t eth_queryLogs
```

The runner sends the fixtures one at a time, in file order.

Each fetch request has a timeout of 30 seconds. When the timeout occurs, the runner stops the request, and the fixture fails. To change the timeout, set `REQUEST_TIMEOUT_MS`:

```sh
RPC_URL=http://127.0.0.1:8080 REQUEST_TIMEOUT_MS=60000 bun test
```

For each fetch request, the runner prints the duration, the `fromBlock` and `toBlock` that it sent, and the result. A fixture that paginates prints one line for each page:

```
035.json request 1 0x2faf088..0x2faf08c: 412 ms (HTTP 200)
035.json request 2 0x2faf089..0x2faf08a: 230 ms (HTTP 200)
```

### Fixture Format

| Field | Type | Description |
| --- | --- | --- |
| `description` | `string` | What the fixture tests. Refer to the MIP-16 section. |
| `request` | `object` | The full JSON-RPC request. The runner sends it without change. |
| `response` | `object` | The expected JSON-RPC response. It contains `result` or `error`. If it contains neither, the request must succeed, but the runner does not compare the result. |

Example:

```json
{
  "description": "Filter USDC Transfer logs by address and topic, and join blocks. See MIP-16 Example.",
  "request": {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_queryLogs",
    "params": [{
      "filter": {
        "address": "0x754704bc059f8c67012fed69bc8a327a5aafb603",
        "topics": ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]
      },
      "fields": {
        "logs": ["blockNumber", "logIndex", "address", "data", "topics"],
        "blocks": ["number", "timestamp"]
      },
      "order": "asc",
      "fromBlock": "0x5e69ec4",
      "toBlock": "0x5e69ecb"
    }]
  },
  "response": {
    "jsonrpc": "2.0",
    "id": 1,
    "result": { "...": "..." }
  }
}
```

## Checks

The runner does these checks in order, and stops at the first stage that fails. The checks are in `utils.ts`.

| Stage | Checks |
| --- | --- |
| Transport | The response arrives before `REQUEST_TIMEOUT_MS` and is JSON. |
| Envelope | `jsonrpc` is `"2.0"`, `id` matches, and the response has `result` or `error`, but not both. |
| Error | An expected error has the same `error.code`. An unexpected error fails. |
| Page | On each page: valid block references, each selected field and no other field, encodings with lowercase hex, sort order without duplicates, relations without duplicates or missing references, objects only in the page's blocks, `reverted` true for each frame with an `error`, a `value` more than zero for each transfer, and no page that ends after the block where `target` ends it. |
| Pagination | Each next page succeeds, starts at the requested `fromBlock`, has the same `toBlock`, and links to the previous page by hash. If `toBlock` is a tag, each next request uses the block number that the first page resolved. |
| Comparison | The merged result is equal to the expected `result`. Key order is not significant. For the `error` of a trace or transfer, only `null` or not `null` is compared, not the text. |

Some page checks need specific fields, such as the fields of the ordering key. If a fixture does not select them, only the comparison finds the problem.

## Pages and Budget

Each fixture contains the result of the complete range. The runner requests pages until `cursorBlock` is `toBlock`, changes only `fromBlock` for each next page, and compares the merged result.

A page can end early because of `target` or because of the server budget. The runner cannot tell which. A page must not end after the block where `target` ends it, but it can end before that block. Then the runner prints a note.

Fixtures `020`–`029` and `035`–`039` paginate because of `target`. Any fixture can paginate because of the budget. A server that ends the page early gets a note, not a failure, because the runner cannot tell this defect from the budget.

## Required Block Range

The fixtures use Monad mainnet blocks 50,000,005 to 50,000,018 (`0x2faf085` to `0x2faf092`). The node must serve this range for all five methods.

## Open Questions

MIP-16 does not yet specify these items. The fixtures do not test them until MIP-16 specifies them.

- **Empty filter arrays.** MIP-16 does not specify the result of a filter such as `"from": []`.
