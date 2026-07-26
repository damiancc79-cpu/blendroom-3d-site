import type { Metadata } from "next";
import BlenderStudio from "./BlenderStudio";

export const metadata: Metadata = {
  title: "Blendroom — 3D Fruit Blender",
  description:
    "A playful 3D kitchen where fruit becomes a colorful contained juice vortex inside an editable blender.",
};

export default function Home() {
  return <BlenderStudio />;
}
