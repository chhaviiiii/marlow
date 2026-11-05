import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { handleMcp, publicOrigin, type BuyerDesk } from "./mcp.ts";

const calls: unknown[][] = [];
const desk: BuyerDesk = {
  async search(query) {
    calls.push(["search", query]);
    return [{ id: "desk-walnut", price: 840 }];
  },
  async requestQuote(mandate, pieceId, origin) {
    calls.push(["quote", mandate, pieceId, origin]);
    return mandate === "bad"
      ? { refused: true, body: { status: "refused", reason: "No." } }
      : { refused: false, body: { status: "awaiting_buyer_approval" } };
  },
  orderStatus(orderId) {
    return { refused: false, body: { order_id: orderId } };
  },
};

async function rpc(method: string, params?: unknown) {
  const res = await handleMcp(
    new Request("http://shop.test/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        host: "shop.test",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    desk,
  );
  assert.equal(res.status, 200);
  return (await res.json()) as {
    result: {
      serverInfo: { name: string };
      capabilities: { tools?: object };
      tools: { name: string }[];
      isError?: boolean;
      content: { text: string }[];
    };
    error?: { code: number };
  };
}

test("initialize answers with the tools capability and no session", async () => {
  const { result } = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });
  assert.equal(result.serverInfo.name, "marlow");
  assert.ok(result.capabilities.tools);
});

test("the agent gets three tools, and none of them moves money", async () => {
  const { result } = await rpc("tools/list");
  const names = result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ["get_order_status", "request_quote", "search_catalog"]);
});

test("an unknown tool such as authorize does not exist", async () => {
  const { result, error } = await rpc("tools/call", { name: "authorize_deposit", arguments: {} });
  assert.ok(error || result.isError);
});

test("request_quote passes the mandate through and reports a refusal as an error", async () => {
  const ok = await rpc("tools/call", { name: "request_quote", arguments: { mandate: "good", piece_id: "desk-walnut" } });
  assert.equal(ok.result.isError, false);
  assert.deepEqual(calls.at(-1), ["quote", "good", "desk-walnut", "http://shop.test"]);
  const no = await rpc("tools/call", { name: "request_quote", arguments: { mandate: "bad", piece_id: "desk-walnut" } });
  assert.equal(no.result.isError, true);
  assert.match(no.result.content[0].text, /refused/);
});

test("request_quote without a mandate is refused by the schema", async () => {
  const { result, error } = await rpc("tools/call", { name: "request_quote", arguments: { piece_id: "desk-walnut" } });
  assert.ok(error || result.isError);
});

test("the approval link uses the public host behind a proxy", () => {
  const request = new Request("http://10.0.0.1:10000/api/mcp", {
    headers: { "x-forwarded-host": "marlow.example", "x-forwarded-proto": "https" },
  });
  assert.equal(publicOrigin(request), "https://marlow.example");
});

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.test\.ts$/.test(entry.name) ? [] : [path];
  });
}

test("the shop never imports the buyer side and holds no private key", async () => {
  const { DEMO_BUYERS } = await import("../buyer/demo-private-keys.mjs");
  const privateKeys = Object.values(DEMO_BUYERS).map((buyer) => (buyer as { jwk: { d: string } }).jwk.d);
  for (const path of [...sources("src/server"), ...sources("src/app/api")]) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /demo-private-keys|sign-mandate|@\/buyer|\.\.\/buyer/, path);
    for (const key of privateKeys) assert.equal(text.includes(key), false, path);
  }
});
