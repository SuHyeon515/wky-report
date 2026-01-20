// export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5001";

// export async function apiFetch(path: string, init?: RequestInit) {
//   const res = await fetch(`${API_BASE}${path}`, {
//     ...init,
//     headers: {
//       ...(init?.headers || {}),
//     },
//   });

//   const text = await res.text();
//   let data: any = null;
//   try { data = text ? JSON.parse(text) : null; } catch { data = text; }

//   if (!res.ok) {
//     const msg = typeof data === "string" ? data : (data?.error || JSON.stringify(data));
//     throw new Error(msg || `HTTP ${res.status}`);
//   }
//   return data;
// }

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001";

export async function apiFetch(path: string, init?: RequestInit) {
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    ...init,
    // 쿠키 안 쓰면 필요없지만, 나중 대비로 유지 가능
    credentials: "include",
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}