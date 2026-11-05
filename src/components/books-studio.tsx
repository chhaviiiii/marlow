"use client";

import { AgStudio, AgStudioProvider } from "ag-studio-react";
import {
  AgStudioAiModule,
  createAiHarness,
  studioTheme,
  type AgLlmAdapter,
  type AgLlmResponse,
  type AgReportState,
} from "ag-studio";
import { useMemo } from "react";
import type { ShopSnapshot } from "@/lib/types";

const theme = studioTheme.withParams({
  backgroundColor: "#f3f6ee",
  foregroundColor: "#14201a",
  accentColor: "#003087",
  borderColor: "#b2c4a8",
  borderRadius: 2,
  fontFamily: "var(--font-printed), Arial, sans-serif",
});

const adapter: AgLlmAdapter = {
  executeTurn(request, options) {
    const complete = fetch("/api/studio/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: options?.signal,
    }).then((res) => res.json()) as Promise<AgLlmResponse>;

    return {
      complete,
      stream: {
        async *[Symbol.asyncIterator]() {
          const response = await complete;
          for (const item of response.output ?? []) {
            if (item.type === "message" && item.kind === "output") {
              const text = item.content
                .filter((part) => part.type === "text")
                .map((part) => ("text" in part ? part.text : ""))
                .join("");
              yield { type: "TEXT_MESSAGE_START" as const, messageId: item.id, role: "assistant" as const };
              yield { type: "TEXT_MESSAGE_CONTENT" as const, messageId: item.id, delta: text };
              yield { type: "TEXT_MESSAGE_END" as const, messageId: item.id };
            }
            if (item.type === "function_call") {
              yield { type: "TOOL_CALL_START" as const, toolCallId: item.callId, toolCallName: item.name };
              yield { type: "TOOL_CALL_ARGS" as const, toolCallId: item.callId, delta: item.arguments };
              yield { type: "TOOL_CALL_END" as const, toolCallId: item.callId };
            }
          }
        },
      },
    };
  },
};

function report(): AgReportState {
  return {
    selectedPageId: "week",
    pages: [
      {
        id: "week",
        widgets: {
          agents: {
            type: "bar-chart-grouped",
            dataMapping: {
              categoryKey: [{ id: "orders.agent" }],
              valueKey: [{ id: "orders.gross", aggregation: "sum" }],
            },
            format: { title: { enabled: true, text: "Gross by buyer agent" } },
          },
          status: {
            type: "donut-chart",
            dataMapping: {
              categoryKey: [{ id: "orders.status" }],
              valueKey: [{ id: "orders.gross", aggregation: "sum" }],
            },
            format: { title: { enabled: true, text: "Gross by PayPal status" } },
          },
          book: {
            type: "grid",
            dataMapping: {
              cols: [
                { id: "orders.agent" },
                { id: "orders.piece" },
                { id: "orders.status" },
                { id: "orders.gross", aggregation: "sum" },
                { id: "orders.deposit", aggregation: "sum" },
                { id: "orders.captured", aggregation: "sum" },
                { id: "orders.refunded", aggregation: "sum" },
                { id: "orders.paypalOrderId" },
              ],
            },
            format: { title: { enabled: true, text: "PayPal ledger" } },
          },
        },
        widgetLayout: {
          agents: { xTrack: 0, yTrack: 0, xSpan: 14, ySpan: 14 },
          status: { xTrack: 14, yTrack: 0, xSpan: 10, ySpan: 14 },
          book: { xTrack: 0, yTrack: 14, xSpan: 24, ySpan: 18 },
        },
      },
    ],
  };
}

export default function BooksStudio({ shop }: { shop: ShopSnapshot }) {
  const data = useMemo(
    () => ({
      sources: [
        {
          id: "orders",
          data: shop.ledger.map((row) => ({
            ...row,
            margin: Math.round(row.margin * 1000) / 10,
          })),
        },
      ],
    }),
    [shop.version, shop.ledger],
  );
  const initialState = useMemo(() => report(), []);
  const ai = useMemo(
    () =>
      ({ api }: { api: Parameters<typeof createAiHarness>[0] }) =>
        createAiHarness(api, {
          adapter,
          promptStarters: [
            { label: "Margin by agent", prompt: "Add a chart of margin by buyer agent for this PayPal ledger." },
            { label: "Refunds", prompt: "Which orders have a refund, and how much gross is left?" },
            { label: "What is here", prompt: "What tables and fields does this dashboard have?" },
          ],
          models: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }],
        }),
    [],
  );

  return (
    <AgStudioProvider modules={[AgStudioAiModule]}>
      <div className="books">
        <AgStudio
          data={data}
          initialState={initialState}
          mode="edit"
          theme={theme}
          ai={ai}
          panels={{ edit: { left: ["ai"], right: ["edit"] } }}
        />
      </div>
    </AgStudioProvider>
  );
}
