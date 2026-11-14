import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import { RESTAURANT_NAME } from "@/lib/restaurant";

export const metadata: Metadata = {
  title: "Wingman Dinner · Cobros CoDi",
  description: "Cobra mesas y divide cuentas con CoDi, vía pey",
};

const themeScript = `try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-5">
          <Link href="/" className="text-[17px] font-semibold">
            {RESTAURANT_NAME}
          </Link>
          <ThemeToggle />
        </header>
        {children}
        <footer className="mx-auto w-full max-w-6xl px-5 pb-8 pt-12 text-[13px] text-faint">
          Cobros con CoDi, vía pey
        </footer>
      </body>
    </html>
  );
}
