"use client";

import { DEMO_BUYERS } from "@/buyer/demo-private-keys.mjs";
import { signMandate } from "@/buyer/sign-mandate.mjs";

export type Signer = keyof typeof DEMO_BUYERS | "";

const CHOICES: Signer[] = ["juniper", "northwind", "atelier"];

/** Plays the buyer's side in the browser. The shop only ever sees the signed result. */
export function signAs(signer: Signer) {
  return signer ? signMandate(DEMO_BUYERS[signer]) : undefined;
}

export function BuyingAs({ value, onChange }: { value: Signer; onChange: (signer: Signer) => void }) {
  return (
    <label className="fine buying-as">
      Buying as{" "}
      <select value={value} onChange={(event) => onChange(event.target.value as Signer)}>
        <option value="">No buyer, no mandate</option>
        {CHOICES.map((id) => {
          const buyer = DEMO_BUYERS[id as keyof typeof DEMO_BUYERS];
          return (
            <option key={id} value={id}>
              {buyer.name}, signs up to ${buyer.ceiling.toLocaleString("en-US")}
            </option>
          );
        })}
      </select>
    </label>
  );
}
