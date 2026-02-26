import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const openAISans = localFont({
  src: [
    {
      path: "../fonts/OpenAISans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/OpenAISans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/OpenAISans-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/OpenAISans-RegularItalic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-body",
  display: "swap",
});

const openAISansDisplay = localFont({
  src: [
    {
      path: "../fonts/OpenAISans-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/OpenAISans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Omicron",
  description: "Omicron consumer onboarding and assistant workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${openAISans.className} ${openAISans.variable} ${openAISansDisplay.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
