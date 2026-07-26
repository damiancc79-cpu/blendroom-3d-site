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
    "Open the fridge, grab fresh fruit, resize the blender with its arrow controls, and press the red button to mix a contained juice vortex.",
  openGraph: {
    title: "Blendroom — 3D Fruit Blender",
    description:
      "Open the fridge, grab fruit, and press the blender’s red button.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "An open fruit fridge beside a blender mixing a rainbow juice vortex",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blendroom — 3D Fruit Blender",
    description:
      "Open the fridge, grab fruit, and press the blender’s red button.",
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
