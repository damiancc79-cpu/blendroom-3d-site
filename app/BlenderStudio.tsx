"use client";

import {
  ContactShadows,
  Html,
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
  type MutableRefObject,
} from "react";
import * as THREE from "three";

type FruitType = "strawberry" | "banana" | "orange" | "blueberry" | "kiwi";

type FruitItem = {
  id: number;
  type: FruitType;
  position: [number, number, number];
  inJar: boolean;
  inFridge: boolean;
  phase: number;
  juice: number;
  poured: number;
  spilled: number;
};

type ServeMode =
  | "docked"
  | "dragging"
  | "pouring"
  | "auto-pouring"
  | "returning"
  | "served";

type SpillMode =
  | "idle"
  | "tipping"
  | "spilling"
  | "settling"
  | "spilled";

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

type SpillSource = {
  id: number;
  color: string;
  phase: number;
  amount: number;
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
const CUP_POSITION = new THREE.Vector3(2.35, 0.02, 0.22);
const CUP_RIM_Y = 1.13;
const CUP_CAPACITY = 5;
const POUR_RATE = 1.65;
const SPILL_RATE = 3.4;
const COUNTER_TOP_Y = 0.035;
const MAX_SPILL_PARTICLES = 220;
const SPILL_PARTICLE_RADIUS = 0.058;
const FRIDGE_X = -4.15;
const FRIDGE_Z = -2.2;
const MAX_FRUIT = 12;
const MAX_JUICE_PARTICLES = 240;
const JAR_FLUID_BOTTOM = 1.17;
const JAR_FLUID_TOP = 3.02;
const JUICE_PARTICLE_RADIUS = 0.052;
const BLENDER_SIZES = [
  { label: "Mini", value: 0.8 },
  { label: "Everyday", value: 1 },
  { label: "Big batch", value: 1.28 },
] as const;

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

function fridgePosition(index: number): [number, number, number] {
  const slots: [number, number, number][] = [
    [-0.43, 3.12, 0.69],
    [0.3, 3.12, 0.69],
    [-0.42, 2.23, 0.69],
    [0.32, 2.23, 0.69],
    [-0.04, 1.3, 0.69],
  ];
  const slot = slots[index % slots.length];
  return [FRIDGE_X + slot[0], slot[1], FRIDGE_Z + slot[2]];
}

function freshFridgeFruit(
  id: number,
  type: FruitType,
  index: number,
): FruitItem {
  return {
    id,
    type,
    position: fridgePosition(index),
    inJar: false,
    inFridge: true,
    phase: id * 1.71,
    juice: 0,
    poured: 0,
    spilled: 0,
  };
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
    fruit.inJar || fruit.inFridge
      ? fruit
      : {
          ...fruit,
          position: boardPosition(boardSlot++),
        },
  );
}

function smoothieColor(
  fruits: FruitItem[],
  amount: (fruit: FruitItem) => number = (fruit) => fruit.juice,
) {
  const inside = fruits.filter(
    (fruit) => fruit.inJar && amount(fruit) > 0.0001,
  );
  const totalJuice = inside.reduce(
    (sum, fruit) => sum + amount(fruit),
    0,
  );
  if (!totalJuice) return "#e9895c";

  const color = new THREE.Color(0, 0, 0);
  inside.forEach((fruit) =>
    color.add(
      new THREE.Color(FRUIT_COLORS[fruit.type]).multiplyScalar(amount(fruit)),
    ),
  );
  color.multiplyScalar(1 / totalJuice);
  color.lerp(new THREE.Color("#f5d6a2"), 0.18);
  return `#${color.getHexString()}`;
}

export default function BlenderStudio() {
  const [fruits, setFruits] = useState<FruitItem[]>(() =>
    FRUIT.map((fruit, index) =>
      freshFridgeFruit(index + 1, fruit.type, index),
    ),
  );
  const [fridgeOpen, setFridgeOpen] = useState(false);
  const [blenderSize, setBlenderSize] = useState(1);
  const [blending, setBlending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [serveMode, setServeMode] = useState<ServeMode>("docked");
  const [spillMode, setSpillMode] = useState<SpillMode>("idle");
  const [batchId, setBatchId] = useState(1);
  const [muted, setMuted] = useState(false);
  const [liveMessage, setLiveMessage] = useState(
    "Open the fridge to choose fresh fruit.",
  );
  const nextId = useRef(FRUIT.length + 1);
  const completionScheduled = useRef(false);
  const reducedMotion = useReducedMotion();
  const insideFruits = fruits.filter((fruit) => fruit.inJar);
  const insideCount = insideFruits.length;
  const fridgeCount = fruits.filter((fruit) => fruit.inFridge).length;
  const onBoardCount = fruits.length - insideCount - fridgeCount;
  const blendProgress = insideCount
    ? insideFruits.reduce((sum, fruit) => sum + fruit.juice, 0) / insideCount
    : 0;
  const blendComplete =
    insideCount > 0 && insideFruits.every((fruit) => fruit.juice >= 0.995);
  const producedUnits = insideFruits.reduce(
    (sum, fruit) => sum + fruit.juice,
    0,
  );
  const cupUnits = insideFruits.reduce(
    (sum, fruit) => sum + Math.max(0, fruit.poured - fruit.spilled),
    0,
  );
  const spilledUnits = insideFruits.reduce(
    (sum, fruit) => sum + fruit.spilled,
    0,
  );
  const jarUnits = Math.max(
    0,
    producedUnits -
      insideFruits.reduce((sum, fruit) => sum + fruit.poured, 0),
  );
  const cupFraction = THREE.MathUtils.clamp(cupUnits / CUP_CAPACITY, 0, 1);
  const servedUnits = cupUnits + spilledUnits;
  const spillFraction = THREE.MathUtils.clamp(
    spilledUnits / Math.max(0.001, servedUnits),
    0,
    1,
  );
  const jarColor = useMemo(
    () =>
      smoothieColor(fruits, (fruit) =>
        Math.max(0, fruit.juice - fruit.poured),
      ),
    [fruits],
  );
  const cupColor = useMemo(
    () =>
      smoothieColor(fruits, (fruit) =>
        Math.max(0, fruit.poured - fruit.spilled),
      ),
    [fruits],
  );
  const spillColor = useMemo(
    () => smoothieColor(fruits, (fruit) => fruit.spilled),
    [fruits],
  );
  const spilling =
    spillMode === "tipping" || spillMode === "spilling";
  const spillingActive =
    spilling || spillMode === "settling";
  const canServe =
    blendComplete &&
    !blending &&
    spillMode === "idle" &&
    spilledUnits <= 0.001 &&
    jarUnits > 0.01 &&
    cupUnits < CUP_CAPACITY - 0.01;
  const pouring =
    serveMode === "pouring" || serveMode === "auto-pouring";
  const servingActive =
    serveMode === "dragging" || pouring || serveMode === "returning";
  const canSpill =
    cupUnits > 0.01 &&
    !servingActive &&
    spillMode === "idle";
  const sceneLocked = dragging || servingActive || spillingActive;
  const batchLocked =
    servingActive ||
    spillingActive ||
    cupUnits > 0.001 ||
    spilledUnits > 0.001;
  const sizeIndex = BLENDER_SIZES.reduce(
    (closest, option, index) =>
      Math.abs(option.value - blenderSize) <
      Math.abs(BLENDER_SIZES[closest].value - blenderSize)
        ? index
        : closest,
    0,
  );
  const sizeLabel = BLENDER_SIZES[sizeIndex].label;

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
            setLiveMessage("Smoothie complete. Drag the glass jug to the cup.");
          }, 0);
        }
        return next;
      });
    }, 45);
    return () => window.clearInterval(timer);
  }, [blending]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (!document.hidden) return;
      setBlending(false);
      setDragging(false);
      setServeMode((current) =>
        current === "dragging" ||
        current === "pouring" ||
        current === "auto-pouring"
          ? "returning"
          : current,
      );
      if (spillMode === "tipping") {
        setSpillMode("idle");
      } else if (spillMode === "spilling") {
        setFruits((current) =>
          current.map((fruit) =>
            fruit.inJar
              ? { ...fruit, spilled: fruit.poured }
              : fruit,
          ),
        );
        setSpillMode("settling");
      }
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", stopWhenHidden);
  }, [spillMode]);

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

  const transferJuice = useCallback((requested: number) => {
    setFruits((current) => {
      const active = current.filter((fruit) => fruit.inJar);
      const currentCup = active.reduce(
        (sum, fruit) =>
          sum + Math.max(0, fruit.poured - fruit.spilled),
        0,
      );
      const remaining = active.reduce(
        (sum, fruit) => sum + Math.max(0, fruit.juice - fruit.poured),
        0,
      );
      const accepted = Math.min(
        requested,
        remaining,
        Math.max(0, CUP_CAPACITY - currentCup),
      );
      if (accepted <= 0.0001 || remaining <= 0.0001) return current;

      return current.map((fruit) => {
        if (!fruit.inJar) return fruit;
        const fruitRemaining = Math.max(0, fruit.juice - fruit.poured);
        if (fruitRemaining <= 0) return fruit;
        const share = fruitRemaining / remaining;
        return {
          ...fruit,
          poured: Math.min(
            fruit.juice,
            fruit.poured + accepted * share,
          ),
        };
      });
    });
  }, []);

  useEffect(() => {
    if (!pouring) return;

    let interval = 0;
    const delay = window.setTimeout(
      () => {
        interval = window.setInterval(
          () => transferJuice(POUR_RATE * 0.05),
          50,
        );
      },
      reducedMotion ? 0 : 280,
    );

    return () => {
      window.clearTimeout(delay);
      if (interval) window.clearInterval(interval);
    };
  }, [pouring, reducedMotion, transferJuice]);

  useEffect(() => {
    if (!pouring || canServe) return;
    const timer = window.setTimeout(() => {
      setServeMode("returning");
      setDragging(false);
      setLiveMessage(
        cupUnits >= CUP_CAPACITY - 0.01
          ? "Crystal cup filled. The remaining smoothie stays in the jug."
          : "Smoothie served. The jug is empty.",
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canServe, cupUnits, pouring]);

  const transferCupToCounter = useCallback((requested: number) => {
    setFruits((current) => {
      const active = current.filter((fruit) => fruit.inJar);
      const currentCup = active.reduce(
        (sum, fruit) =>
          sum + Math.max(0, fruit.poured - fruit.spilled),
        0,
      );
      const accepted = Math.min(requested, currentCup);
      if (accepted <= 0.0001 || currentCup <= 0.0001) return current;

      return current.map((fruit) => {
        if (!fruit.inJar) return fruit;
        const fruitInCup = Math.max(0, fruit.poured - fruit.spilled);
        if (fruitInCup <= 0) return fruit;
        return {
          ...fruit,
          spilled: Math.min(
            fruit.poured,
            fruit.spilled + accepted * (fruitInCup / currentCup),
          ),
        };
      });
    });
  }, []);

  useEffect(() => {
    if (spillMode !== "tipping") return;
    const timer = window.setTimeout(
      () => setSpillMode("spilling"),
      reducedMotion ? 0 : 320,
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion, spillMode]);

  useEffect(() => {
    if (spillMode !== "spilling") return;
    const timer = window.setInterval(
      () => transferCupToCounter(SPILL_RATE * 0.05),
      50,
    );
    return () => window.clearInterval(timer);
  }, [spillMode, transferCupToCounter]);

  useEffect(() => {
    if (spillMode !== "spilling" || cupUnits > 0.01) return;
    const timer = window.setTimeout(() => {
      setFruits((current) =>
        current.map((fruit) =>
          fruit.inJar ? { ...fruit, spilled: fruit.poured } : fruit,
        ),
      );
      setSpillMode("settling");
      setLiveMessage(
        "Cup emptied. The smoothie is spreading across the countertop.",
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cupUnits, spillMode]);

  const finishSpillSimulation = useCallback(() => {
    setSpillMode((current) =>
      current === "settling" ? "spilled" : current,
    );
    setLiveMessage(
      "The spill has settled into a glossy puddle. Clear the batch to reset.",
    );
  }, []);

  useEffect(() => {
    const returnJug = (message: string) => {
      if (!servingActive) return;
      setServeMode("returning");
      setDragging(false);
      setLiveMessage(message);
    };
    const cancelServing = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      returnJug("Serving canceled. Jug returning to the blender.");
    };
    const returnOnBlur = () =>
      returnJug("Serving paused. Jug returning to the blender.");
    window.addEventListener("keydown", cancelServing);
    window.addEventListener("blur", returnOnBlur);
    return () => {
      window.removeEventListener("keydown", cancelServing);
      window.removeEventListener("blur", returnOnBlur);
    };
  }, [servingActive]);

  useEffect(() => {
    const cancelCupTip = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || spillMode !== "tipping") return;
      setSpillMode("idle");
      setLiveMessage("Cup tip canceled before any smoothie was spilled.");
    };
    const cancelCupTipOnBlur = () => {
      if (spillMode !== "tipping") return;
      setSpillMode("idle");
      setLiveMessage("Cup tip canceled before any smoothie was spilled.");
    };
    window.addEventListener("keydown", cancelCupTip);
    window.addEventListener("blur", cancelCupTipOnBlur);
    return () => {
      window.removeEventListener("keydown", cancelCupTip);
      window.removeEventListener("blur", cancelCupTipOnBlur);
    };
  }, [spillMode]);

  const beginAutoServe = useCallback(() => {
    if (servingActive || spillingActive) {
      setLiveMessage("Finish the current fluid interaction first.");
      return;
    }
    if (!canServe) {
      setLiveMessage(
        spilledUnits > 0.001
          ? "Clear the countertop spill before serving again."
          : blendComplete
          ? "The cup or jug has no room left. Clear the batch to start again."
          : "Blend the fruit until smooth before serving.",
      );
      return;
    }
    setServeMode("auto-pouring");
    setDragging(false);
    setLiveMessage("Jug moving into place. Pouring into the crystal cup.");
  }, [
    blendComplete,
    canServe,
    servingActive,
    spilledUnits,
    spillingActive,
  ]);

  const beginSpill = useCallback(() => {
    if (sceneLocked) {
      setLiveMessage("Finish the current interaction before tipping the cup.");
      return;
    }
    if (!canSpill) {
      setLiveMessage(
        spillMode === "spilled"
          ? "The smoothie is already spread across the counter."
          : "Serve smoothie into the crystal cup before spilling it.",
      );
      return;
    }
    setSpillMode("tipping");
    setDragging(false);
    setLiveMessage(
      "Crystal cup tipping. Watch the smoothie hit and spread across the table.",
    );
  }, [canSpill, sceneLocked, spillMode]);

  const toggleFridge = useCallback(() => {
    if (sceneLocked || cupUnits > 0.001 || spilledUnits > 0.001) {
      setLiveMessage(
        sceneLocked
          ? "Finish the current fluid interaction before using the fridge."
          : "Clear the served smoothie before starting a new batch.",
      );
      return;
    }

    if (!fridgeOpen) {
      setFridgeOpen(true);
      setLiveMessage("Fridge open. Grab a fruit and drag it into the jug.");
      return;
    }

    const kept = fruits.filter((fruit) => !fruit.inFridge);
    const fresh = FRUIT.map((fruit, index) =>
      freshFridgeFruit(nextId.current++, fruit.type, index),
    );
    setFruits([...kept, ...fresh]);
    setFridgeOpen(false);
    setLiveMessage(
      "Fridge closed. Five fresh fruits generated inside.",
    );
  }, [cupUnits, fridgeOpen, fruits, sceneLocked, spilledUnits]);

  const dropFruit = useCallback(
    (
      id: number,
      position: [number, number, number],
      droppedOverJar: boolean,
    ) => {
      if (batchLocked) {
        setLiveMessage("Clear the served smoothie before adding more fruit.");
        return;
      }
      const draggedFruit = fruits.find((fruit) => fruit.id === id);
      const activeFruitCount = fruits.filter(
        (fruit) => fruit.id !== id && !fruit.inFridge,
      ).length;
      const capacityReached =
        Boolean(draggedFruit?.inFridge) && activeFruitCount >= MAX_FRUIT;

      if (capacityReached) {
        setFruits((current) =>
          current.map((fruit) =>
            fruit.id === id
              ? {
                  ...fruit,
                  position: [...fruit.position] as [number, number, number],
                }
              : fruit,
          ),
        );
        setLiveMessage(
          "This batch is full. Mix or clear it before taking more fruit.",
        );
        return;
      }

      const radius = 0.7 * blenderSize;
      const radialDistance = Math.hypot(
        position[0] - BLENDER_X,
        position[2],
      );
      const withinOpening =
        droppedOverJar ||
        (radialDistance < radius &&
          position[1] > 2.35 * blenderSize &&
          position[1] < 4.05 * blenderSize);

      setFruits((current) => {
        const movingFruit = current.find((fruit) => fruit.id === id);
        const currentActiveCount = current.filter(
          (fruit) => fruit.id !== id && !fruit.inFridge,
        ).length;
        if (movingFruit?.inFridge && currentActiveCount >= MAX_FRUIT) {
          return current.map((fruit) =>
            fruit.id === id
              ? {
                  ...fruit,
                  position: [...fruit.position] as [number, number, number],
                }
              : fruit,
          );
        }

        const insideSlot = current.filter(
          (fruit) => fruit.inJar && fruit.id !== id,
        ).length;
        const next = current.map((fruit) => {
          if (fruit.id !== id) return fruit;
          if (withinOpening) {
            return {
              ...fruit,
              inJar: true,
              inFridge: false,
              position: jarPosition(insideSlot, blenderSize),
            };
          }
          return {
            ...fruit,
            inJar: false,
            inFridge: false,
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
    [batchLocked, blenderSize, fruits],
  );

  const moveBoardFruitToJug = useCallback(() => {
    if (blending || batchLocked || sceneLocked) return;
    setFruits((current) => {
      const target = current.find(
        (fruit) =>
          !fruit.inJar && (!fruit.inFridge || fridgeOpen),
      );
      if (!target) return current;
      const insideSlot = current.filter((fruit) => fruit.inJar).length;
      const next = current.map((fruit) =>
        fruit.id === target.id
          ? {
              ...fruit,
              inJar: true,
              inFridge: false,
              position: jarPosition(insideSlot, blenderSize),
            }
          : fruit,
      );
      return reflowBoard(next);
    });
    setLiveMessage("One fruit moved into the jug. Ready to whirl.");
  }, [batchLocked, blenderSize, blending, fridgeOpen, sceneLocked]);

  const resizeBlender = useCallback(
    (nextSize: number) => {
      if (batchLocked || sceneLocked) {
        setLiveMessage(
          sceneLocked
            ? "Finish the current interaction before resizing."
            : "Return and clear the served batch before resizing.",
        );
        return;
      }
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
    [batchLocked, blenderSize, sceneLocked],
  );

  const stepBlenderSize = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = THREE.MathUtils.clamp(
        sizeIndex + direction,
        0,
        BLENDER_SIZES.length - 1,
      );
      resizeBlender(BLENDER_SIZES[nextIndex].value);
    },
    [resizeBlender, sizeIndex],
  );

  const toggleBlend = () => {
    if (sceneLocked || cupUnits > 0.001 || spilledUnits > 0.001) {
      setLiveMessage(
        sceneLocked
          ? "Finish the current interaction before using the blender."
          : "The smoothie has left the jug. Clear the batch to blend again.",
      );
      return;
    }
    if (!insideCount) {
      setLiveMessage("Open the fridge and drop at least one fruit into the jug.");
      return;
    }
    if (blendComplete) {
      setLiveMessage("This batch is already silky smooth. Add fresh fruit or clear it.");
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
    setDragging(false);
    setServeMode("docked");
    setSpillMode("idle");
    setBatchId((current) => current + 1);
    const fresh = FRUIT.map((fruit, index) =>
      freshFridgeFruit(nextId.current++, fruit.type, index),
    );
    setFruits(fresh);
    setFridgeOpen(false);
    setLiveMessage("Batch cleared. Five fresh fruits generated in the fridge.");
  };

  const handleServeModeChange = useCallback((mode: ServeMode) => {
    setServeMode(mode);
    if (mode === "dragging") {
      setLiveMessage("Jug picked up. Drag it over the glowing crystal cup.");
    } else if (mode === "pouring") {
      setLiveMessage("Hold over the cup to pour. Move away to pause.");
    } else if (mode === "returning") {
      setLiveMessage("Jug returning to the blender.");
    }
  }, []);

  const finishJugReturn = useCallback(() => {
    setServeMode(canServe ? "docked" : cupUnits > 0.001 ? "served" : "docked");
    setDragging(false);
  }, [canServe, cupUnits]);

  const phaseLabel = (() => {
    if (spillMode === "tipping") return "Cup tipping";
    if (spillMode === "spilling") return "Fluid spill";
    if (spillMode === "settling") return "Puddle spreading";
    if (spillMode === "spilled") return "Counter covered";
    if (pouring) return "Pouring smoothie";
    if (serveMode === "dragging") return "Carry jug to cup";
    if (serveMode === "returning") return "Jug returning";
    if (serveMode === "served") {
      return cupUnits >= CUP_CAPACITY - 0.01
        ? "Crystal cup full"
        : "Smoothie served";
    }
    if (blendProgress >= 0.98) return "Silky smooth";
    if (blending && blendProgress > 0.62) return "Fluid vortex";
    if (blending && blendProgress > 0.24) return "Juice releasing";
    if (blending) return "Crushing fruit";
    if (blendProgress > 0.02) return "Partly blended";
    return insideCount ? "Ready to whirl" : "Waiting for fruit";
  })();
  const statusProgress =
    spillingActive || spilledUnits > 0.001
      ? spillFraction
      : cupUnits > 0.001 || servingActive
        ? cupFraction
        : blendProgress;
  const serveLabel = (() => {
    if (spillMode === "tipping") return "Cup tipping toward the table";
    if (spillMode === "spilling") {
      return `Spilling · ${Math.round(spillFraction * 100)}%`;
    }
    if (spillMode === "settling") return "Fluid spreading and settling";
    if (spillMode === "spilled") return "Smoothie puddle settled";
    if (pouring) return `Pouring · ${Math.round(cupFraction * 100)}%`;
    if (serveMode === "dragging") return "Hold the jug over the cup";
    if (canSpill) return "Click the cup to spill it";
    if (cupUnits >= CUP_CAPACITY - 0.01) return "Crystal cup filled";
    if (jarUnits <= 0.01 && cupUnits > 0) return "Smoothie served";
    return canServe ? "Drag the jug to the cup" : "Blend until silky smooth";
  })();
  const serveButtonLabel =
    spillMode === "tipping" || spillMode === "spilling" ? "Spilling…"
    : spillMode === "settling" ? "Settling…"
    : spillMode === "spilled" ? "Spilled"
    : canSpill ? "Spill it"
    : pouring ? "Pouring…"
    : cupUnits >= CUP_CAPACITY - 0.01 ? "Cup filled"
    : jarUnits <= 0.01 && cupUnits > 0 ? "Jug empty"
    : "Pour for me";
  const cupAction = canSpill ? beginSpill : beginAutoServe;
  const cupActionDisabled =
    servingActive || spillingActive || (!canServe && !canSpill);
  const cupActionLabel =
    spillMode === "tipping"
      ? "Crystal cup is tipping toward the counter"
      : spillMode === "spilling"
        ? "Smoothie is spilling from the crystal cup"
        : spillMode === "settling"
          ? "Smoothie spill is spreading across the counter"
          : spillMode === "spilled"
            ? "Smoothie spilled; clear the batch to reset"
            : canSpill
              ? "Spill all smoothie from the crystal cup onto the counter"
              : "Automatically pour the smoothie into the crystal cup";

  return (
    <main className="studio-shell">
      <div
        className={`canvas-wrap ${sceneLocked ? "is-dragging" : ""}`}
        aria-label="Interactive 3D kitchen with a fruit blender and crystal serving cup"
      >
        <Canvas
          shadows
          dpr={[1, 1.6]}
          camera={{ position: [7.4, 4.8, 10.2], fov: 38, near: 0.1, far: 80 }}
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
              sizeIndex={sizeIndex}
              sizeLabel={sizeLabel}
              blending={blending}
              blendProgress={blendProgress}
              blendComplete={blendComplete}
              smoothieColor={jarColor}
              cupColor={cupColor}
              spillColor={spillColor}
              jarUnits={jarUnits}
              cupUnits={cupUnits}
              spilledUnits={spilledUnits}
              cupFraction={cupFraction}
              spillFraction={spillFraction}
              canServe={canServe}
              canSpill={canSpill}
              serveMode={serveMode}
              spillMode={spillMode}
              batchId={batchId}
              batchLocked={batchLocked}
              fridgeOpen={fridgeOpen}
              fridgeCount={fridgeCount}
              dragging={sceneLocked}
              reducedMotion={reducedMotion}
              onDragging={setDragging}
              onFruitDrop={dropFruit}
              onFridgeToggle={toggleFridge}
              onQuickAdd={moveBoardFruitToJug}
              onBlend={toggleBlend}
              onSizeStep={stepBlenderSize}
              onServeModeChange={handleServeModeChange}
              onReturnComplete={finishJugReturn}
              onAutoServe={beginAutoServe}
              onSpill={beginSpill}
              onSpillSettled={finishSpillSimulation}
            />
          </Suspense>
        </Canvas>
      </div>

      <header className="brand-lockup" aria-labelledby="studio-title">
        <div className="eyebrow">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          BLENDROOM · KITCHEN LAB
        </div>
        <h1 id="studio-title">Blend what&apos;s fresh.</h1>
        <p>Blend, pour, then click the crystal cup and watch fluid physics take over.</p>
      </header>

      <aside
        className={`utility-pill ${
          blending || pouring || spillingActive ? "is-live" : ""
        }`}
      >
        <span className="status-dot" aria-hidden="true" />
        <div className="status-copy">
          <span>
            {blending
              ? "Motor running"
              : pouring
                ? "Serving now"
                : spillingActive
                  ? "Fluid simulation"
                  : "Kitchen status"}
          </span>
          <strong>
            {phaseLabel}
            <em>{Math.round(statusProgress * 100)}%</em>
          </strong>
        </div>
        <button
          className="utility-button"
          type="button"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? "Turn motor sound on" : "Mute motor sound"}
          title={muted ? "Sound off" : "Sound on"}
        >
          {muted ? "⊘" : "♪"}
        </button>
        <button
          className="utility-button clear-button"
          type="button"
          onClick={reset}
          disabled={
            !insideCount &&
            !onBoardCount &&
            cupUnits <= 0.001 &&
            spilledUnits <= 0.001
          }
          aria-label="Clear the current batch and restock the fridge"
          title="Fresh batch"
        >
          ↺
        </button>
      </aside>

      <aside
        className={`serve-panel ${canServe || canSpill ? "is-ready" : ""} ${
          pouring ? "is-pouring" : ""
        } ${canSpill ? "is-spill-ready" : ""} ${
          spillingActive ? "is-spilling" : ""
        }`}
        aria-labelledby="serve-title"
      >
        <div
          className={`serve-cup-glyph ${
            spillingActive || spillMode === "spilled" ? "is-tipped" : ""
          }`}
          aria-hidden="true"
        >
          <span style={{ height: `${Math.max(5, cupFraction * 82)}%` }} />
        </div>
        <div className="serve-copy">
          <small id="serve-title">
            {spilledUnits > 0.001 || spillingActive
              ? "Counter fluid"
              : "Crystal serve"}
          </small>
          <strong>{serveLabel}</strong>
          <progress
            value={
              spilledUnits > 0.001 || spillingActive
                ? spilledUnits
                : cupUnits
            }
            max={
              spilledUnits > 0.001 || spillingActive
                ? Math.max(0.001, servedUnits)
                : CUP_CAPACITY
            }
            aria-label={
              spilledUnits > 0.001 || spillingActive
                ? "Spill simulation progress"
                : "Crystal cup fill level"
            }
            aria-valuetext={
              spilledUnits > 0.001 || spillingActive
                ? `${Math.round(spillFraction * 100)}% spilled`
                : `${Math.round(cupFraction * 100)}% full`
            }
          />
        </div>
        <button
          type="button"
          onClick={cupAction}
          disabled={cupActionDisabled}
          aria-label={cupActionLabel}
        >
          {serveButtonLabel}
        </button>
      </aside>

      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>
    </main>
  );
}

type SceneProps = {
  fruits: FruitItem[];
  blenderSize: number;
  sizeIndex: number;
  sizeLabel: string;
  blending: boolean;
  blendProgress: number;
  blendComplete: boolean;
  smoothieColor: string;
  cupColor: string;
  spillColor: string;
  jarUnits: number;
  cupUnits: number;
  spilledUnits: number;
  cupFraction: number;
  spillFraction: number;
  canServe: boolean;
  canSpill: boolean;
  serveMode: ServeMode;
  spillMode: SpillMode;
  batchId: number;
  batchLocked: boolean;
  fridgeOpen: boolean;
  fridgeCount: number;
  dragging: boolean;
  reducedMotion: boolean;
  onDragging: (dragging: boolean) => void;
  onFruitDrop: (
    id: number,
    position: [number, number, number],
    droppedOverJar: boolean,
  ) => void;
  onFridgeToggle: () => void;
  onQuickAdd: () => void;
  onBlend: () => void;
  onSizeStep: (direction: -1 | 1) => void;
  onServeModeChange: (mode: ServeMode) => void;
  onReturnComplete: () => void;
  onAutoServe: () => void;
  onSpill: () => void;
  onSpillSettled: () => void;
};

function BlendroomScene({
  fruits,
  blenderSize,
  sizeIndex,
  sizeLabel,
  blending,
  blendProgress,
  blendComplete,
  smoothieColor: color,
  cupColor,
  spillColor,
  jarUnits,
  cupUnits,
  spilledUnits,
  cupFraction,
  spillFraction,
  canServe,
  canSpill,
  serveMode,
  spillMode,
  batchId,
  batchLocked,
  fridgeOpen,
  fridgeCount,
  dragging,
  reducedMotion,
  onDragging,
  onFruitDrop,
  onFridgeToggle,
  onQuickAdd,
  onBlend,
  onSizeStep,
  onServeModeChange,
  onReturnComplete,
  onAutoServe,
  onSpill,
  onSpillSettled,
}: SceneProps) {
  const compact = useThree((state) => state.size.width < 880);
  const spoutWorldRef = useRef(
    new THREE.Vector3(BLENDER_X, 3.06 * blenderSize, 0),
  );
  const streamFlowRef = useRef(0);
  const cupRimWorldRef = useRef(
    new THREE.Vector3(CUP_POSITION.x + 0.42, CUP_RIM_Y, CUP_POSITION.z),
  );
  const spillFlowRef = useRef(0);
  const activeFruitCount = fruits.filter((fruit) => !fruit.inFridge).length;
  const canTakeFromFridge =
    !dragging && !batchLocked && activeFruitCount < MAX_FRUIT;
  const canQuickAdd =
    !dragging &&
    !batchLocked &&
    (fruits.some((fruit) => !fruit.inJar && !fruit.inFridge) ||
      (fridgeOpen && fridgeCount > 0 && canTakeFromFridge));
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
  const spillSources = useMemo<SpillSource[]>(
    () =>
      fruits
        .filter((fruit) => fruit.inJar && fruit.spilled > 0.0001)
        .map((fruit) => ({
          id: fruit.id,
          color: FRUIT_COLORS[fruit.type],
          phase: fruit.phase,
          amount: fruit.spilled,
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
      <Fridge
        open={fridgeOpen}
        stockCount={fridgeCount}
        blending={blending || batchLocked || dragging}
        canTakeFruit={canTakeFromFridge}
        canQuickAdd={canQuickAdd}
        reducedMotion={reducedMotion}
        onToggle={onFridgeToggle}
        onQuickAdd={onQuickAdd}
      />
      <BlenderRig
        size={blenderSize}
        sizeIndex={sizeIndex}
        sizeLabel={sizeLabel}
        blending={blending}
        blendProgress={blendProgress}
        blendComplete={blendComplete}
        smoothieColor={color}
        jarUnits={jarUnits}
        canServe={canServe}
        serveMode={serveMode}
        fruitCount={fruits.filter((fruit) => fruit.inJar).length}
        juiceSources={juiceSources}
        reducedMotion={reducedMotion}
        controlsLocked={batchLocked || dragging}
        spoutWorldRef={spoutWorldRef}
        streamFlowRef={streamFlowRef}
        onBlend={onBlend}
        onSizeStep={onSizeStep}
        onDragging={onDragging}
        onServeModeChange={onServeModeChange}
        onReturnComplete={onReturnComplete}
      />
      <CrystalCup
        color={cupColor}
        fillFraction={cupFraction}
        spillFraction={spillFraction}
        units={cupUnits}
        canServe={canServe}
        canSpill={canSpill}
        serveMode={serveMode}
        spillMode={spillMode}
        reducedMotion={reducedMotion}
        streamFlowRef={streamFlowRef}
        spillFlowRef={spillFlowRef}
        cupRimWorldRef={cupRimWorldRef}
        onAutoServe={onAutoServe}
        onSpill={onSpill}
      />
      <PourStream
        color={cupUnits > 0.001 ? cupColor : color}
        fillFraction={cupFraction}
        spoutWorldRef={spoutWorldRef}
        flowRef={streamFlowRef}
        reducedMotion={reducedMotion}
      />
      <CupSpillStream
        color={spilledUnits > 0.001 ? spillColor : cupColor}
        cupRimWorldRef={cupRimWorldRef}
        flowRef={spillFlowRef}
        reducedMotion={reducedMotion}
      />
      <SpillFluidSimulation
        key={batchId}
        sources={spillSources}
        color={spillColor}
        spillFraction={spillFraction}
        spillMode={spillMode}
        blenderSize={blenderSize}
        cupRimWorldRef={cupRimWorldRef}
        flowRef={spillFlowRef}
        reducedMotion={reducedMotion}
        onSettled={onSpillSettled}
      />

      {fruits.map((fruit) => (
        <DraggableFruit
          key={fruit.id}
          fruit={fruit}
          blenderSize={blenderSize}
          blending={blending}
          fridgeOpen={fridgeOpen}
          disabled={
            dragging ||
            batchLocked ||
            (fruit.inFridge && !canTakeFromFridge)
          }
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
        minDistance={compact ? 11.5 : 6.8}
        maxDistance={compact ? 23 : 14.5}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.48}
        minAzimuthAngle={-0.55}
        maxAzimuthAngle={0.72}
        target={compact ? [-1.55, 1.5, 0] : [-0.7, 1.55, 0]}
        dampingFactor={0.07}
      />
      <ResponsiveCamera reducedMotion={reducedMotion} />
    </>
  );
}

function ResponsiveCamera({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, size } = useThree();

  useEffect(() => {
    const isMobile = size.width < 880;
    if (isMobile) {
      camera.position.set(6.4, 5.6, 16.2);
    } else {
      camera.position.set(7.4, 4.8, 10.2);
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = THREE.MathUtils.degToRad(isMobile ? 50 : 38);
      const focalLength =
        (0.5 * camera.getFilmHeight()) / Math.tan(targetFov * 0.5);
      camera.setFocalLength(focalLength);
    }
    camera.lookAt(isMobile ? -1.55 : -0.7, isMobile ? 1.5 : 1.55, 0);
  }, [camera, reducedMotion, size.height, size.width]);

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

function Fridge({
  open,
  stockCount,
  blending,
  canTakeFruit,
  canQuickAdd,
  reducedMotion,
  onToggle,
  onQuickAdd,
}: {
  open: boolean;
  stockCount: number;
  blending: boolean;
  canTakeFruit: boolean;
  canQuickAdd: boolean;
  reducedMotion: boolean;
  onToggle: () => void;
  onQuickAdd: () => void;
}) {
  const doorPivot = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (!doorPivot.current) return;
    const target = open ? -1.42 : 0;
    doorPivot.current.rotation.y = reducedMotion
      ? target
      : THREE.MathUtils.damp(
          doorPivot.current.rotation.y,
          target,
          7.5,
          Math.min(delta, 0.05),
        );
  });

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <group position={[FRIDGE_X, 0, FRIDGE_Z]}>
      <mesh castShadow receiveShadow position={[0, 2.16, -0.63]}>
        <boxGeometry args={[1.86, 4.32, 0.14]} />
        <meshStandardMaterial color="#cbd0c2" roughness={0.52} />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} castShadow position={[x, 2.16, 0]}>
          <boxGeometry args={[0.14, 4.32, 1.38]} />
          <meshStandardMaterial color="#dce0d4" roughness={0.48} />
        </mesh>
      ))}
      {[0.08, 4.24].map((y) => (
        <mesh key={y} castShadow position={[0, y, 0]}>
          <boxGeometry args={[1.88, 0.16, 1.38]} />
          <meshStandardMaterial color="#dce0d4" roughness={0.5} />
        </mesh>
      ))}

      <mesh position={[0, 2.15, -0.54]}>
        <boxGeometry args={[1.62, 3.98, 0.04]} />
        <meshStandardMaterial color="#748177" roughness={0.74} />
      </mesh>
      {[1.72, 2.62, 3.52].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.18]}>
            <boxGeometry args={[1.62, 0.055, 1.06]} />
            <meshPhysicalMaterial
              color="#d7e8e3"
              transparent
              opacity={0.58}
              roughness={0.18}
              transmission={0.12}
            />
          </mesh>
          <mesh position={[0, y + 0.025, 0.7]}>
            <boxGeometry args={[1.65, 0.055, 0.05]} />
            <meshStandardMaterial color="#b6c5bd" metalness={0.25} roughness={0.34} />
          </mesh>
        </group>
      ))}
      <pointLight
        position={[0, 3.55, 0.48]}
        intensity={open ? 8 : 0}
        distance={3.2}
        color="#fff1bd"
      />

      <group ref={doorPivot} position={[-0.94, 2.16, 0.73]}>
        <RoundedBox
          args={[1.9, 4.34, 0.16]}
          radius={0.12}
          smoothness={4}
          position={[0.95, 0, 0]}
          castShadow
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <meshStandardMaterial
            color={hovered ? "#eef0e7" : "#e3e5dc"}
            roughness={0.36}
            metalness={0.08}
          />
        </RoundedBox>
        <RoundedBox
          args={[0.11, 1.18, 0.13]}
          radius={0.04}
          smoothness={3}
          position={[1.58, 0.22, 0.14]}
          castShadow
        >
          <meshStandardMaterial color="#a77c50" metalness={0.72} roughness={0.22} />
        </RoundedBox>
        <mesh position={[0.95, -0.42, 0.13]}>
          <boxGeometry args={[1.46, 0.025, 0.025]} />
          <meshStandardMaterial color="#c4c9bd" roughness={0.42} />
        </mesh>
        {[0.62, 0.78, 0.94, 1.1, 1.26].map((x) => (
          <mesh key={x} position={[x, 1.7, 0.13]}>
            <boxGeometry args={[0.07, 0.018, 0.028]} />
            <meshStandardMaterial color="#9da69c" roughness={0.48} />
          </mesh>
        ))}
      </group>

      <Html
        center
        position={[0, -0.38, 0.78]}
        zIndexRange={[60, 0]}
        wrapperClass="fridge-anchor"
      >
        <div
          className={`fridge-callout ${open ? "is-open" : ""}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="fridge-toggle"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-expanded={open}
          >
            <span className="fridge-glyph" aria-hidden="true">
              {open ? "↙" : "▥"}
            </span>
            <span>
              <small>
                {open
                  ? canTakeFruit
                    ? `${stockCount} on the shelves`
                    : "Current batch is full"
                  : `${stockCount} fresh inside`}
              </small>
              <strong>{open ? "Close · restock" : "Open fridge"}</strong>
            </span>
          </button>
          {open && (
            <button
              type="button"
              className="quick-add"
              onClick={(event) => {
                event.stopPropagation();
                onQuickAdd();
              }}
              disabled={blending || !canQuickAdd}
            >
              Place one <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
      </Html>
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

function BlenderPowerButton({
  blending,
  ready,
  complete,
  disabled,
  onPress,
}: {
  blending: boolean;
  ready: boolean;
  complete: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  const buttonColor = blending
    ? "#435947"
    : complete
      ? "#c99960"
      : ready
        ? "#e05545"
        : "#b7a99b";

  return (
    <group>
      <mesh
        position={[0, 0.48, 0.728]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          onPress();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerOver={(event) => {
          event.stopPropagation();
          if (!disabled) setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.06 : 1}
      >
        <cylinderGeometry args={[0.27, 0.27, 0.08, 40]} />
        <meshStandardMaterial
          color={buttonColor}
          roughness={0.34}
          emissive={buttonColor}
          emissiveIntensity={blending ? 0.42 : ready ? 0.16 : 0.04}
        />
      </mesh>
      <mesh position={[0, 0.48, 0.774]}>
        <torusGeometry args={[0.145, 0.022, 12, 32]} />
        <meshStandardMaterial
          color={blending ? "#d8f0d7" : "#ffe0d4"}
          emissive={blending ? "#7bc37e" : "#a53125"}
          emissiveIntensity={blending ? 0.72 : 0.18}
        />
      </mesh>
      <Html
        center
        position={[0, 0.48, 0.81]}
        zIndexRange={[70, 0]}
        wrapperClass="power-anchor"
      >
        <button
          type="button"
          className={`appliance-power-hit ${blending ? "is-running" : ""} ${
            ready && !blending ? "is-ready" : ""
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onPress();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          disabled={disabled}
          aria-label={
            disabled
              ? "Blender controls unavailable during the current interaction"
              : blending
              ? "Stop blender"
              : complete
                ? "Smoothie is complete"
                : ready
                  ? "Start blending"
                  : "Add fruit before blending"
          }
          aria-pressed={blending}
        >
          <span aria-hidden="true">{blending ? "■" : "▶"}</span>
        </button>
      </Html>
    </group>
  );
}

function BlenderRig({
  size,
  sizeIndex,
  sizeLabel,
  blending,
  blendProgress,
  blendComplete,
  smoothieColor: color,
  jarUnits,
  canServe,
  serveMode,
  fruitCount,
  juiceSources,
  reducedMotion,
  controlsLocked,
  spoutWorldRef,
  streamFlowRef,
  onBlend,
  onSizeStep,
  onDragging,
  onServeModeChange,
  onReturnComplete,
}: {
  size: number;
  sizeIndex: number;
  sizeLabel: string;
  blending: boolean;
  blendProgress: number;
  blendComplete: boolean;
  smoothieColor: string;
  jarUnits: number;
  canServe: boolean;
  serveMode: ServeMode;
  fruitCount: number;
  juiceSources: JuiceSource[];
  reducedMotion: boolean;
  controlsLocked: boolean;
  spoutWorldRef: MutableRefObject<THREE.Vector3>;
  streamFlowRef: MutableRefObject<number>;
  onBlend: () => void;
  onSizeStep: (direction: -1 | 1) => void;
  onDragging: (dragging: boolean) => void;
  onServeModeChange: (mode: ServeMode) => void;
  onReturnComplete: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const jugCarrier = useRef<THREE.Group>(null);
  const tiltPivot = useRef<THREE.Group>(null);
  const jugTiltRef = useRef(0);
  const spoutAnchor = useRef<THREE.Object3D>(null);
  const blade = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const rpm = useRef(0);
  const activePointer = useRef<number | null>(null);
  const locallyDragging = useRef(false);
  const overCup = useRef(false);
  const returnNotified = useRef(false);
  const dragPlane = useRef(
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  );
  const dragStartHit = useRef(new THREE.Vector3());
  const dragStartPosition = useRef(new THREE.Vector3());
  const dragTarget = useRef(new THREE.Vector3());
  const [hovered, setHovered] = useState(false);
  const pourAngle = -0.96;
  const pivot = useMemo(() => new THREE.Vector3(0.88, 2.28, 0), []);
  const spout = useMemo(() => new THREE.Vector3(0.84, 3.06, 0), []);
  const cupMouth = useMemo(
    () => new THREE.Vector3(CUP_POSITION.x, CUP_RIM_Y, CUP_POSITION.z),
    [],
  );
  const pourPosition = useMemo(() => {
    const transformedSpout = spout
      .clone()
      .sub(pivot)
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), pourAngle)
      .add(pivot);
    const desiredSpoutY = CUP_RIM_Y + 1.02;
    return new THREE.Vector3(
      (CUP_POSITION.x - BLENDER_X) / size - transformedSpout.x,
      desiredSpoutY / size - transformedSpout.y,
      CUP_POSITION.z / size - transformedSpout.z,
    );
  }, [pivot, pourAngle, size, spout]);

  const jarProfile = useMemo(
    () => [
      new THREE.Vector2(0.56, 0),
      new THREE.Vector2(0.6, 0.12),
      new THREE.Vector2(0.78, 1.85),
      new THREE.Vector2(0.82, 2.08),
    ],
    [],
  );

  useEffect(() => {
    document.body.style.cursor =
      hovered && canServe && serveMode === "docked" ? "grab" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [canServe, hovered, serveMode]);

  useEffect(() => {
    if (
      serveMode !== "returning" &&
      serveMode !== "served" &&
      serveMode !== "docked" &&
      serveMode !== "auto-pouring"
    ) {
      return;
    }
    locallyDragging.current = false;
    activePointer.current = null;
    overCup.current = false;
    if (serveMode !== "auto-pouring") onDragging(false);
  }, [onDragging, serveMode]);

  useEffect(
    () => () => {
      locallyDragging.current = false;
      activePointer.current = null;
      streamFlowRef.current = 0;
      onDragging(false);
      document.body.style.cursor = "";
    },
    [onDragging, streamFlowRef],
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
    if (jugCarrier.current && tiltPivot.current) {
      const pouringPose =
        serveMode === "pouring" || serveMode === "auto-pouring";
      const targetPosition =
        serveMode === "dragging" && locallyDragging.current
          ? dragTarget.current
          : pouringPose
            ? pourPosition
            : new THREE.Vector3();
      const targetTilt = pouringPose
        ? pourAngle
        : serveMode === "dragging"
          ? -0.08 *
            THREE.MathUtils.clamp(dragTarget.current.x / 1.2, 0, 1)
          : 0;
      const speed = reducedMotion
        ? 80
        : serveMode === "dragging"
          ? 18
          : serveMode === "returning"
            ? 7
            : 8.5;

      jugCarrier.current.position.x = THREE.MathUtils.damp(
        jugCarrier.current.position.x,
        targetPosition.x,
        speed,
        dt,
      );
      jugCarrier.current.position.y = THREE.MathUtils.damp(
        jugCarrier.current.position.y,
        targetPosition.y,
        speed,
        dt,
      );
      jugCarrier.current.position.z = THREE.MathUtils.damp(
        jugCarrier.current.position.z,
        targetPosition.z,
        speed,
        dt,
      );
      tiltPivot.current.rotation.z = THREE.MathUtils.damp(
        tiltPivot.current.rotation.z,
        targetTilt,
        speed,
        dt,
      );
      jugTiltRef.current = tiltPivot.current.rotation.z;

      spoutAnchor.current?.updateWorldMatrix(true, false);
      spoutAnchor.current?.getWorldPosition(spoutWorldRef.current);
      const desiredFlow =
        pouringPose && canServe
          ? THREE.MathUtils.smoothstep(
              Math.abs(tiltPivot.current.rotation.z),
              0.5,
              Math.abs(pourAngle),
            )
          : 0;
      streamFlowRef.current = THREE.MathUtils.damp(
        streamFlowRef.current,
        desiredFlow,
        reducedMotion ? 60 : 9,
        dt,
      );

      if (serveMode === "returning") {
        const home =
          jugCarrier.current.position.length() < 0.018 &&
          Math.abs(tiltPivot.current.rotation.z) < 0.018;
        if (home && !returnNotified.current) {
          returnNotified.current = true;
          onReturnComplete();
        }
      } else {
        returnNotified.current = false;
      }
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

  const pointerTarget = (event: ThreeEvent<PointerEvent>) =>
    event.target as unknown as {
      setPointerCapture: (pointerId: number) => void;
      releasePointerCapture: (pointerId: number) => void;
    };

  const startJugDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!canServe || locallyDragging.current || !jugCarrier.current) return;
    event.stopPropagation();
    locallyDragging.current = true;
    activePointer.current = event.pointerId;
    overCup.current = false;
    pointerTarget(event).setPointerCapture(event.pointerId);
    dragPlane.current.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
    );
    const hit = new THREE.Vector3();
    if (event.ray.intersectPlane(dragPlane.current, hit)) {
      dragStartHit.current.copy(hit);
    }
    dragStartPosition.current.copy(jugCarrier.current.position);
    dragTarget.current.copy(jugCarrier.current.position);
    onDragging(true);
    onServeModeChange("dragging");
    document.body.style.cursor = "grabbing";
  };

  const moveJug = (event: ThreeEvent<PointerEvent>) => {
    if (
      !locallyDragging.current ||
      activePointer.current !== event.pointerId
    ) {
      return;
    }
    event.stopPropagation();
    const hit = new THREE.Vector3();
    if (!event.ray.intersectPlane(dragPlane.current, hit)) return;
    const delta = hit.sub(dragStartHit.current).multiplyScalar(1 / size);
    dragTarget.current.copy(dragStartPosition.current).add(delta);
    dragTarget.current.x = THREE.MathUtils.clamp(
      dragTarget.current.x,
      -0.25,
      1.75,
    );
    dragTarget.current.y = THREE.MathUtils.clamp(
      dragTarget.current.y,
      -0.12,
      1.15,
    );
    dragTarget.current.z = THREE.MathUtils.clamp(
      dragTarget.current.z,
      -0.28,
      0.28,
    );

    const inCupZone = event.ray.distanceToPoint(cupMouth) < 0.86;
    if (inCupZone !== overCup.current) {
      overCup.current = inCupZone;
      onServeModeChange(inCupZone ? "pouring" : "dragging");
    }
  };

  const finishJugDrag = (event: ThreeEvent<PointerEvent>) => {
    if (
      !locallyDragging.current ||
      activePointer.current !== event.pointerId
    ) {
      return;
    }
    event.stopPropagation();
    locallyDragging.current = false;
    activePointer.current = null;
    overCup.current = false;
    try {
      pointerTarget(event).releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be gone after a browser-level cancel.
    }
    document.body.style.cursor = hovered ? "grab" : "";
    onDragging(false);
    onServeModeChange("returning");
  };

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
        <BlenderPowerButton
          blending={blending}
          ready={fruitCount > 0 && !blendComplete && !controlsLocked}
          complete={blendComplete}
          disabled={controlsLocked}
          onPress={onBlend}
        />
        <mesh position={[-0.45, 0.1, 0.55]}>
          <boxGeometry args={[0.28, 0.06, 0.25]} />
          <meshStandardMaterial color="#4e4237" roughness={0.72} />
        </mesh>
        <mesh position={[0.45, 0.1, 0.55]}>
          <boxGeometry args={[0.28, 0.06, 0.25]} />
          <meshStandardMaterial color="#4e4237" roughness={0.72} />
        </mesh>
      </group>

      <Html
        center
        position={[0, -0.24, 0.28]}
        zIndexRange={[65, 0]}
        wrapperClass="blender-stepper-anchor"
      >
        <div
          className="size-stepper"
          aria-label="Blender size"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSizeStep(-1);
            }}
            disabled={controlsLocked || sizeIndex === 0}
            aria-label="Decrease blender size"
          >
            ←
          </button>
          <div>
            <small>Blender size</small>
            <strong>{sizeLabel}</strong>
            <output>{size.toFixed(2)}×</output>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSizeStep(1);
            }}
            disabled={
              controlsLocked || sizeIndex === BLENDER_SIZES.length - 1
            }
            aria-label="Increase blender size"
          >
            →
          </button>
        </div>
      </Html>

      {canServe && serveMode === "docked" && (
        <Html
          center
          position={[0.25, 3.75, 0]}
          zIndexRange={[55, 0]}
          wrapperClass="jug-hint-anchor"
        >
          <div className="jug-hint">DRAG JUG TO SERVE</div>
        </Html>
      )}

      <group ref={jugCarrier}>
        <group ref={tiltPivot} position={[pivot.x, pivot.y, pivot.z]}>
          <group position={[-pivot.x, -pivot.y, -pivot.z]}>
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
              <mesh
                position={[0, 2.02, 0]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <torusGeometry args={[0.8, 0.055, 16, 64]} />
                <meshStandardMaterial
                  color="#a7c7c2"
                  transparent
                  opacity={0.52}
                  roughness={0.18}
                />
              </mesh>
              <RoundedBox
                args={[0.28, 0.075, 0.46]}
                radius={0.035}
                smoothness={3}
                position={[0.82, 2.045, 0]}
              >
                <meshPhysicalMaterial
                  color="#b9dad6"
                  transparent
                  opacity={0.48}
                  transmission={0.25}
                  roughness={0.12}
                />
              </RoundedBox>
              <mesh
                position={[0.88, 1.26, 0]}
                rotation={[0, 0, Math.PI / 2]}
              >
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
                    <meshStandardMaterial
                      color="#7a9c97"
                      transparent
                      opacity={0.62}
                    />
                  </mesh>
                  <mesh position={[0.65 + index * 0.02, y, 0]}>
                    <boxGeometry args={[0.06, 0.012, 0.012]} />
                    <meshStandardMaterial
                      color="#7a9c97"
                      transparent
                      opacity={0.48}
                    />
                  </mesh>
                </group>
              ))}
            </group>

            {fruitCount > 0 && (
              <JuiceFluid
                blending={blending}
                blendProgress={blendProgress}
                color={color}
                sources={juiceSources}
                remainingUnits={jarUnits}
                reducedMotion={reducedMotion}
                tiltRef={jugTiltRef}
              />
            )}

            <object3D
              ref={spoutAnchor}
              position={[spout.x, spout.y, spout.z]}
            />
            <mesh
              position={[0.16, 2.07, 0]}
              onPointerDown={startJugDrag}
              onPointerMove={moveJug}
              onPointerUp={finishJugDrag}
              onPointerCancel={finishJugDrag}
              onLostPointerCapture={finishJugDrag}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHovered(true);
              }}
              onPointerOut={() => setHovered(false)}
            >
              <boxGeometry args={[1.9, 2.45, 1.55]} />
              <meshBasicMaterial
                transparent
                opacity={0}
                depthWrite={false}
                colorWrite={false}
              />
            </mesh>
          </group>
        </group>
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

function CrystalCup({
  color,
  fillFraction,
  spillFraction,
  units,
  canServe,
  canSpill,
  serveMode,
  spillMode,
  reducedMotion,
  streamFlowRef,
  spillFlowRef,
  cupRimWorldRef,
  onAutoServe,
  onSpill,
}: {
  color: string;
  fillFraction: number;
  spillFraction: number;
  units: number;
  canServe: boolean;
  canSpill: boolean;
  serveMode: ServeMode;
  spillMode: SpillMode;
  reducedMotion: boolean;
  streamFlowRef: MutableRefObject<number>;
  spillFlowRef: MutableRefObject<number>;
  cupRimWorldRef: MutableRefObject<THREE.Vector3>;
  onAutoServe: () => void;
  onSpill: () => void;
}) {
  const cupPivot = useRef<THREE.Group>(null);
  const liquidFrame = useRef<THREE.Group>(null);
  const rimAnchor = useRef<THREE.Object3D>(null);
  const splash = useRef<THREE.Mesh>(null);
  const targetRing = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const fillHeight = 0.82 * fillFraction;
  const surfaceRadius = THREE.MathUtils.lerp(0.27, 0.39, fillFraction);
  const pouring =
    serveMode === "pouring" || serveMode === "auto-pouring";
  const tipping = spillMode !== "idle";
  const spillInteraction = spillMode !== "idle";

  useEffect(() => {
    if (!hovered || (!canServe && !canSpill)) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [canServe, canSpill, hovered]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const targetTilt = tipping ? 1.23 : 0;
    if (cupPivot.current) {
      cupPivot.current.rotation.x = reducedMotion
        ? targetTilt
        : THREE.MathUtils.damp(
            cupPivot.current.rotation.x,
            targetTilt,
            6.8,
            dt,
          );
    }
    if (liquidFrame.current && cupPivot.current) {
      liquidFrame.current.rotation.x =
        -cupPivot.current.rotation.x * 0.9;
      liquidFrame.current.position.z =
        Math.abs(cupPivot.current.rotation.x) * 0.11;
    }
    rimAnchor.current?.updateWorldMatrix(true, false);
    rimAnchor.current?.getWorldPosition(cupRimWorldRef.current);
    const targetSpillFlow =
      spillMode === "spilling" && units > 0.002 ? 1 : 0;
    spillFlowRef.current = THREE.MathUtils.damp(
      spillFlowRef.current,
      targetSpillFlow,
      reducedMotion ? 40 : 9,
      dt,
    );

    if (splash.current) {
      splash.current.visible = streamFlowRef.current > 0.04;
      splash.current.rotation.z +=
        delta * (reducedMotion ? 0.2 : 1.8 + streamFlowRef.current * 2);
      const splashScale =
        reducedMotion
          ? 0.72
          : 0.68 +
            Math.sin(state.clock.elapsedTime * 8) *
              0.08 *
              streamFlowRef.current;
      splash.current.scale.setScalar(splashScale);
    }
    if (targetRing.current) {
      const pulse =
        (canServe || canSpill) && !reducedMotion
          ? 1 + Math.sin(state.clock.elapsedTime * 3.6) * 0.08
          : 1;
      targetRing.current.scale.setScalar(pulse);
    }
  });

  const status =
    spillMode === "spilled"
      ? "TABLE SPILLED"
      : spillMode === "settling"
        ? "JUICE SPREADING"
        : spillMode === "spilling"
          ? `${Math.round(spillFraction * 100)}% SPILLED`
          : spillMode === "tipping"
            ? "TIPPING CUP"
            : canSpill
              ? "CLICK CUP TO SPILL"
              : units >= CUP_CAPACITY - 0.01
      ? "CUP FULL"
      : pouring
        ? `${Math.round(fillFraction * 100)}% FILLED`
        : canServe
          ? "HOLD JUG HERE"
          : units > 0.01
            ? "SMOOTHIE SERVED"
            : "CRYSTAL CUP";

  return (
    <group position={[CUP_POSITION.x, CUP_POSITION.y, CUP_POSITION.z]}>
      <pointLight
        position={[0.25, 0.8, -0.3]}
        intensity={canServe || canSpill ? 3.8 : 1.2}
        distance={2.3}
        color="#bceff1"
      />
      <group ref={cupPivot} position={[0, 0.01, 0.3]}>
        <group position={[0, -0.01, -0.3]}>
          <mesh
            castShadow
            position={[0, 0.57, 0]}
            onClick={(event) => {
              event.stopPropagation();
              if (canSpill) onSpill();
              else if (canServe) onAutoServe();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerOver={(event) => {
              event.stopPropagation();
              setHovered(true);
            }}
            onPointerOut={() => setHovered(false)}
          >
            <cylinderGeometry args={[0.44, 0.3, 1.08, 16, 1, true]} />
            <meshPhysicalMaterial
              color="#e9fbff"
              transparent
              opacity={0.42}
              transmission={0.72}
              thickness={0.2}
              ior={1.52}
              roughness={0.045}
              clearcoat={1}
              clearcoatRoughness={0.06}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh
            position={[0, 1.11, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.44, 0.045, 14, 48]} />
            <meshPhysicalMaterial
              color="#eefcff"
              transparent
              opacity={0.72}
              transmission={0.65}
              roughness={0.035}
              clearcoat={1}
            />
          </mesh>
          <mesh position={[0, 0.08, 0]} receiveShadow>
            <cylinderGeometry args={[0.3, 0.28, 0.14, 16]} />
            <meshPhysicalMaterial
              color="#dff3f4"
              transparent
              opacity={0.58}
              transmission={0.48}
              roughness={0.08}
            />
          </mesh>

          {fillFraction > 0.001 && (
            <group ref={liquidFrame} position={[0, 0.62, 0]}>
              <mesh
                position={[0, 0.15 + fillHeight * 0.5 - 0.62, 0]}
                scale={[1, Math.max(0.001, fillHeight), 1]}
              >
                <cylinderGeometry args={[0.37, 0.27, 1, 32]} />
                <meshPhysicalMaterial
                  color={color}
                  transparent
                  opacity={0.72}
                  roughness={0.2}
                  transmission={0.04}
                  thickness={0.12}
                />
              </mesh>
              <mesh
                position={[0, 0.15 + fillHeight - 0.62, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                scale={surfaceRadius}
              >
                <circleGeometry args={[1, 48]} />
                <meshPhysicalMaterial
                  color={color}
                  transparent
                  opacity={0.86}
                  roughness={0.16}
                  clearcoat={0.45}
                />
              </mesh>
            </group>
          )}

          <mesh
            ref={targetRing}
            visible={canServe || pouring || canSpill}
            position={[0, 1.14, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.59, 0.035, 12, 48]} />
            <meshStandardMaterial
              color={canSpill ? "#db5849" : "#ef8b5d"}
              emissive={canSpill ? "#b63f36" : "#e46c48"}
              emissiveIntensity={canServe || canSpill ? 0.65 : 0.25}
              transparent
              opacity={0.78}
            />
          </mesh>
          <mesh
            ref={splash}
            visible={false}
            position={[0, 0.18 + fillHeight, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.31, 0.025, 10, 36]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.18}
              transparent
              opacity={0.72}
            />
          </mesh>
          <object3D ref={rimAnchor} position={[0, 1.11, 0.42]} />
        </group>
      </group>

      <Html
        center
        position={[0, 1.48, 0]}
        zIndexRange={[54, 0]}
        wrapperClass="cup-badge-anchor"
      >
        <div
          className={`cup-badge ${
            canServe || canSpill ? "is-ready" : ""
          } ${spillInteraction ? "is-spilling" : ""}`}
        >
          {status}
        </div>
      </Html>
    </group>
  );
}

function CupSpillStream({
  color,
  cupRimWorldRef,
  flowRef,
  reducedMotion,
}: {
  color: string;
  cupRimWorldRef: MutableRefObject<THREE.Vector3>;
  flowRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const streamRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const vectorsRef = useRef({
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    control: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    direction: new THREE.Vector3(),
  });
  const segmentCount = reducedMotion ? 4 : 7;

  useFrame((state) => {
    const mesh = streamRef.current;
    if (!mesh) return;
    const strength = flowRef.current;
    mesh.visible = strength > 0.025;
    if (!mesh.visible) {
      mesh.count = 0;
      return;
    }

    const vectors = vectorsRef.current;
    vectors.start.copy(cupRimWorldRef.current);
    vectors.end.set(
      vectors.start.x,
      COUNTER_TOP_Y + 0.045,
      Math.min(2.18, vectors.start.z + 0.34),
    );
    vectors.control.lerpVectors(vectors.start, vectors.end, 0.48);
    vectors.control.y -= reducedMotion ? 0.015 : 0.09;
    vectors.control.z += 0.08;

    const pointAt = (target: THREE.Vector3, t: number) => {
      const inverse = 1 - t;
      target
        .copy(vectors.start)
        .multiplyScalar(inverse * inverse)
        .addScaledVector(vectors.control, 2 * inverse * t)
        .addScaledVector(vectors.end, t * t);
    };

    const radius =
      (0.038 + strength * 0.026) *
      (reducedMotion
        ? 1
        : 0.94 + Math.sin(state.clock.elapsedTime * 15) * 0.045);
    for (let index = 0; index < segmentCount; index += 1) {
      pointAt(vectors.a, index / segmentCount);
      pointAt(vectors.b, (index + 1) / segmentCount);
      vectors.direction.copy(vectors.b).sub(vectors.a);
      const segmentLength = vectors.direction.length();
      dummy.position
        .copy(vectors.a)
        .add(vectors.b)
        .multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(up, vectors.direction.normalize());
      dummy.scale.set(radius, segmentLength, radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.count = segmentCount;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={streamRef}
      args={[undefined, undefined, 7]}
      count={0}
      frustumCulled={false}
      renderOrder={6}
    >
      <cylinderGeometry args={[1, 0.76, 1, 12]} />
      <meshPhysicalMaterial
        color={color}
        transparent
        opacity={0.88}
        roughness={0.14}
        clearcoat={0.62}
        clearcoatRoughness={0.16}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

type SpillFluidState = {
  count: number;
  accumulator: number;
  settledFrames: number;
  frozen: boolean;
  positions: Float32Array;
  previous: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  ages: Float32Array;
  surface: Uint8Array;
  emittedByFruit: Map<number, number>;
};

function spillHashKey(x: number, y: number, z: number) {
  return (
    (x * 73856093) ^
    (y * 19349663) ^
    (z * 83492791)
  );
}

function SpillFluidSimulation({
  sources,
  color,
  spillFraction,
  spillMode,
  blenderSize,
  cupRimWorldRef,
  flowRef,
  reducedMotion,
  onSettled,
}: {
  sources: SpillSource[];
  color: string;
  spillFraction: number;
  spillMode: SpillMode;
  blenderSize: number;
  cupRimWorldRef: MutableRefObject<THREE.Vector3>;
  flowRef: MutableRefObject<number>;
  reducedMotion: boolean;
  onSettled: () => void;
}) {
  const compact = useThree((state) => state.size.width < 880);
  const particleYield = reducedMotion ? 12 : compact ? 25 : 44;
  const particleLimit = Math.min(
    MAX_SPILL_PARTICLES,
    Math.round(CUP_CAPACITY * particleYield),
  );
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const impactRippleRef = useRef<THREE.Mesh>(null);
  const hashRef = useRef(new Map<number, number[]>());
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particleColor = useMemo(() => new THREE.Color(), []);
  const mixColor = useMemo(() => new THREE.Color(color), [color]);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const velocityDirection = useMemo(() => new THREE.Vector3(), []);
  const simRef = useRef<SpillFluidState>({
    count: 0,
    accumulator: 0,
    settledFrames: 0,
    frozen: false,
    positions: new Float32Array(MAX_SPILL_PARTICLES * 3),
    previous: new Float32Array(MAX_SPILL_PARTICLES * 3),
    velocities: new Float32Array(MAX_SPILL_PARTICLES * 3),
    colors: new Float32Array(MAX_SPILL_PARTICLES * 3),
    ages: new Float32Array(MAX_SPILL_PARTICLES),
    surface: new Uint8Array(MAX_SPILL_PARTICLES),
    emittedByFruit: new Map(),
  });

  useEffect(() => {
    const mesh = particlesRef.current;
    if (!mesh) return;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color("#ffffff"));
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.needsUpdate = true;
    }
  }, []);

  useFrame((state, frameDelta) => {
    const mesh = particlesRef.current;
    const ripple = impactRippleRef.current;
    if (!mesh || !ripple) return;
    const sim = simRef.current;
    const rim = cupRimWorldRef.current;

    let emittedThisFrame = 0;
    for (const source of sources) {
      const desired = Math.min(
        particleLimit,
        Math.max(
          1,
          Math.floor(source.amount * particleYield + 0.0001),
        ),
      );
      let emitted = sim.emittedByFruit.get(source.id) ?? 0;
      while (
        emitted < desired &&
        emittedThisFrame < 18 &&
        sim.count < particleLimit
      ) {
        const index = sim.count++;
        const offset = index * 3;
        const angle = source.phase + emitted * 2.399;
        const jitter = 0.014 + (emitted % 5) * 0.006;
        const speedBand = ((emitted * 13 + source.id) % 9) / 8;
        const sourceColor = new THREE.Color(source.color);

        sim.positions[offset] = rim.x + Math.cos(angle) * jitter;
        sim.positions[offset + 1] = rim.y + 0.015 + (emitted % 3) * 0.008;
        sim.positions[offset + 2] = rim.z + Math.sin(angle) * jitter;
        sim.previous[offset] = sim.positions[offset];
        sim.previous[offset + 1] = sim.positions[offset + 1];
        sim.previous[offset + 2] = sim.positions[offset + 2];
        sim.velocities[offset] =
          Math.cos(angle) * (0.12 + speedBand * 0.22);
        sim.velocities[offset + 1] = -0.42 - speedBand * 0.28;
        sim.velocities[offset + 2] = 0.88 + speedBand * 1.05;
        sim.colors[offset] = sourceColor.r;
        sim.colors[offset + 1] = sourceColor.g;
        sim.colors[offset + 2] = sourceColor.b;
        sim.ages[index] = 0;
        sim.surface[index] = 0;
        sim.frozen = false;
        sim.settledFrames = 0;
        emitted += 1;
        emittedThisFrame += 1;
      }
      sim.emittedByFruit.set(source.id, emitted);
    }

    ripple.visible = flowRef.current > 0.035;
    if (ripple.visible) {
      ripple.position.set(
        rim.x,
        COUNTER_TOP_Y + 0.018,
        Math.min(2.18, rim.z + 0.34),
      );
      const rippleScale =
        reducedMotion
          ? 0.7
          : 0.64 +
            Math.sin(state.clock.elapsedTime * 9) *
              0.09 *
              flowRef.current;
      ripple.scale.setScalar(rippleScale);
      ripple.rotation.z += frameDelta * (reducedMotion ? 0.1 : 1.3);
    }

    const expectedParticleCount = Math.min(
      particleLimit,
      sources.reduce(
        (sum, source) =>
          sum +
          Math.max(
            1,
            Math.floor(source.amount * particleYield + 0.0001),
          ),
        0,
      ),
    );
    if (sim.count > 0 && !sim.frozen) {
      const frameDt = Math.min(frameDelta, 1 / 30);
      sim.accumulator = Math.min(sim.accumulator + frameDt, 1 / 30);
      const fixedDt = 1 / 60;
      const maximumSteps = 2;
      let steps = 0;

      while (sim.accumulator >= fixedDt && steps < maximumSteps) {
        for (let index = 0; index < sim.count; index += 1) {
          const offset = index * 3;
          sim.previous[offset] = sim.positions[offset];
          sim.previous[offset + 1] = sim.positions[offset + 1];
          sim.previous[offset + 2] = sim.positions[offset + 2];
          sim.velocities[offset + 1] -= 8.2 * fixedDt;
          sim.positions[offset] += sim.velocities[offset] * fixedDt;
          sim.positions[offset + 1] +=
            sim.velocities[offset + 1] * fixedDt;
          sim.positions[offset + 2] +=
            sim.velocities[offset + 2] * fixedDt;
        }

        for (let iteration = 0; iteration < 2; iteration += 1) {
          const hash = hashRef.current;
          hash.clear();
          const cellSize = 0.15;

          for (let index = 0; index < sim.count; index += 1) {
            const offset = index * 3;
            const cellX = Math.floor(sim.positions[offset] / cellSize);
            const cellY = Math.floor(
              sim.positions[offset + 1] / cellSize,
            );
            const cellZ = Math.floor(
              sim.positions[offset + 2] / cellSize,
            );
            const key = spillHashKey(cellX, cellY, cellZ);
            const bucket = hash.get(key);
            if (bucket) bucket.push(index);
            else hash.set(key, [index]);
          }

          for (let a = 0; a < sim.count; a += 1) {
            const aOffset = a * 3;
            const cellX = Math.floor(sim.positions[aOffset] / cellSize);
            const cellY = Math.floor(
              sim.positions[aOffset + 1] / cellSize,
            );
            const cellZ = Math.floor(
              sim.positions[aOffset + 2] / cellSize,
            );

            for (let xStep = -1; xStep <= 1; xStep += 1) {
              for (let yStep = -1; yStep <= 1; yStep += 1) {
                for (let zStep = -1; zStep <= 1; zStep += 1) {
                  const bucket = hash.get(
                    spillHashKey(
                      cellX + xStep,
                      cellY + yStep,
                      cellZ + zStep,
                    ),
                  );
                  if (!bucket) continue;
                  for (const b of bucket) {
                    if (b <= a) continue;
                    const bOffset = b * 3;
                    const dx =
                      sim.positions[bOffset] - sim.positions[aOffset];
                    const dy =
                      sim.positions[bOffset + 1] -
                      sim.positions[aOffset + 1];
                    const dz =
                      sim.positions[bOffset + 2] -
                      sim.positions[aOffset + 2];
                    const distanceSquared = dx * dx + dy * dy + dz * dz;
                    if (
                      distanceSquared <= 0.000001 ||
                      distanceSquared >= cellSize * cellSize
                    ) {
                      continue;
                    }
                    const distance = Math.sqrt(distanceSquared);
                    const normalX = dx / distance;
                    const normalY = dy / distance;
                    const normalZ = dz / distance;
                    const minimumDistance = 0.092;

                    if (distance < minimumDistance) {
                      const correction =
                        (minimumDistance - distance) * 0.46;
                      sim.positions[aOffset] -= normalX * correction;
                      sim.positions[aOffset + 1] -= normalY * correction;
                      sim.positions[aOffset + 2] -= normalZ * correction;
                      sim.positions[bOffset] += normalX * correction;
                      sim.positions[bOffset + 1] += normalY * correction;
                      sim.positions[bOffset + 2] += normalZ * correction;
                    } else if (iteration === 1) {
                      const cohesion =
                        (1 - distance / cellSize) * 0.0015;
                      sim.positions[aOffset] += normalX * cohesion;
                      sim.positions[aOffset + 1] += normalY * cohesion;
                      sim.positions[aOffset + 2] += normalZ * cohesion;
                      sim.positions[bOffset] -= normalX * cohesion;
                      sim.positions[bOffset + 1] -= normalY * cohesion;
                      sim.positions[bOffset + 2] -= normalZ * cohesion;
                    }
                  }
                }
              }
            }
          }

          for (let index = 0; index < sim.count; index += 1) {
            const offset = index * 3;
            let x = sim.positions[offset];
            let y = sim.positions[offset + 1];
            let z = sim.positions[offset + 2];
            const wasSurface = sim.surface[index];
            const overCounter =
              Math.abs(x) < 5.5 - SPILL_PARTICLE_RADIUS &&
              Math.abs(z) < 2.46 - SPILL_PARTICLE_RADIUS;
            sim.surface[index] = 0;

            if (
              overCounter &&
              y < COUNTER_TOP_Y + SPILL_PARTICLE_RADIUS
            ) {
              y = COUNTER_TOP_Y + SPILL_PARTICLE_RADIUS * 0.22;
              sim.surface[index] = 1;
              if (wasSurface === 0) {
                const splashAngle = index * 2.399;
                const splash = 0.012 + (index % 4) * 0.006;
                x += Math.cos(splashAngle) * splash;
                z += 0.018 + Math.sin(splashAngle) * splash;
              }

              const pushOutCircle = (
                centerX: number,
                centerZ: number,
                radius: number,
              ) => {
                const dx = x - centerX;
                const dz = z - centerZ;
                const distance = Math.max(0.0001, Math.hypot(dx, dz));
                const limit = radius + SPILL_PARTICLE_RADIUS * 0.3;
                if (distance >= limit) return;
                x = centerX + (dx / distance) * limit;
                z = centerZ + (dz / distance) * limit;
              };
              pushOutCircle(BLENDER_X, 0, 0.88 * blenderSize);
              pushOutCircle(3.55, 0.32, 0.8);
              pushOutCircle(CUP_POSITION.x, 0.72, 0.38);
            } else if (
              y < -2.115 + SPILL_PARTICLE_RADIUS
            ) {
              y = -2.115 + SPILL_PARTICLE_RADIUS * 0.22;
              sim.surface[index] = 2;
            }

            sim.positions[offset] = x;
            sim.positions[offset + 1] = y;
            sim.positions[offset + 2] = z;
          }
        }

        for (let index = 0; index < sim.count; index += 1) {
          const offset = index * 3;
          sim.velocities[offset] =
            (sim.positions[offset] - sim.previous[offset]) / fixedDt;
          sim.velocities[offset + 1] =
            (sim.positions[offset + 1] - sim.previous[offset + 1]) /
            fixedDt;
          sim.velocities[offset + 2] =
            (sim.positions[offset + 2] - sim.previous[offset + 2]) /
            fixedDt;

          if (sim.surface[index] === 1) {
            sim.velocities[offset] *= 0.976;
            sim.velocities[offset + 1] = 0;
            sim.velocities[offset + 2] *= 0.976;
          } else if (sim.surface[index] === 2) {
            sim.velocities[offset] *= 0.9;
            sim.velocities[offset + 1] = 0;
            sim.velocities[offset + 2] *= 0.9;
          } else {
            sim.velocities[offset] *= 0.995;
            sim.velocities[offset + 1] *= 0.995;
            sim.velocities[offset + 2] *= 0.995;
          }
        }

        const viscosityHash = hashRef.current;
        viscosityHash.clear();
        const viscosityRadius = 0.15;
        for (let index = 0; index < sim.count; index += 1) {
          const offset = index * 3;
          const key = spillHashKey(
            Math.floor(sim.positions[offset] / viscosityRadius),
            Math.floor(sim.positions[offset + 1] / viscosityRadius),
            Math.floor(sim.positions[offset + 2] / viscosityRadius),
          );
          const bucket = viscosityHash.get(key);
          if (bucket) bucket.push(index);
          else viscosityHash.set(key, [index]);
        }

        for (let a = 0; a < sim.count; a += 1) {
          const aOffset = a * 3;
          const cellX = Math.floor(
            sim.positions[aOffset] / viscosityRadius,
          );
          const cellY = Math.floor(
            sim.positions[aOffset + 1] / viscosityRadius,
          );
          const cellZ = Math.floor(
            sim.positions[aOffset + 2] / viscosityRadius,
          );
          for (let xStep = -1; xStep <= 1; xStep += 1) {
            for (let yStep = -1; yStep <= 1; yStep += 1) {
              for (let zStep = -1; zStep <= 1; zStep += 1) {
                const bucket = viscosityHash.get(
                  spillHashKey(
                    cellX + xStep,
                    cellY + yStep,
                    cellZ + zStep,
                  ),
                );
                if (!bucket) continue;
                for (const b of bucket) {
                  if (b <= a) continue;
                  const bOffset = b * 3;
                  const dx =
                    sim.positions[bOffset] - sim.positions[aOffset];
                  const dy =
                    sim.positions[bOffset + 1] -
                    sim.positions[aOffset + 1];
                  const dz =
                    sim.positions[bOffset + 2] -
                    sim.positions[aOffset + 2];
                  const distance = Math.hypot(dx, dy, dz);
                  if (
                    distance <= 0.0001 ||
                    distance >= viscosityRadius
                  ) {
                    continue;
                  }
                  const q = 1 - distance / viscosityRadius;
                  const mix = 0.05 * q * q;
                  const differenceX =
                    (sim.velocities[bOffset] -
                      sim.velocities[aOffset]) *
                    mix;
                  const differenceY =
                    (sim.velocities[bOffset + 1] -
                      sim.velocities[aOffset + 1]) *
                    mix;
                  const differenceZ =
                    (sim.velocities[bOffset + 2] -
                      sim.velocities[aOffset + 2]) *
                    mix;
                  sim.velocities[aOffset] += differenceX;
                  sim.velocities[aOffset + 1] += differenceY;
                  sim.velocities[aOffset + 2] += differenceZ;
                  sim.velocities[bOffset] -= differenceX;
                  sim.velocities[bOffset + 1] -= differenceY;
                  sim.velocities[bOffset + 2] -= differenceZ;
                }
              }
            }
          }
        }

        for (let index = 0; index < sim.count; index += 1) {
          const offset = index * 3;
          const speed = Math.hypot(
            sim.velocities[offset],
            sim.velocities[offset + 1],
            sim.velocities[offset + 2],
          );
          if (speed > 5.5) {
            const scale = 5.5 / speed;
            sim.velocities[offset] *= scale;
            sim.velocities[offset + 1] *= scale;
            sim.velocities[offset + 2] *= scale;
          }
          sim.ages[index] += fixedDt;
        }

        sim.accumulator -= fixedDt;
        steps += 1;
      }

      let maximumSpeed = 0;
      for (let index = 0; index < sim.count; index += 1) {
        const offset = index * 3;
        maximumSpeed = Math.max(
          maximumSpeed,
          Math.hypot(
            sim.velocities[offset],
            sim.velocities[offset + 1],
            sim.velocities[offset + 2],
          ),
        );
      }
      if (
        spillMode === "settling" &&
        sim.count >= expectedParticleCount &&
        maximumSpeed < 0.045
      ) {
        sim.settledFrames += 1;
        if (sim.settledFrames > 60) {
          sim.frozen = true;
          onSettled();
        }
      } else {
        sim.settledFrames = 0;
      }
    }

    mesh.count = sim.count;
    for (let index = 0; index < sim.count; index += 1) {
      const offset = index * 3;
      const surface = sim.surface[index];
      particleColor
        .setRGB(
          sim.colors[offset],
          sim.colors[offset + 1],
          sim.colors[offset + 2],
        )
        .lerp(mixColor, Math.min(0.78, sim.ages[index] * 0.45));
      dummy.position.set(
        sim.positions[offset],
        sim.positions[offset + 1],
        sim.positions[offset + 2],
      );
      if (surface > 0) {
        dummy.quaternion.identity();
        const puddlePulse =
          reducedMotion
            ? 1
            : 0.94 + Math.sin(index * 1.7 + state.clock.elapsedTime * 3) * 0.06;
        dummy.scale.set(
          1.35 * puddlePulse,
          0.2 + (1 - spillFraction) * 0.04,
          1.35 / puddlePulse,
        );
      } else {
        velocityDirection.set(
          sim.velocities[offset],
          sim.velocities[offset + 1],
          sim.velocities[offset + 2],
        );
        const speed = velocityDirection.length();
        if (speed > 0.001) {
          dummy.quaternion.setFromUnitVectors(
            up,
            velocityDirection.normalize(),
          );
        } else {
          dummy.quaternion.identity();
        }
        dummy.scale.set(
          0.78,
          reducedMotion ? 1 : 1.05 + Math.min(0.85, speed * 0.16),
          0.78,
        );
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, particleColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <mesh
        ref={impactRippleRef}
        visible={false}
        rotation={[Math.PI / 2, 0, 0]}
        renderOrder={7}
      >
        <torusGeometry args={[0.24, 0.028, 10, 36]} />
        <meshPhysicalMaterial
          color={color}
          transparent
          opacity={0.68}
          roughness={0.12}
          clearcoat={0.7}
          depthWrite={false}
        />
      </mesh>
      <instancedMesh
        ref={particlesRef}
        args={[undefined, undefined, MAX_SPILL_PARTICLES]}
        count={0}
        frustumCulled={false}
        renderOrder={6}
      >
        <icosahedronGeometry args={[SPILL_PARTICLE_RADIUS, 1]} />
        <meshPhysicalMaterial
          vertexColors
          transparent
          opacity={0.84}
          roughness={0.14}
          clearcoat={0.72}
          clearcoatRoughness={0.16}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

function PourStream({
  color,
  fillFraction,
  spoutWorldRef,
  flowRef,
  reducedMotion,
}: {
  color: string;
  fillFraction: number;
  spoutWorldRef: MutableRefObject<THREE.Vector3>;
  flowRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const stream = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const vectorsRef = useRef({
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    control: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    direction: new THREE.Vector3(),
  });
  const segmentCount = reducedMotion ? 5 : 9;

  useFrame((state) => {
    const mesh = stream.current;
    if (!mesh) return;
    const strength = flowRef.current;
    mesh.visible = strength > 0.025;
    if (!mesh.visible) {
      mesh.count = 0;
      return;
    }

    const vectors = vectorsRef.current;
    vectors.start.copy(spoutWorldRef.current);
    vectors.end.set(
      CUP_POSITION.x,
      CUP_POSITION.y + 0.15 + 0.82 * fillFraction,
      CUP_POSITION.z,
    );
    vectors.control.lerpVectors(vectors.start, vectors.end, 0.48);
    vectors.control.y -= reducedMotion ? 0.04 : 0.18;

    const pointAt = (target: THREE.Vector3, t: number) => {
      const inverse = 1 - t;
      target
        .copy(vectors.start)
        .multiplyScalar(inverse * inverse)
        .addScaledVector(vectors.control, 2 * inverse * t)
        .addScaledVector(vectors.end, t * t);
    };

    const radius =
      (0.035 + strength * 0.026) *
      (reducedMotion ? 1 : 0.92 + Math.sin(state.clock.elapsedTime * 14) * 0.04);
    for (let index = 0; index < segmentCount; index += 1) {
      const t0 = index / segmentCount;
      const t1 = (index + 1) / segmentCount;
      pointAt(vectors.a, t0);
      pointAt(vectors.b, t1);
      vectors.direction.copy(vectors.b).sub(vectors.a);
      const segmentLength = vectors.direction.length();
      dummy.position
        .copy(vectors.a)
        .add(vectors.b)
        .multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(up, vectors.direction.normalize());
      dummy.scale.set(radius, segmentLength, radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.count = segmentCount;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={stream}
      args={[undefined, undefined, 9]}
      count={0}
      frustumCulled={false}
      renderOrder={5}
    >
      <cylinderGeometry args={[1, 0.82, 1, 12]} />
      <meshPhysicalMaterial
        color={color}
        transparent
        opacity={0.86}
        roughness={0.18}
        transmission={0.04}
        clearcoat={0.35}
        depthWrite={false}
      />
    </instancedMesh>
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
  remainingUnits,
  reducedMotion,
  tiltRef,
}: {
  blending: boolean;
  blendProgress: number;
  color: string;
  sources: JuiceSource[];
  remainingUnits: number;
  reducedMotion: boolean;
  tiltRef: MutableRefObject<number>;
}) {
  const compact = useThree((state) => state.size.width < 880);
  const particleYield = reducedMotion ? 8 : compact ? 12 : 20;
  const particleLimit = Math.min(
    MAX_JUICE_PARTICLES,
    particleYield * MAX_FRUIT,
  );
  const particles = useRef<THREE.InstancedMesh>(null);
  const liquidFrame = useRef<THREE.Group>(null);
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
    const frame = liquidFrame.current;
    if (
      !particleMesh ||
      !bodyMesh ||
      !surfaceMesh ||
      !surfaceMaterial ||
      !frame
    ) {
      return;
    }

    const frameDt = Math.min(frameDelta, 0.033);
    frame.rotation.z = -tiltRef.current * 0.9;
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

    const fillUnits = Math.min(
      remainingUnits,
      sim.count / Math.max(1, particleYield),
    );
    const visibleParticleCount = Math.min(
      sim.count,
      Math.max(0, Math.ceil(fillUnits * particleYield)),
    );
    const fillHeight =
      fillUnits > 0.001 ? Math.min(1.65, 0.05 + fillUnits * 0.13) : 0;
    const fillTop = JAR_FLUID_BOTTOM + fillHeight;
    const surfaceRadius = Math.max(
      0.42,
      jarInteriorRadius(Math.max(JAR_FLUID_BOTTOM, fillTop)) -
        JUICE_PARTICLE_RADIUS * 0.25,
    );
    const fluidVisible = fillUnits > 0.001;

    bodyMesh.visible = fluidVisible;
    surfaceMesh.visible = fluidVisible;
    if (fluidVisible) {
      bodyMesh.position.y = JAR_FLUID_BOTTOM + fillHeight * 0.5 - 2;
      bodyMesh.scale.set(
        surfaceRadius / 0.69,
        Math.max(0.001, fillHeight),
        surfaceRadius / 0.69,
      );
      surfaceMesh.position.y = fillTop + 0.008 - 2;
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

    if (sim.count > 0 && remainingUnits > 0.001) {
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

      particleMesh.count = visibleParticleCount;
      for (
        let renderIndex = 0;
        renderIndex < visibleParticleCount;
        renderIndex += 1
      ) {
        const index = Math.min(
          sim.count - 1,
          Math.floor(
            (renderIndex * sim.count) /
              Math.max(1, visibleParticleCount),
          ),
        );
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
          sim.positions[offset + 1] - 2,
          sim.positions[offset + 2],
        );
        const pulse =
          reducedMotion
            ? 0.9
            : 0.86 + Math.sin(sim.ages[index] * 7 + index) * 0.08;
        dummy.scale.setScalar(pulse);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(renderIndex, dummy.matrix);
        particleMesh.setColorAt(renderIndex, particleColor);
      }
      particleMesh.instanceMatrix.needsUpdate = true;
      if (particleMesh.instanceColor) {
        particleMesh.instanceColor.needsUpdate = true;
      }
    } else {
      particleMesh.count = 0;
    }
  });

  return (
    <group ref={liquidFrame} position={[0, 2, 0]}>
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
  fridgeOpen,
  disabled,
  reducedMotion,
  onDragging,
  onDrop,
}: {
  fruit: FruitItem;
  blenderSize: number;
  blending: boolean;
  fridgeOpen: boolean;
  disabled: boolean;
  reducedMotion: boolean;
  onDragging: (dragging: boolean) => void;
  onDrop: (
    id: number,
    position: [number, number, number],
    droppedOverJar: boolean,
  ) => void;
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
      hovered && !blending && !disabled && fruit.juice <= 0.02 ? "grab" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [blending, disabled, fruit.juice, hovered]);

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
    if (dragging.current || blending || disabled || fruit.juice > 0.02) return;
    event.stopPropagation();
    dragging.current = true;
    activePointer.current = event.pointerId;
    onDragging(true);
    pointerTarget(event).setPointerCapture(event.pointerId);
    const position = group.current?.position ?? new THREE.Vector3(...fruit.position);
    const mouth = new THREE.Vector3(BLENDER_X, 3.05 * blenderSize, 0);
    const horizontalTravel = Math.hypot(
      position.x - mouth.x,
      position.z - mouth.z,
    );

    if (!fruit.inJar && horizontalTravel > 0.15) {
      dragPlane.current.setFromCoplanarPoints(
        position,
        mouth,
        mouth.clone().add(new THREE.Vector3(0, 1, 0)),
      );
    } else {
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      dragPlane.current.setFromNormalAndCoplanarPoint(normal, position);
    }

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
    hit.x = THREE.MathUtils.clamp(hit.x, -5.4, 4.25);
    hit.y = THREE.MathUtils.clamp(hit.y, 0.22, 4.35);
    hit.z = THREE.MathUtils.clamp(hit.z, -1.7, 1.4);
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
    const droppedOverJar =
      Math.hypot(position.x - BLENDER_X, position.z) <
        0.72 * blenderSize &&
      position.y > 2.35 * blenderSize &&
      position.y < 4.05 * blenderSize;
    onDrop(
      fruit.id,
      [position.x, position.y, position.z],
      droppedOverJar,
    );
  };

  if (fruit.inFridge && !fridgeOpen) return null;

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
        if (!blending && !disabled && fruit.juice <= 0.02) setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh visible={false}>
        <sphereGeometry args={[0.42, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <group
        scale={
          hovered && !blending && !disabled && fruit.juice <= 0.02 ? 1.08 : 1
        }
      >
        <FruitModel type={fruit.type} />
      </group>
      {hovered && !blending && !disabled && fruit.juice <= 0.02 && (
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
