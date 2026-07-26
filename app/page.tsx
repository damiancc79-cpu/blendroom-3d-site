import type { Metadata } from "next";
import BlenderStudio from "./BlenderStudio";

export const metadata: Metadata = {
  title: "Blendroom — 3D Fruit Blender",
  description:
    "A playful 3D kitchen where you open the fridge, grab fruit, resize the blender, and mix with its physical red button.",
};

export default function Home() {
  return <BlenderStudio />;
}
