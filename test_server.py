import requests
import json


def test_server_connection():
    """Test if the Django server is accessible"""

    # Test URLs
    base_url = "http://10.187.189.47:8000"
    test_urls = [
        f"{base_url}/api/iot/system/status/",
        f"{base_url}/api/iot/devices/register/",
        f"{base_url}/api/iot/sensor/data/",
        f"{base_url}/api/iot/bookings/active/",
    ]

    print("=== Testing Server Connection ===")
    print(f"Testing server at: {base_url}")
    print()

    for url in test_urls:
        try:
            print(f"Testing: {url}")

            if "register" in url or "sensor/data" in url:
                # POST request
                test_data = {
                    "device_id": "TEST_DEVICE",
                    "device_type": "sensor",
                    "name": "Test Device",
                    "location": "Test Location",
                }
                response = requests.post(url, json=test_data, timeout=5)
            else:
                # GET request
                response = requests.get(url, timeout=5)

            print(f"  Status Code: {response.status_code}")
            print(f"  Response: {response.text[:100]}...")

            if response.status_code in [200, 201]:
                print("  ✅ SUCCESS")
            else:
                print("  ⚠️  Unexpected status code")

        except requests.exceptions.ConnectionError:
            print("  ❌ CONNECTION FAILED - Server not reachable")
        except requests.exceptions.Timeout:
            print("  ❌ TIMEOUT - Server not responding")
        except Exception as e:
            print(f"  ❌ ERROR: {str(e)}")

        print()


if __name__ == "__main__":
    test_server_connection()
