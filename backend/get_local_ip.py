#!/usr/bin/env python3
"""
Auto-detect local IP address for Smart Parking Backend
This script finds the machine's IP address and updates configuration files
"""

import socket
import json
import os
import sys
from pathlib import Path

def get_local_ip():
    """Get the local IP address of this machine"""
    try:
        # Connect to a remote address to determine local IP
        # This doesn't actually send data, just determines the route
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            # Connect to Google's DNS (doesn't actually connect)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
        return local_ip
    except Exception as e:
        print(f"Error getting local IP: {e}")
        return None

def get_all_ips():
    """Get all available IP addresses on this machine"""
    import subprocess
    import re
    
    ips = []
    try:
        if sys.platform.startswith('win'):
            # Windows
            result = subprocess.run(['ipconfig'], capture_output=True, text=True)
            lines = result.stdout.split('\n')
            for line in lines:
                if 'IPv4 Address' in line and '192.168.' in line:
                    ip = re.search(r'(\d+\.\d+\.\d+\.\d+)', line)
                    if ip:
                        ips.append(ip.group(1))
                elif 'IPv4 Address' in line and '10.' in line:
                    ip = re.search(r'(\d+\.\d+\.\d+\.\d+)', line)
                    if ip:
                        ips.append(ip.group(1))
        else:
            # Linux/Mac
            result = subprocess.run(['hostname', '-I'], capture_output=True, text=True)
            if result.returncode == 0:
                ips = result.stdout.strip().split()
        return ips
    except Exception as e:
        print(f"Error getting all IPs: {e}")
        return []

def update_django_settings(ip):
    """Update Django settings with detected IP"""
    settings_file = Path(__file__).parent / "smartparking_backend" / "settings.py"
    
    if not settings_file.exists():
        print(f"Settings file not found: {settings_file}")
        return False
    
    try:
        with open(settings_file, 'r') as f:
            content = f.read()
        
        # Update ALLOWED_HOSTS to include the detected IP
        if f'"{ip}"' not in content:
            # Find the ALLOWED_HOSTS section
        lines = content.split('\n')
        new_lines = []
        in_allowed_hosts = False
        
        for line in lines:
            if 'ALLOWED_HOSTS = [' in line:
                in_allowed_hosts = True
                new_lines.append(line)
            elif in_allowed_hosts and ']' in line:
                # Add the new IP before closing bracket
                new_lines.append(f'    "{ip}",  # Auto-detected IP')
                new_lines.append(line)
                in_allowed_hosts = False
            else:
                new_lines.append(line)
        
        with open(settings_file, 'w') as f:
            f.write('\n'.join(new_lines))
        
        print(f"✅ Updated Django settings with IP: {ip}")
        return True
        
    except Exception as e:
        print(f"❌ Error updating Django settings: {e}")
        return False

def create_ip_config(ip):
    """Create IP configuration file for frontend and ESP32"""
    config = {
        "server_ip": ip,
        "server_port": 8000,
        "api_base_url": f"http://{ip}:8000/api",
        "iot_base_url": f"http://{ip}:8000/api/iot",
        "detected_at": str(Path().cwd()),
        "status": "active"
    }
    
    # Save to backend directory
    backend_config = Path(__file__).parent / "ip_config.json"
    with open(backend_config, 'w') as f:
        json.dump(config, f, indent=2)
    
    # Save to frontend directory
    frontend_config = Path(__file__).parent.parent / "frontend" / "ip_config.json"
    frontend_config.parent.mkdir(exist_ok=True)
    with open(frontend_config, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"✅ Created IP config files with IP: {ip}")
    return config

def main():
    print("🔍 Smart Parking - Auto IP Detection")
    print("=" * 50)
    
    # Get primary IP
    primary_ip = get_local_ip()
    if not primary_ip:
        print("❌ Could not detect primary IP address")
        return False
    
    print(f"📍 Primary IP detected: {primary_ip}")
    
    # Get all IPs for reference
    all_ips = get_all_ips()
    if all_ips:
        print(f"📍 All available IPs: {', '.join(all_ips)}")
    
    # Update Django settings
    if update_django_settings(primary_ip):
        print("✅ Django settings updated")
    else:
        print("❌ Failed to update Django settings")
    
    # Create configuration files
    config = create_ip_config(primary_ip)
    
    print("\n🚀 Configuration Summary:")
    print(f"   Server IP: {config['server_ip']}")
    print(f"   API URL: {config['api_base_url']}")
    print(f"   IoT URL: {config['iot_base_url']}")
    
    print("\n📝 Next Steps:")
    print("1. Start Django server: python manage.py runserver 0.0.0.0:8000")
    print("2. Update ESP32 code with the detected IP")
    print("3. Restart your React Native app")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
