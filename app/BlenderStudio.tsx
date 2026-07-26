"use client";

import {
  ContactShadows,
  OrbitControls,
  RoundedBox,
  SoftShadows,
} from "@react-three/drei";
import {
  Canvas,
  type ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

type FruitType = "strawberry" | "banana" | "orange" | "blueberry" | "kiwi";

type FruitItem = {
  id: number;
  type: FruitType;
  position: [number, number, number];
  inJar: boolean;
  phase: number;
  juice: number;
};

type FruitDefinition = {
  type: FruitType;
  label: string;
  icon: string;
  color: string;
};

type JuiceSource = {
  id: number;
  type: FruitType;
  color: string;
  phase: number;
  juice: number;
};

const FRUIT: FruitDefinition[] = [
  { type: "strawberry", label: "Strawberry", icon: "🍓", color: "#d94f50" },
  { type: "banana", label: "Banana", icon: "🍌", color: "#f2c84b" },
  { type: "orange", label: "Orange", icon: "🍊", color: "#ef8a35" },
  { type: "blueberry", label: "Blueberry", icon: "🫐", color: "#465f9f" },
  { type: "kiwi", label: "Kiwi", icon: "🥝", color: "#7eaa4a" },
];

const FRUIT_COLORS = Object.fromEntries(
  FRUIT.map((fruit) => [fruit.type, fruit.color]),
) as Record<FruitType, string>;

const BLENDER_X = 0.45;
const MAX_FRUIT = 12;
const MAX_JUICE_PARTICLES = 240;
const JAR_FLUID_BOTTOM = 1.17;
const JAR_FLUID_TOP = 3.02;
const JUICE_PARTICLE_RADIUS = 0.052;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function boardPosition(index: number): [number, number, number] {
  const column = index % 4;
  const row = Math.floor(index / 4) % 3;
  return [-3.45 + column * 0.5, 0.45 + row * 0.015, -0.28 + row * 0.48];
}

function jarPosition(index: number, size: number): [number, number, number] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const angle = index * goldenAngle;
  const radius = (index % 2 === 0 ? 0.18 : 0.34) * size;
  const layer = index % 4;
  return [
    BLENDER_X + Math.cos(angle) * radius,
    (1.38 + layer * 0.36 + Math.floor(index / 8) * 0.08) * size,
    Math.sin(angle) * radius,
  ];
}

function reflowBoard(fruits: FruitItem[]) {
  let boardSlot = 0;
  return fruits.map((fruit) =>
    fruit.inJar
      ? fruit
      : {
          ...fruit,
          position: boardPosition(boardSlot++),
        },
  );
}

function smoothieColor(fruits: FruitItem[]) {
  const inside = fruits.filter((fruit) => fruit.inJar && fruit.juice > 0);
  const totalJuice = inside.reduce((sum, fruit) => sum + fruit.juice, 0);
  if (!totalJuice) return "#e9895c";

  const color = new THREE.Color(0, 0, 0);
  inside.forEach((fruit) =>
    color.add(
      new THREE.Color(FRUIT_COLORS[fruit.type]).multiplyScalar(fruit.juice),
    ),
  );
  color.multiplyScalar(1 / totalJuice);
  color.lerp(new THREE.Color("#f5d6a2"), 0.18);
  return `#${color.getHexString()}`;
}

export default function BlenderStudio() {
  const [fruits, setFruits] = useState<FruitItem[]>([]);
  const [blenderSize, setBlenderSize] = useState(1);
  const [blending, setBlending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [muted, setMuted] = useState(false);
  const [liveMessage, setLiveMessage] = useState(
    "Choose a fruit to begin your blend.",
  );
  const nextId = useRef(1);
  const completionScheduled = useRef(false);
  const reducedMotion = useReducedMotion();
  const insideFruits = fruits.filter((fruit) => fruit.inJar);
  const insideCount = insideFruits.length;
  const onBoardCount = fruits.length - insideCount;
  const blendProgress = insideCount
    ? insideFruits.reduce((sum, fruit) => sum + fruit.juice, 0) / insideCount
    : 0;
  const blendComplete =
    insideCount > 0 && insideFruits.every((fruit) => fruit.juice >= 0.995);
  const color = useMemo(() => smoothieColor(fruits), [fruits]);

  useEffect(() => {
    if (!blending) return;
    completionScheduled.current = false;
    const timer = window.setInterval(() => {
      setFruits((current) => {
        const next = current.map((fruit) =>
          fruit.inJar
            ? { ...fruit, juice: Math.min(1, fruit.juice + 0.018) }
            : fruit,
        );
        const active = next.filter((fruit) => fruit.inJar);
        const complete =
          active.length > 0 && active.every((fruit) => fruit.juice >= 0.995);
        if (complete && !completionScheduled.current) {
          completionScheduled.current = true;
          window.setTimeout(() => {
            setBlending(false);
            setLiveMessage("Smoothie complete. Silky smooth.");
          }, 0);
        }
        return next;
      });
    }, 45);
    return () => window.clearInterval(timer);
  }, [blending]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) setBlending(false);
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", stopWhenHidden);
  }, []);

  useEffect(() => {
    if (!blending || muted) return;

    let context: AudioContext | null = null;
    let oscillators: OscillatorNode[] = [];
    try {
      context = new AudioContext();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 420;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.12);
      filter.connect(gain);
      gain.connect(context.destination);

      [72, 108, 146].forEach((frequency, index) => {
        const oscillator = context!.createOscillator();
        oscillator.type = index === 0 ? "sawtooth" : "sine";
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index * 7;
        oscillator.connect(filter);
        oscillator.start();
        oscillators.push(oscillator);
      });
    } catch {
      context = null;
      oscillators = [];
    }

    return () => {
      if (!context) return;
      oscillators.forEach((oscillator) => {
        try {
          oscillator.stop(context!.currentTime + 0.04);
        } catch {
          // The node may already have stopped.
        }
      });
      window.setTimeout(() => context?.close().catch(() => undefined), 90);
    };
  }, [blending, muted]);

  const addFruit = useCallback(
    (type: FruitType) => {
      if (fruits.length >= MAX_FRUIT) {
        setLiveMessage("The kitchen is full. Start over for a fresh batch.");
        return;
      }
      const id = nextId.current++;
      setFruits((current) => [
        ...current,
        {
          id,
          type,
          position: boardPosition(current.filter((fruit) => !fruit.inJar).length),
          inJar: false,
          phase: id * 1.71,
          juice: 0,
        },
      ]);
      setLiveMessage(
        `${FRUIT.find((fruit) => fruit.type === type)?.label} added. Drag it into the jug.`,
      );
    },
    [fruits.length],
  );

  const dropFruit = useCallback(
    (id: number, position: [number, number, number]) => {
      const radius = 0.7 * blenderSize;
      const radialDistance = Math.hypot(
        position[0] - BLENDER_X,
        position[2],
      );
      const withinOpening =
        radialDistance < radius &&
        position[1] > 2.35 * blenderSize &&
        position[1] < 4.05 * blenderSize;

      setFruits((current) => {
        const insideSlot = current.filter(
          (fruit) => fruit.inJar && fruit.id !== id,
        ).length;
        const next = current.map((fruit) => {
          if (fruit.id !== id) return fruit;
          if (withinOpening) {
            return {
              ...fruit,
              inJar: true,
              position: jarPosition(insideSlot, blenderSize),
            };
          }
          return {
            ...fruit,
            inJar: false,
            position,
          };
        });
        return reflowBoard(next);
      });

      if (withinOpening) {
        setLiveMessage("Fruit dropped in. Ready to whirl.");
      } else {
        setLiveMessage("Fruit returned to the cutting board.");
      }
    },
    [blenderSize],
  );

  const moveBoardFruitToJug = useCallback(() => {
    if (blending) return;
    setFruits((current) => {
      const target = current.find((fruit) => !fruit.inJar);
      if (!target) return current;
      const insideSlot = current.filter((fruit) => fruit.inJar).length;
      const next = current.map((fruit) =>
        fruit.id === target.id
          ? {
              ...fruit,
              inJar: true,
              position: jarPosition(insideSlot, blenderSize),
            }
          : fruit,
      );
      return reflowBoard(next);
    });
    setLiveMessage("One fruit moved into the jug. Ready to whirl.");
  }, [blenderSize, blending]);

  const resizeBlender = useCallback(
    (nextSize: number) => {
      const clamped = Math.min(1.3, Math.max(0.78, nextSize));
      const ratio = clamped / blenderSize;
      setFruits((current) =>
        current.map((fruit) =>
          fruit.inJar
            ? {
                ...fruit,
                position: [
                  BLENDER_X + (fruit.position[0] - BLENDER_X) * ratio,
                  fruit.position[1] * ratio,
                  fruit.position[2] * ratio,
                ],
              }
            : fruit,
        ),
      );
      setBlenderSize(clamped);
      setLiveMessage(`Blender size set to ${clamped.toFixed(2)} times.`);
    },
    [blenderSize],
  );

  const toggleBlend = () => {
    if (!insideCount) {
      setLiveMessage("Drop at least one fruit into the jug first.");
      return;
    }
    setBlending((running) => {
      const next = !running;
      setLiveMessage(next ? "Blending started." : "Blending paused.");
      return next;
    });
  };

  const reset = () => {
    setBlending(false);
    setFruits([]);
    setLiveMessage("Jug cleared. Choose a fruit for a fresh blend.");
  };

  const phaseLabel =
    blendProgress >= 0.98
      ? "Silky smooth"
      : blending && blendProgress > 0.62
        ? "Fluid vortex"
        : blending && blendProgress > 0.24
          ? "Juice releasing"
        : blending
          ? "Crushing fruit"
          : blendProgress > 0.02
            ? "Partly blended"
          : insideCount
            ? "Ready to whirl"
            : "Waiting for fruit";

  return (
    <main className="studio-shell">
      <div
        className={`canvas-wrap ${dragging ? "is-dragging" : ""}`}
        aria-label="Interactive 3D kitchen with a blender"
      >
        <Canvas
          shadows
          dpr={[1, 1.6]}
          camera={{ position: [6.2, 4.5, 8.1], fov: 38, near: 0.1, far: 80 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          fallback={
            <div className="webgl-fallback">
              This 3D kitchen needs WebGL. Try opening it in a current browser.
            </div>
          }
        >
          <Suspense fallback={null}>
            <BlendroomScene
              fruits={fruits}
              blenderSize={blenderSize}
              blending={blending}
              blendProgress={blendProgress}
              smoothieColor={color}
              dragging={dragging}
              reducedMotion={reducedMotion}
              onDragging={setDragging}
              onFruitDrop={dropFruit}
            />
          </Suspense>
        </Canvas>
      </div>

      <section className="brand-card" aria-labelledby="studio-title">
        <div className="eyebrow">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          BLENDROOM
        </div>
        <h1 id="studio-title">Make a little sunshine.</h1>
        <p>Pick fruit, drag it into the jug, then let the kitchen whirl.</p>
        <div className="drag-hint">
          <span aria-hidden="true">↗</span>
          Drag fruit from the walnut board into the glass jug
        </div>
      </section>

      <aside className={`scene-status ${blending ? "is-live" : ""}`}>
        <span className="status-dot" aria-hidden="true" />
        <div>
          <span>{blending ? "Motor running" : "Blender studio"}</span>
          <strong>{phaseLabel}</strong>
        </div>
        <button
          className="sound-button"
          type="button"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? "Turn motor sound on" : "Mute motor sound"}
          title={muted ? "Sound off" : "Sound on"}
        >
          {muted ? "⊘" : "♪"}
        </button>
      </aside>

      <section className="control-deck" aria-label="Blender controls">
        <div className="control-group fruit-control">
          <div className="control-heading">
            <span>1 · Pick fruit</span>
            <span className="count-pill">
              {onBoardCount} on board · {insideCount} in jug
            </span>
          </div>
          <div className="fruit-list">
            {FRUIT.map((fruit) => (
              <button
                key={fruit.type}
                type="button"
                className="fruit-button"
                onClick={() => addFruit(fruit.type)}
                disabled={fruits.length >= MAX_FRUIT}
                style={{ "--fruit-color": fruit.color } as React.CSSProperties}
                aria-label={`Add ${fruit.label}`}
              >
                <span className="fruit-orb" aria-hidden="true">
                  {fruit.icon}
                </span>
                <span>{fruit.label}</span>
                <span className="fruit-plus" aria-hidden="true">
                  +
                </span>
              </button>
            ))}
          </div>
          <div className="fruit-assist-row">
            <span>Drag to the jug</span>
            <button
              type="button"
              onClick={moveBoardFruitToJug}
              disabled={!onBoardCount || blending}
              aria-label="Move one fruit from the board into the jug"
            >
              Put one in jug <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>

        <div className="control-group size-control">
          <div className="control-heading">
            <span>2 · Blender size</span>
            <output htmlFor="blender-size">{blenderSize.toFixed(2)}×</output>
          </div>
          <input
            id="blender-size"
            type="range"
            min="0.78"
            max="1.3"
            step="0.01"
            value={blenderSize}
            onChange={(event) => resizeBlender(Number(event.target.value))}
            aria-label="Blender size"
            aria-valuetext={`${blenderSize.toFixed(2)} times normal size`}
          />
          <div className="size-presets" aria-label="Blender size presets">
            <button
              type="button"
              onClick={() => resizeBlender(0.8)}
              aria-pressed={blenderSize < 0.9}
              className={blenderSize < 0.9 ? "is-active" : ""}
            >
              Mini
            </button>
            <button
              type="button"
              onClick={() => resizeBlender(1)}
              aria-pressed={blenderSize >= 0.9 && blenderSize < 1.15}
              className={
                blenderSize >= 0.9 && blenderSize < 1.15 ? "is-active" : ""
              }
            >
              Everyday
            </button>
            <button
              type="button"
              onClick={() => resizeBlender(1.28)}
              aria-pressed={blenderSize >= 1.15}
              className={blenderSize >= 1.15 ? "is-active" : ""}
            >
              Big batch
            </button>
          </div>
        </div>

        <div className="control-group action-control">
          <div className="blend-readout">
            <span>{phaseLabel}</span>
            <span>{Math.round(blendProgress * 100)}%</span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${blendProgress * 100}%`, background: color }} />
          </div>
          <div className="action-row">
            <button
              type="button"
              className={`blend-button ${blending ? "is-running" : ""}`}
              onClick={toggleBlend}
              disabled={!insideCount || blendComplete}
            >
              <span className="power-glyph" aria-hidden="true">
                {blending ? "■" : "▶"}
              </span>
              {blending
                ? "Stop"
                : blendComplete
                  ? "Smooth!"
                  : blendProgress > 0
                    ? "Keep blending"
                    : "Blend now"}
            </button>
            <button
              type="button"
              className="reset-button"
              onClick={reset}
              disabled={!fruits.length}
              aria-label="Start over and clear all fruit"
            >
              ↺
            </button>
          </div>
        </div>
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>
    </main>
  );
}

type SceneProps = {
  fruits: FruitItem[];
  blenderSize: number;
  blending: boolean;
  blendProgress: number;
  smoothieColor: string;
  dragging: boolean;
  reducedMotion: boolean;
  onDragging: (dragging: boolean) => void;
  onFruitDrop: (id: number, position: [number, number, number]) => void;
};

function BlendroomScene({
  fruits,
  blenderSize,
  blending,
  blendProgress,
  smoothieColor: color,
  dragging,
  reducedMotion,
  onDragging,
  onFruitDrop,
}: SceneProps) {
  const compact = useThree((state) => state.size.width < 880);
  const juiceSources = useMemo(
    () =>
      fruits
        .filter((fruit) => fruit.inJar)
        .map((fruit) => ({
          id: fruit.id,
          type: fruit.type,
          color: FRUIT_COLORS[fruit.type],
          phase: fruit.phase,
          juice: fruit.juice,
        })),
    [fruits],
  );

  return (
    <>
      <color attach="background" args={["#eadfce"]} />
      <fog attach="fog" args={["#eadfce", 12, 30]} />
      <SoftShadows size={18} samples={8} focus={0.45} />
      <ambientLight intensity={1.1} color="#fff4dc" />
      <hemisphereLight
        intensity={1.25}
        color="#dff2ef"
        groundColor="#8c684c"
      />
      <directionalLight
        castShadow
        position={[-5, 8, 5]}
        intensity={2.6}
        color="#ffd7a3"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0004}
      />
      <pointLight position={[4.3, 4.6, -1.3]} intensity={34} color="#b8e5e0" />

      <Kitchen />
      <BlenderRig
        size={blenderSize}
        blending={blending}
        blendProgress={blendProgress}
        smoothieColor={color}
        fruitCount={fruits.filter((fruit) => fruit.inJar).length}
        juiceSources={juiceSources}
        reducedMotion={reducedMotion}
      />

      {fruits.map((fruit) => (
        <DraggableFruit
          key={fruit.id}
          fruit={fruit}
          blenderSize={blenderSize}
          blending={blending}
          reducedMotion={reducedMotion}
          onDragging={onDragging}
          onDrop={onFruitDrop}
        />
      ))}

      <ContactShadows
        position={[0, 0.02, 0]}
        opacity={0.38}
        scale={10}
        blur={2.8}
        far={4.5}
        color="#513f32"
      />
      <OrbitControls
        makeDefault
        enabled={!dragging}
        enablePan={false}
        minDistance={compact ? 8.8 : 6.8}
        maxDistance={compact ? 16 : 12}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.48}
        minAzimuthAngle={-0.55}
        maxAzimuthAngle={0.72}
        target={compact ? [-1.05, 1.42, 0] : [0.1, 1.42, 0]}
        dampingFactor={0.07}
      />
      <ResponsiveCamera reducedMotion={reducedMotion} />
    </>
  );
}

function ResponsiveCamera({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, size } = useThree();
  const mobileLayout = useRef<boolean | null>(null);

  useEffect(() => {
    const isMobile = size.width < 880;
    if (mobileLayout.current === isMobile && !reducedMotion) return;
    if (isMobile) {
      camera.position.set(8.4, 5.6, 12.3);
    } else {
      camera.position.set(6.2, 4.5, 8.1);
    }
    camera.lookAt(isMobile ? -1.05 : 0.1, 1.42, 0);
    mobileLayout.current = isMobile;
  }, [camera, reducedMotion, size.width]);

  return null;
}

function Kitchen() {
  const tilePositions = useMemo(() => {
    const tiles: [number, number, number][] = [];
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 16; column++) {
        tiles.push([-4.65 + column * 0.62, 0.72 + row * 0.46, -2.86]);
      }
    }
    return tiles;
  }, []);

  return (
    <group>
      <mesh receiveShadow position={[0, -2.24, 0]}>
        <boxGeometry args={[16, 0.25, 12]} />
        <meshStandardMaterial color="#b58f70" roughness={0.86} />
      </mesh>
      <mesh receiveShadow position={[0, 2.55, -3.05]}>
        <boxGeometry args={[14, 9.5, 0.28]} />
        <meshStandardMaterial color="#f1e7d8" roughness={0.92} />
      </mesh>

      <group>
        {tilePositions.map((position, index) => (
          <RoundedBox
            key={index}
            args={[0.58, 0.42, 0.08]}
            radius={0.035}
            smoothness={2}
            position={position}
            receiveShadow
          >
            <meshStandardMaterial
              color={index % 5 === 0 ? "#b9c9b3" : "#d9dfd2"}
              roughness={0.68}
            />
          </RoundedBox>
        ))}
      </group>

      <mesh receiveShadow castShadow position={[0, -0.31, 0]}>
        <boxGeometry args={[10.8, 0.5, 4.8]} />
        <meshStandardMaterial color="#d9cbb9" roughness={0.53} />
      </mesh>
      <mesh receiveShadow position={[0, -0.03, 0]}>
        <boxGeometry args={[11, 0.12, 4.92]} />
        <meshStandardMaterial color="#eee5d7" roughness={0.42} />
      </mesh>
      <mesh castShadow position={[0, -1.35, -0.05]}>
        <boxGeometry args={[10.5, 2.35, 4.5]} />
        <meshStandardMaterial color="#71846f" roughness={0.62} />
      </mesh>

      {[-4.3, -2.15, 0, 2.15, 4.3].map((x, index) => (
        <group key={x}>
          <RoundedBox
            args={[1.96, 1.94, 0.12]}
            radius={0.055}
            smoothness={3}
            position={[x, -1.3, 2.23]}
          >
            <meshStandardMaterial
              color={index === 2 ? "#7f927b" : "#788b72"}
              roughness={0.58}
            />
          </RoundedBox>
          <mesh position={[x + 0.66, -1.3, 2.32]}>
            <boxGeometry args={[0.045, 0.38, 0.04]} />
            <meshStandardMaterial color="#c29d70" metalness={0.72} roughness={0.26} />
          </mesh>
        </group>
      ))}

      <UpperCabinet position={[-4.2, 3.42, -2.68]} />
      <UpperCabinet position={[4.2, 3.42, -2.68]} />
      <WindowScene />

      <mesh castShadow position={[-2.65, 3.2, -2.62]}>
        <boxGeometry args={[2.25, 0.16, 0.6]} />
        <meshStandardMaterial color="#694735" roughness={0.66} />
      </mesh>
      <CeramicMug position={[-3.25, 3.48, -2.47]} color="#d86d56" />
      <CeramicMug position={[-2.62, 3.48, -2.47]} color="#eee2ca" />
      <HerbPot position={[-1.85, 3.45, -2.47]} />

      <CuttingBoard />
      <FruitBowl />
      <Sink />
      <Pendant position={[-2.6, 5.1, 0.1]} />
      <Pendant position={[3.1, 5.1, 0.1]} />
    </group>
  );
}

function UpperCabinet({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[2.25, 2.35, 0.65]} radius={0.08} smoothness={3} castShadow>
        <meshStandardMaterial color="#81917a" roughness={0.59} />
      </RoundedBox>
      <RoundedBox
        args={[1.88, 1.98, 0.08]}
        radius={0.05}
        smoothness={3}
        position={[0, 0, 0.37]}
      >
        <meshStandardMaterial color="#72856d" roughness={0.64} />
      </RoundedBox>
      <mesh position={[0.68, 0, 0.45]}>
        <boxGeometry args={[0.04, 0.43, 0.04]} />
        <meshStandardMaterial color="#c29d70" metalness={0.72} roughness={0.25} />
      </mesh>
    </group>
  );
}

function WindowScene() {
  return (
    <group position={[1.95, 3.05, -2.84]}>
      <RoundedBox args={[3.1, 2.65, 0.16]} radius={0.45} smoothness={6}>
        <meshStandardMaterial color="#d9c7a9" roughness={0.56} />
      </RoundedBox>
      <RoundedBox
        args={[2.72, 2.3, 0.08]}
        radius={0.34}
        smoothness={6}
        position={[0, -0.01, 0.12]}
      >
        <meshBasicMaterial color="#a9d6d2" />
      </RoundedBox>
      <mesh position={[0, 0, 0.18]}>
        <boxGeometry args={[0.06, 2.24, 0.05]} />
        <meshStandardMaterial color="#f2e8d7" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.18]}>
        <boxGeometry args={[2.66, 0.06, 0.05]} />
        <meshStandardMaterial color="#f2e8d7" roughness={0.5} />
      </mesh>
      {[
        [-0.95, -0.62, 0.23],
        [0.75, -0.72, 0.22],
        [0.9, 0.58, 0.22],
      ].map((position, index) => (
        <mesh
          key={index}
          position={position as [number, number, number]}
          rotation={[0, 0, index * 0.7]}
        >
          <sphereGeometry args={[0.36 + index * 0.05, 12, 8]} />
          <meshStandardMaterial color={index === 1 ? "#648d64" : "#759d6a"} />
        </mesh>
      ))}
    </group>
  );
}

function CuttingBoard() {
  return (
    <group position={[-2.78, 0.1, 0.12]}>
      <RoundedBox args={[2.55, 0.13, 1.75]} radius={0.08} smoothness={4} castShadow>
        <meshStandardMaterial color="#81553b" roughness={0.72} />
      </RoundedBox>
      <mesh position={[-0.92, 0.09, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 24]} />
        <meshStandardMaterial color="#563927" roughness={0.75} />
      </mesh>
    </group>
  );
}

function FruitBowl() {
  return (
    <group position={[3.55, 0.1, 0.32]}>
      <mesh castShadow rotation={[0, 0, Math.PI]}>
        <sphereGeometry args={[0.72, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2.25]} />
        <meshStandardMaterial color="#d9a45f" roughness={0.54} side={THREE.DoubleSide} />
      </mesh>
      {[
        [-0.28, 0.37, 0.04, "#d95448"],
        [0.17, 0.42, 0.15, "#ef9c36"],
        [0.02, 0.35, -0.27, "#e8c24c"],
      ].map(([x, y, z, fruitColor], index) => (
        <mesh key={index} castShadow position={[x as number, y as number, z as number]}>
          <sphereGeometry args={[0.29, 20, 16]} />
          <meshStandardMaterial color={fruitColor as string} roughness={0.62} />
        </mesh>
      ))}
    </group>
  );
}

function Sink() {
  return (
    <group position={[4.2, 0.05, -1.05]}>
      <RoundedBox args={[1.75, 0.12, 1.2]} radius={0.12} smoothness={4}>
        <meshStandardMaterial color="#b5b1a6" metalness={0.55} roughness={0.28} />
      </RoundedBox>
      <mesh position={[0.55, 0.63, -0.32]}>
        <torusGeometry args={[0.5, 0.055, 12, 32, Math.PI]} />
        <meshStandardMaterial color="#b58a55" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0.06, 0.62, -0.32]}>
        <cylinderGeometry args={[0.055, 0.055, 0.66, 16]} />
        <meshStandardMaterial color="#b58a55" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Pendant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 3.1, 8]} />
        <meshStandardMaterial color="#5b4637" />
      </mesh>
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.48, 0.62, 32, 1, true]} />
        <meshStandardMaterial
          color="#c59662"
          metalness={0.45}
          roughness={0.34}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight position={[0, -0.2, 0]} color="#ffc777" intensity={13} distance={4} />
    </group>
  );
}

function CeramicMug({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.22, 0.2, 0.48, 24, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.48} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.24, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.14, 0.035, 10, 20]} />
        <meshStandardMaterial color={color} roughness={0.48} />
      </mesh>
    </group>
  );
}

function HerbPot({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.28, 0.22, 0.46, 20]} />
        <meshStandardMaterial color="#e9ddc9" roughness={0.72} />
      </mesh>
      {[-0.22, 0, 0.2].map((x, index) => (
        <group key={x} position={[x, 0.55, 0]} rotation={[0, 0, x * 1.5]}>
          <mesh>
            <cylinderGeometry args={[0.018, 0.018, 0.7, 8]} />
            <meshStandardMaterial color="#4d774d" />
          </mesh>
          <mesh position={[0.12, 0.24, 0]} rotation={[0, 0, 0.8 + index * 0.1]}>
            <sphereGeometry args={[0.18, 10, 8]} />
            <meshStandardMaterial color="#66935d" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function BlenderRig({
  size,
  blending,
  blendProgress,
  smoothieColor: color,
  fruitCount,
  juiceSources,
  reducedMotion,
}: {
  size: number;
  blending: boolean;
  blendProgress: number;
  smoothieColor: string;
  fruitCount: number;
  juiceSources: JuiceSource[];
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const blade = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const rpm = useRef(0);

  const jarProfile = useMemo(
    () => [
      new THREE.Vector2(0.56, 0),
      new THREE.Vector2(0.6, 0.12),
      new THREE.Vector2(0.78, 1.85),
      new THREE.Vector2(0.82, 2.08),
    ],
    [],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    rpm.current = THREE.MathUtils.damp(rpm.current, blending ? 1 : 0, 5.2, dt);
    if (blade.current) {
      blade.current.rotation.y +=
        rpm.current * dt * (reducedMotion ? 5 : 36);
    }
    if (group.current) {
      group.current.position.x = BLENDER_X;
      group.current.position.y =
        blending && !reducedMotion
          ? Math.sin(state.clock.elapsedTime * 55) * 0.0045
          : 0;
    }
    if (lid.current) {
      const targetX = blending ? 0 : reducedMotion ? 0.28 : 0.72;
      const targetY = blending ? 3.17 : reducedMotion ? 3.32 : 3.45;
      const targetRotation = blending ? 0 : reducedMotion ? -0.24 : -0.72;
      lid.current.position.x = THREE.MathUtils.damp(
        lid.current.position.x,
        targetX,
        8,
        dt,
      );
      lid.current.position.y = THREE.MathUtils.damp(
        lid.current.position.y,
        targetY,
        8,
        dt,
      );
      lid.current.rotation.z = THREE.MathUtils.damp(
        lid.current.rotation.z,
        targetRotation,
        8,
        dt,
      );
    }
  });

  return (
    <group ref={group} scale={size}>
      <group>
        <RoundedBox
          args={[1.5, 0.82, 1.4]}
          radius={0.24}
          smoothness={5}
          position={[0, 0.44, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#eee4d3" roughness={0.39} />
        </RoundedBox>
        <mesh position={[0, 0.94, 0]} castShadow>
          <cylinderGeometry args={[0.65, 0.69, 0.28, 48]} />
          <meshStandardMaterial
            color="#b9976c"
            metalness={0.72}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0, 0.48, 0.711]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 0.06, 40]} />
          <meshStandardMaterial color="#df5e4d" roughness={0.38} />
        </mesh>
        <mesh position={[0, 0.48, 0.748]}>
          <torusGeometry args={[0.14, 0.022, 12, 32]} />
          <meshStandardMaterial color="#f8d2c7" emissive="#9f2419" emissiveIntensity={0.14} />
        </mesh>
        <mesh position={[-0.45, 0.1, 0.55]}>
          <boxGeometry args={[0.28, 0.06, 0.25]} />
          <meshStandardMaterial color="#4e4237" roughness={0.72} />
        </mesh>
        <mesh position={[0.45, 0.1, 0.55]}>
          <boxGeometry args={[0.28, 0.06, 0.25]} />
          <meshStandardMaterial color="#4e4237" roughness={0.72} />
        </mesh>
      </group>

      <group position={[0, 1.02, 0]}>
        <mesh renderOrder={3} castShadow>
          <latheGeometry args={[jarProfile, 64]} />
          <meshPhysicalMaterial
            color="#c8e7e2"
            transparent
            opacity={0.27}
            roughness={0.08}
            metalness={0}
            transmission={0.45}
            thickness={0.18}
            ior={1.45}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 2.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.8, 0.055, 16, 64]} />
          <meshStandardMaterial
            color="#a7c7c2"
            transparent
            opacity={0.52}
            roughness={0.18}
          />
        </mesh>
        <mesh position={[0.88, 1.26, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.5, 0.1, 16, 32, Math.PI * 1.55]} />
          <meshPhysicalMaterial
            color="#b8d8d5"
            transparent
            opacity={0.42}
            roughness={0.12}
            transmission={0.25}
          />
        </mesh>
        {[0.55, 0.92, 1.29, 1.66].map((y, index) => (
          <group key={y}>
            <mesh position={[0.73 + index * 0.02, y, 0]}>
              <boxGeometry args={[0.1, 0.016, 0.012]} />
              <meshStandardMaterial color="#7a9c97" transparent opacity={0.62} />
            </mesh>
            <mesh position={[0.65 + index * 0.02, y, 0]}>
              <boxGeometry args={[0.06, 0.012, 0.012]} />
              <meshStandardMaterial color="#7a9c97" transparent opacity={0.48} />
            </mesh>
          </group>
        ))}
      </group>

      <group ref={blade} position={[0, 1.13, 0]}>
        {[0, Math.PI / 2].map((rotation) => (
          <mesh key={rotation} rotation={[0, rotation, 0]}>
            <boxGeometry args={[1, 0.045, 0.13]} />
            <meshStandardMaterial
              color="#d9d5ca"
              metalness={0.9}
              roughness={0.17}
            />
          </mesh>
        ))}
        <mesh>
          <cylinderGeometry args={[0.12, 0.12, 0.2, 24]} />
          <meshStandardMaterial color="#9f8d75" metalness={0.82} roughness={0.22} />
        </mesh>
      </group>

      {fruitCount > 0 && (
        <JuiceFluid
          blending={blending}
          blendProgress={blendProgress}
          color={color}
          sources={juiceSources}
          reducedMotion={reducedMotion}
        />
      )}

      <group ref={lid} position={[0.72, 3.45, 0]} rotation={[0, 0, -0.72]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.84, 0.8, 0.18, 48]} />
          <meshStandardMaterial color="#4d4840" roughness={0.48} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.25, 0.28, 0.18, 36]} />
          <meshStandardMaterial color="#686158" roughness={0.42} />
        </mesh>
      </group>
    </group>
  );
}

type FluidState = {
  count: number;
  accumulator: number;
  positions: Float32Array;
  previous: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  ages: Float32Array;
  emittedByFruit: Map<number, number>;
};

function jarInteriorRadius(y: number) {
  const lowerY = 1.02;
  const shoulderY = 1.14;
  const upperY = 2.87;
  let radius: number;

  if (y <= shoulderY) {
    const t = THREE.MathUtils.clamp(
      (y - lowerY) / (shoulderY - lowerY),
      0,
      1,
    );
    radius = THREE.MathUtils.lerp(0.56, 0.6, t);
  } else {
    const t = THREE.MathUtils.clamp(
      (y - shoulderY) / (upperY - shoulderY),
      0,
      1,
    );
    radius = THREE.MathUtils.lerp(0.6, 0.78, t);
  }

  return radius - 0.035 - JUICE_PARTICLE_RADIUS;
}

function JuiceFluid({
  blending,
  blendProgress,
  color,
  sources,
  reducedMotion,
}: {
  blending: boolean;
  blendProgress: number;
  color: string;
  sources: JuiceSource[];
  reducedMotion: boolean;
}) {
  const compact = useThree((state) => state.size.width < 880);
  const particleYield = reducedMotion ? 8 : compact ? 12 : 20;
  const particleLimit = Math.min(
    MAX_JUICE_PARTICLES,
    particleYield * MAX_FRUIT,
  );
  const particles = useRef<THREE.InstancedMesh>(null);
  const bulkLiquid = useRef<THREE.Mesh>(null);
  const surface = useRef<THREE.Mesh>(null);
  const surfaceShader = useRef<THREE.ShaderMaterial>(null);
  const motor = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const mixColor = useMemo(() => new THREE.Color(color), [color]);
  const particleColor = useMemo(() => new THREE.Color(), []);
  const targetVelocity = useMemo(() => new THREE.Vector3(), []);
  const surfaceUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uColor: { value: new THREE.Color("#e9895c") },
      uOpacity: { value: 0.86 },
    }),
    [],
  );
  const fluid = useRef<FluidState>({
    count: 0,
    accumulator: 0,
    positions: new Float32Array(MAX_JUICE_PARTICLES * 3),
    previous: new Float32Array(MAX_JUICE_PARTICLES * 3),
    velocities: new Float32Array(MAX_JUICE_PARTICLES * 3),
    colors: new Float32Array(MAX_JUICE_PARTICLES * 3),
    ages: new Float32Array(MAX_JUICE_PARTICLES),
    emittedByFruit: new Map(),
  });

  useEffect(() => {
    const mesh = particles.current;
    if (!mesh) return;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color("#ffffff"));
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.needsUpdate = true;
    }
    const material = mesh.material as THREE.Material;
    material.needsUpdate = true;
  }, []);

  useFrame((state, frameDelta) => {
    const sim = fluid.current;
    const particleMesh = particles.current;
    const bodyMesh = bulkLiquid.current;
    const surfaceMesh = surface.current;
    const surfaceMaterial = surfaceShader.current;
    if (!particleMesh || !bodyMesh || !surfaceMesh || !surfaceMaterial) return;

    const frameDt = Math.min(frameDelta, 0.033);
    motor.current = THREE.MathUtils.damp(
      motor.current,
      blending ? 1 : 0,
      reducedMotion ? 3.5 : 5.5,
      frameDt,
    );

    let emittedThisFrame = 0;
    for (const source of sources) {
      const desired = Math.min(
        particleYield,
        Math.floor(source.juice * particleYield + 0.0001),
      );
      let emitted = sim.emittedByFruit.get(source.id) ?? 0;

      while (
        emitted < desired &&
        emittedThisFrame < 8 &&
        sim.count < particleLimit
      ) {
        const index = sim.count++;
        const offset = index * 3;
        const angle =
          source.phase + emitted * 1.73 + source.juice * Math.PI * 4.2;
        const spawnRadius = 0.12 + ((emitted * 17) % 8) * 0.022;
        const spawnY =
          1.34 + ((emitted * 7 + source.id) % 6) * 0.055 + source.juice * 0.08;
        const sourceColor = new THREE.Color(source.color);

        sim.positions[offset] = Math.cos(angle) * spawnRadius;
        sim.positions[offset + 1] = spawnY;
        sim.positions[offset + 2] = Math.sin(angle) * spawnRadius;
        sim.velocities[offset] = -Math.sin(angle) * 0.72;
        sim.velocities[offset + 1] = 0.12 + (emitted % 3) * 0.05;
        sim.velocities[offset + 2] = Math.cos(angle) * 0.72;
        sim.colors[offset] = sourceColor.r;
        sim.colors[offset + 1] = sourceColor.g;
        sim.colors[offset + 2] = sourceColor.b;
        sim.ages[index] = 0;
        emitted += 1;
        emittedThisFrame += 1;
      }

      sim.emittedByFruit.set(source.id, emitted);
    }

    const fillUnits = sim.count / Math.max(1, particleYield);
    const fillHeight =
      sim.count > 0 ? Math.min(1.65, 0.05 + fillUnits * 0.13) : 0;
    const fillTop = JAR_FLUID_BOTTOM + fillHeight;
    const surfaceRadius = Math.max(
      0.42,
      jarInteriorRadius(Math.max(JAR_FLUID_BOTTOM, fillTop)) -
        JUICE_PARTICLE_RADIUS * 0.25,
    );
    const fluidVisible = sim.count > 0;

    bodyMesh.visible = fluidVisible;
    surfaceMesh.visible = fluidVisible;
    if (fluidVisible) {
      bodyMesh.position.y = JAR_FLUID_BOTTOM + fillHeight * 0.5;
      bodyMesh.scale.set(
        surfaceRadius / 0.69,
        Math.max(0.001, fillHeight),
        surfaceRadius / 0.69,
      );
      surfaceMesh.position.y = fillTop + 0.008;
      surfaceMesh.scale.setScalar(surfaceRadius);
      const bodyMaterial = bodyMesh.material as THREE.MeshPhysicalMaterial;
      bodyMaterial.color.lerp(mixColor, 1 - Math.exp(-frameDt * 6));
      surfaceMaterial.uniforms.uTime.value = state.clock.elapsedTime;
      surfaceMaterial.uniforms.uStrength.value = THREE.MathUtils.damp(
        surfaceMaterial.uniforms.uStrength.value,
        motor.current * (reducedMotion ? 0.32 : 1),
        5,
        frameDt,
      );
      (
        surfaceMaterial.uniforms.uColor.value as THREE.Color
      ).lerp(mixColor, 1 - Math.exp(-frameDt * 6));
      surfaceMaterial.uniforms.uOpacity.value = THREE.MathUtils.lerp(
        0.75,
        0.9,
        blendProgress,
      );
    }

    if (sim.count > 0) {
      sim.accumulator = Math.min(sim.accumulator + frameDt, 1 / 30);
      const fixedDt = 1 / 60;
      let steps = 0;

      while (sim.accumulator >= fixedDt && steps < 2) {
        const topBoundary = Math.min(
          JAR_FLUID_TOP,
          Math.max(1.42, fillTop + (blending ? 0.32 : 0.12)),
        );

        for (let index = 0; index < sim.count; index += 1) {
          const offset = index * 3;
          const x = sim.positions[offset];
          const y = sim.positions[offset + 1];
          const z = sim.positions[offset + 2];
          const vx = sim.velocities[offset];
          const vy = sim.velocities[offset + 1];
          const vz = sim.velocities[offset + 2];
          const radial = Math.max(0.0001, Math.hypot(x, z));
          const radiusLimit = jarInteriorRadius(y);
          const normalizedHeight = THREE.MathUtils.clamp(
            (y - JAR_FLUID_BOTTOM) /
              Math.max(0.2, topBoundary - JAR_FLUID_BOTTOM),
            0,
            1,
          );
          const wallRatio = THREE.MathUtils.clamp(
            radial / Math.max(0.1, radiusLimit),
            0,
            1.4,
          );
          const circulation = motor.current * (reducedMotion ? 0.36 : 1);
          const omega = 7.5 * circulation;
          const radialFlow =
            0.34 * circulation * (1 - normalizedHeight * 2);
          const verticalFlow =
            0.52 * circulation * (2 * wallRatio * wallRatio - 0.72);

          targetVelocity.set(
            -z * omega + (x / radial) * radialFlow,
            verticalFlow,
            x * omega + (z / radial) * radialFlow,
          );

          const forceGain = 7.5 * circulation;
          sim.previous[offset] = x;
          sim.previous[offset + 1] = y;
          sim.previous[offset + 2] = z;
          sim.velocities[offset] =
            vx + (targetVelocity.x - vx) * forceGain * fixedDt;
          sim.velocities[offset + 1] =
            vy +
            ((targetVelocity.y - vy) * forceGain - 0.62) * fixedDt;
          sim.velocities[offset + 2] =
            vz + (targetVelocity.z - vz) * forceGain * fixedDt;

          if (y < 1.38 && circulation > 0.05) {
            const bladeKick = (1.38 - y) * 3.5 * circulation;
            sim.velocities[offset] +=
              Math.cos(sim.ages[index] * 6 + index) * bladeKick * fixedDt;
            sim.velocities[offset + 1] += bladeKick * 0.45 * fixedDt;
            sim.velocities[offset + 2] +=
              Math.sin(sim.ages[index] * 5 + index) * bladeKick * fixedDt;
          }

          const damping = reducedMotion ? 0.973 : 0.987;
          sim.velocities[offset] *= damping;
          sim.velocities[offset + 1] *= damping;
          sim.velocities[offset + 2] *= damping;
          sim.positions[offset] += sim.velocities[offset] * fixedDt;
          sim.positions[offset + 1] += sim.velocities[offset + 1] * fixedDt;
          sim.positions[offset + 2] += sim.velocities[offset + 2] * fixedDt;
        }

        for (let iteration = 0; iteration < 2; iteration += 1) {
          for (let a = 0; a < sim.count; a += 1) {
            const aOffset = a * 3;
            for (let b = a + 1; b < sim.count; b += 1) {
              const bOffset = b * 3;
              const dx = sim.positions[bOffset] - sim.positions[aOffset];
              const dy =
                sim.positions[bOffset + 1] - sim.positions[aOffset + 1];
              const dz =
                sim.positions[bOffset + 2] - sim.positions[aOffset + 2];
              const distanceSquared = dx * dx + dy * dy + dz * dz;
              if (distanceSquared <= 0.000001 || distanceSquared > 0.034) {
                continue;
              }
              const distance = Math.sqrt(distanceSquared);
              const minimumDistance = JUICE_PARTICLE_RADIUS * 1.72;
              if (distance >= minimumDistance) continue;
              const correction =
                ((minimumDistance - distance) / distance) * 0.22;
              const correctionX = dx * correction;
              const correctionY = dy * correction;
              const correctionZ = dz * correction;
              sim.positions[aOffset] -= correctionX;
              sim.positions[aOffset + 1] -= correctionY;
              sim.positions[aOffset + 2] -= correctionZ;
              sim.positions[bOffset] += correctionX;
              sim.positions[bOffset + 1] += correctionY;
              sim.positions[bOffset + 2] += correctionZ;
            }
          }

          for (let index = 0; index < sim.count; index += 1) {
            const offset = index * 3;
            let x = sim.positions[offset];
            let y = sim.positions[offset + 1];
            let z = sim.positions[offset + 2];

            if (y < JAR_FLUID_BOTTOM) {
              y = JAR_FLUID_BOTTOM;
              if (sim.velocities[offset + 1] < 0) {
                sim.velocities[offset + 1] *= -0.08;
              }
            } else if (y > topBoundary) {
              y = topBoundary;
              if (sim.velocities[offset + 1] > 0) {
                sim.velocities[offset + 1] *= -0.08;
              }
            }

            const radial = Math.max(0.0001, Math.hypot(x, z));
            const radiusLimit = jarInteriorRadius(y);
            if (radial > radiusLimit) {
              const normalX = x / radial;
              const normalZ = z / radial;
              x = normalX * radiusLimit;
              z = normalZ * radiusLimit;
              const outwardVelocity =
                sim.velocities[offset] * normalX +
                sim.velocities[offset + 2] * normalZ;
              if (outwardVelocity > 0) {
                sim.velocities[offset] -= outwardVelocity * 1.05 * normalX;
                sim.velocities[offset + 2] -= outwardVelocity * 1.05 * normalZ;
              }
              sim.velocities[offset] *= 0.94;
              sim.velocities[offset + 2] *= 0.94;
            }

            sim.positions[offset] = x;
            sim.positions[offset + 1] = y;
            sim.positions[offset + 2] = z;
          }
        }

        for (let index = 0; index < sim.count; index += 1) {
          const offset = index * 3;
          const recoveredX =
            (sim.positions[offset] - sim.previous[offset]) / fixedDt;
          const recoveredY =
            (sim.positions[offset + 1] - sim.previous[offset + 1]) / fixedDt;
          const recoveredZ =
            (sim.positions[offset + 2] - sim.previous[offset + 2]) / fixedDt;
          sim.velocities[offset] = THREE.MathUtils.lerp(
            recoveredX,
            sim.velocities[offset],
            0.12,
          );
          sim.velocities[offset + 1] = THREE.MathUtils.lerp(
            recoveredY,
            sim.velocities[offset + 1],
            0.12,
          );
          sim.velocities[offset + 2] = THREE.MathUtils.lerp(
            recoveredZ,
            sim.velocities[offset + 2],
            0.12,
          );
          const speed = Math.hypot(
            sim.velocities[offset],
            sim.velocities[offset + 1],
            sim.velocities[offset + 2],
          );
          if (speed > 4.5) {
            const scale = 4.5 / speed;
            sim.velocities[offset] *= scale;
            sim.velocities[offset + 1] *= scale;
            sim.velocities[offset + 2] *= scale;
          }
          sim.ages[index] += fixedDt;
        }

        sim.accumulator -= fixedDt;
        steps += 1;
      }

      particleMesh.count = sim.count;
      for (let index = 0; index < sim.count; index += 1) {
        const offset = index * 3;
        const mixing = Math.min(
          0.76,
          sim.ages[index] * (blending ? 0.16 : 0.045),
        );
        particleColor
          .setRGB(
            sim.colors[offset],
            sim.colors[offset + 1],
            sim.colors[offset + 2],
          )
          .lerp(mixColor, mixing);
        dummy.position.set(
          sim.positions[offset],
          sim.positions[offset + 1],
          sim.positions[offset + 2],
        );
        const pulse =
          reducedMotion
            ? 0.9
            : 0.86 + Math.sin(sim.ages[index] * 7 + index) * 0.08;
        dummy.scale.setScalar(pulse);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(index, dummy.matrix);
        particleMesh.setColorAt(index, particleColor);
      }
      particleMesh.instanceMatrix.needsUpdate = true;
      if (particleMesh.instanceColor) {
        particleMesh.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <mesh ref={bulkLiquid} visible={false} renderOrder={1}>
        <cylinderGeometry args={[0.69, 0.5, 1, 48, 1, false]} />
        <meshPhysicalMaterial
          color={color}
          transparent
          opacity={0.66}
          roughness={0.22}
          transmission={0.08}
          thickness={0.18}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={surface}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      >
        <circleGeometry args={[1, 56]} />
        <shaderMaterial
          ref={surfaceShader}
          uniforms={surfaceUniforms}
          vertexShader={`
            uniform float uTime;
            uniform float uStrength;
            varying float vRadius;

            void main() {
              vec3 p = position;
              vRadius = length(position.xy);
              float wave =
                sin(position.x * 14.0 + uTime * 6.4) +
                cos(position.y * 12.0 - uTime * 5.1);
              float funnel = 1.0 - smoothstep(0.0, 0.82, vRadius);
              p.z += wave * 0.012 * uStrength * (0.35 + vRadius);
              p.z -= funnel * 0.075 * uStrength;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
          `}
          fragmentShader={`
            uniform vec3 uColor;
            uniform float uOpacity;
            varying float vRadius;

            void main() {
              float rim = smoothstep(0.42, 1.0, vRadius);
              vec3 highlight = mix(
                uColor,
                vec3(1.0, 0.92, 0.76),
                0.2 + rim * 0.18
              );
              gl_FragColor = vec4(highlight, uOpacity);
            }
          `}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <instancedMesh
        ref={particles}
        args={[undefined, undefined, MAX_JUICE_PARTICLES]}
        count={0}
        frustumCulled={false}
        renderOrder={2}
      >
        <icosahedronGeometry args={[JUICE_PARTICLE_RADIUS, 1]} />
        <meshPhysicalMaterial
          vertexColors
          transparent
          opacity={0.88}
          roughness={0.24}
          clearcoat={0.35}
          clearcoatRoughness={0.2}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

function DraggableFruit({
  fruit,
  blenderSize,
  blending,
  reducedMotion,
  onDragging,
  onDrop,
}: {
  fruit: FruitItem;
  blenderSize: number;
  blending: boolean;
  reducedMotion: boolean;
  onDragging: (dragging: boolean) => void;
  onDrop: (id: number, position: [number, number, number]) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const dragPlane = useRef(new THREE.Plane());
  const grabOffset = useRef(new THREE.Vector3());
  const latestPosition = useRef(new THREE.Vector3(...fruit.position));
  const dragging = useRef(false);
  const activePointer = useRef<number | null>(null);
  const restingScale = useRef(new THREE.Vector3(1, 1, 1));
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    latestPosition.current.set(...fruit.position);
    if (!blending && group.current) group.current.position.set(...fruit.position);
  }, [blending, fruit.position]);

  useEffect(() => {
    document.body.style.cursor =
      hovered && !blending && fruit.juice <= 0.02 ? "grab" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [blending, fruit.juice, hovered]);

  useEffect(
    () => () => {
      if (dragging.current) onDragging(false);
      dragging.current = false;
      activePointer.current = null;
      document.body.style.cursor = "";
    },
    [onDragging],
  );

  useFrame((state, delta) => {
    if (!group.current || dragging.current) return;

    if (fruit.inJar && blending) {
      const speed = reducedMotion ? 1.25 : 3.6 + fruit.juice * 7.5;
      const time = state.clock.elapsedTime * speed + fruit.phase;
      const radius = reducedMotion
        ? 0.035
        : Math.max(0.08, 0.5 * blenderSize - 0.31) *
          (1 - fruit.juice * 0.28);
      const targetX = BLENDER_X + Math.cos(time) * radius;
      const targetZ = Math.sin(time) * radius;
      const rawCirculation =
        (1.7 +
          Math.sin(time * 0.43) * (reducedMotion ? 0.06 : 0.36) +
          fruit.juice * 0.16) *
        blenderSize;
      const circulation = THREE.MathUtils.clamp(
        rawCirculation,
        1.08 * blenderSize + 0.3,
        2.9 * blenderSize - 0.3,
      );

      group.current.position.set(targetX, circulation, targetZ);
      group.current.rotation.x +=
        delta * (reducedMotion ? 0.3 : 4 + fruit.juice * 8);
      group.current.rotation.z +=
        delta * (reducedMotion ? 0.2 : 3 + fruit.juice * 6);
      const visibleScale = Math.max(0.04, 1 - fruit.juice * 0.98);
      group.current.scale.setScalar(visibleScale);
    } else {
      const bob =
        !fruit.inJar && !reducedMotion
          ? Math.sin(state.clock.elapsedTime * 2.2 + fruit.phase) * 0.015
          : 0;
      group.current.position.set(
        fruit.position[0],
        fruit.position[1] + bob,
        fruit.position[2],
      );
      if (fruit.inJar) {
        const visibleScale = Math.max(0.04, 1 - fruit.juice * 0.98);
        restingScale.current.setScalar(visibleScale);
      } else {
        restingScale.current.set(1, 1, 1);
      }
      group.current.scale.lerp(restingScale.current, Math.min(1, delta * 8));
    }
  });

  const pointerTarget = (
    event: ThreeEvent<PointerEvent>,
  ): {
    setPointerCapture: (pointerId: number) => void;
    releasePointerCapture: (pointerId: number) => void;
  } =>
    event.target as unknown as {
      setPointerCapture: (pointerId: number) => void;
      releasePointerCapture: (pointerId: number) => void;
    };

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (blending || fruit.juice > 0.02) return;
    event.stopPropagation();
    dragging.current = true;
    activePointer.current = event.pointerId;
    onDragging(true);
    pointerTarget(event).setPointerCapture(event.pointerId);
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    const position = group.current?.position ?? new THREE.Vector3(...fruit.position);
    dragPlane.current.setFromNormalAndCoplanarPoint(normal, position);
    const hit = new THREE.Vector3();
    if (event.ray.intersectPlane(dragPlane.current, hit)) {
      grabOffset.current.copy(position).sub(hit);
    }
    document.body.style.cursor = "grabbing";
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || activePointer.current !== event.pointerId) return;
    event.stopPropagation();
    const hit = new THREE.Vector3();
    if (!event.ray.intersectPlane(dragPlane.current, hit)) return;
    hit.add(grabOffset.current);
    hit.x = THREE.MathUtils.clamp(hit.x, -4.25, 4.25);
    hit.y = THREE.MathUtils.clamp(hit.y, 0.22, 4.35);
    hit.z = THREE.MathUtils.clamp(hit.z, -1.35, 1.4);
    latestPosition.current.copy(hit);
    group.current?.position.copy(hit);
  };

  const finishDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || activePointer.current !== event.pointerId) return;
    event.stopPropagation();
    dragging.current = false;
    activePointer.current = null;
    try {
      pointerTarget(event).releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be gone after a browser-level cancel.
    }
    onDragging(false);
    document.body.style.cursor = hovered ? "grab" : "";
    const position = latestPosition.current;
    onDrop(fruit.id, [position.x, position.y, position.z]);
  };

  return (
    <group
      ref={group}
      position={fruit.position}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={finishDrag}
      onPointerOver={(event) => {
        event.stopPropagation();
        if (!blending && fruit.juice <= 0.02) setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh visible={false}>
        <sphereGeometry args={[0.42, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <group scale={hovered && !blending && fruit.juice <= 0.02 ? 1.08 : 1}>
        <FruitModel type={fruit.type} />
      </group>
      {hovered && !blending && fruit.juice <= 0.02 && (
        <mesh position={[0, -0.34, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.29, 0.36, 32]} />
          <meshBasicMaterial color="#fff4d7" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function FruitModel({ type }: { type: FruitType }) {
  if (type === "strawberry") {
    return (
      <group>
        <mesh castShadow scale={[0.82, 1.08, 0.82]}>
          <sphereGeometry args={[0.29, 24, 18]} />
          <meshStandardMaterial color="#d94f50" roughness={0.58} />
        </mesh>
        <mesh position={[0, -0.22, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.25, 0.32, 24]} />
          <meshStandardMaterial color="#d94f50" roughness={0.58} />
        </mesh>
        <group position={[0, 0.3, 0]}>
          {[0, 1.25, 2.5, 3.75, 5].map((rotation) => (
            <mesh key={rotation} rotation={[0.35, rotation, 0]} scale={[0.08, 0.24, 0.08]}>
              <coneGeometry args={[1, 1, 6]} />
              <meshStandardMaterial color="#5f8d4e" roughness={0.7} />
            </mesh>
          ))}
        </group>
      </group>
    );
  }

  if (type === "banana") {
    return (
      <group rotation={[0.4, 0.2, -0.5]}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.105, 14, 32, Math.PI * 1.45]} />
          <meshStandardMaterial color="#efc74d" roughness={0.52} />
        </mesh>
        <mesh position={[-0.22, 0.04, 0.2]} rotation={[0.8, 0, -0.3]}>
          <cylinderGeometry args={[0.055, 0.07, 0.14, 12]} />
          <meshStandardMaterial color="#79583c" roughness={0.7} />
        </mesh>
      </group>
    );
  }

  if (type === "orange") {
    return (
      <group>
        <mesh castShadow scale={[1, 0.96, 1]}>
          <sphereGeometry args={[0.3, 28, 20]} />
          <meshStandardMaterial color="#ef8a35" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.3, 0]} rotation={[0, 0, -0.5]} scale={[0.18, 0.05, 0.1]}>
          <sphereGeometry args={[1, 16, 10]} />
          <meshStandardMaterial color="#608c4d" roughness={0.65} />
        </mesh>
      </group>
    );
  }

  if (type === "blueberry") {
    return (
      <group>
        {[
          [0, 0.08, 0],
          [0.2, -0.08, 0.02],
          [-0.19, -0.08, 0.04],
          [0.07, -0.1, 0.2],
        ].map((position, index) => (
          <mesh key={index} castShadow position={position as [number, number, number]}>
            <sphereGeometry args={[0.19, 22, 16]} />
            <meshStandardMaterial color={index % 2 ? "#42568f" : "#4b65a5"} roughness={0.62} />
          </mesh>
        ))}
        <mesh position={[0, 0.27, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.065, 0.022, 5, 5]} />
          <meshStandardMaterial color="#273a68" roughness={0.66} />
        </mesh>
      </group>
    );
  }

  return (
    <group rotation={[0.15, 0.3, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.29, 0.29, 0.2, 28]} />
        <meshStandardMaterial color="#7eaa4a" roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.105, 0]}>
        <cylinderGeometry args={[0.235, 0.235, 0.012, 28]} />
        <meshStandardMaterial color="#9fcb61" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.116, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.016, 20]} />
        <meshStandardMaterial color="#efe1a2" roughness={0.68} />
      </mesh>
      {Array.from({ length: 10 }).map((_, index) => {
        const angle = (index / 10) * Math.PI * 2;
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * 0.15, 0.127, Math.sin(angle) * 0.15]}
          >
            <sphereGeometry args={[0.012, 6, 5]} />
            <meshStandardMaterial color="#342b23" />
          </mesh>
        );
      })}
    </group>
  );
}
