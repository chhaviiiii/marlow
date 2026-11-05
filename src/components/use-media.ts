"use client";

import { useSyncExternalStore } from "react";

/** Tracks a media query. The server and the first hydrated paint report false. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
