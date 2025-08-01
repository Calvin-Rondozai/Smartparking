from rest_framework import serializers
from django.contrib.auth.models import User
from .models import ParkingLot, ParkingSpot, Booking, UserProfile, Payment

class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name']
    
    def get_full_name(self, obj):
        if obj.first_name and obj.last_name:
            return f"{obj.first_name} {obj.last_name}"
        elif obj.first_name:
            return obj.first_name
        elif obj.last_name:
            return obj.last_name
        else:
            return obj.username

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['phone_number', 'license_plate', 'car_name', 'is_verified']

class ParkingSpotSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParkingSpot
        fields = '__all__'

class ParkingLotSerializer(serializers.ModelSerializer):
    parking_spots = ParkingSpotSerializer(many=True, read_only=True)
    available_spots = serializers.ReadOnlyField()
    
    class Meta:
        model = ParkingLot
        fields = '__all__'

class BookingSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    parking_spot = ParkingSpotSerializer(read_only=True)
    parking_spot_id = serializers.IntegerField(write_only=True)
    
    class Meta:
        model = Booking
        fields = '__all__'
        read_only_fields = ['total_cost', 'status']

class PaymentSerializer(serializers.ModelSerializer):
    booking = BookingSerializer(read_only=True)
    booking_id = serializers.IntegerField(write_only=True)
    
    class Meta:
        model = Payment
        fields = '__all__'

class ParkingSpotDetailSerializer(serializers.ModelSerializer):
    parking_lot = ParkingLotSerializer(read_only=True)
    current_booking = serializers.SerializerMethodField()
    
    class Meta:
        model = ParkingSpot
        fields = '__all__'
    
    def get_current_booking(self, obj):
        active_booking = obj.booking_set.filter(status='active').first()
        if active_booking:
            return BookingSerializer(active_booking).data
        return None 