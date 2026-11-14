import { BRAND_ASSETS } from "@/lib/brand";

/** Very faint official mark on the operational canvas — not a second 3D scene. */
export function BrandWatermark() {
  return (
    <div className="brand-watermark" aria-hidden>
      <img src={BRAND_ASSETS.logo} alt="" />
    </div>
  );
}
