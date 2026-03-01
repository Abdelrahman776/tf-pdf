from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path

from .config import settings
from .schemas import EventEntry, PageData
from .store import DATA_DIR


DB_PATH = DATA_DIR / "metadata.db"


def _conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _using_postgres() -> bool:
    return bool(settings.supabase_db_url)


def _pg_conn():
    import psycopg

    return psycopg.connect(settings.supabase_db_url)


def init_db() -> None:
    if _using_postgres():
        _init_db_postgres()
        return

    conn = _conn()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            content_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            path TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            file_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL,
            message TEXT NOT NULL,
            result_file TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS job_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            at TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            page_json TEXT NOT NULL,
            UNIQUE(job_id, page_number)
        );
        """
    )
    conn.commit()
    conn.close()


def _init_db_postgres() -> None:
    conn = _pg_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            content_type TEXT NOT NULL,
            size_bytes BIGINT NOT NULL,
            path TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            file_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL,
            message TEXT NOT NULL,
            result_file TEXT,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS job_events (
            id BIGSERIAL PRIMARY KEY,
            job_id TEXT NOT NULL,
            at TIMESTAMPTZ NOT NULL,
            status TEXT NOT NULL,
            message TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS pages (
            id BIGSERIAL PRIMARY KEY,
            job_id TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            page_json JSONB NOT NULL,
            UNIQUE(job_id, page_number)
        )
        """
    )
    conn.commit()
    conn.close()


def save_file(file_id: str, filename: str, content_type: str, size_bytes: int, path: str) -> None:
    if _using_postgres():
        conn = _pg_conn()
        conn.execute(
            """
            INSERT INTO files(id, filename, content_type, size_bytes, path, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET filename = EXCLUDED.filename,
                content_type = EXCLUDED.content_type,
                size_bytes = EXCLUDED.size_bytes,
                path = EXCLUDED.path,
                created_at = EXCLUDED.created_at
            """,
            (file_id, filename, content_type, size_bytes, path, datetime.utcnow()),
        )
        conn.commit()
        conn.close()
        return

    conn = _conn()
    conn.execute(
        """
        INSERT OR REPLACE INTO files(id, filename, content_type, size_bytes, path, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (file_id, filename, content_type, size_bytes, path, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()


def save_job_snapshot(job_id: str, file_id: str, mode: str, status: str, progress: int, message: str, result_file: str | None, created_at: str, updated_at: str) -> None:
    if _using_postgres():
        conn = _pg_conn()
        conn.execute(
            """
            INSERT INTO jobs(id, file_id, mode, status, progress, message, result_file, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET file_id = EXCLUDED.file_id,
                mode = EXCLUDED.mode,
                status = EXCLUDED.status,
                progress = EXCLUDED.progress,
                message = EXCLUDED.message,
                result_file = EXCLUDED.result_file,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at
            """,
            (job_id, file_id, mode, status, progress, message, result_file, created_at, updated_at),
        )
        conn.commit()
        conn.close()
        return

    conn = _conn()
    conn.execute(
        """
        INSERT OR REPLACE INTO jobs(id, file_id, mode, status, progress, message, result_file, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (job_id, file_id, mode, status, progress, message, result_file, created_at, updated_at),
    )
    conn.commit()
    conn.close()


def save_event(job_id: str, event: EventEntry) -> None:
    if _using_postgres():
        conn = _pg_conn()
        conn.execute(
            "INSERT INTO job_events(job_id, at, status, message) VALUES (%s, %s, %s, %s)",
            (job_id, event.at, event.status.value, event.message),
        )
        conn.commit()
        conn.close()
        return

    conn = _conn()
    conn.execute(
        "INSERT INTO job_events(job_id, at, status, message) VALUES (?, ?, ?, ?)",
        (job_id, event.at.isoformat(), event.status.value, event.message),
    )
    conn.commit()
    conn.close()


def save_pages(job_id: str, pages: list[PageData]) -> None:
    if _using_postgres():
        conn = _pg_conn()
        for page in pages:
            conn.execute(
                """
                INSERT INTO pages(job_id, page_number, page_json)
                VALUES (%s, %s, %s::jsonb)
                ON CONFLICT (job_id, page_number) DO UPDATE
                SET page_json = EXCLUDED.page_json
                """,
                (job_id, page.page_number, json.dumps(page.model_dump())),
            )
        conn.commit()
        conn.close()
        return

    conn = _conn()
    for page in pages:
        conn.execute(
            """
            INSERT OR REPLACE INTO pages(job_id, page_number, page_json)
            VALUES (?, ?, ?)
            """,
            (job_id, page.page_number, json.dumps(page.model_dump())),
        )
    conn.commit()
    conn.close()


def list_jobs(limit: int = 50) -> list[dict]:
    if _using_postgres():
        conn = _pg_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, file_id, mode, status, progress, message, result_file, created_at, updated_at
            FROM jobs
            ORDER BY updated_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
        conn.close()
        return [
            {
                "id": row[0],
                "file_id": row[1],
                "mode": row[2],
                "status": row[3],
                "progress": row[4],
                "message": row[5],
                "result_file": row[6],
                "created_at": row[7].isoformat() if row[7] else None,
                "updated_at": row[8].isoformat() if row[8] else None,
            }
            for row in rows
        ]

    conn = _conn()
    rows = conn.execute(
        """
        SELECT id, file_id, mode, status, progress, message, result_file, created_at, updated_at
        FROM jobs
        ORDER BY updated_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_job_snapshot(job_id: str) -> dict | None:
    if _using_postgres():
        conn = _pg_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, file_id, mode, status, progress, message, result_file, created_at, updated_at
            FROM jobs
            WHERE id = %s
            """,
            (job_id,),
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            return None
        return {
            "id": row[0],
            "file_id": row[1],
            "mode": row[2],
            "status": row[3],
            "progress": row[4],
            "message": row[5],
            "result_file": row[6],
            "created_at": row[7].isoformat() if row[7] else None,
            "updated_at": row[8].isoformat() if row[8] else None,
        }

    conn = _conn()
    row = conn.execute(
        """
        SELECT id, file_id, mode, status, progress, message, result_file, created_at, updated_at
        FROM jobs
        WHERE id = ?
        """,
        (job_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def list_job_events(job_id: str, limit: int = 200) -> list[dict]:
    if _using_postgres():
        conn = _pg_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT at, status, message
            FROM job_events
            WHERE job_id = %s
            ORDER BY at ASC
            LIMIT %s
            """,
            (job_id, limit),
        )
        rows = cur.fetchall()
        conn.close()
        return [
            {
                "at": row[0].isoformat() if row[0] else None,
                "status": row[1],
                "message": row[2],
            }
            for row in rows
        ]

    conn = _conn()
    rows = conn.execute(
        """
        SELECT at, status, message
        FROM job_events
        WHERE job_id = ?
        ORDER BY at ASC
        LIMIT ?
        """,
        (job_id, limit),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_page_snapshot(job_id: str, page_number: int) -> dict | None:
    if _using_postgres():
        conn = _pg_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT page_json
            FROM pages
            WHERE job_id = %s AND page_number = %s
            """,
            (job_id, page_number),
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            return None
        value = row[0]
        if isinstance(value, str):
            return json.loads(value)
        return value

    conn = _conn()
    row = conn.execute(
        """
        SELECT page_json
        FROM pages
        WHERE job_id = ? AND page_number = ?
        """,
        (job_id, page_number),
    ).fetchone()
    conn.close()
    if not row:
        return None
    return json.loads(row["page_json"])


def list_page_snapshots(job_id: str) -> list[dict]:
    if _using_postgres():
        conn = _pg_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT page_json
            FROM pages
            WHERE job_id = %s
            ORDER BY page_number ASC
            """,
            (job_id,),
        )
        rows = cur.fetchall()
        conn.close()
        pages: list[dict] = []
        for row in rows:
            value = row[0]
            if isinstance(value, str):
                pages.append(json.loads(value))
            else:
                pages.append(value)
        return pages

    conn = _conn()
    rows = conn.execute(
        """
        SELECT page_json
        FROM pages
        WHERE job_id = ?
        ORDER BY page_number ASC
        """,
        (job_id,),
    ).fetchall()
    conn.close()
    return [json.loads(row["page_json"]) for row in rows]
