import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Divide la cuenta",
  description: "Divide una cuenta y cobra a cada quien con CoDi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
