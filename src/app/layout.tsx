import type { Metadata, Viewport } from "next";
import "./globals.css";
import StarfieldCanvas from "@/components/StarfieldCanvas";
import AuthWarmup from "@/components/AuthWarmup";

export const metadata: Metadata = {
  title: "Voice Party Arcade | High-Speed Voice & 3D Board Game",
  description: "Multiplayer voice party game, 3D roadmap board, AI host dares & karaoke arcade!",
  manifest: "/manifest.json",
  // Without this every page load asks for /favicon.ico, gets a 404, and the
  // browser tab falls back to a blank sheet — the PWA icons were already here,
  // nothing was pointing the tab at them.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Voice Party",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch zoom stays available. Locking it is a WCAG 1.4.4 failure, and this is
  // a game full of small type that people play on phones.
  themeColor: "#0d1117",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen overflow-x-hidden selection:bg-partyPink selection:text-white bg-[#0d1117]">
        <StarfieldCanvas />
        <AuthWarmup />
        {children}
      </body>
    </html>
  );
}
