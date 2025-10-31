#!/usr/bin/env python3
"""
Smart Parking Backend Startup Script
Auto-detects IP, updates configuration, and starts Django server
"""

import os
import sys
import subprocess
import time
from pathlib import Path


def run_ip_detection():
    """Run IP detection script"""
    print("🔍 Detecting local IP address...")
    try:
        result = subprocess.run(
            [sys.executable, "get_local_ip.py"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent,
        )
        if result.returncode == 0:
            print("✅ IP detection successful")
            print(result.stdout)
            return True
        else:
            print("❌ IP detection failed")
            print(result.stderr)
            return False
    except Exception as e:
        print(f"❌ Error running IP detection: {e}")
        return False


def start_django_server():
    """Start Django development server"""
    print("\n🚀 Starting Django development server...")
    print("=" * 60)

    try:
        # Start server on all interfaces
        cmd = [sys.executable, "manage.py", "runserver", "0.0.0.0:8000"]
        print(f"Running: {' '.join(cmd)}")
        print("\n📡 Server will be accessible from:")
        print("   - http://localhost:8000")
        print("   - http://0.0.0.0:8000")
        print("   - http://[YOUR_IP]:8000")
        print("\n🛑 Press Ctrl+C to stop the server")
        print("=" * 60)

        # Run the server
        subprocess.run(cmd, cwd=Path(__file__).parent)

    except KeyboardInterrupt:
        print("\n\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        return False

    return True


def check_dependencies():
    """Check if required dependencies are installed"""
    print("🔍 Checking dependencies...")

    try:
        import django

        print(f"✅ Django {django.get_version()}")
    except ImportError:
        print("❌ Django not installed")
        return False

    try:
        import rest_framework

        print("✅ Django REST Framework")
    except ImportError:
        print("❌ Django REST Framework not installed")
        return False

    try:
        import corsheaders

        print("✅ Django CORS Headers")
    except ImportError:
        print("❌ Django CORS Headers not installed")
        return False

    return True


def main():
    print("🏗️  Smart Parking Backend Startup")
    print("=" * 50)

    # Check if we're in the right directory
    if not Path("manage.py").exists():
        print(
            "❌ manage.py not found. Please run this script from the backend directory."
        )
        return False

    # Check dependencies
    if not check_dependencies():
        print("\n❌ Missing dependencies. Please install requirements:")
        print("   pip install -r requirements.txt")
        return False

    # Run IP detection
    print("\n" + "=" * 50)
    if not run_ip_detection():
        print("⚠️  IP detection failed, but continuing with server startup...")

    # Start Django server
    print("\n" + "=" * 50)
    start_django_server()

    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
