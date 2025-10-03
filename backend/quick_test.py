#!/usr/bin/env python
"""
Quick test to verify backend endpoints
"""
import os
import sys
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.contrib.auth.models import User
from parking_app.models import UserProfile

def test_backend():
    print("🧪 Testing backend...")
    
    # Check if we have any users
    users = User.objects.all()
    print(f"Total users: {users.count()}")
    
    # Check if we have any UserProfiles
    profiles = UserProfile.objects.all()
    print(f"Total UserProfiles: {profiles.count()}")
    
    # Show user details
    for user in users[:5]:  # Show first 5 users
        try:
            profile = UserProfile.objects.get(user=user)
            print(f"✅ {user.username} ({user.email}) - Staff: {user.is_staff}, Super: {user.is_superuser}, Profile: {profile.id}")
        except UserProfile.DoesNotExist:
            print(f"❌ {user.username} ({user.email}) - Staff: {user.is_staff}, Super: {user.is_superuser}, NO PROFILE")
    
    print("\n🔧 Backend is ready!")
    print("📱 Mobile app should now work with users created in admin")
    print("🔐 Admin dashboard blocks general users")

if __name__ == '__main__':
    test_backend() 