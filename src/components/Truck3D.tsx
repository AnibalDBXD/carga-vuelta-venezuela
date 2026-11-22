import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { OrbitControls, Edges, Environment, Lightformer, Html, useGLTF } from "@react-three/drei";
import { Box3, Mesh, Vector3, type Object3D } from "three";
import type { Placed } from "@/lib/packing";
import type { VehicleKind } from "@/lib/venezuela";
import { boxTextures } from "./cardboard";

const PALETTE = [
  "#f2c230",
  "#4aa3df",
  "#5cc88a",
  "#e57a44",
  "#c86bd4",
  "#e0e0e0",
  "#ff6b6b",
  "#8fd3c8",
];
const BODY = "#f2c230";
const GLASS = "#9fd3ff";
const FRAME = "#24262b";
const LIGHT = "#ffe9a8";
const TAIL = "#e04545";

const MODELS: Record<VehicleKind, string> = {
  auto: "/models/kenney-sedan.glb",
  pickup: "/models/kenney-truck-flat.glb",
  furgon: "/models/kenney-van.glb",
  camion350: "/models/kenney-truck.glb",
  camion750: "/models/kenney-delivery.glb",
  gandola: "/models/tevy-semi-truck.glb",
};
// Solo se precarga el modelo del vehículo mostrado (ver VehicleGLB): precargar
// los 6 GLB de golpe descarga megabytes que casi nunca se usan.

type Props = {
  kind: VehicleKind;
  length: number;
  width: number;
  height: number; // cm
  boxes?: Placed[];
  colorKeys?: string[];
  highlightedOrder?: number;
  className?: string;
  /** Rotación lenta, solo en la landing (design.md §4.4). */
  spin?: boolean;
  /** Segundos entre cajas para que la carga se vaya montando (0 = sin animación). */
  stagger?: number;
};

// Look estándar (specs/002-vistas-3d.md): canvas transparente, sin fondo ni
// piso — el camión flota sobre la página.
export default function Truck3D({
  kind,
  length,
  width,
  height,
  boxes = [],
  colorKeys = [],
  className,
  highlightedOrder,
  spin = false,
  stagger = 0,
}: Props) {
  const L = length / 100,
    W = width / 100,
    H = height / 100;
  const s = spec(kind, L, W);
  const open = kind === "pickup" || kind === "auto";
  const span = Math.max(L + s.cabL, 4);
  const ghost = boxes.length > 0;
  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const step = reduceMotion ? 0 : stagger;
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [span * 0.9, span * 0.55, span * 0.9], fov: 40 }}
        shadows
        dpr={[1, 2]}
        gl={{ alpha: true }}
      >
        <FitCamera span={span} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1.4} castShadow />
        <Environment resolution={64}>
          <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer
            intensity={1}
            position={[-5, 1, -1]}
            rotation-y={Math.PI / 2}
            scale={[20, 1, 1]}
          />
        </Environment>
        <group position={[-(L - s.cabL) / 2, 0, 0]}>
          <ModelBoundary
            fallback={
              <>
                <Body kind={kind} L={L} W={W} H={H} cabL={s.cabL} chassis={s.chassis} />
                <Wheels axles={s.axles} track={s.track} r={s.wheelR} w={s.wheelW} />
              </>
            }
          >
            <Suspense fallback={null}>
              <VehicleGLB kind={kind} L={L} cabL={s.cabL} ghost={ghost} />
            </Suspense>
          </ModelBoundary>
          {/* cargo space */}
          <group position={[0, s.chassis, -W / 2]}>
            <mesh position={[L / 2, H / 2, W / 2]}>
              <boxGeometry args={[L, H, W]} />
              <meshStandardMaterial
                color={open ? "#888" : "#d9dde3"}
                transparent
                opacity={open ? 0.06 : 0.12}
                depthWrite={false}
              />
              <Edges color="#f2c230" />
            </mesh>
            <mesh position={[L / 2, 0.01, W / 2]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[L, W]} />
              <meshStandardMaterial color="#5b4a36" roughness={0.9} />
            </mesh>
            {boxes.map((b, index) => {
              const ci = Math.max(0, colorKeys.indexOf(b.pkgId));
              const delay = step > 0 ? index * step : 0;
              return (
                <CargoBox
                  key={`${b.pkgId}-${b.unit}`}
                  b={b}
                  color={PALETTE[ci % PALETTE.length] ?? "#f2c230"}
                  dimmed={highlightedOrder !== undefined && b.loadOrder !== highlightedOrder}
                  highlighted={b.loadOrder === highlightedOrder}
                  delay={delay}
                />
              );
            })}
            <Html position={[L, H + 0.15, W / 2]} center>
              <span
                style={{
                  fontFamily: "IBM Plex Mono",
                  fontSize: 11,
                  color: "#f2c230",
                  whiteSpace: "nowrap",
                }}
              >
                {kind === "auto" ? "MALETERO ▸" : "PUERTA ▸"}
              </span>
            </Html>
          </group>
        </group>
        <OrbitControls
          makeDefault
          target={[0, 1, 0]}
          maxPolarAngle={Math.PI / 2.05}
          autoRotate={spin}
          autoRotateSpeed={0.35}
        />
      </Canvas>
    </div>
  );
}

export { PALETTE };

/** Bulto de cartón: la cinta lleva el color del bulto; frágil = etiqueta FRÁGIL. */
function CargoBox({
  b,
  color,
  dim,
  highlighted,
}: {
  b: Placed;
  color: string;
  dim: boolean;
  highlighted: boolean;
}) {
  const tex = useMemo(() => boxTextures(color, b.fragile), [color, b.fragile]);
  const face = { roughness: 0.85, transparent: dim, opacity: dim ? 0.3 : 1 };
  return (
    <mesh
      position={[(b.x + b.l / 2) / 100, (b.z + b.h / 2) / 100, (b.y + b.w / 2) / 100]}
      castShadow
    >
      <boxGeometry args={[b.l / 100 - 0.01, b.h / 100 - 0.01, b.w / 100 - 0.01]} />
      <meshStandardMaterial attach="material-0" map={tex.side} {...face} />
      <meshStandardMaterial attach="material-1" map={tex.side} {...face} />
      <meshStandardMaterial attach="material-2" map={tex.top} {...face} />
      <meshStandardMaterial attach="material-3" map={tex.bottom} {...face} />
      <meshStandardMaterial attach="material-4" map={tex.side} {...face} />
      <meshStandardMaterial attach="material-5" map={tex.side} {...face} />
      <Edges color={b.fragile ? "#ff3b3b" : highlighted ? "#f2c230" : "#1a1a1a"} />
    </mesh>
  );
}

type Dims = { L: number; W: number; H: number; cabL: number; chassis: number };

function spec(kind: VehicleKind, L: number, W: number) {
  switch (kind) {
    case "auto":
      return {
        cabL: 2.9,
        chassis: 0.5,
        wheelR: 0.32,
        wheelW: 0.22,
        track: W / 2 + 0.2,
        axles: [-2.1, -0.5],
      };
    case "pickup":
      return {
        cabL: 1.9,
        chassis: 0.85,
        wheelR: 0.38,
        wheelW: 0.28,
        track: W / 2 + 0.15,
        axles: [-1.35, L * 0.68],
      };
    case "furgon":
      return {
        cabL: 1.5,
        chassis: 0.55,
        wheelR: 0.34,
        wheelW: 0.24,
        track: W / 2 + 0.12,
        axles: [-0.95, L * 0.66],
      };
    case "camion750": {
      const cabL = Math.min(2.2, Math.max(1.6, L * 0.35));
      return {
        cabL,
        chassis: 0.95,
        wheelR: 0.5,
        wheelW: 0.38,
        track: W / 2 + 0.05,
        axles: [-cabL + 0.7, L * 0.62, L * 0.85],
      };
    }
    case "gandola":
      return {
        cabL: 2.7,
        chassis: 1.15,
        wheelR: 0.5,
        wheelW: 0.38,
        track: W / 2 - 0.05,
        axles: [-2.15, -0.95, -0.35, L - 1.9, L - 0.6],
      };
    default: {
      const cabL = Math.min(2, Math.max(1.4, L * 0.4));
      return {
        cabL,
        chassis: 0.9,
        wheelR: 0.45,
        wheelW: 0.34,
        track: W / 2 + 0.05,
        axles: [-cabL + 0.6, L * 0.72],
      };
    }
  }
}

function Wheels({ axles, track, r, w }: { axles: number[]; track: number; r: number; w: number }) {
  return (
    <>
      {axles.flatMap((x) =>
        [-1, 1].map((s) => <Wheel key={`${x}${s}`} x={x} z={s * track} r={r} w={w} />),
      )}
    </>
  );
}

function Wheel({ x, z, r, w }: { x: number; z: number; r: number; w: number }) {
  return (
    <group position={[x, r, z]} rotation-x={Math.PI / 2}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, w, 24]} />
        <meshStandardMaterial color="#141414" roughness={0.85} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[r * 0.55, r * 0.55, w + 0.02, 18]} />
        <meshStandardMaterial color="#9aa0a8" metalness={0.65} roughness={0.3} />
      </mesh>
    </group>
  );
}

class ModelBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Nodos del GLB que se vuelven fantasma: todo excepto el tractor de la gandola. */
function isGhostTarget(kind: VehicleKind, o: Object3D) {
  if (kind !== "gandola") return true;
  let n: Object3D | null = o;
  while (n) {
    if (
      n.name === "trailer" ||
      n.name.startsWith("trailer_") ||
      n.name.startsWith("door_rear") ||
      n.name.startsWith("landing_leg")
    )
      return true;
    n = n.parent;
  }
  return false;
}

function VehicleGLB({
  kind,
  L,
  cabL,
  ghost,
}: {
  kind: VehicleKind;
  L: number;
  cabL: number;
  ghost: boolean;
}) {
  useGLTF.preload(MODELS[kind]);
  const { scene } = useGLTF(MODELS[kind]);
  const model = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
      }
    });
    return cloned;
  }, [scene]);
  const xform = useMemo(() => {
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const s = (L + cabL) / Math.max(size.z, 0.001);
    return { s, x: (L - cabL) / 2 + center.z * s, y: -box.min.y * s, z: -center.x * s };
  }, [model, L, cabL]);
  useLayoutEffect(() => {
    model.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const g = ghost && isGhostTarget(kind, o);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.transparent = g;
        m.opacity = g ? 0.22 : 1;
        m.depthWrite = !g;
      }
    });
  }, [model, ghost, kind]);
  return (
    <primitive
      object={model}
      rotation-y={-Math.PI / 2}
      scale={xform.s}
      position={[xform.x, xform.y, xform.z]}
    />
  );
}

function Body({ kind, ...dims }: Dims & { kind: VehicleKind }) {
  switch (kind) {
    case "auto":
      return <CarBody {...dims} />;
    case "pickup":
      return <PickupBody {...dims} />;
    case "furgon":
      return <VanBody {...dims} />;
    case "gandola":
      return <SemiBody {...dims} />;
    case "camion750":
      return <BoxTruckBody {...dims} big />;
    default:
      return <BoxTruckBody {...dims} big={false} />;
  }
}

function Headlights({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x, y, s * z]}>
          <boxGeometry args={[0.05, 0.1, 0.28]} />
          <meshStandardMaterial color={LIGHT} emissive={LIGHT} emissiveIntensity={0.5} />
        </mesh>
      ))}
    </>
  );
}

/** Sedán: capó + cabina acristalada + maletero (la zona de carga). */
function CarBody({ L, W, cabL }: Dims) {
  const bw = W + 0.45;
  const x1 = -cabL + 1.0,
    x2 = -0.15;
  return (
    <group>
      <mesh position={[(L - cabL) / 2, 0.3, 0]} castShadow>
        <boxGeometry args={[L + cabL + 0.4, 0.36, bw]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[(x1 + x2) / 2, 0.75, 0]} castShadow>
        <boxGeometry args={[x2 - x1, 0.54, bw - 0.3]} />
        <meshStandardMaterial color={GLASS} metalness={0.9} roughness={0.15} />
      </mesh>
      <mesh position={[(x1 + x2) / 2 + 0.12, 1.05, 0]} castShadow>
        <boxGeometry args={[(x2 - x1) * 0.72, 0.07, bw - 0.34]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-cabL - 0.24, 0.26, 0]}>
        <boxGeometry args={[0.12, 0.2, bw]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <mesh position={[L + 0.24, 0.26, 0]}>
        <boxGeometry args={[0.12, 0.2, bw]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <Headlights x={-cabL - 0.22} y={0.4} z={bw / 2 - 0.18} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[L + 0.19, 0.4, s * (bw / 2 - 0.18)]}>
          <boxGeometry args={[0.05, 0.09, 0.26]} />
          <meshStandardMaterial color={TAIL} />
        </mesh>
      ))}
    </group>
  );
}

/** Pickup: capó + cabina doble + cama abierta con paredes bajas. */
function PickupBody({ L, W, H, cabL, chassis }: Dims) {
  const bw = W + 0.35;
  const hoodL = cabL * 0.45;
  const ccL = cabL - hoodL;
  const wallH = H + 0.12;
  return (
    <group>
      <mesh position={[(L - cabL) / 2, chassis - 0.13, 0]}>
        <boxGeometry args={[L + cabL + 0.2, 0.26, bw - 0.15]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <mesh position={[-cabL + hoodL / 2, chassis + 0.3, 0]} castShadow>
        <boxGeometry args={[hoodL + 0.1, 0.6, bw]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-ccL / 2, chassis + 0.41, 0]} castShadow>
        <boxGeometry args={[ccL, 0.82, bw]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-ccL / 2 - 0.02, chassis + 1.07, 0]} castShadow>
        <boxGeometry args={[ccL * 0.9, 0.5, bw * 0.92]} />
        <meshStandardMaterial color={GLASS} metalness={0.9} roughness={0.15} />
      </mesh>
      <mesh position={[-ccL / 2 - 0.05, chassis + 1.36, 0]} castShadow>
        <boxGeometry args={[ccL * 0.82, 0.07, bw * 0.86]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[L / 2, chassis + wallH / 2, s * (W / 2 + 0.045)]} castShadow>
          <boxGeometry args={[L + 0.12, wallH, 0.07]} />
          <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[L + 0.04, chassis + wallH / 2, 0]} castShadow>
        <boxGeometry args={[0.08, wallH, W + 0.16]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-cabL - 0.08, chassis * 0.5, 0]}>
        <boxGeometry args={[0.14, 0.32, bw]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <Headlights x={-cabL - 0.05} y={chassis + 0.28} z={bw / 2 - 0.2} />
    </group>
  );
}

/** Furgoneta: cabina delantera con parabrisas inclinado + marco de furgón recortado. */
function VanBody({ L, W, H, cabL, chassis }: Dims) {
  const bw = W + 0.3;
  const roofY = chassis + H + 0.1;
  const lowH = chassis + 0.55;
  return (
    <group>
      <mesh position={[(L - cabL) / 2, chassis - 0.11, 0]}>
        <boxGeometry args={[L + cabL + 0.15, 0.22, bw - 0.1]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <mesh position={[-cabL / 2, lowH / 2, 0]} castShadow>
        <boxGeometry args={[cabL + 0.05, lowH, bw]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-cabL + 0.4, lowH + (roofY - lowH) / 2, 0]} rotation-z={0.9}>
        <boxGeometry args={[roofY - lowH + 0.2, 0.05, bw - 0.2]} />
        <meshStandardMaterial color={GLASS} metalness={0.9} roughness={0.15} />
      </mesh>
      <mesh position={[-cabL * 0.35, roofY, 0]} castShadow>
        <boxGeometry args={[cabL * 0.75, 0.1, bw]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-cabL * 0.35, lowH + 0.42, s * (bw / 2 + 0.01)]}>
          <boxGeometry args={[cabL * 0.55, 0.62, 0.02]} />
          <meshStandardMaterial color={GLASS} metalness={0.9} roughness={0.15} />
        </mesh>
      ))}
      {/* marco del área de carga */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0.05, chassis + (H + 0.1) / 2, s * (W / 2 - 0.02)]}>
            <boxGeometry args={[0.08, H + 0.1, 0.08]} />
            <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[L - 0.05, chassis + (H + 0.1) / 2, s * (W / 2 - 0.02)]}>
            <boxGeometry args={[0.08, H + 0.1, 0.08]} />
            <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[L / 2, roofY - 0.05, s * (W / 2 - 0.02)]}>
            <boxGeometry args={[L, 0.08, 0.08]} />
            <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.05, roofY - 0.05, 0]}>
        <boxGeometry args={[0.08, 0.08, W - 0.04]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[L - 0.05, roofY - 0.05, 0]}>
        <boxGeometry args={[0.08, 0.08, W - 0.04]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-cabL - 0.08, 0.35, 0]}>
        <boxGeometry args={[0.14, 0.3, bw * 0.95]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <Headlights x={-cabL - 0.05} y={lowH - 0.15} z={bw / 2 - 0.2} />
    </group>
  );
}

/** Camión de caja (350/750): cabina sobre motor + chasis + caja de carga. */
function BoxTruckBody({ L, W, H, cabL, chassis, big }: Dims & { big: boolean }) {
  const cabW = Math.max(W, 1.7);
  const cabH = Math.min(H + 0.55, 2.9);
  return (
    <group>
      <mesh position={[(L - cabL) / 2, chassis - 0.13, 0]}>
        <boxGeometry args={[L + cabL, 0.26, W * 0.85]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <mesh position={[-cabL / 2, chassis + cabH / 2, 0]} castShadow>
        <boxGeometry args={[cabL, cabH, cabW]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-cabL - 0.01, chassis + cabH * 0.68, 0]}>
        <boxGeometry args={[0.03, cabH * 0.34, cabW * 0.82]} />
        <meshStandardMaterial color={GLASS} metalness={0.9} roughness={0.1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-cabL * 0.5, chassis + cabH * 0.7, s * (cabW / 2 + 0.01)]}>
          <boxGeometry args={[cabL * 0.55, cabH * 0.28, 0.02]} />
          <meshStandardMaterial color={GLASS} metalness={0.9} roughness={0.15} />
        </mesh>
      ))}
      <mesh position={[-cabL - 0.09, chassis * 0.5, 0]}>
        <boxGeometry args={[0.16, 0.34, cabW]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <mesh position={[-cabL - 0.015, chassis * 0.72, 0]}>
        <boxGeometry args={[0.03, 0.3, cabW * 0.55]} />
        <meshStandardMaterial color="#3a3d44" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0.5, 0.5, -(W * 0.42)]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.22, 0.22, 0.6, 16]} />
        <meshStandardMaterial color="#8a8f98" metalness={0.7} roughness={0.35} />
      </mesh>
      {big && (
        <mesh position={[-cabL / 2 - 0.05, chassis + cabH + 0.18, 0]} rotation-z={0.15}>
          <boxGeometry args={[cabL * 0.7, 0.38, cabW * 0.85]} />
          <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
        </mesh>
      )}
      <Headlights x={-cabL - 0.05} y={chassis * 0.78} z={cabW / 2 - 0.25} />
    </group>
  );
}

/** Gandola: tractocamión con capó + quinta rueda + semirremolque (área de carga). */
function SemiBody({ L, W, cabL, chassis }: Dims) {
  const cabW = Math.max(1.9, W * 0.85);
  return (
    <group>
      <mesh position={[-cabL / 2 + 0.2, 1.0, 0]}>
        <boxGeometry args={[cabL + 0.8, 0.24, cabW * 0.8]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <mesh position={[-cabL + 0.5, 1.45, 0]} castShadow>
        <boxGeometry args={[1.05, 1.1, cabW * 0.9]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-cabL / 2 + 0.52, 2.22, 0]} castShadow>
        <boxGeometry args={[cabL - 0.95, 2.7, cabW]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0.055, 2.55, 0]}>
        <boxGeometry args={[0.03, 0.6, cabW * 0.8]} />
        <meshStandardMaterial color={GLASS} metalness={0.9} roughness={0.1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-cabL / 2 + 0.55, 2.55, s * (cabW / 2 + 0.01)]}>
          <boxGeometry args={[(cabL - 0.95) * 0.6, 0.55, 0.02]} />
          <meshStandardMaterial color={GLASS} metalness={0.9} roughness={0.15} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.14, 2.1, s * (cabW / 2 - 0.14)]}>
          <cylinderGeometry args={[0.05, 0.05, 2.1, 10]} />
          <meshStandardMaterial color="#8a8f98" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[-0.3, chassis - 0.06, 0]}>
        <boxGeometry args={[0.9, 0.14, 1.1]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <mesh position={[-cabL - 0.06, 0.5, 0]}>
        <boxGeometry args={[0.14, 0.42, cabW]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <Headlights x={-cabL - 0.02} y={1.15} z={cabW * 0.32} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.45, 0.57, s * 0.55]}>
          <boxGeometry args={[0.09, 1.14, 0.09]} />
          <meshStandardMaterial color={FRAME} roughness={0.7} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[L * 0.42, chassis - 0.42, s * (W / 2 + 0.05)]}>
          <boxGeometry args={[L * 0.5, 0.42, 0.05]} />
          <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function CargoBox({
  b,
  color,
  dimmed,
  highlighted,
  delay,
}: {
  b: Placed;
  color: string;
  dimmed: boolean;
  highlighted: boolean;
  delay: number;
}) {
  const ref = useRef<Mesh>(null);
  const time = useRef(0);
  const done = useRef(delay <= 0);
  const targetY = (b.z + b.h / 2) / 100;

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh || delay <= 0 || done.current) return;
    time.current += delta;
    const local = time.current - delay;
    if (local < 0) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const p = Math.min(1, local / 0.3);
    const eased = 1 - Math.pow(1 - p, 3);
    // Cae desde un poco más arriba y crece: se lee como si la estuvieran montando.
    mesh.scale.setScalar(0.4 + 0.6 * eased);
    mesh.position.y = targetY + (1 - eased) * 0.5;
    if (p >= 1) done.current = true;
  });

  return (
    <mesh
      ref={ref}
      position={[(b.x + b.l / 2) / 100, targetY, (b.y + b.w / 2) / 100]}
      visible={delay <= 0}
      castShadow
    >
      <boxGeometry args={[b.l / 100 - 0.01, b.h / 100 - 0.01, b.w / 100 - 0.01]} />
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        transparent={dimmed}
        opacity={dimmed ? 0.3 : 1}
      />
      <Edges color={b.fragile ? "#ff3b3b" : highlighted ? "#f2c230" : "#1a1a1a"} />
    </mesh>
  );
}

function FitCamera({ span }: { span: number }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const factor = Math.max(1, (1.3 * size.height) / Math.max(1, size.width));
    camera.position.set(span * 0.9 * factor, span * 0.55 * factor, span * 0.9 * factor);
    camera.lookAt(0, 1, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, span, invalidate]);
  return null;
}
