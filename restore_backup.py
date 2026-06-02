#!/usr/bin/env python3
import psycopg
import gzip
import re

BACKUP_FILE = "/Users/digitone/.paperclip/instances/default/data/backups/paperclip-20260528-181816.sql.gz"
CONN_STR = "host=localhost port=54329 dbname=paperclip user=paperclip password=paperclip"
BREAKPOINT = "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900"

def read_statements():
    with gzip.open(BACKUP_FILE, 'rt', encoding='utf-8') as f:
        buffer = ""
        for chunk in iter(lambda: f.read(65536), ''):
            buffer += chunk
            while True:
                idx = buffer.find(BREAKPOINT)
                if idx == -1:
                    break
                stmt = buffer[:idx].strip()
                if stmt:
                    yield stmt
                buffer = buffer[idx + len(BREAKPOINT):]
        if buffer.strip():
            yield buffer.strip()

def main():
    print("Connecting to database...")
    with psycopg.connect(CONN_STR) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            print("Dropping existing tables...")
            cur.execute("""
                DO $$ DECLARE
                    r RECORD;
                BEGIN
                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
                    END LOOP;
                END $$;
            """)
            cur.execute("DROP TABLE IF EXISTS drizzle.__drizzle_migrations CASCADE")
            cur.execute("DROP SEQUENCE IF EXISTS drizzle.__drizzle_migrations_id_seq CASCADE")
            cur.execute("CREATE SCHEMA IF NOT EXISTS drizzle")
            cur.execute("CREATE SCHEMA IF NOT EXISTS public")
            print("Existing tables dropped. Schemas ready.")

    print("Starting restore...")
    with psycopg.connect(CONN_STR) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            done = 0
            errors = 0
            in_copy = False
            copy_buffer = []
            copy_table = None
            copy_cols = None

            for stmt in read_statements():
                # Handle COPY ... FROM stdin;
                if stmt.upper().startswith("COPY ") and "FROM stdin" in stmt.lower():
                    in_copy = True
                    m = re.match(r'COPY\s+"?([^"]+)"?\."?([^"]+)"?\s*\(([^)]+)\)\s+FROM\s+stdin;', stmt, re.IGNORECASE)
                    if m:
                        copy_table = f'"{m.group(1)}"."{m.group(2)}"'
                        copy_cols = [c.strip().strip('"') for c in m.group(3).split(',')]
                    else:
                        m = re.match(r'COPY\s+"?([^"]+)"?\s*\(([^)]+)\)\s+FROM\s+stdin;', stmt, re.IGNORECASE)
                        if m:
                            copy_table = f'"public"."{m.group(1)}"'
                            copy_cols = [c.strip().strip('"') for c in m.group(2).split(',')]
                    copy_buffer = []
                    continue

                if in_copy:
                    if stmt == "\\.":
                        in_copy = False
                        if copy_table and copy_buffer:
                            cols = ', '.join(f'"{c}"' for c in copy_cols)
                            placeholders = ', '.join(['%s'] * len(copy_cols))
                            sql = f'INSERT INTO {copy_table} ({cols}) VALUES ({placeholders})'
                            for row in copy_buffer:
                                try:
                                    cur.execute(sql, row)
                                except Exception as e:
                                    errors += 1
                                    if errors <= 3:
                                        print(f"COPY insert error: {e}")
                        copy_table = None
                        copy_cols = None
                        copy_buffer = []
                        done += 1
                    else:
                        parts = stmt.split('\t')
                        row = []
                        for p in parts:
                            p = p.strip()
                            if p == '\\N':
                                row.append(None)
                            else:
                                row.append(p)
                        copy_buffer.append(row)
                    continue

                if not stmt or stmt.startswith('--'):
                    continue
                try:
                    cur.execute(stmt)
                    done += 1
                    if done % 100 == 0:
                        print(f"Progress: {done} statements executed...")
                except Exception as e:
                    errors += 1
                    if errors <= 5:
                        print(f"Error: {e}")
                        print(f"Statement: {stmt[:200]}")

            print(f"\nRestore complete!")
            print(f"Statements executed: {done}")
            print(f"Errors: {errors}")

if __name__ == "__main__":
    main()
