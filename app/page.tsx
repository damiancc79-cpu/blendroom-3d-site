import type { Metadata } from "next";
import BlenderStudio from "./BlenderStudio";

export const metadata: Metadata = {
  title: "Blendroom — 3D Fruit Blender",
  description:
    "A playful 3D kitchen where you can add fruit, drag it into the jug, resize the blender, and make a smoothie.",
};

export default function Home() {
  return <BlenderStudio />;
}
