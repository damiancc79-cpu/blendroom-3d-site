import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COUNTER_EDGE_RELEASE_Y,
  COUNTER_FASCIA_Z,
  COUNTER_FRONT_TRIGGER_Z,
  COUNTER_HALF_Z,
  COUNTER_LIP_DURATION,
  COUNTER_TOP_CONTACT_Y,
  COUNTER_TOP_Y,
  SPILL_AIR,
  SPILL_COUNTERTOP,
  SPILL_FASCIA,
  SPILL_LIP,
  SPILL_PARTICLE_RADIUS,
  getSpillLipScale,
  intersectsCounterSlab,
  resolveSpillFrontEdge,
} from "../app/spill-edge-physics.mjs";

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
  assert.match(html, /blend fruit, serve it, then tip the crystal cup/i);
  assert.match(html, /aria-label="Mute motor sound"/);
  assert.match(
    html,
    /aria-label="Clear the current batch and restock the fridge"/,
  );
  assert.match(
    html,
    /Blend, pour, then click the crystal cup and watch fluid physics take over\./,
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

test("keeps the contained and spilled fluid simulations in source", async () => {
  const [studio, edgePhysics, layout, image] = await Promise.all([
    readFile(new URL("../app/BlenderStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/spill-edge-physics.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(studio, /juice:\s*number/);
  assert.match(studio, /poured:\s*number/);
  assert.match(studio, /spilled:\s*number/);
  assert.match(studio, /type SpillMode/);
  assert.match(studio, /function JuiceFluid\(/);
  assert.match(studio, /function CrystalCup\(/);
  assert.match(studio, /function PourStream\(/);
  assert.match(studio, /function CupSpillStream\(/);
  assert.match(studio, /function SpillFluidSimulation\(/);
  assert.match(studio, /function spillHashKey\(/);
  assert.match(studio, /MAX_SPILL_PARTICLES\s*=\s*220/);
  assert.match(edgePhysics, /COUNTER_TOP_Y\s*=\s*0\.035/);
  assert.match(studio, /spilled:\s*fruit\.poured/);
  assert.match(studio, /Spill all smoothie from the crystal cup onto the counter/);
  assert.match(studio, /Smoothie spilled; clear the batch to reset/);
  assert.match(studio, /Click the cup to spill it/);
  assert.match(studio, /spillMode === "spilling"/);
  assert.match(studio, /const maximumSteps\s*=\s*2/);
  assert.match(studio, /sources\.reduce\(/);
  assert.match(studio, /onSettled\(\)/);
  assert.match(studio, /sim\.velocities\[offset \+ 1\]\s*-=\s*8\.2/);
  assert.match(studio, /pushOutCircle\(BLENDER_X/);
  assert.match(edgePhysics, /COUNTER_HALF_Z\s*=\s*2\.46/);
  assert.match(edgePhysics, /COUNTER_FRONT_TRIGGER_Z/);
  assert.match(edgePhysics, /COUNTER_FASCIA_Z/);
  assert.match(edgePhysics, /COUNTER_EDGE_RELEASE_Y/);
  assert.match(studio, /edgeAges:\s*Float32Array/);
  assert.match(edgePhysics, /SPILL_LIP\s*=\s*3/);
  assert.match(edgePhysics, /SPILL_FASCIA\s*=\s*4/);
  assert.match(studio, /resolveSpillFrontEdge\(edgeParticle\)/);
  assert.match(studio, /spillMode === "spilling" && flowRef\.current/);
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

test("keeps spilled particles outside the counter while rolling over its lip", () => {
  const particle = {
    phase: SPILL_COUNTERTOP,
    x: 2.3,
    y: COUNTER_TOP_CONTACT_Y,
    z: COUNTER_FRONT_TRIGGER_Z + 0.001,
    previousZ: COUNTER_FRONT_TRIGGER_Z - 0.02,
    velocityZ: 1,
    edgeAge: 0,
  };
  const topScale = { x: 1.35, y: 0.2, z: 1.35 };
  const lipScale = { x: 1, y: 1, z: 1 };

  assert.ok(
    particle.y - SPILL_PARTICLE_RADIUS * topScale.y > COUNTER_TOP_Y,
  );
  assert.equal(
    intersectsCounterSlab(
      { x: particle.x, y: particle.y, z: 0 },
      topScale,
    ),
    false,
  );
  assert.equal(resolveSpillFrontEdge(particle), true);
  assert.equal(particle.phase, SPILL_LIP);

  for (
    let age = 0;
    age <= COUNTER_LIP_DURATION + 0.0001;
    age += 1 / 120
  ) {
    particle.edgeAge = Math.min(age, COUNTER_LIP_DURATION);
    particle.z -= 0.03;
    particle.y -= 0.01;
    assert.equal(resolveSpillFrontEdge(particle), true);

    const scale =
      particle.phase === SPILL_LIP
        ? getSpillLipScale(particle.edgeAge, lipScale)
        : { x: 0.9, y: 1.5, z: 0.42 };
    assert.equal(
      intersectsCounterSlab(particle, scale),
      false,
      `particle entered the slab at edge age ${particle.edgeAge}`,
    );
  }

  particle.edgeAge = COUNTER_LIP_DURATION;
  assert.equal(resolveSpillFrontEdge(particle), true);
  assert.equal(particle.phase, SPILL_FASCIA);
  assert.equal(particle.z, COUNTER_FASCIA_Z);
  assert.ok(particle.z > COUNTER_HALF_Z);

  particle.y = COUNTER_EDGE_RELEASE_Y - 0.001;
  assert.equal(resolveSpillFrontEdge(particle), true);
  assert.equal(particle.phase, SPILL_AIR);
  assert.ok(particle.z > COUNTER_FASCIA_Z);
  assert.equal(
    intersectsCounterSlab(
      particle,
      { x: 0.78, y: 1.05, z: 0.78 },
    ),
    false,
  );
});
