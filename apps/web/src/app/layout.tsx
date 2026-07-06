import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
