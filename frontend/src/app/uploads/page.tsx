"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function UploadsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [branch, setBranch] = useState("본점");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const onUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("branch", branch);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/uploads/file`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "업로드 실패");
      setResult(json);
    } catch (e: any) {
      setError(e.message || "에러");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">업로드</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500">지점</label>
          <input className="border rounded px-3 py-2" value={branch} onChange={e => setBranch(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs text-gray-500">엑셀 파일</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <button
          onClick={onUpload}
          disabled={!file || loading}
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {loading ? "업로드 중..." : "업로드"}
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {result && (
        <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <p className="text-sm text-gray-500">
        업로드 성공 후 <b>/reports</b>에서 바로 리포트가 뜹니다.
      </p>
    </main>
  );
}