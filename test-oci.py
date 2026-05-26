import os
import sys
from dotenv import load_dotenv

# Load env from agent-backend/.env and root .env
load_dotenv(os.path.join(os.path.dirname(__file__), "agent-backend", ".env"))
load_dotenv()

# Add agent-backend to path to import oci_helper
sys.path.append(os.path.join(os.path.dirname(__file__), "agent-backend"))

try:
    from oci_helper import get_compute_client
    import oci
except ImportError:
    print("ERROR: Could not import oci. Make sure you have run 'pip install oci' in your environment.")
    sys.exit(1)

def main():
    print("=" * 60)
    print("  Lightly OCI Authentication Test")
    print("=" * 60)
    
    compartment_id = os.getenv("OCI_COMPARTMENT_ID")
    if not compartment_id:
        print("ERROR: OCI_COMPARTMENT_ID not set in your environment.")
        sys.exit(1)
        
    print("Connecting to OCI Core services...")
    try:
        compute_client = get_compute_client()
        print("Listing compute instances in compartment...")
        instances = compute_client.list_instances(compartment_id=compartment_id).data
        print(f"Connection SUCCESSFUL! Found {len(instances)} instance(s):")
        for inst in instances:
            print(f" - {inst.display_name} ({inst.lifecycle_state})")
    except Exception as e:
        print("ERROR: Failed to connect to OCI:")
        print(e)
        sys.exit(1)
        
    print("=" * 60)

if __name__ == "__main__":
    main()
