import { BRAND, LUX_ART } from "@/lib/brand";
import { LuxStill } from "@/components/lux-still";

/** Login copy cards from the lux art pack (12 / 13 / 14 / 15) plus brand-type composition (04). */
export function LoginCopyCards() {
  const cards = [
    { src: LUX_ART.badgeCode, alt: BRAND.agencyCode },
    { src: LUX_ART.fasihi, alt: BRAND.representativeShort },
    { src: LUX_ART.ramezani, alt: BRAND.loginManager },
    { src: LUX_ART.code3045, alt: BRAND.loginCodeLine },
  ] as const;

  return (
    <div className="max-w-xl space-y-3">
      <LuxStill
        src={LUX_ART.brandType}
        alt={BRAND.insurer}
        className="aspect-video w-full max-w-md rounded-2xl object-cover shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
      />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((card) => (
          <li key={card.src}>
            <LuxStill
              src={card.src}
              alt={card.alt}
              className="aspect-video w-full rounded-xl object-cover ring-1 ring-brand-gold/35 shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
