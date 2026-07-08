import type { Metadata } from "next";
import { Lora } from "next/font/google";
import "./globals.css";

// Serif podle tištěného jídelního lístku MASI-CO — používá ho TV kompozice.
const lora = Lora({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lora",
  display: "swap"
});

export const metadata: Metadata = {
  title: "MASI-CO TV Studio",
  description: "Interní studio pro denní TV menu smyčky MASI-CO food."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className={lora.variable}>
      <body>{children}</body>
    </html>
  );
}
