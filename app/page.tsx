import type { Metadata } from "next";
import BlenderStudio from "./BlenderStudio";

export const metadata: Metadata = {
  title: "Blendroom — 3D Fruit Blender",
  description:
    "A playful 3D kitchen where you grab fruit, blend it, then drag the glass jug to pour a smoothie into a crystal cup.",
};

export default function Home() {
  return <BlenderStudio />;
}
