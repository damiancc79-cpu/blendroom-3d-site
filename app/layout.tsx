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
    "Open the fridge, grab fresh fruit, blend a contained juice vortex, then drag the glass jug to pour into a crystal cup.",
  openGraph: {
    title: "Blendroom — 3D Fruit Blender",
    description:
      "Blend fresh fruit, drag the glass jug, and pour into a crystal cup.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "A glass blender jug pouring a fresh smoothie into a faceted crystal cup in a warm kitchen",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blendroom — 3D Fruit Blender",
    description:
      "Blend fresh fruit, drag the glass jug, and pour into a crystal cup.",
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
