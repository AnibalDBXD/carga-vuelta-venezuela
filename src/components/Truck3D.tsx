import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { OrbitControls, Edges, Environment, Lightformer, Html } from "@react-three/drei";
import type { Placed } from "@/lib/packing";
import type { VehicleKind } from "@/lib/venezuela";

const PALETTE = ["#f2c230", "#4aa3df", "#5cc88a", "#e57a44", "#c86bd4", "#e0e0e0", "#ff6b6b", "#8fd3c8"];

type Props = {
  kind: VehicleKind;
  length: number; width: number; height: number; // cm
  boxes?: Placed[];
  colorKeys?: string[];
  highlightedOrder?: number;
  className?: string;
  spin?: boolean;
};

export default function Truck3D({ kind, length, width, height, boxes = [], colorKeys = [], className, highlightedOrder, spin = false }: Props) {
  const L = length / 100, W = width / 100, H = height / 100;
  const open = kind === "pickup" || kind === "auto";
  const cabL = kind === "gandola" ? 2.4 : kind === "auto" ? 2.2 : Math.min(2, Math.max(1.4, L * 0.4));
  const cabH = kind === "auto" ? 1.1 : kind === "pickup" ? 1.5 : Math.max(1.8, Math.min(H + 0.6, 2.9));
  const cabW = Math.max(W, 1.6);
  const chassis = kind === "auto" ? 0.35 : 0.9;
  const wheelR = kind === "gandola" || kind === "camion750" ? 0.5 : 0.38;
  const span = Math.max(L + cabL, 4);
  const axles = [-cabL + 0.6, L * 0.75, ...(kind === "gandola" ? [L * 0.88, L - 0.6] : [])];
  return (
    <div className={className}>
      <Canvas camera={{ position: [span * 0.9, span * 0.55, span * 0.9], fov: 40 }} shadows dpr={[1, 2]}>
        <FitCamera span={span} />
        <color attach="background" args={["#1d1f24"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1.4} castShadow />
        <Environment resolution={64}>
          <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={1} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        </Environment>
        <group position={[-(L - cabL) / 2, 0, 0]}>
          {/* ground */}
          <mesh rotation-x={-Math.PI / 2} position={[L / 2 - cabL / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[span * 3, span * 3]} />
            <meshStandardMaterial color="#2a2c31" roughness={0.95} />
          </mesh>
          <gridHelper args={[span * 3, Math.round(span * 3), "#3a3d44", "#30333a"]} position={[L / 2 - cabL / 2, 0.002, 0]} />
          {/* chassis */}
          <mesh position={[(L - cabL) / 2, chassis - 0.1, 0]} castShadow>
            <boxGeometry args={[L + cabL, 0.2, W * 0.9]} />
            <meshStandardMaterial color="#222" metalness={0.6} roughness={0.5} />
          </mesh>
          {/* cab */}
          <group position={[-cabL / 2, chassis + cabH / 2, 0]}>
            <mesh castShadow>
              <boxGeometry args={[cabL, cabH, cabW]} />
              <meshStandardMaterial color="#f2c230" metalness={0.3} roughness={0.4} />
            </mesh>
            <mesh position={[-cabL / 2 - 0.01, cabH * 0.18, 0]}>
              <boxGeometry args={[0.02, cabH * 0.38, cabW * 0.85]} />
              <meshStandardMaterial color="#9fd3ff" metalness={0.9} roughness={0.1} />
            </mesh>
          </group>
          {/* wheels */}
          {axles.flatMap((x) => [-1, 1].map((s) => (
            <mesh key={`${x}${s}`} position={[x, wheelR, s * (W / 2)]} rotation-x={Math.PI / 2} castShadow>
              <cylinderGeometry args={[wheelR, wheelR, 0.3, 24]} />
              <meshStandardMaterial color="#111" roughness={0.8} />
            </mesh>
          )))}
          {/* cargo space */}
          <group position={[0, chassis, -W / 2]}>
            <mesh position={[L / 2, H / 2, W / 2]}>
              <boxGeometry args={[L, H, W]} />
              <meshStandardMaterial color={open ? "#888" : "#d9dde3"} transparent opacity={open ? 0.06 : 0.12} depthWrite={false} />
              <Edges color="#f2c230" />
            </mesh>
            <mesh position={[L / 2, 0.01, W / 2]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[L, W]} />
              <meshStandardMaterial color="#5b4a36" roughness={0.9} />
            </mesh>
            {boxes.map((b) => {
              const ci = Math.max(0, colorKeys.indexOf(b.pkgId));
              return (
                <mesh key={`${b.pkgId}-${b.unit}`} position={[(b.x + b.l / 2) / 100, (b.z + b.h / 2) / 100, (b.y + b.w / 2) / 100]} castShadow>
                  <boxGeometry args={[b.l / 100 - 0.01, b.h / 100 - 0.01, b.w / 100 - 0.01]} />
                  <meshStandardMaterial color={PALETTE[ci % PALETTE.length] ?? "#f2c230"} roughness={0.7} transparent={highlightedOrder !== undefined && b.loadOrder !== highlightedOrder} opacity={highlightedOrder !== undefined && b.loadOrder !== highlightedOrder ? 0.3 : 1} />
                  <Edges color={b.fragile ? "#ff3b3b" : b.loadOrder === highlightedOrder ? "#f2c230" : "#1a1a1a"} />
                </mesh>
              );
            })}
            <Html position={[L, H + 0.15, W / 2]} center>
              <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#f2c230", whiteSpace: "nowrap" }}>PUERTA ▸</span>
            </Html>
          </group>
        </group>
        <OrbitControls makeDefault target={[0, 1, 0]} maxPolarAngle={Math.PI / 2.05} autoRotate={spin} autoRotateSpeed={0.35} />
      </Canvas>
    </div>
  );
}

export { PALETTE };

function FitCamera({ span }: { span: number }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const factor = Math.max(1, 1.3 * size.height / Math.max(1, size.width));
    camera.position.set(span * 0.9 * factor, span * 0.55 * factor, span * 0.9 * factor);
    camera.lookAt(0, 1, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, span, invalidate]);
  return null;
}
