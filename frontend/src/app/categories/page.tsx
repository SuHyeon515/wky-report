"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function CategoriesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [isFixed, setIsFixed] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      setItems(await apiFetch("/categories"));
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setError("");
    try {
      await apiFetch("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, is_fixed: isFixed }),
      });
      setName("");
      setIsFixed(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">카테고리</h1>

      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-500">이름</label>
          <input className="border rounded px-3 py-2" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <label className="flex gap-2 items-center text-sm">
          <input type="checkbox" checked={isFixed} onChange={e => setIsFixed(e.target.checked)} />
          고정지출
        </label>
        <button onClick={create} className="bg-black text-white rounded px-4 py-2">
          추가
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <div className="border rounded">
        <div className="grid grid-cols-3 bg-gray-50 text-sm font-semibold p-2">
          <div>ID</div><div>이름</div><div>고정</div>
        </div>
        {items.map((c) => (
          <div key={c.id} className="grid grid-cols-3 p-2 border-t text-sm">
            <div>{c.id}</div>
            <div>{c.name}</div>
            <div>{c.is_fixed ? "Y" : "N"}</div>
          </div>
        ))}
      </div>
    </main>
  );
}