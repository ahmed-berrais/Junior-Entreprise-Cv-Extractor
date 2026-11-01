import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Geist_Mono, Figtree } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { HtmlLang } from "@/components/site/html-lang";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// The club font (S1-11). It feeds --font-club in globals.css.
const clubFont = Figtree({
  variable: "--font-club",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CV Extractor · Pristini JE",
  description: "Job fair CV platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${clubFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* The language comes from a cookie (S1-14), so everything that shows text sits inside
            <Suspense> (Cache Components). NextIntlClientProvider passes the texts to client components. */}
        <Suspense fallback={null}>
          <NextIntlClientProvider>
            <HtmlLang />
            <SiteHeader />
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter />
          </NextIntlClientProvider>
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
