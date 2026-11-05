import type { Metadata } from "next";
import { SetupForm } from "@/components/setup-form";

export const metadata: Metadata = { title: "Set up a shop · Marlow" };

export default function SetupPage() {
  return <SetupForm />;
}
