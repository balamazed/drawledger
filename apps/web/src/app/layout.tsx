import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "DrawLedger: provably fair draws on MST",
  description: "Run lotteries and allocations that every entrant can verify, with on-chain proof on MST Blockchain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-card">
          <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="font-serif text-lg font-semibold tracking-tight">
              Draw<span className="text-accent">Ledger</span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/how-it-works" className="hidden hover:text-accent sm:inline">How it works</Link>
              <Link href="/verify" className="whitespace-nowrap hover:text-accent">Verify</Link>
              <Link href="/operator" className="btn-primary whitespace-nowrap py-1.5">Run a draw</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 pt-4 text-xs text-muted">
          DrawLedger runs on MST Blockchain. Free-entry draws only. Open source verifier: anyone can check any draw.
        </footer>
      </body>
    </html>
  );
}
