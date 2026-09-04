import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { LEAD_SOURCES, type LeadSource, type Opportunity, type PolicyKind } from "@/lib/types";

const PRODUCTS: PolicyKind[] = ["شخص ثالث", "بدنه", "عمر و سرمایه‌گذاری", "درمان تکمیلی", "آتش‌سوزی", "مسئولیت"];

export function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { upsertOpportunity, users, currentUser } = useStore();
  const [form, setForm] = useState({
    contactName: "",
    phone: "",
    city: "تهران",
    source: LEAD_SOURCES[0] as LeadSource,
    product: PRODUCTS[0] as PolicyKind,
    expectedPremium: "",
    owner: currentUser?.name ?? "",
    nextAction: "تماس اول و نیازسنجی",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

  const submit = () => {
    if (!form.contactName.trim() || !form.phone.trim()) return;
    const now = new Date();
    const deal: Opportunity = {
      id: `OP-${Date.now()}`,
      title: `${form.product} — ${form.contactName.trim()}`,
      contactName: form.contactName.trim(),
      phone: form.phone.trim(),
      city: form.city,
      source: form.source,
      product: form.product,
      expectedPremium: Number(form.expectedPremium) || 0,
      probability: 20,
      stage: "سرنخ جدید",
      owner: form.owner || currentUser?.name || "—",
      nextAction: form.nextAction,
      nextActionAt: new Date(now.getTime() + 2 * 86400000).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    upsertOpportunity(deal);
    onOpenChange(false);
    setForm((f) => ({ ...f, contactName: "", phone: "", expectedPremium: "" }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ثبت سرنخ جدید</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ld-name">نام مخاطب</Label>
            <Input id="ld-name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ld-phone">شماره تماس</Label>
            <Input id="ld-phone" className="num" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ld-city">شهر</Label>
            <Input id="ld-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ld-source">منبع</Label>
            <select id="ld-source" className={selectClass} value={form.source} onChange={(e) => set("source", e.target.value)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ld-product">رشته بیمه</Label>
            <select id="ld-product" className={selectClass} value={form.product} onChange={(e) => set("product", e.target.value)}>
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ld-premium">حق بیمه برآوردی (ریال)</Label>
            <Input
              id="ld-premium"
              className="num"
              inputMode="numeric"
              value={form.expectedPremium}
              onChange={(e) => set("expectedPremium", e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ld-owner">کارشناس</Label>
            <select id="ld-owner" className={selectClass} value={form.owner} onChange={(e) => set("owner", e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ld-next">اقدام بعدی</Label>
            <Input id="ld-next" value={form.nextAction} onChange={(e) => set("nextAction", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={!form.contactName.trim() || !form.phone.trim()}>
            ثبت سرنخ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
