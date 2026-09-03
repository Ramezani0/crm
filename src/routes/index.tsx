import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, LogIn } from "lucide-react";
import { Emblem } from "@/components/emblem/Emblem";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ROLES } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ورود به CRM فصیحی | سامانه مدیریت بیمه" },
      {
        name: "description",
        content: "ورود کارشناسان و مدیران دفتر بیمه فصیحی به سامانه مدیریت مشتریان، بیمه‌نامه‌ها و اقساط.",
      },
      { property: "og:title", content: "ورود به CRM فصیحی" },
      { property: "og:description", content: "سامانه یکپارچه مدیریت بیمه‌نامه، اقساط و مشتریان." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, currentUser, hydrated } = useStore();
  const navigate = useNavigate();
  const [username, setUsername] = useState("ceo");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hydrated && currentUser) navigate({ to: "/dashboard", replace: true });
  }, [hydrated, currentUser, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = login(username, password);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "خطای نامشخص");
    else navigate({ to: "/dashboard" });
  };

  return (
    <div className="surface-hero grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-6 text-primary" aria-hidden />
          <span className="text-lg font-extrabold">CRM فصیحی</span>
        </div>
        <Emblem className="mx-auto w-full max-w-sm" />
        <div className="max-w-md">
          <h2 className="text-2xl font-bold leading-relaxed">
            مدیریت هوشمند بیمه‌نامه‌ها، اقساط و مشتریان در یک سامانه یکپارچه
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            پایش لحظه‌ای اقساط معوق، یادآوری تمدید بیمه‌نامه‌ها و گزارش‌های مدیریتی، طراحی‌شده برای دفاتر
            نمایندگی بیمه در ایران.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="glass w-full max-w-md rounded-3xl p-8">
          <div className="mb-6 text-center lg:hidden">
            <Emblem className="mx-auto w-40" />
          </div>
          <h1 className="text-xl font-bold">ورود به سامانه</h1>
          <p className="mt-1 text-sm text-muted-foreground">لطفاً نام کاربری و رمز عبور خود را وارد کنید.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="username">نام کاربری</Label>
              <Input
                id="username"
                value={username}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">رمز عبور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              <LogIn className="size-4" aria-hidden />
              {busy ? "در حال ورود…" : "ورود"}
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-border/70 bg-card/60 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">حساب‌های نمایشی (رمز: ۱۲۳۴۵۶)</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { u: "ceo", r: "ceo" },
                { u: "manager", r: "internal_manager" },
                { u: "sales", r: "sales" },
                { u: "accounting", r: "accounting" },
              ].map((d) => (
                <button
                  key={d.u}
                  type="button"
                  onClick={() => {
                    setUsername(d.u);
                    setPassword("123456");
                  }}
                  className="rounded-lg border border-border px-2 py-1.5 text-right text-xs hover:border-primary/60 hover:bg-secondary"
                >
                  <span className="block font-semibold">{ROLES.find((x) => x.id === d.r)?.label}</span>
                  <span className="text-muted-foreground">{d.u}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
