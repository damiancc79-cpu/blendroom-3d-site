export const SPILL_PARTICLE_RADIUS = 0.058;
export const COUNTER_TOP_Y = 0.035;
export const COUNTER_HALF_X = 5.5;
export const COUNTER_HALF_Z = 2.46;
export const COUNTER_SLAB_BOTTOM_Y = -0.09;
export const COUNTER_TOP_CONTACT_Y =
  COUNTER_TOP_Y + SPILL_PARTICLE_RADIUS * 0.26;
export const COUNTER_FRONT_TRIGGER_Z =
  COUNTER_HALF_Z - SPILL_PARTICLE_RADIUS * 0.72;
export const COUNTER_FASCIA_Z =
  COUNTER_HALF_Z + SPILL_PARTICLE_RADIUS * 0.78;
export const COUNTER_EDGE_RELEASE_Y =
  COUNTER_SLAB_BOTTOM_Y - SPILL_PARTICLE_RADIUS * 0.65;
export const COUNTER_LIP_DURATION = 0.12;

export const SPILL_AIR = 0;
export const SPILL_COUNTERTOP = 1;
export const SPILL_FLOOR = 2;
export const SPILL_LIP = 3;
export const SPILL_FASCIA = 4;

const LIP_DROP_START = 0.58;
const LIP_END_Y = -0.006;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function smoothstep(value, minimum, maximum) {
  const progress = clamp(
    (value - minimum) / Math.max(0.000001, maximum - minimum),
    0,
    1,
  );
  return progress * progress * (3 - 2 * progress);
}

export function getSpillLipPose(edgeAge, target) {
  const lipProgress = smoothstep(edgeAge, 0, COUNTER_LIP_DURATION);
  if (lipProgress < LIP_DROP_START) {
    const aroundProgress = smoothstep(
      lipProgress,
      0,
      LIP_DROP_START,
    );
    target.y = COUNTER_TOP_CONTACT_Y;
    target.z = lerp(
      COUNTER_FRONT_TRIGGER_Z,
      COUNTER_FASCIA_Z,
      aroundProgress,
    );
  } else {
    const dropProgress = smoothstep(
      lipProgress,
      LIP_DROP_START,
      1,
    );
    target.y = lerp(
      COUNTER_TOP_CONTACT_Y,
      LIP_END_Y,
      dropProgress,
    );
    target.z = COUNTER_FASCIA_Z;
  }
  target.progress = lipProgress;
  return target;
}

export function getSpillLipScale(edgeAge, target) {
  const lipProgress = smoothstep(edgeAge, 0, COUNTER_LIP_DURATION);
  if (lipProgress < LIP_DROP_START) {
    const aroundProgress = smoothstep(
      lipProgress,
      0,
      LIP_DROP_START,
    );
    target.x = lerp(1.35, 0.9, aroundProgress);
    target.y = 0.2;
    target.z = lerp(1.35, 0.78, aroundProgress);
  } else {
    const dropProgress = smoothstep(
      lipProgress,
      LIP_DROP_START,
      1,
    );
    target.x = 0.9;
    target.y = lerp(0.2, 1.5, dropProgress);
    target.z = lerp(0.78, 0.42, dropProgress);
  }
  return target;
}

export function resolveSpillFrontEdge(particle) {
  const withinCounterWidth = Math.abs(particle.x) <= COUNTER_HALF_X;
  const crossedFrontLip =
    withinCounterWidth &&
    particle.previousZ < COUNTER_FRONT_TRIGGER_Z &&
    particle.z >= COUNTER_FRONT_TRIGGER_Z &&
    particle.velocityZ > 0;
  const insideFrontTransition =
    withinCounterWidth &&
    particle.z >= COUNTER_FRONT_TRIGGER_Z &&
    particle.z <=
      COUNTER_FASCIA_Z + SPILL_PARTICLE_RADIUS * 0.3 &&
    particle.y <=
      COUNTER_TOP_CONTACT_Y + SPILL_PARTICLE_RADIUS &&
    particle.y >= COUNTER_EDGE_RELEASE_Y;

  if (particle.phase === SPILL_LIP) {
    const pose = getSpillLipPose(particle.edgeAge, particle);
    particle.phase =
      pose.progress >= 0.999 ? SPILL_FASCIA : SPILL_LIP;
    return true;
  }

  if (particle.phase === SPILL_FASCIA) {
    if (particle.y >= COUNTER_EDGE_RELEASE_Y) {
      particle.z = COUNTER_FASCIA_Z;
    } else {
      particle.phase = SPILL_AIR;
      particle.z =
        COUNTER_FASCIA_Z + SPILL_PARTICLE_RADIUS * 0.08;
    }
    return true;
  }

  if (
    (particle.phase === SPILL_COUNTERTOP &&
      particle.z >= COUNTER_FRONT_TRIGGER_Z) ||
    crossedFrontLip ||
    (particle.phase === SPILL_AIR && insideFrontTransition)
  ) {
    particle.phase = SPILL_LIP;
    particle.edgeAge = 0;
    particle.y = COUNTER_TOP_CONTACT_Y;
    particle.z = COUNTER_FRONT_TRIGGER_Z;
    return true;
  }

  return false;
}

export function intersectsCounterSlab(position, scale) {
  const radiusX = SPILL_PARTICLE_RADIUS * scale.x;
  const radiusY = SPILL_PARTICLE_RADIUS * scale.y;
  const radiusZ = SPILL_PARTICLE_RADIUS * scale.z;
  const epsilon = 0.000001;
  const overlapsX =
    position.x + radiusX > -COUNTER_HALF_X + epsilon &&
    position.x - radiusX < COUNTER_HALF_X - epsilon;
  const overlapsY =
    position.y + radiusY > COUNTER_SLAB_BOTTOM_Y + epsilon &&
    position.y - radiusY < COUNTER_TOP_Y - epsilon;
  const overlapsZ =
    position.z + radiusZ > -COUNTER_HALF_Z + epsilon &&
    position.z - radiusZ < COUNTER_HALF_Z - epsilon;
  return overlapsX && overlapsY && overlapsZ;
}
