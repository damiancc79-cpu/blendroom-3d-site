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
  metadataBase: new URL(
    "https://blendroom-3d-kitchen.damiancc79.chatgpt.site",
  ),
  title: "Blendroom — 3D Fruit Blender",
  description:
    "Blend fresh fruit, pour into a crystal cup, then tip it onto the counter and watch a particle-based fluid spill spread and drip.",
  openGraph: {
    title: "Blendroom — 3D Fruit Blender",
    description:
      "Blend, pour, then spill a fully simulated smoothie across the counter.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "A tipped crystal cup spilling a smoothie into a glossy puddle across a warm kitchen counter",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blendroom — 3D Fruit Blender",
    description:
      "Blend, pour, then spill a fully simulated smoothie across the counter.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
