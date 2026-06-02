#!/usr/bin/env python3
import psycopg
import gzip

BACKUP_FILE = "/Users/digitone/.paperclip/instances/default/data/backups/paperclip-20260528-181816.sql.gz"
CONN_STR = "host=localhost port=54329 dbname=paperclip user=paperclip password=paperclip"
BREAKPOINT = "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900"

def main():
    print("Connecting...")
    conn = psycopg.connect(CONN_STR)
    conn.autocommit = True
    cur = conn.cursor()
    
    print("Dropping existing data...")
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
    
    print("Reading backup...")
    with gzip.open(BACKUP_FILE, 'rt', encoding='utf-8') as f:
        content = f.read()
    
    # Split by breakpoints
    parts = content.split(BREAKPOINT)
    print(f"Total parts: {len(parts)}")
    
    done = 0
    errors = 0
    copy_mode = False
    copy_sql = None
    copy_data = []
    
    for part in parts:
        stmt = part.strip()
        if not stmt:
            continue
            
        # Check if this is a COPY statement
        if stmt.upper().startswith('COPY ') and 'FROM stdin' in stmt.lower():
            copy_mode = True
            copy_sql = stmt
            copy_data = []
            continue
            
        if copy_mode:
            if stmt == '\\.':
                # End of COPY data - execute COPY
                copy_mode = False
                full_sql = copy_sql + '\n' + '\n'.join(copy_data) + '\n\\.'
                try:
                    cur.execute(full_sql)
                    done += 1
                except Exception as e:
                    errors += 1
                    if errors <= 5:
                        print(f"COPY error: {e}")
                copy_sql = None
                copy_data = []
            else:
                copy_data.append(stmt)
            continue
        
        # Regular SQL
        if stmt.startswith('--'):
            continue
        try:
            cur.execute(stmt)
            done += 1
            if done % 100 == 0:
                print(f"Progress: {done}...")
        except Exception as e:
            errors += 1
            if errors <= 10:
                print(f"Error: {e}")
                print(f"Stmt: {stmt[:150]}")
    
    print(f"\nDone! Executed: {done}, Errors: {errors}")
    
    # Verify
    cur.execute("SELECT COUNT(*) FROM public.companies")
    print(f"Companies: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM public.agents")
    print(f"Agents: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM public.issues")
    print(f"Issues: {cur.fetchone()[0]}")
    
    conn.close()

if __name__ == "__main__":
    main()
