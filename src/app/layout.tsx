import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wingman Dinner · Cobros CoDi",
  description: "Divide una cuenta y cobra a cada quien con CoDi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
