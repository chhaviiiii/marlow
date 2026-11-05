# Video script (under 3 minutes)

Target length: **2:45**. Record the screen with your voice. No music.

## Before you record

1. Put `OPENAI_API_KEY` and the PayPal sandbox keys in `.env.local`. The top bar then reads **AI · gpt-6.1-terra** and **PayPal sandbox**, and agent replies carry the **AI** badge.
2. Run the production build so no developer badges appear:
   ```bash
   npm run build && npm start
   ```
3. Open http://localhost:3000 in a clean browser window, about 1440 × 900. Hide bookmarks. Zoom 100%.
4. Click **Reset the week**.
5. Have your PayPal sandbox personal account email and password ready (developer.paypal.com → Testing Tools → Sandbox Accounts). Do a full practice run once, then reset.
6. Open a terminal in the repo with a large font, for the MCP step.
7. Close anything that shows notifications.

---

## 0:00 to 0:15 · The problem

**Screen:** the Agent page, "Who is buying today?"

**Say:**
> AI agents are starting to shop for people. A small business needs three answers before money moves: who is this agent, did a person agree, and what is the price. Marlow checks all three, and PayPal handles the money.

## 0:15 to 0:30 · What Marlow is

**Screen:** point at the "Run a sale" rows, the "Try to get past it" rows, then "How a sale works" on the job ticket at the right.

**Say:**
> This is Marlow, the shop agent for Field & Grain, a furniture workshop in Austin. Shop policy sets every price. PayPal opens only for a registered agent with a mandate it signed.

## 0:30 to 0:55 · Try to get past it

**Do:** click **Unregistered agent**. Let the chips finish. Then click the **Over budget** chip, then the **Card number** chip above the Buying as picker.

**Say:**
> First, Drift. It signs with a real key, but the shop never registered that key, so the mandate check turns red and PayPal stays closed. Next, Northwind wants a $2,400 table with a $2,000 ceiling. The mandate passes, policy holds the price, and PayPal stays closed again. Last, someone pastes a card number. Marlow masks it and refuses the sale.

## 0:55 to 1:25 · A real buyer, in plain words

**Do:** under **Buying as**, choose **Juniper, signs up to $880**. If you skip this, the message has no signed mandate and the shop refuses the sale. Then type this into the box and press Send:

> Hi, I'm Juniper's agent. She needs a walnut writing desk in Austin before Friday, and won't go over 880.

Let the chips finish. Click **Details** once to open the checks, then close it.

**Say:**
> Now Juniper's agent asks in plain English and presents a mandate it signed. The model calls the shop's tools: catalog, market comps, the floor, policy, and the mandate. Green checks are live and grey means sample data. The desk is $840, so the deposit is $336, inside Juniper's signed ceiling of $880.

## 1:25 to 1:45 · PayPal holds the deposit

**Do:** click the blue **PayPal** button on the job ticket. Sign in with the sandbox buyer and approve. Wait for **Held**.

**Say:**
> A person approves in PayPal. This is an authorization, so PayPal holds $336 and charges nothing yet. Marlow also invoices the $504 balance, due on delivery.

## 1:45 to 2:00 · The schedule changes

**Do:** click **The floor moved** on the job ticket (or the Floor tab).

**Say:**
> On Thursday the mill was held for a stool nobody paid for. When PayPal held the deposit, Marlow released that hold, and the desk took the mill, the finish bench, and Friday's van.

## 2:00 to 2:10 · Capture and refund

**Do:** back to **Agent**. Click **Capture $336.00 · van loaded**, then **Refund $80 for a scuff**. The tracker lands on **Settled**.

**Say:**
> When the van is loaded, Marlow captures the deposit. A scuff means $80 goes back through the same PayPal payment.

## 2:10 to 2:20 · The books

**Do:** open **Books**. In the AI Assistant, click **Refunds** or type "Which orders have a refund?"

**Say:**
> The books show the same PayPal ledger in an AG Studio dashboard, and the owner can ask which orders have a refund.

## 2:20 to 2:36 · An outside agent buys over MCP

**Do:** in the terminal, run:

```bash
node scripts/buyer-agent.mjs atelier "elm bench"
```

Open the approval link it prints and approve the $288 deposit in PayPal. Back in the terminal, wait for "Approved by a person." Cut the PayPal sign-in from the edit.

**Say:**
> Atelier's agent is a separate program buying over MCP. It signs a mandate and gets a quote, but it has no tool that pays. It sends a link, a person approves in PayPal, and the agent sees the hold.

## 2:36 to 2:45 · Close

**Screen:** back to the Agent page.

**Say:**
> A small shop can sell to AI agents and keep control of its prices, its buyers, and its schedule. PayPal handles the money.

Stop recording. Trim to under 3:00.

---

## If something goes wrong on camera

- The PayPal popup asks for a login you don't have: use the sandbox personal account. The business account belongs to the shop and cannot pay itself.
- The typed sentence is refused with "a name in text proves nothing": choose **Juniper, signs up to $880** under **Buying as**, then send it again.
- The model answers oddly: click the **Full sale** row (or the **Full sale: walnut desk** chip) instead of typing. It runs the same tools.
- Anything else: **Reset the week** and start that section again. Cut it together in editing.

## Upload

YouTube → Visibility **Public**. Title: *Marlow: the shop agent for agent buyers (PayPal AI Hackathon)*. Paste the link into the Devpost form and the README.
