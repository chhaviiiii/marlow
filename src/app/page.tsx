import type { Metadata } from "next";
import { Desk } from "@/components/desk";

export const metadata: Metadata = { title: "Agent" };

export default function HomePage() {
  return <Desk />;
}
