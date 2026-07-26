import type { Metadata } from "next";
import BlenderStudio from "./BlenderStudio";

export const metadata: Metadata = {
  title: "Blendroom — 3D Fruit Blender",
  description:
    "A playful 3D kitchen where you blend fruit, serve it, then tip the crystal cup and simulate the smoothie spreading across the counter.",
};

export default function Home() {
  return <BlenderStudio />;
}
