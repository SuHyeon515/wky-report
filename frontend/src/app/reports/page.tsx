"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

const formatCurrency = (n: number) =>
  (n ?? 0).toLocaleString("ko-KR", { style: "currency", currency: "KRW" });

function getTextColor(hexColor: string) {
  const c = hexColor.substring(1);
  const rgb = parseInt(c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#222" : "#fff";
}

const PIE_COLORS = [
  "#16a34a", "#22c55e", "#10b981", "#0ea5e9", "#6366f1",
  "#8b5cf6", "#f97316", "#f59e0b", "#ef4444", "#dc2626",
];

type ReportData = {
  summary: { total_in: number; total_out: number; net: number };
  by_category: { category: string; sum: number }[];
  income_details: { tx_date: string; description: string; category: string; amount: number; memo?: string }[];
  expense_details: { tx_date: string; description: string; category: string; amount: number; is_fixed?: boolean; memo?: string }[];
};

export default function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1);
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1);
  const [branch, setBranch] = useState("");

  const [branches, setBranches] = useState<string[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadBranches = async () => {
    try {
      const arr = await apiFetch("/meta/branches");
      setBranches(Array.isArray(arr) ? arr : []);
    } catch {
      setBranches([]);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          branch,
          start_month: startMonth,
          end_month: endMonth,
        }),
      });

      res.by_category ??= [];
      res.income_details ??= [];
      res.expense_details ??= [];
      res.summary ??= { total_in: 0, total_out: 0, net: 0 };

      setData(res);
    } catch (e: any) {
      setError(e.message || "불러오기 실패");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== 가공 ======
  const incomeRows = useMemo(() => data?.income_details || [], [data]);
  const expenseRows = useMemo(() => data?.expense_details || [], [data]);

  const fixedRows = useMemo(
    () => expenseRows.filter((r) => !!r.is_fixed),
    [expenseRows]
  );
  const variableRows = useMemo(
    () => expenseRows.filter((r) => !r.is_fixed),
    [expenseRows]
  );

  const toChartData = (rows: { category: string; amount: number }[]) => {
    const grouped: Record<string, number> = {};
    for (const r of rows) {
      const cat = (r.category || "").trim() ? r.category : "미분류";
      grouped[cat] = (grouped[cat] || 0) + Math.abs(r.amount || 0);
    }
    return Object.entries(grouped)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  };

  const incomeChart = useMemo(
    () =>
      toChartData(
        incomeRows.map((r) => ({ category: r.category, amount: r.amount }))
      ),
    [incomeRows]
  );
  const fixedChart = useMemo(
    () =>
      toChartData(
        fixedRows.map((r) => ({ category: r.category, amount: r.amount }))
      ),
    [fixedRows]
  );
  const variableChart = useMemo(
    () =>
      toChartData(
        variableRows.map((r) => ({ category: r.category, amount: r.amount }))
      ),
    [variableRows]
  );

  const stats = useMemo(() => {
    const s = data?.summary || { total_in: 0, total_out: 0, net: 0 };
    return [
      { label: "총 수입", value: Math.abs(s.total_in || 0), tone: "text-green-700", bg: "bg-green-50" },
      { label: "총 지출", value: Math.abs(s.total_out || 0), tone: "text-red-700", bg: "bg-red-50" },
      { label: "순이익", value: s.net || 0, tone: "text-blue-700", bg: "bg-blue-50" },
    ];
  }, [data]);

  const blocks = useMemo(() => ([
    { title: "📈 수입", tone: "text-green-700", tableTone: "text-green-700", rows: incomeRows, chart: incomeChart },
    { title: "🏠 고정지출", tone: "text-indigo-700", tableTone: "text-indigo-700", rows: fixedRows, chart: fixedChart },
    { title: "🚗 변동지출", tone: "text-orange-700", tableTone: "text-orange-700", rows: variableRows, chart: variableChart },
  ]), [incomeRows, fixedRows, variableRows, incomeChart, fixedChart, variableChart]);

  return (
    <main className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-bold">📘 리포트 (수입 + 지출)</h1>
            <p className="text-sm text-gray-500 mt-1">
              {year}년 {startMonth}월 ~ {endMonth}월 {branch ? `· ${branch}` : "· 전체지점"}
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500">지점</label>
            <select className="border rounded-lg px-3 py-2" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">전체</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500">연도</label>
            <input
              type="number"
              className="border rounded-lg px-3 py-2 w-28"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500">시작 월</label>
            <input
              type="number"
              min={1}
              max={12}
              className="border rounded-lg px-3 py-2 w-24"
              value={startMonth}
              onChange={(e) => setStartMonth(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500">종료 월</label>
            <input
              type="number"
              min={1}
              max={12}
              className="border rounded-lg px-3 py-2 w-24"
              value={endMonth}
              onChange={(e) => setEndMonth(Number(e.target.value))}
            />
          </div>

          <button
            onClick={loadReport}
            className="bg-black text-white rounded-lg px-4 py-2 hover:opacity-90"
          >
            조회
          </button>
        </div>

        {!!data && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stats.map((s, i) => (
              <div key={i} className={`rounded-xl border p-4 ${s.bg}`}>
                <div className="text-xs text-gray-500">{s.label}</div>
                <div className={`text-lg font-extrabold ${s.tone}`}>
                  {formatCurrency(s.value)}
                </div>
              </div>
            ))}
          </div>
        )}

        {loading && <p className="mt-4 text-sm text-gray-500">⏳ 불러오는 중...</p>}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>

      {!!data && (
        <div className="space-y-4">
          {blocks.map((blk, idx) => (
            <section key={idx} className="rounded-2xl border bg-white p-6 shadow-sm space-y-5">
              <h2 className={`text-xl font-bold ${blk.tone}`}>{blk.title}</h2>

              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 min-w-[320px]">
                  <div className="rounded-xl border p-3">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={blk.chart.map((d) => ({ name: d.category, value: d.amount }))}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={100}
                          labelLine={false}
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, name, index }: any) => {
                            const RADIAN = Math.PI / 180;
                            const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
                            const x = cx + radius * Math.cos(-midAngle * RADIAN);
                            const y = cy + radius * Math.sin(-midAngle * RADIAN);
                            const color = getTextColor(PIE_COLORS[index % PIE_COLORS.length]);
                            return (
                              <text
                                x={x}
                                y={y}
                                fill={color}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={12}
                                fontWeight={700}
                              >
                                {`${name} ${(percent * 100).toFixed(0)}%`}
                              </text>
                            );
                          }}
                        >
                          {blk.chart.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 border">분류</th>
                        <th className="p-2 border text-right">비율</th>
                        <th className="p-2 border text-right">금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const total = blk.chart.reduce((s, v) => s + v.amount, 0);
                        return (
                          <>
                            {blk.chart.map((r, i) => {
                              const percent = total ? (r.amount / total) * 100 : 0;
                              return (
                                <tr key={i}>
                                  <td className="p-2 border">{r.category}</td>
                                  <td className="p-2 border text-right text-gray-500">{percent.toFixed(2)}%</td>
                                  <td className={`p-2 border text-right font-semibold ${blk.tableTone}`}>
                                    {formatCurrency(r.amount)}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="bg-gray-100 font-bold">
                              <td className="p-2 border">합계</td>
                              <td className="p-2 border text-right">100.00%</td>
                              <td className={`p-2 border text-right ${blk.tableTone}`}>
                                {formatCurrency(total)}
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 border">날짜</th>
                      <th className="p-2 border">내용</th>
                      <th className="p-2 border">카테고리</th>
                      <th className="p-2 border text-right">금액</th>
                      <th className="p-2 border">메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blk.rows.length ? (
                      blk.rows.map((r: any, i: number) => (
                        <tr key={i}>
                          <td className="p-2 border">{r.tx_date}</td>
                          <td className="p-2 border">{r.description}</td>
                          <td className="p-2 border">{r.category || "미분류"}</td>
                          <td className={`p-2 border text-right font-semibold ${blk.tableTone}`}>
                            {formatCurrency(Math.abs(r.amount))}
                          </td>
                          <td className="p-2 border text-gray-600">{r.memo || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-gray-400">
                          내역 없음
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}