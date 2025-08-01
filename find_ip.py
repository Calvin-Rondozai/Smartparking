#!/usr/bin/env python3
"""
Script to find your computer's IP address for ESP32 connection
"""

import socket
import subprocess
import platform

def get_local_ip():
    """Get the local IP address of this computer"""
    try:
        # Create a socket to get local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return None

def get_all_ips():
    """Get all network interfaces and their IPs"""
    ips = []
    
    try:
        if platform.system() == "Windows":
            # Windows command
            result = subprocess.run(['ipconfig'], capture_output=True, text=True)
            lines = result.stdout.split('\n')
            
            for line in lines:
                if 'IPv4 Address' in line and '192.168.' in line:
                    ip = line.split(':')[-1].strip()
                    if ip:
                        ips.append(ip)
        else:
            # Linux/Mac command
            result = subprocess.run(['ifconfig'], capture_output=True, text=True)
            lines = result.stdout.split('\n')
            
            for line in lines:
                if 'inet ' in line and '192.168.' in line:
                    parts = line.split()
                    for part in parts:
                        if part.startswith('192.168.'):
                            ips.append(part)
                            break
    except Exception as e:
        print(f"Error getting IPs: {e}")
    
    return ips

def main():
    print("🔍 Finding your computer's IP address for ESP32 connection...")
    print("=" * 60)
    
    # Get local IP
    local_ip = get_local_ip()
    if local_ip:
        print(f"✅ Primary IP Address: {local_ip}")
    else:
        print("❌ Could not determine primary IP address")
    
    # Get all IPs
    all_ips = get_all_ips()
    if all_ips:
        print(f"\n📋 All available IP addresses:")
        for i, ip in enumerate(all_ips, 1):
            print(f"   {i}. {ip}")
    
    print("\n" + "=" * 60)
    print("📝 Instructions for ESP32:")
    print("1. Use one of the IP addresses above in your ESP32 code")
    print("2. Replace the serverUrl in your ESP32 code:")
    print(f"   const char* serverUrl = \"http://{local_ip}:8000/api/iot/\";")
    print("\n3. Make sure your Django server is running:")
    print("   cd backend")
    print("   python manage.py runserver 0.0.0.0:8000")
    print("\n4. Ensure both ESP32 and computer are on the same WiFi network")
    
    if local_ip:
        print(f"\n🎯 Recommended configuration:")
        print(f"   Server URL: http://{local_ip}:8000/api/iot/")
    
    print("\n⚠️  Troubleshooting:")
    print("- If ESP32 can't connect, try different IP addresses from the list above")
    print("- Make sure Windows Firewall allows connections on port 8000")
    print("- Check if your WiFi router blocks local connections")

if __name__ == "__main__":
    main() 