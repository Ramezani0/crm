import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Float, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { BRAND, BRAND_ASSETS } from "@/lib/brand";
import { mulberry32 } from "@/lib/scene-variation";
import { CUBE_ICON_LAYOUT, drawCubeIcon, type CubeIconKind } from "./cube-icons";

function useVisibilityLoop() {
  const [running, setRunning] = useState(true);
  useEffect(() => {
    const sync = () => setRunning(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return running;
}

function useThemeDark() {
  const [dark, setDark] = useState(() =>
    typeof document === "undefined" ? true : !document.documentElement.classList.contains("light"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(!root.classList.contains("light"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** Punch the PNG’s black field so the official diamond sits in the 3D scene. */
function useKarafarinTexture() {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let disposed = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (disposed) return;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i]! < 22 && d[i + 1]! < 22 && d[i + 2]! < 22) d[i + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.src = BRAND_ASSETS.logo;
    return () => {
      disposed = true;
      setTexture((prev) => {
        prev?.dispose();
        return null;
      });
    };
  }, []);

  return texture;
}

function useCubeIconTextures() {
  const [maps, setMaps] = useState<Partial<Record<CubeIconKind, THREE.CanvasTexture>>>({});

  useEffect(() => {
    const next: Partial<Record<CubeIconKind, THREE.CanvasTexture>> = {};
    for (const item of CUBE_ICON_LAYOUT) {
      const tex = new THREE.CanvasTexture(drawCubeIcon(item.kind));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      next[item.kind] = tex;
    }
    setMaps(next);
    return () => {
      for (const tex of Object.values(next)) tex?.dispose();
    };
  }, []);

  return maps;
}

function GoldDust({ dark, seed, tight }: { dark: boolean; seed: number; tight?: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const spin = 0.028 + (seed % 17) * 0.0012;
  const geom = useMemo(() => {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const count = tight ? 70 : 110;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const spread = tight ? 3.4 : 6.2;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() - 0.5) * spread;
      positions[i * 3 + 1] = (rng() - 0.5) * (tight ? 3.2 : 4.8);
      positions[i * 3 + 2] = (rng() - 0.5) * (tight ? 2.4 : 3.6);
      const gold = rng() > 0.38;
      if (gold) {
        colors[i * 3] = 0.99;
        colors[i * 3 + 1] = 0.74;
        colors[i * 3 + 2] = 0.05;
      } else {
        colors[i * 3] = 0.0;
        colors[i * 3 + 1] = 0.46;
        colors[i * 3 + 2] = 0.25;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [seed, tight]);

  useEffect(() => () => geom.dispose(), [geom]);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * spin;
  });

  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial
        size={tight ? 0.032 : 0.038}
        vertexColors
        transparent
        opacity={dark ? 0.7 : 0.5}
        sizeAttenuation
      />
    </points>
  );
}

function OrbitRing({ radius = 1.85, speed = 0.16, color = "#fcbc00" }: { radius?: number; speed?: number; color?: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * speed;
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2.5, 0.18, 0]}>
      <torusGeometry args={[radius, 0.012, 8, 80]} />
      <meshBasicMaterial color={color} transparent opacity={0.42} />
    </mesh>
  );
}

function OfficialMark({ texture, seed }: { texture: THREE.CanvasTexture | null; seed: number }) {
  const group = useRef<THREE.Group>(null);
  const gem = useRef<THREE.MeshPhysicalMaterial>(null);
  const phase = (seed % 1000) / 1000;
  const amp = 0.018 + (seed % 11) * 0.0012;
  useFrame(({ clock }) => {
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.05 + phase * Math.PI * 2);
    if (group.current) {
      const s = 1 + pulse * amp;
      group.current.scale.setScalar(s);
    }
    if (gem.current) {
      gem.current.emissiveIntensity = 0.1 + pulse * 0.16;
    }
  });
  return (
    <Float speed={1.05} rotationIntensity={0.18} floatIntensity={0.32}>
      <group ref={group}>
        <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, -0.12]}>
          <planeGeometry args={[2.55, 2.55]} />
          <meshPhysicalMaterial
            color="#007440"
            metalness={0.35}
            roughness={0.22}
            transparent
            opacity={0.42}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[1.22, 0]} />
          <meshPhysicalMaterial
            ref={gem}
            color="#007440"
            metalness={0.28}
            roughness={0.18}
            transparent
            opacity={0.22}
            transmission={0.15}
            thickness={0.4}
            emissive="#007440"
            emissiveIntensity={0.12}
          />
        </mesh>
        {texture ? (
          <mesh position={[0, 0, 0.08]}>
            <planeGeometry args={[2.35, 2.35]} />
            <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ) : null}
      </group>
    </Float>
  );
}

function MarblePedestal({ dark }: { dark: boolean }) {
  const slab = dark ? "#161814" : "#3a3d38";
  const gold = "#fcbc00";
  return (
    <group position={[0, -1.22, 0]}>
      <mesh position={[0, -0.22, 0]}>
        <boxGeometry args={[2.55, 0.16, 2.55]} />
        <meshStandardMaterial color={slab} roughness={0.38} metalness={0.18} />
      </mesh>
      <mesh position={[0, -0.13, 0]}>
        <boxGeometry args={[2.6, 0.028, 2.6]} />
        <meshStandardMaterial color={gold} metalness={0.72} roughness={0.22} />
      </mesh>
      <mesh>
        <boxGeometry args={[2.05, 0.16, 2.05]} />
        <meshStandardMaterial color={slab} roughness={0.34} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[2.1, 0.026, 2.1]} />
        <meshStandardMaterial color={gold} metalness={0.72} roughness={0.22} />
      </mesh>
    </group>
  );
}

function GlassCubes({
  maps,
  dark,
}: {
  maps: Partial<Record<CubeIconKind, THREE.CanvasTexture>>;
  dark: boolean;
}) {
  const size = 0.68;
  const gap = 0.08;
  const step = (size + gap) / 2;
  const glass = dark ? "#7ecad8" : "#9bd4e8";

  return (
    <group position={[0, -0.02, 0]}>
      {CUBE_ICON_LAYOUT.map((item) => {
        const x = item.col * step;
        const y = item.row * step;
        const map = maps[item.kind];
        return (
          <group key={item.kind} position={[x, y, 0]}>
            <RoundedBox args={[size, size, size]} radius={0.08} smoothness={4}>
              <meshPhysicalMaterial
                color={glass}
                metalness={0.12}
                roughness={0.08}
                transmission={0.28}
                thickness={0.45}
                ior={1.4}
                transparent
                opacity={0.78}
                clearcoat={0.8}
                clearcoatRoughness={0.12}
                attenuationColor={glass}
                attenuationDistance={1.4}
              />
            </RoundedBox>
            {map ? (
              <>
                <mesh position={[0, 0, size / 2 + 0.012]}>
                  <planeGeometry args={[size * 0.46, size * 0.46]} />
                  <meshBasicMaterial map={map} transparent depthWrite={false} />
                </mesh>
                <mesh position={[size / 2 + 0.012, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                  <planeGeometry args={[size * 0.46, size * 0.46]} />
                  <meshBasicMaterial map={map} transparent depthWrite={false} />
                </mesh>
              </>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

function EmeraldUmbrella() {
  return (
    <group position={[0, 0.08, 0]}>
      <mesh position={[0, 1.18, 0]} scale={[1, 0.42, 1]}>
        <sphereGeometry args={[1.48, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#007440"
          metalness={0.38}
          roughness={0.2}
          clearcoat={0.7}
          clearcoatRoughness={0.18}
          side={THREE.DoubleSide}
        />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[0, 1.12, 0]} rotation={[0.62, a, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 1.42, 6]} />
            <meshStandardMaterial color="#0b5a32" metalness={0.35} roughness={0.3} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 2.35, 10]} />
        <meshStandardMaterial color="#fcbc00" metalness={0.78} roughness={0.18} />
      </mesh>
      <mesh position={[0.11, -0.92, 0.02]} rotation={[0, 0, Math.PI / 2.2]}>
        <torusGeometry args={[0.13, 0.028, 8, 20, Math.PI * 1.15]} />
        <meshStandardMaterial color="#fcbc00" metalness={0.78} roughness={0.18} />
      </mesh>
    </group>
  );
}

function LuxuryShowcase({ dark, seed }: { dark: boolean; seed: number }) {
  const group = useRef<THREE.Group>(null);
  const maps = useCubeIconTextures();
  const yaw = 0.11 + (seed % 13) * 0.002;

  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * yaw;
    group.current.position.y = -0.42 + Math.sin(clock.elapsedTime * 0.7) * 0.04;
  });

  return (
    <group ref={group} position={[-1.42, -0.42, 0]} scale={0.92}>
      <MarblePedestal dark={dark} />
      <GlassCubes maps={maps} dark={dark} />
      <EmeraldUmbrella />
      <OrbitRing radius={1.55} speed={0.12} color="#fcbc00" />
      <OrbitRing radius={1.78} speed={-0.08} color="#007440" />
    </group>
  );
}

function SceneContent({ compact }: { compact: boolean }) {
  const dark = useThemeDark();
  const texture = useKarafarinTexture();
  const seed = useMemo(() => (Math.random() * 0xffffffff) >>> 0, []);

  return (
    <>
      <fog attach="fog" args={[dark ? "#050806" : "#f4efe0", compact ? 7 : 8, compact ? 16 : 18]} />
      <ambientLight intensity={dark ? 0.42 : 0.7} />
      <hemisphereLight args={[dark ? "#e8c547" : "#fcbc00", dark ? "#050806" : "#efe6cc", 0.5]} />
      <directionalLight position={[3.2, 3.6, 2.8]} intensity={1.35} color="#fff6d2" />
      <pointLight position={[-2.2, 1.4, 2]} intensity={compact ? 16 : 20} color="#007440" distance={11} />
      <pointLight position={[2.2, -0.6, 1.8]} intensity={compact ? 12 : 16} color="#fcbc00" distance={9} />
      <spotLight position={[0.2, 4.2, 3.2]} angle={0.42} intensity={18} color="#fff4cc" penumbra={0.5} />
      <GoldDust dark={dark} seed={seed} tight={!compact} />
      {compact ? (
        <>
          <OrbitRing />
          <OfficialMark texture={texture} seed={seed} />
        </>
      ) : (
        <>
          <LuxuryShowcase dark={dark} seed={seed} />
          <ContactShadows
            position={[-1.42, -1.72, 0]}
            opacity={dark ? 0.48 : 0.32}
            scale={9}
            blur={2.4}
            far={4}
            color="#050806"
          />
        </>
      )}
    </>
  );
}

export default function InsuranceScene({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const running = useVisibilityLoop();

  return (
    <div
      className={cn(
        "relative isolate h-full min-h-[280px] w-full",
        compact && "h-56 w-56",
        className,
      )}
      role="img"
      aria-label={
        compact
          ? `نشان سه‌بعدی ${BRAND.insurer}`
          : `صحنه لوکس بیمه — مکعب شیشه‌ای و چتر ${BRAND.insurer}`
      }
    >
      <Canvas
        frameloop={running ? "always" : "never"}
        dpr={[1, 1.25]}
        camera={
          compact
            ? { position: [0, 0.1, 4.7], fov: 34 }
            : { position: [0.15, 0.48, 6.55], fov: 30 }
        }
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ pointerEvents: "none", background: "transparent" }}
      >
        <SceneContent compact={compact} />
      </Canvas>
    </div>
  );
}
