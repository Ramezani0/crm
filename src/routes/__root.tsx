import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider } from "../lib/store";
import { BRAND, BRAND_ASSETS } from "../lib/brand";
import { THEME_BOOT_SCRIPT } from "../lib/theme";
import { ThemeProvider } from "../lib/theme-context";
import { Toaster } from "../components/ui/sonner";
import { Button } from "../components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="glass max-w-md rounded-2xl p-10 text-center">
        <h1 className="text-6xl font-bold text-title">۴۰۴</h1>
        <h2 className="mt-4 text-xl font-semibold">صفحه پیدا نشد</h2>
        <p className="mt-2 text-base text-muted-foreground">
          آدرس وارد شده در سامانه فصیحی وجود ندارد یا جابه‌جا شده است.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">بازگشت به ورود</Link>
        </Button>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="glass max-w-md rounded-2xl p-10 text-center">
        <h1 className="text-xl font-semibold tracking-tight">این صفحه بارگذاری نشد</h1>
        <p className="mt-2 text-base text-muted-foreground">
          خطایی رخ داده است. می‌توانید دوباره تلاش کنید یا به صفحه اصلی بازگردید.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            تلاش دوباره
          </Button>
          <Button asChild variant="outline">
            <a href="/">صفحه اصلی</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${BRAND.title} | سامانه مدیریت بیمه` },
      { name: "description", content: BRAND.subtitle },
      { name: "author", content: BRAND.titleEn },
      { property: "og:type", content: "website" },
      { property: "og:title", content: BRAND.title },
      { property: "og:description", content: BRAND.subtitle },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap",
      },
      { rel: "icon", href: BRAND_ASSETS.favicon, type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: BRAND_ASSETS.logoSm },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <StoreProvider>
          <Outlet />
          <Toaster position="top-center" dir="rtl" />
        </StoreProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
