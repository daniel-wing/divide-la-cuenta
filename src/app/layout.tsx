import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import { APP_NAME, RESTAURANT_NAME } from "@/lib/restaurant";

export const metadata: Metadata = {
  title: "Dividí · Cobros con CoDi",
  description: "Cobra mesas y divide cuentas con CoDi, vía pey",
};

const themeScript = `try{var t=localStorage.getItem('theme');var d=t==='dark';document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-5">
          <Link href="/" className="flex items-baseline gap-3">
            <span className="display text-[26px] font-extrabold leading-none text-pagada">{APP_NAME}</span>
            <span className="text-[15px] text-muted">{RESTAURANT_NAME}</span>
          </Link>
          <ThemeToggle />
        </header>
        {children}
        <footer className="mx-auto w-full max-w-6xl px-5 pb-8 pt-12 text-[13px] text-faint">
          Cada quien paga su parte con CoDi. Sin terminal y sin comisión por cobro. Vía pey.
        </footer>
      </body>
    </html>
  );
}
