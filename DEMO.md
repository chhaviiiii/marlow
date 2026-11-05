# Video script (under 3 minutes)

Target length: **2:45**. Record the screen with your voice. No music.

## Before you record

1. Put `OPENAI_API_KEY` in `.env.local` so the top bar reads **AI · gpt-4o-mini** and agent replies carry the **AI** badge.
2. Run the production build so no developer badges appear:
   ```bash
   npm run build && npm start
   ```
3. Open http://localhost:3000 in a clean browser window, about 1440 × 900. Hide bookmarks. Zoom 100%.
4. Click **Reset the week**.
5. Have your **PayPal sandbox personal account** email and password ready (developer.paypal.com → Testing Tools → Sandbox Accounts). Do a full practice run once, then reset.
6. Close anything that shows notifications.

---

## 0:00 to 0:15 · The problem

**Screen:** the Agent page, "Who is buying today?"

**Say:**
> AI agents are starting to shop for people. When one shows up at a small business, the owner needs three answers before money moves: who is this agent, did a person agree to this purchase, and what is the price. Marlow answers all three, and PayPal moves the money.

## 0:15 to 0:30 · What Marlow is

**Screen:** point at the three "Run a sale" cards, the three "Try to get past it" cards, then the "How a sale works" panel on the right.

**Say:**
> This is Marlow, the shop agent for Field & Grain, a furniture workshop in Austin. Its buyers are agents. Policy sets every price, the model just repeats it. And PayPal only opens for a registered agent with a signed mandate.

## 0:30 to 0:55 · Try to get past it

**Do:** click **Unregistered agent**. Let the chips finish. Then click **Over budget**, then **Card number**.

**Say:**
> First, an agent the shop doesn't know. Marlow checks the catalog, the market, the floor, and the price, then the mandate check turns red, and PayPal stays closed. Next, Northwind is registered, but it wants a $2,400 table with a $2,000 ceiling. The mandate passes, policy holds the price, and PayPal stays closed again. Last, someone pastes a card number. It's masked before it reaches the log, and refused.

## 0:55 to 1:25 · A real buyer, in plain words

**Do:** type this into the box and press Send:

> Hi, I'm Juniper's agent. She needs a walnut writing desk in Austin before Friday, and won't go over 880.

Let the chips finish. Click **Details** once to open the checks, then close it.

**Say:**
> Now Juniper's agent asks in plain English. The model turns that into a request and calls the shop's tools: catalog search, market comps, the workshop floor, the pricing policy, and the mandate. Every live check is green, and anything on sample data shows grey. The desk is $840, so the deposit is $336, and Juniper's mandate is signed for a ceiling of $880, with no card on file.

## 1:25 to 1:50 · PayPal holds the deposit

**Do:** click the blue **PayPal** button. Sign in with the sandbox buyer and approve. Wait for **Held**.

**Say:**
> The buyer approves in PayPal. This is an authorization: PayPal holds $336 and charges nothing yet. Marlow also sends a PayPal invoice for the $504 balance, due on delivery.

## 1:50 to 2:10 · Money moves the schedule

**Do:** click **The floor moved** (or the Floor tab).

**Say:**
> Here's why the hold matters. On Thursday the mill was held for a stool nobody paid for. The moment PayPal authorized, that hold was released, and the desk took the mill, the finish bench, and Friday's van. The shop only spends time that PayPal is backing.

## 2:10 to 2:25 · Capture and refund

**Do:** back to **Agent**. Click **Capture $336.00 · van loaded**, then **Refund $80 for a scuff**. The tracker lands on **Settled**.

**Say:**
> When the van is loaded, Marlow captures the deposit. The desk picked up a scuff, so $80 goes back through the same PayPal payment. Every step has a PayPal id.

## 2:25 to 2:40 · The books

**Do:** open **Books**. In the AI assistant, click **Refunds** or type "Which orders have a refund?"

**Say:**
> The books are the same PayPal ledger, in an AG Studio dashboard. The owner can just ask: which orders have a refund?

## 2:40 to 2:50 · Close

**Screen:** back to the Agent page.

**Say:**
> Agents can buy. The merchant keeps control of the price, the buyer, and the schedule. PayPal moves the money. This is Marlow.

Stop recording. Trim to under 3:00.

---

## If something goes wrong on camera

- The PayPal popup asks for a login you don't have: use the sandbox **personal** account. The business account belongs to the shop and cannot pay itself.
- The model answers oddly: click the **Full sale** card (or the **Full sale: walnut desk** chip) instead of typing. It runs the same tools.
- Anything else: **Reset the week** and start that section again. Cut it together in editing.

## Upload

YouTube → Visibility **Public**. Title: *Marlow: the shop agent for agent buyers (PayPal AI Hackathon)*. Paste the link into the Devpost form and the README.
