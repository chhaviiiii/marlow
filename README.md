# Marlow

Marlow is a shop agent for merchants whose buyers are AI agents. Shop policy sets the price, a signed mandate admits the buyer, and PayPal holds the deposit.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

- **Demo video:** _add the YouTube link here_
- **Live demo:** https://marlow-ixup.onrender.com (PayPal sandbox), or run it locally in two minutes (below)

![A refused agent and an admitted one, with the PayPal deposit ready to approve](docs/screenshots/agent-quote.png)

## The problem

AI agents are starting to shop for people. When one arrives at a small business, the owner needs three answers before any money moves:

1. Who is this agent, and does the shop know it?
2. Did a person agree to this purchase, for this item, city, and budget?
3. What is the price? It has to come from the shop, because a model that can change a price can be talked into a discount.

Marlow checks all three and shows each check on screen. PayPal then handles the money: it authorizes and holds the deposit, the shop captures it when the piece ships, and any refund goes back through PayPal. The workshop schedule changes only after PayPal holds the deposit.

The demo merchant is Field & Grain, a fictional furniture workshop in Austin. Its buyer agents are Juniper, Northwind, and Atelier.

## Try it in two minutes

You need Node 22.

```bash
git clone https://github.com/chhaviiiii/marlow.git
cd marlow
npm install
npm run dev
```

Open http://localhost:3000.

The Agent page opens with six demo options:

| Option | What it shows |
| --- | --- |
| Full sale: walnut writing desk for Juniper | The checks pass, PayPal holds a $336 deposit, the floor moves, then capture and refund |
| Second buyer: elm bench for Atelier | The same rules for a different agent and piece, with a $288 deposit |
| Browse: anything in white oak? | A plain question returns four pieces and their prices. No payment |
| Unregistered agent | Drift asks for the desk. The mandate check refuses it and PayPal stays closed |
| Over budget | Northwind wants the $2,400 dining table with a $2,000 ceiling. Policy holds the price and PayPal stays closed |
| Card number | A pasted card number is masked and refused |

1. Try the three guardrails first and watch the red checks.
2. Click **Full sale**. The checks pass and the PayPal card shows a $336 deposit. Channel3 and Kernel show grey chips until their keys are set, because they ran on sample data.
3. Hold, capture, and refund the deposit from the card. Open **Floor** to see the desk take Thursday's mill, and **Books** to see the ledger.

With no keys, PayPal calls run in rehearsal mode with `RH-` ids, so anyone can clone the repo and click through the whole flow offline. Add sandbox keys and the same buttons call the PayPal sandbox:

```bash
cp .env.example .env.local
# PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, NEXT_PUBLIC_PAYPAL_CLIENT_ID from
# https://developer.paypal.com/dashboard/applications/sandbox
# OPENAI_API_KEY to let the model choose the tools
npm run dev
```

In sandbox mode the quote shows PayPal's own button. Approve it with a sandbox personal account from Testing Tools → Sandbox Accounts. The shop's own account cannot pay itself.

## How PayPal is used

PayPal is the only payment method. Amounts are set on the server, and the browser never sends one. This is how a sale runs:

```mermaid
sequenceDiagram
    participant B as Buyer agent
    participant M as Marlow
    participant P as Policy
    participant G as Mandate check
    participant PP as PayPal
    participant F as Floor
    B->>M: "Walnut desk for Juniper, Austin, before Friday, ceiling $880"
    M->>M: Catalog search, market comps, floor, listing check
    M->>P: Price the piece
    P-->>M: $840, deposit $336 (40%), margin 44%
    M->>G: Is Juniper registered? Is the mandate signed?
    G-->>M: Admitted, mandate mdt_…, no card number
    M->>PP: Orders v2 create, intent AUTHORIZE, $336
    B->>PP: Approves in PayPal
    PP-->>M: Authorized
    M->>F: Release the unpaid stool, commit the desk
    M->>PP: Invoice the $504 balance
    Note over M,PP: When the van is loaded
    M->>PP: Capture $336
    M->>PP: Refund $80 for a scuff
```

The PayPal calls are:

| PayPal capability | Where it happens |
| --- | --- |
| Orders v2 `createOrder`, intent `AUTHORIZE` | The deposit, for the amount policy signed |
| JS SDK button (`@paypal/react-paypal-js`) | Buyer approval on the quote card |
| Orders v2 `authorizeOrder` | Holds the deposit. On the walnut desk this also changes the floor |
| Payments v2 `captureAuthorizedPayment` | Capture when the piece ships |
| Payments v2 `refundCapturedPayment` | Partial refund against the capture |
| Invoicing v2 `POST /v2/invoicing/invoices` | The balance, due on delivery |

The hold commits the buyer while the shop builds the piece. Capture waits for shipping, and refunds go back through the same PayPal payment. On the walnut desk, the authorization also releases the unpaid hold on Thursday's mill.

The server calls use the official PayPal Server SDK (`@paypal/paypal-server-sdk`), which is generated by APIMatic. `src/server/paypal/context.ts` lists the PayPal methods the agent may call, and those are loaded into its instructions at decision time.

Two checks run before PayPal opens:

- Mandate: an agent that cannot prove who it is, or that a person agreed, never reaches PayPal. The mandate is an HMAC over the agent, ceiling, city, and deadline, so changing any of them breaks it (`src/server/agent-pay.test.ts`).
- Card numbers: agents should present a token bound to a mandate. A raw card number is masked before it reaches the log, and the sale stops.

Every step the agent took shows as a chip under its answer, green or red, or grey for sample data, with the detail one click away.

## How AI is used

- Shop agent (`src/server/clerk.ts`). The Vercel AI SDK runs `gpt-4o-mini` with five tools: take a request, search the catalog, authorize, capture, and refund. The model reads a request in plain words, restates it, and chooses tools. It cannot change a price. Prices come from a plain function, tested in `src/lib/policy.test.ts`, and the PayPal tools only accept a quote that policy signed. Messages written by the model carry an AI badge.
- Books agent (`src/app/api/studio/turn`). AG Studio's AI assistant answers questions about the PayPal ledger and redraws the dashboard on request.
- Without a key, both agents fall back to the same tools driven by the shop's rules, so a judge can run everything with zero setup. The top bar shows which one is answering: `AI · gpt-4o-mini` or `AI · rules only`.

## Sponsor tools

| Tool | What it does here | Where |
| --- | --- | --- |
| PayPal | Orders, authorizations, captures, refunds, invoices, JS SDK button | `src/server/paypal/`, `src/components/paypal-live.tsx` |
| APIMatic | Generated the PayPal Server SDK. The PayPal method list is loaded into the agent at decision time | `src/server/paypal/context.ts` |
| AG Grid (AG Studio) | The Books page: an AI-editable dashboard over the PayPal ledger | `src/components/books-studio.tsx` |
| Bryntum Scheduler | The Floor page: a PayPal authorization changes the week's schedule | `src/components/floor-scheduler.tsx` |
| Channel3 | Market comps for the quote. Live with `CHANNEL3_API_KEY`, fixture otherwise | `src/server/channel3.ts` |
| Elastic | Catalog search. Elasticsearch with `ELASTIC_URL` (`docker compose up`), embedded scoring otherwise | `src/server/elastic.ts` |
| Kernel | Opens the top comparable listing in a cloud browser before the quote goes out, with `KERNEL_API_KEY` | `src/server/kernel.ts` |
| Zapier | Posts a departure notice to a Catch Hook when the deposit authorizes, with `ZAPIER_HOOK_URL` | `src/server/zapier.ts` |
| Render | Hosts the live demo from the `render.yaml` blueprint. | `render.yaml`, `scripts/sweep.mjs` |
| Postman | A collection for every API route | `postman/marlow.postman_collection.json` |
| Astropods | The agent's deploy spec | `astropods.yml`, `AGENT.md` |

## Screens

| | |
| --- | --- |
| ![Welcome](docs/screenshots/agent-welcome.png) | ![Settled sale](docs/screenshots/agent-settled.png) |
| The agent before a sale | A full sale: held, captured, refunded |
| ![Floor](docs/screenshots/floor.png) | ![Books](docs/screenshots/books.png) |
| Bryntum floor after the PayPal hold | AG Studio books over the PayPal ledger |

## Deploy

Render: New → Blueprint → pick this repo. `render.yaml` creates the web service on the Starter plan (change `plan: starter` to `plan: free` to run it at no cost; free services sleep when idle) and asks for `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, and `OPENAI_API_KEY`. Other tool keys can be added in the service's Environment tab.

Docker: `docker build -t marlow . && docker run -p 3000:3000 --env-file .env.local marlow`

## Project layout

```
src/app/            pages (Agent, Floor, Books, Catalog, Rules) and API routes
src/components/     the agent desk, PayPal button, scheduler, AG Studio
src/server/         shop state, AI agent, mandate check, PayPal client, sponsor tools
src/lib/            catalog, pricing policy, shared types
postman/            API collection
docs/screenshots/   README images
```

## Tests

```bash
npm test      # pricing policy and the mandate check
npm run lint
npm run build
```

## Limits of the prototype

- Each browser gets its own shop, held in memory on one server and keyed by a cookie. **Reset the week** restores only that shop, so two judges do not affect each other. A real shop would persist orders.
- The three buyer agents and their signing keys are built in. A real registry would come from the payment network or the merchant's onboarding.
- Field & Grain and its customers are fictional. PayPal runs in the sandbox.

## License

[MIT](LICENSE)
