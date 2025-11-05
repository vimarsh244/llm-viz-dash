#!/usr/bin/env python3
"""
Test script for the FastAPI server endpoints
"""
import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_health():
    """Test the health endpoint"""
    print("Testing /health endpoint...")
    try:
        resp = requests.get(f"{BASE_URL}/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] == True
        print("✅ Health endpoint working")
        return True
    except Exception as e:
        print(f"❌ Health endpoint failed: {e}")
        return False

def test_cors():
    """Test CORS headers"""
    print("\nTesting CORS preflight...")
    try:
        resp = requests.options(
            f"{BASE_URL}/generate/stream",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type"
            }
        )
        assert resp.status_code == 200
        assert "access-control-allow-origin" in resp.headers
        print("✅ CORS configured correctly")
        return True
    except Exception as e:
        print(f"❌ CORS test failed: {e}")
        return False

def test_tokenize():
    """Test the tokenization endpoint"""
    print("\nTesting /tokenize endpoint...")
    try:
        resp = requests.post(
            f"{BASE_URL}/tokenize",
            json={
                "model_id": "gpt2",
                "prompt": "Hello world, this is a test"
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token_ids" in data
        assert "tokens" in data
        assert "count" in data
        assert data["count"] == len(data["token_ids"])
        assert data["count"] == len(data["tokens"])
        print(f"✅ Tokenization working: {data['count']} tokens")
        print(f"   Tokens: {data['tokens']}")
        return True
    except Exception as e:
        print(f"❌ Tokenization test failed: {e}")
        return False

def test_generate():
    """Test the non-streaming generation endpoint"""
    print("\nTesting /generate endpoint...")
    try:
        resp = requests.post(
            f"{BASE_URL}/generate",
            json={
                "model_id": "gpt2",
                "prompt": "Once upon a time",
                "max_new_tokens": 20,
                "temperature": 0.7
            },
            timeout=30
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "text" in data
        assert len(data["text"]) > 0
        print(f"✅ Generation working")
        print(f"   Generated: {data['text'][:100]}...")
        return True
    except Exception as e:
        print(f"❌ Generation test failed: {e}")
        return False

def test_streaming():
    """Test the streaming generation endpoint"""
    print("\nTesting /generate/stream endpoint...")
    try:
        resp = requests.post(
            f"{BASE_URL}/generate/stream",
            json={
                "model_id": "gpt2",
                "prompt": "Hello",
                "max_new_tokens": 10,
                "temperature": 0.7
            },
            stream=True,
            timeout=30
        )
        assert resp.status_code == 200
        
        chunks = []
        for line in resp.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data:'):
                    chunk = line[5:].strip()
                    if chunk:
                        chunks.append(chunk)
        
        assert len(chunks) > 0
        print(f"✅ Streaming working: received {len(chunks)} chunks")
        print(f"   Generated: {''.join(chunks)}")
        return True
    except Exception as e:
        print(f"❌ Streaming test failed: {e}")
        return False

def test_config():
    """Test the config endpoint"""
    print("\nTesting /config endpoint...")
    try:
        resp = requests.post(
            f"{BASE_URL}/config",
            json={
                "model_id": "gpt2"
            },
            timeout=30
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        # Check for at least one config field
        assert len(data) > 0
        print(f"✅ Config endpoint working")
        print(f"   Config keys: {list(data.keys())[:5]}")
        return True
    except Exception as e:
        print(f"❌ Config test failed: {e}")
        return False

def main():
    print("=" * 60)
    print("FastAPI Server Test Suite")
    print("=" * 60)
    
    tests = [
        test_health,
        test_cors,
        test_tokenize,
        test_generate,
        test_streaming,
        test_config
    ]
    
    results = []
    for test in tests:
        results.append(test())
    
    print("\n" + "=" * 60)
    print(f"Results: {sum(results)}/{len(results)} tests passed")
    print("=" * 60)
    
    if all(results):
        print("✅ All tests passed!")
        return 0
    else:
        print("❌ Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())

