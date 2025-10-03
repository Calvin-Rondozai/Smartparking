#!/usr/bin/env python3
"""
Simple script to run overtime checking automatically
Run this script every minute to check for overtime bookings
"""

import os
import sys
import django
import time
from datetime import datetime

# Add the project directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking.settings')
django.setup()

from parking_app.management.commands.check_overtime_bookings import Command

def run_overtime_check():
    """Run the overtime checking command"""
    print(f"🕐 [{datetime.now()}] Running overtime check...")
    
    try:
        # Create command instance and run it
        command = Command()
        command.handle()
        print(f"✅ [{datetime.now()}] Overtime check completed")
    except Exception as e:
        print(f"❌ [{datetime.now()}] Error running overtime check: {e}")

if __name__ == "__main__":
    print("🚀 Starting overtime checker...")
    print("Press Ctrl+C to stop")
    
    try:
        while True:
            run_overtime_check()
            # Wait 60 seconds before next check
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n🛑 Overtime checker stopped")

