import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Space_Mono, Noto_Sans_KR, Rajdhani, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./squid-menu.css";

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono-sq",
  display: "swap",
});

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-korean",
  display: "swap",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "SQUID GAME",
    template: "%s | SQUID GAME",
  },
  description: "Squid Game Arcade — Survive. Or don't.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${spaceMono.variable} ${notoSansKR.variable} ${rajdhani.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-black text-white antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}