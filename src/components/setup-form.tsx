"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentLink } from "@/components/agent-link";
import { PayoutLimit } from "@/components/payout-limit";
import {
  MAX_CATALOG_BYTES,
  MAX_ROWS,
  SAMPLE_SHOP,
  type RowProblem,
  type SetupErrors,
} from "@/lib/merchant-sheet";

type Form = typeof SAMPLE_SHOP;
type Created = { id: string; name: string; pieces: number; shopUrl: string; mcpUrl: string; notes: RowProblem[] };

const EMPTY: Form = { name: "", city: "", depositPercent: "40", minMarginPercent: "10", catalog: "" };
const ORDER: (keyof Form)[] = ["name", "city", "catalog", "depositPercent", "minMarginPercent"];

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? <p className="field-error" id={id}>{text}</p> : null;
}

export function SetupForm() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<SetupErrors>({});
  const [created, setCreated] = useState<Created | null>(null);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (created) doneRef.current?.focus();
  }, [created]);

  function set(field: keyof Form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function showErrors(next: SetupErrors) {
    setErrors(next);
    const first = ORDER.find((field) => next[field]);
    if (first) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
  }

  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CATALOG_BYTES) {
      event.target.value = "";
      showErrors({ catalog: `${file.name} is over 1 MB. Nothing was read.` });
      return;
    }
    set("catalog", await file.text());
    setErrors((current) => ({ ...current, catalog: undefined, rows: undefined }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setProblem(null);
    try {
      const res = await fetch("/api/merchants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as Created & { errors?: SetupErrors };
      if (data.errors) showErrors(data.errors);
      else {
        setErrors({});
        setCreated(data);
      }
    } catch {
      setProblem("The server did not answer. Nothing was created. Try again.");
    } finally {
      setWorking(false);
    }
  }

  function startOver() {
    setCreated(null);
    setForm(EMPTY);
  }

  if (created) {
    const origin = new URL(created.shopUrl).origin;
    return (
      <div className="page">
        <header className="top">
          <div>
            <h1 ref={doneRef} tabIndex={-1}>{created.name} is open to agents</h1>
            <p className="lede">
              {created.pieces} {created.pieces === 1 ? "piece" : "pieces"} are on sale. Give the MCP link to an AI agent.
            </p>
          </div>
        </header>
        <div className="shop-sheets">
          <section aria-labelledby="your-shop">
            <h2 id="your-shop" className="sheet-title">Your shop</h2>
            <dl className="receipt">
              <div>
                <dt>Merchant id</dt>
                <dd>{created.id}</dd>
              </div>
              <div>
                <dt>Shop page</dt>
                <dd><Link className="plain-link" href={`/m/${created.id}`}>{created.shopUrl}</Link></dd>
              </div>
            </dl>
            {created.notes.length > 0 && (
              <>
                <h3 className="notes-title">Read these before you share the link</h3>
                <ul className="row-list">
                  {created.notes.map((note) => (
                    <li key={`${note.line}-${note.message}`}>
                      {note.line && <span>Line {note.line}</span>} {note.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <PayoutLimit merchant={created.name} />
            <button className="secondary another" type="button" onClick={startOver}>Set up another shop</button>
          </section>
          <section aria-labelledby="connect" className="shop-connect">
            <h2 id="connect" className="sheet-title">Connect an agent</h2>
            <AgentLink id={created.id} mcpUrl={created.mcpUrl} origin={origin} />
          </section>
        </div>
      </div>
    );
  }

  const describe = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Set up a shop for AI agents</h1>
          <p className="lede">
            Add your catalog and your rules. You get a shop page and an MCP link to hand to an agent. Your policy sets
            every price, and a person approves every deposit.
          </p>
        </div>
      </header>
      <form className="setup" ref={formRef} onSubmit={submit} noValidate>
        <div className="setup-main">
          <div className="field-row">
            <div className="field">
              <label htmlFor="name">Shop name</label>
              <input
                id="name"
                name="name"
                value={form.name}
                maxLength={60}
                autoComplete="organization"
                required
                aria-invalid={Boolean(errors.name)}
                aria-describedby={describe(errors.name && "name-error")}
                onChange={(event) => set("name", event.target.value)}
              />
              <FieldError id="name-error" text={errors.name} />
            </div>
            <div className="field">
              <label htmlFor="city">City</label>
              <input
                id="city"
                name="city"
                value={form.city}
                maxLength={60}
                required
                aria-invalid={Boolean(errors.city)}
                aria-describedby={describe(errors.city && "city-error")}
                onChange={(event) => set("city", event.target.value)}
              />
              <FieldError id="city-error" text={errors.city} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="catalog">Catalog</label>
            <p className="fine" id="catalog-hint">
              Paste rows, or choose a file below. Columns: name, price, cost, lead days. Up to {MAX_ROWS} rows and 1 MB.
              Cost stays private. Agents and the shop page never see it.
            </p>
            <textarea
              id="catalog"
              name="catalog"
              rows={9}
              value={form.catalog}
              spellCheck={false}
              required
              placeholder={SAMPLE_SHOP.catalog}
              aria-invalid={Boolean(errors.catalog)}
              aria-describedby={describe("catalog-hint", errors.catalog && "catalog-error")}
              onChange={(event) => set("catalog", event.target.value)}
            />
            <FieldError id="catalog-error" text={errors.catalog} />
            {errors.rows && (
              <ul className="row-list errors" aria-label="Rows to fix">
                {errors.rows.map((row) => (
                  <li key={`${row.line}-${row.message}`}>
                    {row.line && <span>Line {row.line}</span>} {row.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="file-line">
              <label htmlFor="file">CSV file</label>
              <input ref={fileRef} id="file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={chooseFile} />
            </div>
          </div>
        </div>

        <aside className="setup-side">
          <h2 className="sheet-title">Your policy</h2>
          <div className="field">
            <label htmlFor="depositPercent">Deposit percent</label>
            <p className="fine" id="deposit-hint">PayPal holds this share of the price. From 1 to 100.</p>
            <input
              id="depositPercent"
              name="depositPercent"
              inputMode="decimal"
              value={form.depositPercent}
              required
              aria-invalid={Boolean(errors.depositPercent)}
              aria-describedby={describe("deposit-hint", errors.depositPercent && "deposit-error")}
              onChange={(event) => set("depositPercent", event.target.value)}
            />
            <FieldError id="deposit-error" text={errors.depositPercent} />
          </div>
          <div className="field">
            <label htmlFor="minMarginPercent">Minimum margin percent</label>
            <p className="fine" id="margin-hint">Marlow refuses a sale under this margin. From 0 to 95.</p>
            <input
              id="minMarginPercent"
              name="minMarginPercent"
              inputMode="decimal"
              value={form.minMarginPercent}
              required
              aria-invalid={Boolean(errors.minMarginPercent)}
              aria-describedby={describe("margin-hint", errors.minMarginPercent && "margin-error")}
              onChange={(event) => set("minMarginPercent", event.target.value)}
            />
            <FieldError id="margin-error" text={errors.minMarginPercent} />
          </div>
          <PayoutLimit />
          <div className="setup-actions">
            <button className="primary" type="submit" disabled={working}>
              {working ? "Creating the shop…" : "Create the shop"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setForm(SAMPLE_SHOP);
                setErrors({});
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Fill in a sample shop
            </button>
          </div>
          {problem && <p className="field-error" role="alert">{problem}</p>}
        </aside>
      </form>
    </div>
  );
}
