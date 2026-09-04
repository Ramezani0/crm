import type { Opportunity, PipelineStage } from "@/lib/types";

export const STAGE_TONE: Record<PipelineStage, string> = {
  "سرنخ جدید": "bg-info/15 text-info border-info/30",
  "نیازسنجی": "bg-primary/15 text-primary border-primary/30",
  "استعلام حق بیمه": "bg-accent/15 text-accent-foreground border-accent/30",
  "ارسال پیشنهاد": "bg-warning/15 text-warning border-warning/30",
  "مذاکره": "bg-warning/20 text-warning border-warning/40",
  "صدور": "bg-success/15 text-success border-success/30",
  "از دست رفته": "bg-destructive/15 text-destructive border-destructive/30",
};

export const weighted = (list: Opportunity[]) =>
  list.reduce((sum, o) => sum + (o.expectedPremium * o.probability) / 100, 0);

export const totalValue = (list: Opportunity[]) => list.reduce((s, o) => s + o.expectedPremium, 0);
