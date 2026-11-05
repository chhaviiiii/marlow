import type { Metadata } from "next";
import { Courier_Prime, Libre_Franklin } from "next/font/google";
import { Shell } from "@/components/shell";
import "./globals.css";

const printed = Libre_Franklin({
  variable: "--font-printed",
  subsets: ["latin"],
});

const typed = Courier_Prime({
  variable: "--font-typed",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Marlow: the shop agent for agent buyers",
  description:
    "Marlow sells to AI buyer agents. Policy sets the price, a signed mandate admits the buyer, and PayPal holds the deposit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${printed.variable} ${typed.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
