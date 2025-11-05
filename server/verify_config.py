#!/usr/bin/env python3
"""
Quick verification script to test /config endpoint
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_config_endpoint():
    """Test the /config endpoint"""
    print("Testing /config endpoint...")
    try:
        resp = requests.post(
            f"{BASE_URL}/config",
            json={"model_id": "gpt2"},
            timeout=30
        )
        print(f"Status Code: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Success! Config keys: {list(data.keys())}")
            print(f"Sample config: {json.dumps(data, indent=2)[:500]}")
            return True
        else:
            print(f"❌ Failed with status {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server. Is it running?")
        print(f"   Try: cd server && python3 main.py")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    test_config_endpoint()

