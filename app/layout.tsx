import type { Metadata, Viewport } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
});

const text = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-text",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "How Well Do You Know Me?",
  description: "A host-paced family game. Phones are for answers. The TV is for the reveal.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${text.variable} font-text antialiased`}>{children}</body>
    </html>
  );
}
