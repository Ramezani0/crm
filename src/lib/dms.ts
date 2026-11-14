/** M6 بایگانی / DMS — client helpers. DEMO mirrors vps/dms.py */

import { apiFetch, apiUrl } from "./api";

export const MODULE_LABEL = "بایگانی / DMS";
export const PRODUCT_LABEL = MODULE_LABEL;

export const BARCODE_RE =
  /^DMS-BR[A-Z0-9]+-SH[A-Z0-9]+-RW[A-Z0-9]+-BN[A-Z0-9]+-[A-F0-9]{8}$/;

export const DOCUMENT_KINDS = [
  "proposal",
  "national_id_card",
  "birth_certificate",
  "health_booklet",
  "accident_sketch",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const SIGN_METHODS = ["touch", "fingerprint"] as const;
export type SignMethod = (typeof SIGN_METHODS)[number];

export const OCR_DOC_TYPES = [
  "national_id_card",
  "birth_certificate",
  "health_booklet",
  "accident_sketch",
] as const;
export type OcrDocType = (typeof OCR_DOC_TYPES)[number];

export const DEMO_DISCLAIMER =
  "بارکد زونکن و OCR هنوز DEMO stub (بدون بیومتریک/ML). آپلود فایل پایدار از /api/dms/files → customer_documents + /opt/fasihi/documents. Excel HOLD · بدون wipe · Eng-only این بچ.";

export const OCR_STUB_MAPS: Record<OcrDocType, Record<string, string>> = {
  national_id_card: {
    name: "علی رضایی",
    nationalId: "0012345678",
    fatherName: "محمد",
    birthDateJalali: "1370/05/12",
    serial: "A123456",
  },
  birth_certificate: {
    name: "مریم احمدی",
    nationalId: "0098765432",
    fatherName: "حسین",
    birthDateJalali: "1365/01/20",
    birthCertNo: "۱۲۳۴۵۶",
    placeOfBirth: "تهران",
  },
  health_booklet: {
    name: "رضا کریمی",
    nationalId: "0055555555",
    insuranceNo: "HB-998877",
    issuer: "سازمان بیمه سلامت",
    issueDateJalali: "1402/03/01",
  },
  accident_sketch: {
    sketchRef: "SK-1404-001",
    plateA: "21الف12345",
    plateB: "45ب67890",
    accidentDateJalali: "1404/06/15",
    location: "تهران، بزرگراه همت",
    faultHint: "راننده الف",
  },
};

export type ArchiveLocation = {
  id: number;
  dossierKey: string;
  barcode: string;
  qrPayload: string;
  branch: string;
  shelf: string;
  row: string;
  binder: string;
  policyNumber?: string | null;
  policyholderCode?: string | null;
  nationalId?: string | null;
  demoStub?: boolean;
};

export type DmsDocument = {
  id: number;
  dossierKey: string;
  kind: DocumentKind | string;
  title?: string;
  meta?: Record<string, unknown>;
  documentHash: string;
  hashAlgo?: string;
  signed?: boolean;
  signatureId?: number | null;
  signature?: SignatureRecord | null;
  demoStub?: boolean;
};

export type SignatureRecord = {
  id: number;
  documentId: number;
  method: SignMethod | string;
  payloadStub: unknown;
  documentHash: string;
  hashAlgo?: string;
  signedAt?: string;
  realBiometrics?: boolean;
};

export type OcrJob = {
  id: number;
  docType: OcrDocType | string;
  status: string;
  mappedFields: Record<string, string>;
  realMl?: boolean;
  engine?: string;
};

/** Client-side DEMO barcode preview (server assigns authoritative). */
export function previewBarcode(
  branch: string,
  shelf: string,
  row: string,
  binder: string,
  hex8 = "A1B2C3D4",
): string {
  const slug = (v: string, fb: string) =>
    (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || fb;
  return `DMS-BR${slug(branch, "BR")}-SH${slug(shelf, "SH")}-RW${slug(row, "RW")}-BN${slug(binder, "BN")}-${hex8.toUpperCase()}`;
}

export function isValidBarcode(code: string | null | undefined): boolean {
  if (!code) return false;
  return BARCODE_RE.test(String(code).trim());
}

/** Pure OCR stub map (mirrors Python DEMO). */
export function mapOcrFields(
  docType: OcrDocType | string,
  stubText?: string | null,
): Record<string, string> {
  const base = { ...(OCR_STUB_MAPS[docType as OcrDocType] || { note: "unknown_doc_type" }) };
  if (!stubText) return base;
  const text = stubText.trim();
  if (text.includes("|") && text.includes(":")) {
    for (const part of text.split("|")) {
      const idx = part.indexOf(":");
      if (idx < 0) continue;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (!k || !v) continue;
      const keyMap: Record<string, string> = {
        name: "name",
        نام: "name",
        nationalId: "nationalId",
        national_id: "nationalId",
        کدملی: "nationalId",
        "کد ملی": "nationalId",
        fatherName: "fatherName",
        "نام پدر": "fatherName",
      };
      base[keyMap[k] || k] = v;
    }
  } else {
    base.ocrRaw = text;
  }
  return base;
}

/** Stable hex check (length 64 lowercase hex). */
export function isSha256Hex(h: string | null | undefined): boolean {
  if (!h) return false;
  return /^[a-f0-9]{64}$/.test(String(h).trim());
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  return (await res.json()) as T;
}

export function fetchDmsMeta() {
  return jsonFetch<{
    ok: boolean;
    counts?: Record<string, number>;
    disclaimer?: string;
    futureLinkKeys?: string[];
  }>("/api/dms/meta");
}

export function assignArchive(body: {
  dossierKey: string;
  branch: string;
  shelf: string;
  row: string;
  binder: string;
  policyNumber?: string;
  policyholderCode?: string;
  nationalId?: string;
}) {
  return jsonFetch<{
    ok: boolean;
    assigned?: boolean;
    barcode?: string;
    qrPayload?: string;
    location?: ArchiveLocation;
    error?: string;
  }>("/api/dms/archive/assign", { method: "POST", body: JSON.stringify(body) });
}

export function lookupArchive(params: { barcode?: string; dossierKey?: string }) {
  const qs = new URLSearchParams();
  if (params.barcode) qs.set("barcode", params.barcode);
  if (params.dossierKey) qs.set("dossierKey", params.dossierKey);
  return jsonFetch<{
    ok: boolean;
    found?: boolean;
    location?: ArchiveLocation | null;
    error?: string;
  }>(`/api/dms/archive?${qs.toString()}`);
}

export function createDocument(body: {
  dossierKey: string;
  kind: DocumentKind | string;
  meta?: Record<string, unknown>;
  title?: string;
}) {
  return jsonFetch<{
    ok: boolean;
    document?: DmsDocument;
    documentHash?: string;
    error?: string;
  }>("/api/dms/documents", { method: "POST", body: JSON.stringify(body) });
}

export function fetchDocument(id: number | string) {
  return jsonFetch<{
    ok: boolean;
    found?: boolean;
    document?: DmsDocument | null;
    documentHash?: string;
  }>(`/api/dms/documents/${id}`);
}

export function signDocument(body: {
  documentId: number;
  method: SignMethod;
  payloadStub: unknown;
}) {
  return jsonFetch<{
    ok: boolean;
    signature?: SignatureRecord;
    document?: DmsDocument;
    documentHash?: string;
    realBiometrics?: boolean;
    error?: string;
  }>("/api/dms/sign", { method: "POST", body: JSON.stringify(body) });
}

export function postOcr(body: {
  docType: OcrDocType | string;
  imageMeta?: Record<string, unknown>;
  stubText?: string;
}) {
  return jsonFetch<{
    ok: boolean;
    job?: OcrJob;
    mappedFields?: Record<string, string>;
    realMl?: boolean;
    error?: string;
  }>("/api/dms/ocr", { method: "POST", body: JSON.stringify(body) });
}

export function fetchOcrJob(jobId: number | string) {
  return jsonFetch<{
    ok: boolean;
    found?: boolean;
    job?: OcrJob | null;
    mappedFields?: Record<string, string>;
  }>(`/api/dms/ocr/${jobId}`);
}

export function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    proposal: "فرم پیشنهاد",
    national_id_card: "کارت ملی",
    birth_certificate: "شناسنامه",
    health_booklet: "دفترچه درمانی",
    accident_sketch: "کروکی تصادف",
    other: "سایر",
  };
  return map[kind] || kind;
}

export function ocrTypeLabel(t: string): string {
  return kindLabel(t);
}


/** Normalize archive key — prefer C-K{holder} when bare digits; else pass through (dossierKey OK). */
export function archiveCustomerKey(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^C-K/i.test(s)) return s;
  if (/^\d{4,}$/.test(s)) return `C-K${s}`;
  return s;
}

export const FILE_CATEGORIES: { value: string; label: string }[] = [
  { value: "identity", label: "مدارک هویتی" },
  { value: "vehicle", label: "مدارک خودرو" },
  { value: "vehicle_inspection", label: "بازدید اولیه خودرو" },
  { value: "property", label: "مدارک ملک و آتش‌سوزی" },
  { value: "medical", label: "مدارک پزشکی" },
  { value: "proposal", label: "فرم پیشنهاد" },
  { value: "policy_document", label: "بیمه‌نامه / الحاقیه" },
  { value: "payment_receipt", label: "فیش واریز" },
  { value: "claim", label: "مدارک خسارت" },
  { value: "legal", label: "مدارک حقوقی" },
  { value: "other", label: "سایر" },
];

export type DurableArchiveFile = {
  id: string | number;
  customerId?: string;
  category?: string;
  categoryLabel?: string;
  title?: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  uploadedAt?: string | null;
  note?: string | null;
};

export function listArchiveFiles(customerId: string) {
  const key = archiveCustomerKey(customerId);
  const qs = new URLSearchParams({ customerId: key });
  return jsonFetch<{
    ok: boolean;
    items?: DurableArchiveFile[];
    documents?: DurableArchiveFile[];
    count?: number;
    customerId?: string;
    error?: string;
    documentsRoot?: string;
    maxBytes?: number;
  }>(`/api/dms/files?${qs.toString()}`);
}

export function uploadArchiveFile(body: {
  customerId: string;
  category: string;
  title?: string;
  fileName?: string;
  contentBase64: string;
  note?: string;
  uploadedBy?: string;
  policyNumber?: string;
}) {
  const key = archiveCustomerKey(body.customerId);
  return jsonFetch<{
    ok: boolean;
    document?: DurableArchiveFile;
    durable?: boolean;
    error?: string;
  }>("/api/dms/files", {
    method: "POST",
    body: JSON.stringify({
      customerId: key,
      policyholderCode: key,
      category: body.category,
      title: body.title,
      fileTitle: body.title,
      fileName: body.fileName,
      filename: body.fileName,
      content: body.contentBase64,
      contentBase64: body.contentBase64,
      base64: body.contentBase64,
      note: body.note,
      uploadedBy: body.uploadedBy,
      policyNumber: body.policyNumber,
    }),
  });
}

export function softDeleteArchiveFile(id: string | number) {
  const enc = encodeURIComponent(String(id));
  return jsonFetch<{ ok: boolean; deleted?: boolean; error?: string }>(
    `/api/dms/files/${enc}/delete`,
    { method: "POST", body: "{}" },
  );
}

/** Absolute URL for view/download stream. */
export function archiveFileUrl(id: string | number): string {
  const path = `/api/dms/files/${encodeURIComponent(String(id))}/file` as `/api/${string}`;
  return apiUrl(path);
}

/** Read file as base64 (no data: prefix). Default max 8 MiB. */
export function fileToBase64(file: File, maxBytes = 8 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) {
    return Promise.reject(new Error("حجم فایل بیش از حد مجاز است (۸ مگابایت)"));
  }
  const allowed = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/i;
  if (file.type && !allowed.test(file.type) && !/\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name)) {
    return Promise.reject(new Error("فقط PDF و تصویر (JPG/PNG/WEBP/GIF) پذیرفته می‌شود"));
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
