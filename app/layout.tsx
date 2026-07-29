import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const display = Cinzel({ variable: "--font-display", subsets: ["latin"] });
const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "STRONGLY — Make your week strong",
  description: "A fantasy quest system for stronger weeks, meaningful goals, and visible momentum.",
  metadataBase: new URL("https://strongly.site"),
  openGraph: { title: "STRONGLY", description: "Make your week strong.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "STRONGLY", description: "Make your week strong.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${sans.variable}`}>{children}</body></html>;
}
