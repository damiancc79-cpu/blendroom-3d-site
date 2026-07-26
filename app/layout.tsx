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
    "Add fruit, drag it into the jug, resize your blender, and watch it become swirling juice in a sunlit 3D kitchen.",
  openGraph: {
    title: "Blendroom — 3D Fruit Blender",
    description:
      "Drag in fruit and blend it into a colorful contained juice vortex.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Blendroom blender mixing a rainbow fruit vortex in a warm kitchen",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blendroom — 3D Fruit Blender",
    description:
      "Drag in fruit and blend it into a colorful contained juice vortex.",
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
