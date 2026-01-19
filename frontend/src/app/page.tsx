export default function Home() {
  const items = [
    { href: "/uploads", title: "업로드", desc: "은행 엑셀 업로드 후 DB 저장" },
    { href: "/categories", title: "카테고리", desc: "카테고리 추가/관리" },
    { href: "/unclassified", title: "미분류", desc: "미분류 거래 선택 → 카테고리 적용" },
    { href: "/reports", title: "리포트", desc: "월 범위 리포트(수입/지출/고정/변동)" },
  ];

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">
          업로드 → 분류 → 리포트까지 한 흐름으로 관리
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((x) => (
          <a
            key={x.href}
            href={x.href}
            className="rounded-2xl border bg-white p-5 shadow-sm hover:bg-gray-50"
          >
            <div className="text-lg font-semibold">{x.title}</div>
            <div className="text-sm text-gray-500 mt-1">{x.desc}</div>
            <div className="text-xs text-gray-400 mt-3">{x.href}</div>
          </a>
        ))}
      </div>
    </main>
  );
}