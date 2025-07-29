from django.shortcuts import render
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate, login
from django.contrib.auth.models import User
from django.db import transaction
from .models import ParkingLot, ParkingSpot, Booking, UserProfile, Payment
from .serializers import (
    UserSerializer, UserProfileSerializer, ParkingLotSerializer,
    ParkingSpotSerializer, BookingSerializer, PaymentSerializer
)

# Create your views here.

# Authentication Views
@api_view(['POST'])
@permission_classes([AllowAny])
def signup(request):
    """User registration endpoint (now with username)"""
    try:
        with transaction.atomic():
            # Extract user data
            username = request.data.get('username')
            email = request.data.get('email')
            password = request.data.get('password')
            full_name = request.data.get('fullName', '')

            # Split full name into first and last name
            name_parts = full_name.split(' ', 1)
            first_name = name_parts[0] if name_parts else ''
            last_name = name_parts[1] if len(name_parts) > 1 else ''

            # Validate required fields
            if not all([username, email, password, full_name]):
                return Response({
                    'error': 'Username, email, password, and full name are required'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Validate password length
            if len(password) < 6:
                return Response({
                    'error': 'Password must be at least 6 characters long'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Validate email format
            if '@' not in email or '.' not in email:
                return Response({
                    'error': 'Please enter a valid email address'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Check if user already exists
            if User.objects.filter(username=username).exists():
                return Response({
                    'error': 'Username already exists'
                }, status=status.HTTP_400_BAD_REQUEST)

            if User.objects.filter(email=email).exists():
                return Response({
                    'error': 'Email already exists'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Create user
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name
            )

            # Create user profile
            profile_data = {
                'phone_number': request.data.get('phoneNumber', ''),
                'license_plate': request.data.get('numberPlate', ''),
                'car_name': request.data.get('carName', ''),
            }
            UserProfile.objects.create(user=user, **profile_data)

            return Response({
                'message': 'User registered successfully. Please log in to continue.',
                'user': UserSerializer(user).data
            }, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([AllowAny])
def signin(request):
    print('SIGNIN DATA:', request.data)
    try:
        username = request.data.get('username')
        password = request.data.get('password')
        print('SIGNIN username:', username, 'password:', '*'*len(password) if password else None)
        
        if not username or not password:
            return Response({
                'error': 'Username and password are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Trim whitespace from username
        username = username.strip()
        
        user = authenticate(username=username, password=password)
        print('SIGNIN user:', user)
        
        if user is None:
            return Response({
                'error': 'Invalid username or password'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        # Check if user is active
        if not user.is_active:
            return Response({
                'error': 'Account is deactivated. Please contact support.'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        token, created = Token.objects.get_or_create(user=user)
        
        try:
            profile = UserProfile.objects.get(user=user)
            profile_data = UserProfileSerializer(profile).data
        except UserProfile.DoesNotExist:
            profile_data = {}
        
        return Response({
            'message': 'Login successful',
            'token': token.key,
            'user': UserSerializer(user).data,
            'profile': profile_data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        print('SIGNIN EXCEPTION:', e)
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def signout(request):
    """User logout endpoint"""
    try:
        # Delete the token
        try:
            request.user.auth_token.delete()
        except:
            pass
        return Response({
            'message': 'Logout successful'
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_profile(request):
    """Get current user profile"""
    print(f"[get_user_profile] User: {request.user}, Authenticated: {request.user.is_authenticated}")
    try:
        profile = UserProfile.objects.get(user=request.user)
        print(f"[get_user_profile] Profile found: {profile}")
        return Response({
            'user': UserSerializer(request.user).data,
            'profile': UserProfileSerializer(profile).data
        }, status=status.HTTP_200_OK)
    except UserProfile.DoesNotExist:
        print(f"[get_user_profile] Profile not found for user: {request.user}")
        return Response({
            'error': 'Profile not found'
        }, status=status.HTTP_404_NOT_FOUND)

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_user_profile(request):
    """Update current user profile"""
    try:
        profile = UserProfile.objects.get(user=request.user)
        
        # Update user data if provided
        user_data = request.data.get('user', {})
        if user_data:
            if 'first_name' in user_data:
                request.user.first_name = user_data['first_name']
            if 'last_name' in user_data:
                request.user.last_name = user_data['last_name']
            if 'email' in user_data:
                # Check if email is already taken by another user
                if User.objects.filter(email=user_data['email']).exclude(id=request.user.id).exists():
                    return Response({
                        'error': 'Email already exists'
                    }, status=status.HTTP_400_BAD_REQUEST)
                request.user.email = user_data['email']
            request.user.save()
        
        # Update profile data if provided
        profile_data = request.data.get('profile', {})
        if profile_data:
            if 'phone_number' in profile_data:
                profile.phone_number = profile_data['phone_number']
            if 'license_plate' in profile_data:
                profile.license_plate = profile_data['license_plate']
            if 'car_name' in profile_data:
                profile.car_name = profile_data['car_name']
            profile.save()
        
        return Response({
            'message': 'Profile updated successfully',
            'user': UserSerializer(request.user).data,
            'profile': UserProfileSerializer(profile).data
        }, status=status.HTTP_200_OK)
        
    except UserProfile.DoesNotExist:
        return Response({
            'error': 'Profile not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change user password"""
    try:
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')
        
        if not current_password or not new_password:
            return Response({
                'error': 'Current password and new password are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify current password
        if not request.user.check_password(current_password):
            return Response({
                'error': 'Current password is incorrect'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if new password is different
        if current_password == new_password:
            return Response({
                'error': 'New password must be different from current password'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update password
        request.user.set_password(new_password)
        request.user.save()
        
        return Response({
            'message': 'Password changed successfully'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Parking Views
class ParkingLotList(generics.ListCreateAPIView):
    queryset = ParkingLot.objects.filter(is_active=True)
    serializer_class = ParkingLotSerializer
    permission_classes = [AllowAny]

class ParkingLotDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ParkingLot.objects.all()
    serializer_class = ParkingLotSerializer
    permission_classes = [AllowAny]

class ParkingSpotList(generics.ListCreateAPIView):
    queryset = ParkingSpot.objects.all()
    serializer_class = ParkingSpotSerializer
    permission_classes = [AllowAny]

class ParkingSpotDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ParkingSpot.objects.all()
    serializer_class = ParkingSpotSerializer
    permission_classes = [AllowAny]

class BookingList(generics.ListCreateAPIView):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Booking.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class BookingDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Booking.objects.filter(user=self.request.user)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def extend_booking(request, booking_id):
    """Extend booking duration"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)
        additional_minutes = request.data.get('additional_minutes', 0)
        
        if additional_minutes <= 0:
            return Response({
                'error': 'Additional minutes must be greater than 0'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update end time and duration
        from datetime import timedelta
        booking.end_time += timedelta(minutes=additional_minutes)
        booking.duration_minutes += additional_minutes
        
        # Recalculate cost
        duration = booking.end_time - booking.start_time
        hours = duration.total_seconds() / 3600
        booking.total_cost = hours * booking.parking_spot.parking_lot.hourly_rate
        
        booking.save()
        
        return Response({
            'message': 'Booking extended successfully',
            'booking': BookingSerializer(booking).data
        }, status=status.HTTP_200_OK)
        
    except Booking.DoesNotExist:
        return Response({
            'error': 'Booking not found'
        }, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_booking(request, booking_id):
    """Cancel booking"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)
        
        if booking.status != 'active':
            return Response({
                'error': 'Only active bookings can be cancelled'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Mark booking as cancelled
        booking.status = 'cancelled'
        booking.save()
        
        # Free up the parking spot
        parking_spot = booking.parking_spot
        parking_spot.is_occupied = False
        parking_spot.save()
        
        return Response({
            'message': 'Booking cancelled successfully'
        }, status=status.HTTP_200_OK)
        
    except Booking.DoesNotExist:
        return Response({
            'error': 'Booking not found'
        }, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_parking_stats(request):
    """Get parking statistics for home screen"""
    try:
        total_spots = ParkingSpot.objects.count()
        available_spots = ParkingSpot.objects.filter(is_occupied=False).count()
        total_bookings = Booking.objects.filter(status='active').count()
        
        return Response({
            'total_spots': total_spots,
            'available_spots': available_spots,
            'total_bookings': total_bookings
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
