import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "은행 리포트",
  description: "업로드 / 카테고리 / 미분류 / 리포트",
};

const Nav = () => {
  const items = [
    { href: "/uploads", label: "업로드" },
    { href: "/categories", label: "카테고리" },
    { href: "/unclassified", label: "미분류" },
    { href: "/reports", label: "리포트" },
  ];

  return (
    <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
        <a href="/" className="font-extrabold tracking-tight">
          은행<span className="text-gray-400">리포트</span>
        </a>

        <nav className="ml-auto flex flex-wrap gap-2">
          {items.map((x) => (
            <a
              key={x.href}
              href={x.href}
              className="rounded-full border px-3 py-1 text-sm hover:bg-gray-50"
            >
              {x.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-100 text-gray-900">
        <Nav />
        <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}