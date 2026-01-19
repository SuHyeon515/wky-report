"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function UnclassifiedPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [isFixed, setIsFixed] = useState(false);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected]
  );

  const load = async () => {
    setError("");
    try {
      const [u, c] = await Promise.all([
        apiFetch("/transactions/unclassified?limit=500"),
        apiFetch("/categories"),
      ]);
      setRows(u);
      setCats(c);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const apply = async () => {
    if (!categoryId || selectedIds.length === 0) return;
    setError("");
    try {
      await apiFetch("/categorize/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_ids: selectedIds,
          category_id: categoryId,
          is_fixed: isFixed,
          memo,
        }),
      });
      setSelected({});
      setMemo("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">미분류 거래</h1>
      {error && <p className="text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-gray-500">카테고리</label>
          <select className="border rounded px-3 py-2" value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}>
            <option value="">선택</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <label className="flex gap-2 items-center text-sm">
          <input type="checkbox" checked={isFixed} onChange={e => setIsFixed(e.target.checked)} />
          고정지출
        </label>

        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs text-gray-500">메모</label>
          <input className="border rounded px-3 py-2 w-full" value={memo} onChange={e => setMemo(e.target.value)} />
        </div>

        <button
          onClick={apply}
          disabled={!categoryId || selectedIds.length === 0}
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
        >
          선택 {selectedIds.length}건 적용
        </button>

        <button onClick={load} className="border rounded px-4 py-2">
          새로고침
        </button>
      </div>

      <div className="border rounded overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border">선택</th>
              <th className="p-2 border">날짜</th>
              <th className="p-2 border">내용</th>
              <th className="p-2 border text-right">금액</th>
              <th className="p-2 border">지점</th>
              <th className="p-2 border text-right">잔액</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id}>
                <td className="p-2 border text-center">
                  <input
                    type="checkbox"
                    checked={!!selected[r.id]}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                  />
                </td>
                <td className="p-2 border">{r.tx_date}</td>
                <td className="p-2 border">{r.description}</td>
                <td className="p-2 border text-right">{Number(Math.abs(r.amount)).toLocaleString()}</td>
                <td className="p-2 border">{r.branch || "-"}</td>
                <td className="p-2 border text-right">{Number(r.balance || 0).toLocaleString()}</td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="p-4 text-center text-gray-400">미분류 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}