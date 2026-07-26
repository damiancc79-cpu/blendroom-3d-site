import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Blendroom experience and social metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Blendroom — 3D Fruit Blender<\/title>/i);
  assert.match(
    html,
    /<h1[^>]*>Blend what(?:'|&#x27;)s fresh\.<\/h1>/i,
  );
  assert.match(html, /grab fruit, blend it, then drag the glass jug/);
  assert.match(html, /aria-label="Mute motor sound"/);
  assert.match(
    html,
    /aria-label="Clear the current batch and restock the fridge"/,
  );
  assert.match(
    html,
    /Blend until smooth, then drag the glass jug to the crystal cup\./,
  );
  assert.match(
    html,
    /aria-label="Automatically pour the smoothie into the crystal cup"/,
  );
  assert.match(html, /aria-label="Crystal cup fill level"/);
  assert.match(
    html,
    /https:\/\/blendroom-3d-kitchen\.damiancc79\.chatgpt\.site\/og\.png/,
  );
  assert.match(html, /<meta property="og:image:width" content="1200"\/>/);
  assert.match(html, /<meta property="og:image:height" content="630"\/>/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps the contained fluid simulation and preview asset in source", async () => {
  const [studio, layout, image] = await Promise.all([
    readFile(new URL("../app/BlenderStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(studio, /juice:\s*number/);
  assert.match(studio, /poured:\s*number/);
  assert.match(studio, /function JuiceFluid\(/);
  assert.match(studio, /function CrystalCup\(/);
  assert.match(studio, /function PourStream\(/);
  assert.match(studio, /CUP_CAPACITY\s*=\s*5/);
  assert.match(studio, /POUR_RATE\s*=\s*1\.65/);
  assert.match(studio, /setPointerCapture\(event\.pointerId\)/);
  assert.match(studio, /remainingUnits=\{jarUnits\}/);
  assert.match(studio, /frame\.rotation\.z\s*=\s*-tiltRef\.current/);
  assert.match(studio, /function Fridge\(/);
  assert.match(studio, /function freshFridgeFruit\(/);
  assert.match(studio, /Fridge closed\. Five fresh fruits generated inside\./);
  assert.match(studio, /droppedOverJar/);
  assert.match(studio, /currentActiveCount\s*>?=\s*MAX_FRUIT/);
  assert.match(studio, /setFromCoplanarPoints/);
  assert.match(studio, /function BlenderPowerButton\(/);
  assert.match(studio, /className="size-stepper"/);
  assert.match(studio, /aria-label="Decrease blender size"/);
  assert.match(studio, /aria-label="Increase blender size"/);
  assert.match(studio, /MAX_JUICE_PARTICLES\s*=\s*240/);
  assert.match(studio, /function jarInteriorRadius\(/);
  assert.match(studio, /emittedByFruit:\s*Map<number,\s*number>/);
  assert.match(studio, /<instancedMesh/);
  assert.match(studio, /<shaderMaterial/);
  assert.match(studio, /prefers-reduced-motion:\s*reduce/);
  assert.match(layout, /summary_large_image/);
  assert.deepEqual(
    [...image.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
});
