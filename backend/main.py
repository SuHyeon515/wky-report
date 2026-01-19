import os
import hashlib
from datetime import date
from typing import Any, Dict, List, Optional

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

import pandas as pd

from utils import load_spreadsheet, unify_columns, normalize_vendor, apply_rules

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "30"))

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=CORS_ORIGIN)

def db():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL missing in .env")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)

@app.get("/health")
def health():
    return jsonify({"ok": True})

@app.get("/db/ping")
def db_ping():
    with db() as conn:
        r = conn.execute("select now() as now, version() as version").fetchone()
    return jsonify({"ok": True, "now": str(r["now"]), "version": r["version"]})

# ----------------------------
# fingerprint (중복방지)
# ----------------------------
def make_fingerprint(tx_date: date, amount: float, description: str, branch: Optional[str], balance: Optional[float]) -> str:
    d = (description or "").strip().lower()
    b = (branch or "").strip().lower()
    bal = "" if balance is None else f"{float(balance):.0f}"
    raw = f"{tx_date.isoformat()}|{float(amount):.2f}|{d}|{b}|{bal}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

# ----------------------------
# rules 로드 (DB -> apply_rules 형태)
# ----------------------------
def load_rules(conn) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        select r.keyword, r.target, r.priority, r.is_fixed,
               c.name as category
        from public.category_rules r
        join public.categories c on c.id = r.category_id
        where r.is_enabled = true
        order by r.priority asc, r.id asc
        """
    ).fetchall()

    return [
        {"keyword": r["keyword"], "target": r["target"], "category": r["category"], "is_fixed": r["is_fixed"]}
        for r in rows
    ]

def category_name_to_id(conn, name: str) -> Optional[int]:
    r = conn.execute("select id from public.categories where name = %s", (name,)).fetchone()
    return int(r["id"]) if r else None

# =========================================================
# Step 3에서 만들었던 업로드 batch CRUD
# =========================================================
@app.post("/uploads")
def create_upload_batch():
    j = request.get_json(force=True)
    filename = (j.get("filename") or "").strip()
    branch = (j.get("branch") or "").strip() or None
    if not filename:
        return jsonify({"error": "filename required"}), 400

    with db() as conn:
        row = conn.execute(
            """
            insert into public.upload_batches(filename, branch, row_count)
            values (%s, %s, 0)
            returning id, filename, branch, created_at
            """,
            (filename, branch)
        ).fetchone()
    return jsonify(row)

@app.get("/uploads")
def list_uploads():
    with db() as conn:
        rows = conn.execute(
            """
            select id, filename, bank_hint, branch, row_count, created_at
            from public.upload_batches
            order by id desc
            """
        ).fetchall()
    return jsonify(rows)

@app.delete("/uploads/<int:batch_id>")
def delete_upload(batch_id):
    with db() as conn:
        r = conn.execute(
            "delete from public.upload_batches where id = %s returning id",
            (batch_id,)
        ).fetchone()

    if not r:
        return jsonify({"error": "not found"}), 404
    return jsonify({"deleted": batch_id})

# =========================================================
# Step 4: 실제 파일 업로드 -> bank_transactions 저장
# =========================================================
@app.post("/uploads/file")
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "file required"}), 400

    f = request.files["file"]
    filename = f.filename or "upload.xlsx"

    bank_hint = request.form.get("bank_hint")  # 선택
    branch_hint = request.form.get("branch")   # 선택(파일의 branch를 덮어쓰고 싶으면)

    content = f.read()
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        return jsonify({"error": f"file too large (max {MAX_UPLOAD_MB}MB)"}), 400

    # 1) 엑셀 로드 -> 표준화
    try:
        raw_df = load_spreadsheet(content, filename)
        df = unify_columns(raw_df)  # 최소: date/description/amount (+balance/branch/tx_type)
    except Exception as e:
        return jsonify({"error": f"parse failed: {e}"}), 400

    # 2) 컬럼 보정
    if "balance" not in df.columns:
        df["balance"] = None
    if "branch" not in df.columns:
        df["branch"] = None
    if "tx_type" not in df.columns:
        df["tx_type"] = df["amount"].apply(lambda x: "IN" if float(x) > 0 else "OUT")

    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df = df.dropna(subset=["date"])
    df["description"] = df["description"].astype(str).fillna("").str.strip()

    # branch 힌트로 덮어쓰기
    if branch_hint:
        df["branch"] = branch_hint

    inserted = 0
    skipped = 0

    with db() as conn:
        rules = load_rules(conn)

        # 3) batch 생성
        batch = conn.execute(
            """
            insert into public.upload_batches(filename, bank_hint, branch, row_count)
            values (%s, %s, %s, %s)
            returning id
            """,
            (filename, bank_hint, branch_hint, int(len(df)))
        ).fetchone()
        batch_id = int(batch["id"])

        # 4) row 단위 insert (ON CONFLICT로 중복 skip)
        for _, r in df.iterrows():
            tx_date = r["date"]
            desc = (r.get("description") or "").strip()
            amount = float(r.get("amount") or 0)

            bal_val = r.get("balance")
            balance = None if (bal_val is None or (isinstance(bal_val, float) and pd.isna(bal_val))) else float(bal_val)

            br_val = r.get("branch")
            branch = None if br_val is None or str(br_val).strip() == "" else str(br_val).strip()

            tx_type = (r.get("tx_type") or ("IN" if amount > 0 else "OUT")).strip().upper()
            vendor_norm = normalize_vendor(desc)

            fp = make_fingerprint(tx_date, amount, desc, branch, balance)

            tr = conn.execute(
                """
                insert into public.bank_transactions
                (batch_id, tx_date, description, vendor_normalized, memo, amount, balance, tx_type, branch, fingerprint)
                values
                (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (fingerprint) do nothing
                returning id
                """,
                (batch_id, tx_date, desc, vendor_norm, None, amount, balance, tx_type, branch, fp)
            ).fetchone()

            if not tr:
                skipped += 1
                continue

            tx_id = int(tr["id"])
            inserted += 1

            # 5) 자동 룰 적용 -> transaction_tags 저장
            rr = apply_rules(
                {"description": desc, "memo": "", "vendor_normalized": vendor_norm},
                rules
            )
            cat_name = rr.get("category") or "미분류"
            cat_id = category_name_to_id(conn, cat_name)

            conn.execute(
                """
                insert into public.transaction_tags(transaction_id, category_id, is_fixed, memo)
                values (%s, %s, %s, %s)
                on conflict (transaction_id) do update
                set category_id = excluded.category_id,
                    is_fixed = excluded.is_fixed,
                    memo = excluded.memo,
                    updated_at = now()
                """,
                (tx_id, cat_id, bool(rr.get("is_fixed", False)), None)
            )

    return jsonify({
        "ok": True,
        "batch_id": batch_id,
        "row_count": int(len(df)),
        "inserted": inserted,
        "skipped_duplicates": skipped
    })

# =========================================================
# meta/branches (리포트 필터용)
# =========================================================
@app.get("/meta/branches")
def meta_branches():
    with db() as conn:
        rows = conn.execute(
            """
            select distinct branch
            from public.bank_transactions
            where branch is not null and trim(branch) <> ''
            order by branch
            """
        ).fetchall()
    return jsonify([r["branch"] for r in rows])

# =========================================================
# Categories (분류 UI용)
# =========================================================
@app.get("/categories")
def list_categories():
    with db() as conn:
        rows = conn.execute(
            "select id, name, is_fixed from public.categories order by name"
        ).fetchall()
    return jsonify(rows)

# =========================================================
# Transactions: 미분류 리스트 (분류 UI용)
# =========================================================
@app.get("/transactions/unclassified")
def unclassified_transactions():
    branch = (request.args.get("branch") or "").strip()
    limit = int(request.args.get("limit", "500"))

    branch_sql = ""
    params = []
    if branch:
        branch_sql = " and t.branch = %s "
        params.append(branch)

    params.append(limit)

    with db() as conn:
        rows = conn.execute(
            f"""
            select
              t.id,
              t.tx_date::text as tx_date,
              t.description,
              t.amount,
              t.branch,
              t.balance
            from public.bank_transactions t
            left join public.transaction_tags tt on tt.transaction_id = t.id
            left join public.categories c on c.id = tt.category_id
            where (c.name is null or c.name = '미분류')
            {branch_sql}
            order by t.tx_date desc, t.id desc
            limit %s
            """,
            params
        ).fetchall()

    return jsonify(rows)

# =========================================================
# Categorize: 수동분류 (다건)
# body:
# { "transaction_ids":[1,2,3], "category_id": 5, "is_fixed": false, "memo": "..." }
# =========================================================
@app.post("/categorize/manual")
def categorize_manual():
    j = request.get_json(force=True)
    ids = j.get("transaction_ids") or []
    category_id = j.get("category_id")
    is_fixed = bool(j.get("is_fixed", False))
    memo = j.get("memo")

    if not isinstance(ids, list) or not ids:
        return jsonify({"error": "transaction_ids required"}), 400
    if not category_id:
        return jsonify({"error": "category_id required"}), 400

    with db() as conn:
        for tid in ids:
            conn.execute(
                """
                insert into public.transaction_tags(transaction_id, category_id, is_fixed, memo)
                values (%s, %s, %s, %s)
                on conflict (transaction_id) do update
                set category_id = excluded.category_id,
                    is_fixed = excluded.is_fixed,
                    memo = excluded.memo,
                    updated_at = now()
                """,
                (int(tid), int(category_id), is_fixed, memo)
            )

    return jsonify({"updated": len(ids)})

# =========================================================
# Reports: 네 Next 리포트 화면이 바로 쓰는 형태
# body: { year, branch, start_month, end_month }
# =========================================================
@app.post("/reports")
def reports():
    j = request.get_json(force=True)
    year = int(j.get("year"))
    branch = (j.get("branch") or "").strip()
    start_month = int(j.get("start_month"))
    end_month = int(j.get("end_month"))

    if start_month < 1 or end_month > 12 or start_month > end_month:
        return jsonify({"error": "invalid month range"}), 400

    start_date = date(year, start_month, 1)
    end_date = date(year + 1, 1, 1) if end_month == 12 else date(year, end_month + 1, 1)

    branch_sql = ""
    params = [start_date, end_date]
    if branch:
        branch_sql = " and t.branch = %s "
        params.append(branch)

    with db() as conn:
        # 1) summary
        s = conn.execute(
            f"""
            select
              coalesce(sum(case when t.amount > 0 then t.amount else 0 end),0) as total_in,
              coalesce(sum(case when t.amount < 0 then abs(t.amount) else 0 end),0) as total_out,
              coalesce(sum(t.amount),0) as net
            from public.bank_transactions t
            where t.tx_date >= %s and t.tx_date < %s
            {branch_sql}
            """,
            params
        ).fetchone()

        # 2) category별 합계(수입/지출 같이 내려줌)
        by_cat = conn.execute(
            f"""
            select
              coalesce(c.name, '미분류') as category,
              sum(t.amount) as sum
            from public.bank_transactions t
            left join public.transaction_tags tt on tt.transaction_id = t.id
            left join public.categories c on c.id = tt.category_id
            where t.tx_date >= %s and t.tx_date < %s
            {branch_sql}
            group by 1
            order by abs(sum(t.amount)) desc
            """,
            params
        ).fetchall()

        # 3) income details
        income_rows = conn.execute(
            f"""
            select
              t.tx_date::text as tx_date,
              t.description,
              coalesce(c.name, '미분류') as category,
              t.amount,
              tt.memo
            from public.bank_transactions t
            left join public.transaction_tags tt on tt.transaction_id = t.id
            left join public.categories c on c.id = tt.category_id
            where t.tx_date >= %s and t.tx_date < %s
              and t.amount > 0
            {branch_sql}
            order by t.tx_date asc, t.id asc
            limit 5000
            """,
            params
        ).fetchall()

        # 4) expense details (+ is_fixed)
        expense_rows = conn.execute(
            f"""
            select
              t.tx_date::text as tx_date,
              t.description,
              coalesce(c.name, '미분류') as category,
              t.amount,
              coalesce(tt.is_fixed, c.is_fixed, false) as is_fixed,
              tt.memo
            from public.bank_transactions t
            left join public.transaction_tags tt on tt.transaction_id = t.id
            left join public.categories c on c.id = tt.category_id
            where t.tx_date >= %s and t.tx_date < %s
              and t.amount < 0
            {branch_sql}
            order by t.tx_date asc, t.id asc
            limit 5000
            """,
            params
        ).fetchall()

    return jsonify({
        "summary": {
            "total_in": float(s["total_in"]),
            "total_out": float(s["total_out"]),
            "net": float(s["net"]),
        },
        # 네 프론트가 result.by_category를 배열로 기대함
        "by_category": [{"category": r["category"], "sum": float(r["sum"])} for r in by_cat],
        "income_details": [
            {
                "tx_date": r["tx_date"],
                "description": r["description"],
                "category": r["category"],
                "amount": float(r["amount"]),
                "memo": r["memo"],
            }
            for r in income_rows
        ],
        "expense_details": [
            {
                "tx_date": r["tx_date"],
                "description": r["description"],
                "category": r["category"],
                "amount": float(r["amount"]),
                "is_fixed": bool(r["is_fixed"]),
                "memo": r["memo"],
            }
            for r in expense_rows
        ],
    })

@app.post("/categories")
def create_category():
    j = request.get_json(force=True)
    name = (j.get("name") or "").strip()
    is_fixed = bool(j.get("is_fixed", False))
    if not name:
        return jsonify({"error": "name required"}), 400

    with db() as conn:
        row = conn.execute(
            """
            insert into public.categories(name, is_fixed)
            values (%s, %s)
            on conflict (name) do update set is_fixed = excluded.is_fixed
            returning id, name, is_fixed
            """,
            (name, is_fixed)
        ).fetchone()
    return jsonify(row)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)