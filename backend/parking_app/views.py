from django.shortcuts import render
from rest_framework import status, generics, serializers
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
        user_bookings = Booking.objects.filter(user=self.request.user)
        print(f"=== Fetching bookings for user {self.request.user.username} ===")
        print(f"Found {user_bookings.count()} bookings")
        
        # Check for expired bookings and mark them as completed
        for booking in user_bookings.filter(status='active'):
            if booking.mark_as_completed_if_expired():
                print(f"  - Marked expired booking {booking.id} as completed")
        
        # Refresh the queryset after potential status changes
        user_bookings = Booking.objects.filter(user=self.request.user)
        for booking in user_bookings:
            print(f"  - Booking {booking.id}: {booking.parking_spot.spot_number} ({booking.status})")
        return user_bookings
    
    def perform_create(self, serializer):
        try:
            print("=== Starting booking creation ===")
            
            # Check if user already has an active booking
            existing_active_booking = Booking.objects.filter(
                user=self.request.user, 
                status='active'
            ).first()
            
            if existing_active_booking:
                print(f"User already has active booking: {existing_active_booking.id}")
                raise serializers.ValidationError({
                    'non_field_errors': 'You already have an active booking. Please cancel your current booking before making a new one.'
                })
            
            # Get parking spot from parking_spot_id
            parking_spot_id = serializer.validated_data.get('parking_spot_id')
            print(f"Parking spot ID: {parking_spot_id}")
            
            try:
                parking_spot = ParkingSpot.objects.get(id=parking_spot_id)
                print(f"Found parking spot: {parking_spot.spot_number}")
            except ParkingSpot.DoesNotExist:
                print(f"Parking spot {parking_spot_id} not found")
                raise serializers.ValidationError({
                    'parking_spot_id': 'Parking spot not found.'
                })
            
            # Check if the parking spot is available
            if parking_spot.is_occupied:
                print(f"Parking spot {parking_spot.spot_number} is occupied")
                raise serializers.ValidationError({
                    'parking_spot_id': 'This parking spot is currently occupied and cannot be booked.'
                })
            
            # Mark the spot as occupied
            parking_spot.is_occupied = True
            parking_spot.save()
            print(f"Marked {parking_spot.spot_number} as occupied")
            
            # Create the booking with minimal data
            booking_data = {
                'user': self.request.user,
                'parking_spot': parking_spot,
                'start_time': serializer.validated_data.get('start_time'),
                'end_time': serializer.validated_data.get('end_time'),
                'duration_minutes': serializer.validated_data.get('duration_minutes', 0),
                'vehicle_name': serializer.validated_data.get('vehicle_name', ''),
                'status': 'active'
            }
            
            print(f"Creating booking with data: {booking_data}")
            booking = Booking.objects.create(**booking_data)
            print(f"✅ Booking created successfully: {booking.id}")
            
            return booking
            
        except Exception as e:
            print(f"❌ Error in booking creation: {e}")
            import traceback
            traceback.print_exc()
            raise

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
        print(f"Extend booking called for booking {booking_id}")
        print(f"Request data: {request.data}")
        
        booking = Booking.objects.get(id=booking_id, user=request.user)
        additional_minutes = request.data.get('additional_minutes', 0)
        
        print(f"Additional minutes: {additional_minutes}")
        
        if additional_minutes <= 0:
            return Response({
                'error': 'Additional minutes must be greater than 0'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update end time and duration
        from datetime import timedelta
        booking.end_time += timedelta(minutes=additional_minutes)
        booking.duration_minutes += additional_minutes
        
        # Recalculate cost safely
        try:
            duration = booking.end_time - booking.start_time
            hours = duration.total_seconds() / 3600
            
            # Get hourly rate safely
            if hasattr(booking.parking_spot, 'parking_lot') and booking.parking_spot.parking_lot:
                if hasattr(booking.parking_spot.parking_lot, 'hourly_rate') and booking.parking_spot.parking_lot.hourly_rate:
                    hourly_rate = float(booking.parking_spot.parking_lot.hourly_rate)
                else:
                    hourly_rate = 2.50  # Default rate
            else:
                hourly_rate = 2.50  # Default rate
            
            booking.total_cost = hours * hourly_rate
        except Exception as e:
            print(f"Error calculating total_cost: {e}")
            # Set default cost if calculation fails
            booking.total_cost = (booking.duration_minutes / 60) * 2.50
        
        booking.save()
        
        print(f"Booking extended successfully. New duration: {booking.duration_minutes} minutes")
        
        return Response({
            'message': 'Booking extended successfully',
            'booking': BookingSerializer(booking).data
        }, status=status.HTTP_200_OK)
        
    except Booking.DoesNotExist:
        return Response({
            'error': 'Booking not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        print(f"Error in extend_booking: {e}")
        return Response({
            'error': 'Failed to extend booking'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
        
        # Try to control ESP32 (but don't fail if it doesn't work)
        try:
            import requests
            from iot_integration.models import IoTDevice
            
            # Find the IoT device
            device = IoTDevice.objects.filter(is_active=True).first()
            if device:
                # Send booking control to ESP32
                control_url = f"http://192.168.180.47:8000/api/iot/control/booking/"
                control_data = {
                    'device_id': device.device_id,
                    'slot_number': parking_spot.spot_number,
                    'is_booked': False
                }
                
                response = requests.post(control_url, json=control_data, timeout=3)
                if response.status_code == 200:
                    print(f"✅ ESP32 booking control sent for {parking_spot.spot_number} (cancelled)")
                else:
                    print(f"⚠️ ESP32 booking control failed: {response.status_code} - but booking was cancelled")
        except Exception as e:
            print(f"⚠️ ESP32 booking control error: {e} - but booking was cancelled successfully")
        
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
