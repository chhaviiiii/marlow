/** The limit in plain words. A page that takes a deposit for a created shop must show it. */
export function PayoutLimit({ merchant }: { merchant?: string }) {
  return (
    <p className="limit">
      <b>PayPal limit.</b> {merchant ?? "Your shop name"} appears on the order, but every deposit goes to Marlow&apos;s
      one sandbox app, not to an account of yours. This is a sandbox. No real money moves.
    </p>
  );
}
