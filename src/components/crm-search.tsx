import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { searchCrmDossierHits } from "@/lib/dossier";
import { useDebounced, useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";

export function CrmDossierSearch() {
  const { customers, policies } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const hits = useMemo(
    () => searchCrmDossierHits(dq, customers, policies, 8),
    [dq, customers, policies],
  );

  if (customers.length === 0 && policies.length === 0) return null;

  return (
    <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="جستجوی نام یا شماره بیمه‌نامه…"
        aria-label="جستجوی پرونده ۳۶۵"
        className="h-9"
      />
      {dq.trim() && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card p-1 text-sm shadow-lg">
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">موردی یافت نشد</li>
          ) : (
            hits.map((hit) => (
              <li key={`${hit.kind}-${hit.customerId}-${hit.title}`}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start rounded-md px-3 py-2 text-start hover:bg-secondary"
                  onClick={() => {
                    setQ("");
                    void navigate({
                      to: "/customers/$customerId",
                      params: { customerId: hit.customerId },
                    });
                  }}
                >
                  <span className="font-medium">{hit.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {hit.kind === "policy" ? "بیمه‌نامه · " : ""}
                    {hit.subtitle}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
