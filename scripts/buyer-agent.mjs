#!/usr/bin/env node
/**
 * A real outside buyer agent. It holds its own key, signs a mandate, and buys
 * from Marlow over MCP. It shares nothing with the shop but the wire.
 *
 *   MARLOW_URL=http://localhost:3000 node scripts/buyer-agent.mjs
 *   node scripts/buyer-agent.mjs atelier "elm bench"
 *   BUYER_WAIT_SECONDS=0 node scripts/buyer-agent.mjs
 *
 * The keys it uses are the demo keys in src/buyer/demo-private-keys.mjs.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DEMO_BUYERS } from "../src/buyer/demo-private-keys.mjs";
import { signMandate } from "../src/buyer/sign-mandate.mjs";

const url = process.env.MARLOW_URL || "http://localhost:3000";
const [agent = "juniper", query = "walnut writing desk"] = process.argv.slice(2);
const waitSeconds = Number(process.env.BUYER_WAIT_SECONDS ?? 300);

const buyer = DEMO_BUYERS[agent];
if (!buyer) {
  console.error(`Unknown buyer ${agent}. Use one of: ${Object.keys(DEMO_BUYERS).join(", ")}.`);
  process.exit(1);
}

const client = new Client({ name: `${agent}-buyer-agent`, version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", url)));

async function call(name, args) {
  const reply = await client.callTool({ name, arguments: args });
  return { refused: Boolean(reply.isError), body: JSON.parse(reply.content[0].text) };
}

const { tools } = await client.listTools();
console.log(`Connected to ${url}. Tools: ${tools.map((tool) => tool.name).join(", ")}`);

const { body: found } = await call("search_catalog", { query });
const piece = found.pieces[0];
if (!piece) {
  console.error(`Nothing matches "${query}".`);
  process.exit(1);
}
console.log(`Found ${piece.name} (${piece.id}) at $${piece.price}.`);

const mandate = await signMandate(buyer);
console.log(`Signed a mandate as ${buyer.name}: ceiling $${buyer.ceiling}, ${buyer.city}, deliver by ${buyer.deliverBy}.`);

const quote = await call("request_quote", { mandate, piece_id: piece.id });
if (quote.refused) {
  console.log(`Refused: ${quote.body.reason}`);
  process.exit(2);
}
console.log(`Quoted. Deposit $${quote.body.deposit}, balance $${quote.body.balance_on_delivery}, PayPal ${quote.body.paypal_mode}.`);
console.log(`Order ${quote.body.order_id}`);
console.log(`A person must approve this. Send them: ${quote.body.approval_url}`);

const deadline = Date.now() + waitSeconds * 1000;
let status = quote.body;
while (status.status === "awaiting_buyer_approval" && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  status = (await call("get_order_status", { order_id: quote.body.order_id })).body;
}
await client.close();

if (status.status === "deposit_held") {
  console.log(`Approved by a person. PayPal holds the deposit. Authorization ${status.paypal_authorization_id}.`);
} else {
  console.log(`Still ${status.status}. This agent cannot approve its own payment, so it stops here.`);
}
