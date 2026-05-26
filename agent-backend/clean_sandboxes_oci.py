import os
import sys
import urllib.parse
import pg8000.dbapi
import oci
from oci_helper import get_compute_client

def main():
    print("=" * 60)
    print("  Lightly OCI Cleanup — Terminating Stale Sandboxes")
    print("=" * 60)
    
    # 1. Get active project doAppIds from database
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set in environment.")
        sys.exit(1)
        
    active_slugs = set()
    try:
        # Parse connection string
        result = urllib.parse.urlparse(db_url)
        username = result.username
        password = result.password
        database = result.path[1:]
        hostname = result.hostname
        port = result.port or 5432
        
        # Connect using pg8000 (pure python postgres client)
        conn = pg8000.dbapi.connect(
            user=username,
            password=password,
            host=hostname,
            port=port,
            database=database,
            ssl_context=True
        )
        cursor = conn.cursor()
        cursor.execute('SELECT "doAppId" FROM "project" WHERE "doAppId" IS NOT NULL')
        rows = cursor.fetchall()
        for row in rows:
            active_slugs.add(row[0])
        cursor.close()
        conn.close()
        print(f"Loaded {len(active_slugs)} active project sandbox(es) from database.")
    except Exception as e:
        print(f"ERROR: Failed to connect or query database: {e}")
        sys.exit(1)
        
    # 2. Get OCI Compute instances
    compute_client = get_compute_client()
    compartment_id = os.getenv("OCI_COMPARTMENT_ID")
    if not compartment_id:
        print("ERROR: OCI_COMPARTMENT_ID not set.")
        sys.exit(1)
        
    try:
        # Fetch list of compute instances in compartment
        instances = compute_client.list_instances(compartment_id=compartment_id).data
    except Exception as e:
        print(f"ERROR: Failed to list OCI instances: {e}")
        sys.exit(1)
        
    terminated_count = 0
    for inst in instances:
        name = inst.display_name
        # Target only lightly sandboxes (ignore gateway and others)
        if name.startswith("lightly-") and name != "lightly-gateway":
            if inst.lifecycle_state not in ("TERMINATED", "TERMINATING"):
                # If the VM slug is not in active database projects, it is orphaned!
                if name not in active_slugs:
                    print(f"Terminating orphaned instance: {name} (OCID: {inst.id})")
                    try:
                        compute_client.terminate_instance(inst.id, preserve_boot_volume=False)
                        terminated_count += 1
                    except Exception as e:
                        print(f"  Error terminating {name}: {e}")
                        
    print("-" * 60)
    print(f"Cleanup complete. Terminated {terminated_count} orphaned sandbox instance(s).")
    print("=" * 60)

if __name__ == "__main__":
    from dotenv import load_dotenv
    # Load from parent directory if needed
    parent_dotenv = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(parent_dotenv):
        load_dotenv(parent_dotenv)
    else:
        load_dotenv()
    main()
