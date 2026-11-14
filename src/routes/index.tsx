import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { Emblem } from "@/components/emblem/Emblem";
import { BrandFooter } from "@/components/brand-footer";
import { LoginBrandLockup } from "@/components/login-brand-lockup";
import { LoginCopyCards } from "@/components/login-copy-cards";
import { ThemeSwitch } from "@/components/theme-switch";
import { useStore } from "@/lib/store";
import { BRAND } from "@/lib/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ROLES } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `ورود به ${BRAND.title}` },
      { name: "description", content: BRAND.subtitle },
      { property: "og:title", content: `ورود به ${BRAND.title}` },
      { property: "og:description", content: BRAND.subtitle },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, currentUser, hydrated } = useStore();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hydrated && currentUser) navigate({ to: "/dashboard", replace: true });
  }, [hydrated, currentUser, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    void (async () => {
      const res = await login(username, password);
      setBusy(false);
      if (!res.ok) setError(res.error ?? "خطای نامشخص");
      else navigate({ to: "/dashboard" });
    })();
  };

  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-background">
      <div className="absolute inset-0">
        <Emblem className="h-full min-h-dvh w-full max-w-none" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-background/92 via-background/55 to-transparent" />

      <LoginBrandLockup />

      <div className="absolute start-auto end-4 top-4 z-20 sm:end-6 sm:top-6">
        <ThemeSwitch />
      </div>

      {/* RTL: first column is start (right) — form sits on the right, 3D fills the rest. */}
      <div className="relative z-10 grid min-h-dvh lg:grid-cols-[minmax(22rem,32rem)_1fr]">
        <section className="flex flex-col items-center justify-center p-6 pt-28 sm:pt-32">
          <div className="glass w-full max-w-md rounded-3xl p-8">
            <div className="mb-6">
              <h1 className="title-extrude text-3xl font-extrabold sm:text-4xl">{BRAND.title}</h1>
              <p className="mt-2 text-base font-semibold text-foreground">{BRAND.loginAgency}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{BRAND.loginManager}</p>
            </div>
            <h2 className="text-2xl font-bold text-title">ورود به سامانه</h2>
            <p className="mt-1 text-base text-muted-foreground">
              نقش نمایشی را بزنید، سپس وارد شوید. احراز هویت فاز ۱ محلی است.
            </p>

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
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
                >
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                <LogIn className="size-4" aria-hidden />
                {busy ? "در حال ورود…" : "ورود"}
              </Button>
            </form>

            <div className="mt-6 rounded-xl border border-border/70 bg-card/60 p-3">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                نقش‌های نمایشی (فقط نام کاربری)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { u: "ceo", r: "ceo" as const },
                  { u: "manager", r: "internal_manager" as const },
                  { u: "sales", r: "sales" as const },
                  { u: "accounting", r: "accounting" as const },
                ].map((d) => (
                  <button
                    key={d.u}
                    type="button"
                    onClick={() => setUsername(d.u)}
                    className="min-h-11 rounded-lg border border-border px-2 py-1.5 text-right text-sm hover:border-primary/60 hover:bg-secondary"
                  >
                    <span className="block font-semibold">
                      {ROLES.find((x) => x.id === d.r)?.label}
                    </span>
                    <span className="text-muted-foreground">{d.u}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <BrandFooter className="mt-6 max-w-md px-4" />
        </section>

        <section className="pointer-events-none hidden flex-col justify-end gap-6 p-10 lg:flex xl:p-14">
          <LoginCopyCards />
          <div className="max-w-xl space-y-3">
            <h2 className="title-extrude text-4xl font-extrabold xl:text-5xl">{BRAND.insurer}</h2>
            <p className="title-extrude text-2xl font-bold xl:text-3xl">{BRAND.title}</p>
            <p className="text-base text-muted-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
              {BRAND.tagline}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
