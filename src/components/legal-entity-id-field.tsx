import { LEGAL_ENTITY_ID_LABEL, displayLegalEntityId } from "@/lib/format";

/**
 * شناسه حقوقی — details/dossier only. Do not put this on list tables.
 */
export function LegalEntityIdField({ value }: { value?: string | null }) {
  const text = displayLegalEntityId(value);
  const empty = text === "—";

  return (
    <div>
      <dt className="text-xs text-muted-foreground">{LEGAL_ENTITY_ID_LABEL}</dt>
      <dd className="mt-0.5 text-sm">
        {empty ? (
          "—"
        ) : (
          <span className="num font-mono" dir="ltr">
            {text}
          </span>
        )}
      </dd>
    </div>
  );
}
