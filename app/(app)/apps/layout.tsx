import { Fraunces, Space_Grotesk } from "next/font/google";

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const displayFont = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
});

export default function AppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${bodyFont.className} ${displayFont.variable}`}>
      {children}
    </div>
  );
}
