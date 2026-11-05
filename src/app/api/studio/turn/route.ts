import { NextResponse } from "next/server";
import type { AgLlmRequest, AgLlmResponse } from "ag-studio";
import { usd } from "@/lib/format";
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

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];
  if (body.instructions) messages.push({ role: "system", content: body.instructions });
  for (const item of body.input ?? []) {
    const text = textOf(item);
    if (!text) continue;
    const role =
      item.type === "message" && "role" in item && item.role === "user" ? "user" : "assistant";
    messages.push({ role, content: text });
  }

  const tools = (body.tools ?? []).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: body.toolChoice === "none" ? "none" : "auto",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(message(`The books model returned ${res.status}. ${detail.slice(0, 280)}`));
  }

  const json = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
    }[];
  };
  const choice = json.choices?.[0]?.message;
  const output: AgLlmResponse["output"] = [];
  if (choice?.content) {
    output.push({
      id: `msg-${Date.now()}`,
      kind: "output",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "text", text: choice.content, annotations: [] }],
    });
  }
  for (const call of choice?.tool_calls ?? []) {
    output.push({
      id: call.id,
      kind: "output",
      type: "function_call",
      callId: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
      status: "completed",
    });
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
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    output,
  };
  return NextResponse.json(response);
});
