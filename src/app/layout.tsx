import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

import { ConvexClientProvider } from "@/components/convex-client-provider";
import { Feedback } from "@/components/feedback";
import { Header } from "@/components/header";

// Open Runde — a rounded variant of Inter (github.com/lauridskern/open-runde),
// self-hosted from src/app/fonts.
const openRunde = localFont({
  variable: "--font-open-runde",
  display: "swap",
  src: [
    { path: "./fonts/OpenRunde-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/OpenRunde-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/OpenRunde-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/OpenRunde-Bold.woff2", weight: "700", style: "normal" },
  ],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fan Forecast",
  description: "Live football prediction leagues powered by TxLINE match data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${openRunde.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ConvexClientProvider>
            <Header />
            {children}
            <Feedback />
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}