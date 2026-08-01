import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Party Roadmap Game | High Speed Voice & Board Game",
  description: "Play voice pronunciation challenges in Hausa, Igbo, Yoruba & world languages with WhatsApp room sharing!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen selection:bg-partyPink selection:text-white">
        {children}
      </body>
    </html>
  );
}
