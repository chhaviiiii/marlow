import { NextResponse } from "next/server";
import type { AgLlmRequest, AgLlmResponse } from "ag-studio";
import { usd } from "@/lib/format";
import { DEFAULT_MODEL } from "@/lib/model";
import { getShop } from "@/server/shop";
import { withVisitor } from "@/server/visitor";

export const dynamic = "force-dynamic";

function message(text: string): AgLlmResponse {
  return {
    id: `local-${Date.now()}`,
    createdAt: Date.now(),
    status: "completed",
    output: [
      {
        id: `msg-${Date.now()}`,
        kind: "output",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "text", text, annotations: [] }],
      },
    ],
  };
}

function textOf(item: AgLlmRequest["input"][number]) {
  if (item.type === "message" && "content" in item && Array.isArray(item.content)) {
    return item.content
      .map((part) => (part.type === "text" && "text" in part ? part.text : ""))
      .join("");
  }
  if (item.type === "function_call_output" && "output" in item) return `Tool result: ${item.output}`;
  if (item.type === "function_call" && "name" in item) return `Call ${item.name} ${item.arguments}`;
  return "";
}

function ledgerAnswer(question: string) {
  const rows = getShop().ledger;
  const q = question.toLowerCase();
  const refunds = rows.filter((row) => row.refunded > 0);
  if (/refund/.test(q)) {
    if (!refunds.length) return "No PayPal order in this ledger has a refund.";
    return refunds
      .map((row) => `${row.agent}, ${row.piece}: ${usd(row.refunded)} refunded. Status ${row.status}.`)
      .join(" ");
  }
  if (/margin/.test(q)) {
    return rows
      .map((row) => `${row.piece}: ${(row.margin * 100).toFixed(1)}% margin, ${row.status}.`)
      .join(" ");
  }
  return rows
    .map((row) => `${row.agent}, ${row.piece}, ${row.status}, order ${row.paypalOrderId}.`)
    .join(" ");
}

export const POST = withVisitor(async (request: Request) => {
  const body = (await request.json()) as AgLlmRequest;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const question = (body.input ?? []).map((item) => textOf(item)).filter(Boolean).join("\n");
    return NextResponse.json(message(ledgerAnswer(question)));
  }

  const input: { role: "user" | "assistant"; content: string }[] = [];
  for (const item of body.input ?? []) {
    const text = textOf(item);
    if (!text) continue;
    const role =
      item.type === "message" && "role" in item && item.role === "user" ? "user" : "assistant";
    input.push({ role, content: text });
  }

  const tools = (body.tools ?? []).map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      instructions: body.instructions,
      input,
      tools: tools.length ? tools : undefined,
      tool_choice: body.toolChoice === "none" ? "none" : "auto",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(message(`The books model returned ${res.status}. ${detail.slice(0, 280)}`));
  }

  const json = (await res.json()) as {
    output?: (
      | { type: "message"; content?: { type: string; text?: string }[] }
      | { type: "function_call"; call_id: string; name: string; arguments: string }
      | { type: string }
    )[];
  };
  const output: AgLlmResponse["output"] = [];
  for (const item of json.output ?? []) {
    if (item.type === "message" && "content" in item) {
      const text = (item.content ?? []).map((part) => part.text ?? "").join("");
      if (text) {
        output.push({
          id: `msg-${Date.now()}`,
          kind: "output",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "text", text, annotations: [] }],
        });
      }
    }
    if (item.type === "function_call" && "call_id" in item) {
      output.push({
        id: item.call_id,
        kind: "output",
        type: "function_call",
        callId: item.call_id,
        name: item.name,
        arguments: item.arguments,
        status: "completed",
      });
    }
  }
  if (!output.length) {
    output.push({
      id: `msg-${Date.now()}`,
      kind: "output",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "text", text: "I had nothing to add to the books.", annotations: [] }],
    });
  }

  const response: AgLlmResponse = {
    id: `openai-${Date.now()}`,
    createdAt: Date.now(),
    status: "completed",
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    output,
  };
  return NextResponse.json(response);
});
