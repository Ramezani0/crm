/** P1 persist client — customer PATCH, installment payment, documents, audit.
 * Design/theme HOLD. Call resetApiDataFetch / resetCrmFetches after successful mutates.
 * Customer writes: PATCH only (never PUT).
 * Documents: live Import routes + C-K{holder} key normalization.
 */
import { apiFetch, apiUrl, resetCrmFetches } from "./api";
import type { Customer } from "./types";

export type PersistOk<T> = { ok: true } & T;
export type PersistErr = { ok: false; error?: string; code?: string };

export type CustomerDocument = {
  id: number | string;
  customerId?: string | null;
  policyholderCode?: string | null;
  nationalId?: string | null;
  policyNumber?: string | null;
  category?: string;
  categoryLabel?: string;
  title?: string;
  fileTitle?: string;
  originalName?: string | null;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  fileSizeBytes?: number;
  sha256?: string;
  note?: string | null;
  uploadedBy?: string | null;
  uploadedAt?: string | null;
  createdAt?: string;
  deletedAt?: string | null;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(apiUrl(path as `/api/${string}`), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  return (await res.json()) as T;
}

/** Resolve policyholder / holder code for PATCH. Prefer holderCode, else id. Bare digits — not C-K. */
export function resolvePolicyholderCode(c: Pick<Customer, "id" | "holderCode">): string {
  const holder = String(c.holderCode || "").trim();
  if (holder && !/^C-K/i.test(holder)) return holder;
  const id = String(c.id || "").trim();
  if (/^C-K/i.test(id)) return id.slice(3);
  if (/^C-/i.test(id) && !/^C-K/i.test(id)) {
    // national-style C-{nid} — prefer holderCode if present
    return holder || id;
  }
  return holder || id;
}

/**
 * Live documents folder / customer_id key: `C-K{holder}`.
 * FACT: storage + customer_documents.customer_id use C-K825221 while customers.holder_code is 825221.
 */
export function documentCustomerKey(c: Pick<Customer, "id" | "holderCode">): string {
  const holder = String(c.holderCode || "").trim();
  const id = String(c.id || "").trim();
  if (/^C-K/i.test(id)) return id;
  if (/^C-K/i.test(holder)) return holder;
  const bare = (holder || id.replace(/^C-K/i, "").replace(/^C-/i, "")).trim();
  if (!bare) return id || holder;
  return `C-K${bare}`;
}

/** Aliases to try when listing docs (C-K first, then bare holder/id). */
export function documentCustomerKeyAliases(c: Pick<Customer, "id" | "holderCode">): string[] {
  const primary = documentCustomerKey(c);
  const bare = resolvePolicyholderCode(c);
  const id = String(c.id || "").trim();
  const out: string[] = [];
  for (const k of [primary, bare, id, bare ? `C-K${bare}` : ""]) {
    const t = k.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export type CustomerPatchBody = {
  mobile?: string;
  phone?: string;
  name?: string;
  fullName?: string;
  full_name?: string;
  note?: string;
  performedBy?: string;
};

export async function patchCustomer(
  policyholderCode: string,
  body: CustomerPatchBody,
): Promise<
  | PersistOk<{
      updated?: boolean;
      customer?: {
        id: string;
        holderCode?: string;
        fullName?: string;
        phone?: string;
        mobile?: string;
        note?: string;
        sourceSystem?: string;
      };
      sourceSystemPreserved?: string;
    }>
  | PersistErr
> {
  const code = encodeURIComponent(policyholderCode);
  return jsonFetch(`/api/customers/${code}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function postInstallmentPayment(body: {
  installmentId: string;
  amount: number;
  method: string;
  paidDate?: string;
  performedBy?: string;
}): Promise<
  | PersistOk<{
      installment?: {
        id: string;
        paidAmount: number;
        paidDate?: string;
        paymentMethod?: string;
        status?: string;
        sourceSystem?: string;
      };
      sourceSystemPreserved?: string;
    }>
  | PersistErr
> {
  return jsonFetch("/api/installments/payment", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchAudit(params?: {
  table?: string;
  recordId?: string;
  limit?: number;
}): Promise<
  | PersistOk<{
      items: Array<{
        id: number | string;
        actor: string;
        action: string;
        entity: string;
        ip: string;
        date: string;
        tableName?: string;
        recordId?: string;
        performedBy?: string;
        createdAt?: string;
      }>;
      count: number;
    }>
  | PersistErr
> {
  const qs = new URLSearchParams();
  if (params?.table) qs.set("table", params.table);
  if (params?.recordId) qs.set("recordId", params.recordId);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonFetch(`/api/audit${suffix}`);
}

function normalizeDocList(raw: Record<string, unknown>): CustomerDocument[] {
  const docs = (raw.documents ?? raw.items ?? []) as CustomerDocument[];
  return Array.isArray(docs) ? docs : [];
}

/** Live: GET /api/customers/{C-K…}/documents — tries C-K then bare aliases. */
export async function listCustomerDocuments(
  customer: Pick<Customer, "id" | "holderCode"> | string,
): Promise<PersistOk<{ items: CustomerDocument[]; count: number; customerId?: string }> | PersistErr> {
  const aliases =
    typeof customer === "string"
      ? [customer, customer.replace(/^C-K/i, ""), customer.startsWith("C-K") ? customer : `C-K${customer}`].filter(
          (v, i, a) => v && a.indexOf(v) === i,
        )
      : documentCustomerKeyAliases(customer);

  let lastErr: PersistErr | null = null;
  let best: CustomerDocument[] = [];
  let usedKey = aliases[0] || "";

  for (const key of aliases) {
    const enc = encodeURIComponent(key);
    try {
      const raw = (await jsonFetch(`/api/customers/${enc}/documents`)) as {
        ok?: boolean;
        error?: string;
        documents?: CustomerDocument[];
        items?: CustomerDocument[];
        count?: number;
      };
      if (!raw || raw.ok === false) {
        lastErr = { ok: false, error: raw?.error || "لیست اسناد ناموفق" };
        continue;
      }
      const items = normalizeDocList(raw as Record<string, unknown>);
      if (items.length > 0 || !best.length) {
        best = items;
        usedKey = key;
      }
      if (items.length > 0) break;
    } catch {
      lastErr = { ok: false, error: "خطا در خواندن اسناد" };
    }
  }

  if (lastErr && best.length === 0 && aliases.length === 0) return lastErr;
  return { ok: true, items: best, count: best.length, customerId: usedKey };
}

/** Live POST /api/customers/{C-K…}/documents — also sends Eng field aliases. */
export async function postCustomerDocument(body: {
  policyholderCode?: string;
  customerId?: string;
  category: string;
  fileTitle?: string;
  title?: string;
  filename?: string;
  fileName?: string;
  mimeType?: string;
  contentBase64?: string;
  content?: string;
  nationalId?: string;
  policyNumber?: string;
  uploadedBy?: string;
  note?: string;
}): Promise<PersistOk<{ document?: CustomerDocument }> | PersistErr> {
  const key = String(body.customerId || body.policyholderCode || "").trim();
  if (!key) return { ok: false, error: "شناسه بیمه‌گذار برای سند الزامی است" };
  const enc = encodeURIComponent(key);
  const payload = {
    category: body.category,
    title: body.title || body.fileTitle,
    fileTitle: body.fileTitle || body.title,
    fileName: body.fileName || body.filename,
    filename: body.filename || body.fileName,
    content: body.content || body.contentBase64,
    contentBase64: body.contentBase64 || body.content,
    base64: body.content || body.contentBase64,
    mimeType: body.mimeType,
    policyNumber: body.policyNumber,
    note: body.note,
    uploadedBy: body.uploadedBy,
  };
  return jsonFetch(`/api/customers/${enc}/documents`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Live soft-delete: POST /api/documents/{id}/delete */
export async function softDeleteCustomerDocument(
  documentId: string | number,
): Promise<PersistOk<{ deleted?: boolean }> | PersistErr> {
  const id = encodeURIComponent(String(documentId));
  return jsonFetch(`/api/documents/${id}/delete`, { method: "POST", body: "{}" });
}

/** Read file as base64 (no data: prefix) for upload. Max 8 MiB (live docs ceiling). */
export function fileToBase64(file: File, maxBytes = 8 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) {
    return Promise.reject(new Error("حجم فایل بیش از حد مجاز است"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const i = result.indexOf(",");
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function docDisplayTitle(d: CustomerDocument): string {
  return (d.title || d.fileTitle || d.originalName || "سند").trim();
}

export function afterPersistSuccess(): void {
  resetCrmFetches();
}

export async function fetchPersistMeta(): Promise<
  | PersistOk<{ module?: string; endpoints?: string[]; demoStub?: boolean }>
  | PersistErr
> {
  try {
    return await jsonFetch("/api/persist/meta");
  } catch {
    return { ok: false, error: "persist meta unavailable", code: "unavailable" };
  }
}

export async function postMarkRenewed(body: {
  policyId: string;
  note?: string;
  performedBy?: string;
}): Promise<
  | PersistOk<{
      updated?: boolean;
      alreadyRenewed?: boolean;
      policy?: {
        id: string;
        number?: string;
        status?: string;
        sourceSystem?: string;
      };
      sourceSystemPreserved?: string;
    }>
  | PersistErr
> {
  return jsonFetch("/api/renewals/mark", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
