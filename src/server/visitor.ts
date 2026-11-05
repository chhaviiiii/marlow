import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";

const COOKIE = "marlow_visitor";
const VALID_ID = /^[0-9a-f-]{36}$/;
const WEEK_SECONDS = 60 * 60 * 24 * 7;

const visitors = new AsyncLocalStorage<string>();

export function currentVisitor() {
  return visitors.getStore() ?? "shared";
}

/** Runs a route handler inside the shop that belongs to this browser. */
export function withVisitor<Args extends unknown[], Result>(handler: (...args: Args) => Promise<Result> | Result) {
  return async (...args: Args) => {
    const jar = await cookies();
    const existing = jar.get(COOKIE)?.value;
    const id = existing && VALID_ID.test(existing) ? existing : randomUUID();
    if (id !== existing) {
      const forwarded = (await headers()).get("x-forwarded-proto");
      jar.set(COOKIE, id, {
        httpOnly: true,
        sameSite: "lax",
        secure: forwarded === "https",
        path: "/",
        maxAge: WEEK_SECONDS,
      });
    }
    return visitors.run(id, () => handler(...args));
  };
}
