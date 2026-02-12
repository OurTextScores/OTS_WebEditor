import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OTS WebEditor",
  description: "OTS WebEditor",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isEmbed = process.env.BUILD_MODE === 'embed' || process.env.NEXT_PUBLIC_BUILD_MODE === 'embed';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Base path for resolving relative URLs when embedded */}
        {isEmbed && <base href="/score-editor/" />}
        {/* Note: MSCORE_SCRIPT_URL is injected at build time via webpack.DefinePlugin in next.config.ts */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
