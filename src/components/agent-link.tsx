"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

type Props = {
  id: string;
  mcpUrl: string;
  origin: string;
};

function CopyBlock({ label, text, id }: { label: string; text: string; id: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="copy-block">
      <div className="copy-head">
        <h3 id={id}>{label}</h3>
        <button className="secondary" type="button" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} Copy
        </button>
      </div>
      <pre>{text}</pre>
      <p className="fine" role="status">
        {copied === true && `${label} copied.`}
        {copied === false && "Your browser blocked the copy. Select the text and copy it yourself."}
      </p>
    </div>
  );
}

/** Everything a merchant hands to an agent. All of it is ids and URLs, never merchant text. */
export function AgentLink({ id, mcpUrl, origin }: Props) {
  const config = JSON.stringify({ mcpServers: { [`marlow-${id}`]: { type: "http", url: mcpUrl } } }, null, 2);
  const test = `MARLOW_URL=${origin} MARLOW_MERCHANT=${id} node scripts/buyer-agent.mjs juniper`;
  return (
    <div className="agent-link">
      <CopyBlock id={`mcp-url-${id}`} label="MCP URL" text={mcpUrl} />
      <CopyBlock id={`mcp-config-${id}`} label="Client config" text={config} />
      <p className="fine">
        Any MCP client can search this shop with no key. To request a quote, an agent signs a mandate with a registered
        key. Today those are the three demo buyers: Juniper, Northwind, and Atelier. This shop accepts all three.
      </p>
      <CopyBlock id={`buyer-test-${id}`} label="Test buy, from a clone of the repo" text={test} />
    </div>
  );
}
