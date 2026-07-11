import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merclo",
  description: "Embeddable AI shopping assistants for Shopify storefronts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject
          attributes like cz-shortcut-listen onto <body>, causing a benign
          server/client attribute mismatch. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
