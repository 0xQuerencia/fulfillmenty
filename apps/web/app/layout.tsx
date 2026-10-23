import type { Metadata } from "next";
import "@fontsource-variable/dancing-script/wght.css";
import "@fontsource-variable/inter/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fulfillmenty — Global Sourcing Dashboard",
  description: "An independent, provenance-first product sourcing catalog and API.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
