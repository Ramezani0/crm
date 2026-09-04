export type RoleId = "ceo" | "internal_manager" | "sales" | "accounting";

export const ROLES: { id: RoleId; label: string; description: string }[] = [
  { id: "ceo", label: "مدیرعامل", description: "دسترسی کامل به تمام بخش‌ها و گزارش‌ها" },
  { id: "internal_manager", label: "مدیر داخلی", description: "مدیریت عملیات، وظایف و کاربران" },
  { id: "sales", label: "کارشناس فروش", description: "مدیریت مشتریان و بیمه‌نامه‌ها" },
  { id: "accounting", label: "حسابداری", description: "اقساط، پرداخت‌ها و گزارش‌های مالی" },
];

export type Permission =
  | "dashboard.view"
  | "pipeline.view"
  | "pipeline.edit"
  | "customers.view"
  | "customers.edit"
  | "policies.view"
  | "policies.edit"
  | "installments.view"
  | "installments.pay"
  | "import.run"
  | "reports.view"
  | "tasks.view"
  | "notifications.view"
  | "users.manage"
  | "settings.manage"
  | "audit.view";

export const ROLE_PERMISSIONS: Record<RoleId, Permission[]> = {
  ceo: [
    "dashboard.view",
    "pipeline.view",
    "pipeline.edit",
    "customers.view",
    "customers.edit",
    "policies.view",
    "policies.edit",
    "installments.view",
    "installments.pay",
    "import.run",
    "reports.view",
    "tasks.view",
    "notifications.view",
    "users.manage",
    "settings.manage",
    "audit.view",
  ],
  internal_manager: [
    "dashboard.view",
    "pipeline.view",
    "pipeline.edit",
    "customers.view",
    "customers.edit",
    "policies.view",
    "policies.edit",
    "installments.view",
    "import.run",
    "reports.view",
    "tasks.view",
    "notifications.view",
    "users.manage",
    "settings.manage",
    "audit.view",
  ],
  sales: [
    "dashboard.view",
    "pipeline.view",
    "pipeline.edit",
    "customers.view",
    "customers.edit",
    "policies.view",
    "policies.edit",
    "installments.view",
    "reports.view",
    "tasks.view",
    "notifications.view",
  ],
  accounting: [
    "dashboard.view",
    "pipeline.view",
    "customers.view",
    "policies.view",
    "installments.view",
    "installments.pay",
    "import.run",
    "reports.view",
    "tasks.view",
    "notifications.view",
    "audit.view",
  ],
};

export type CustomerStatus = "active" | "inactive" | "lead";

export interface Customer {
  id: string;
  fullName: string;
  nationalId: string;
  phone: string;
  email: string;
  city: string;
  status: CustomerStatus;
  /** Persian status from source file when available. */
  statusLabel?: string;
  segment: "حقیقی" | "حقوقی";
  agent: string;
  createdAt: string;
  note?: string;
}

/** Raw policy kind from source file/DB (e.g. سواری، بارکش) — not remapped. */
export type PolicyKind = string;
export type PolicyStatus = "active" | "expired" | "pending" | "cancelled";

export interface Policy {
  id: string;
  number: string;
  customerId: string;
  /** Insured / policy holder name from import file when customerId is missing. */
  holderName?: string;
  kind: PolicyKind;
  company: string;
  premium: number;
  startDate: string;
  endDate: string;
  status: PolicyStatus;
  /** Persian status text from source file (preferred for display). */
  statusLabel?: string;
  installmentCount: number;
}

export type InstallmentStatus = "paid" | "due" | "overdue" | "partial";

export interface Installment {
  id: string;
  policyId: string;
  customerId: string;
  holderName?: string;
  seq: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: InstallmentStatus;
  statusLabel?: string;
  payments: { id: string; amount: number; date: string; method: string; by: string }[];
}

export interface Task {
  id: string;
  title: string;
  dueDate: string;
  assignee: string;
  priority: "کم" | "متوسط" | "زیاد";
  done: boolean;
  relatedCustomerId?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  date: string;
  kind: "info" | "warning" | "success" | "danger";
  read: boolean;
}

export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  date: string;
}

export interface AppUser {
  id: string;
  name: string;
  username: string;
  role: RoleId;
  email: string;
  active: boolean;
  lastLogin: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  ip: string;
  date: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  query: { search: string; status: string; city: string; segment: string };
}

export type LeadSource =
  | "تماس ورودی"
  | "واتساپ"
  | "اینستاگرام"
  | "معرفی مشتری"
  | "تمدید بیمه‌نامه"
  | "وب‌سایت"
  | "نمایشگاه";

export const LEAD_SOURCES: LeadSource[] = [
  "تماس ورودی",
  "واتساپ",
  "اینستاگرام",
  "معرفی مشتری",
  "تمدید بیمه‌نامه",
  "وب‌سایت",
  "نمایشگاه",
];

export type PipelineStage =
  | "سرنخ جدید"
  | "نیازسنجی"
  | "استعلام حق بیمه"
  | "ارسال پیشنهاد"
  | "مذاکره"
  | "صدور"
  | "از دست رفته";

export const PIPELINE_STAGES: PipelineStage[] = [
  "سرنخ جدید",
  "نیازسنجی",
  "استعلام حق بیمه",
  "ارسال پیشنهاد",
  "مذاکره",
  "صدور",
];

export const LOST_STAGE: PipelineStage = "از دست رفته";

export type ActivityKind = "call" | "meeting" | "sms" | "whatsapp" | "note";

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  call: "تماس",
  meeting: "جلسه",
  sms: "پیامک",
  whatsapp: "واتساپ",
  note: "یادداشت",
};

export interface Opportunity {
  id: string;
  title: string;
  customerId?: string;
  contactName: string;
  phone: string;
  city: string;
  source: LeadSource;
  product: PolicyKind;
  company?: string;
  expectedPremium: number;
  probability: number;
  stage: PipelineStage;
  owner: string;
  nextAction: string;
  nextActionAt: string;
  lostReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DealActivity {
  id: string;
  opportunityId: string;
  kind: ActivityKind;
  body: string;
  at: string;
  by: string;
}
