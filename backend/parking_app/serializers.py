from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    ParkingLot,
    ParkingSpot,
    Booking,
    UserProfile,
    Payment,
    WalletTransaction,
    UserReport,
)


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "is_superuser",
            "is_staff",
            "balance",
        ]

    def get_full_name(self, obj):
        if obj.first_name and obj.last_name:
            return f"{obj.first_name} {obj.last_name}"
        elif obj.first_name:
            return obj.first_name
        elif obj.last_name:
            return obj.last_name
        else:
            return obj.username

    def get_balance(self, obj):
        try:
            return float(obj.profile.balance)
        except Exception:
            return 0.0


class UserProfileSerializer(serializers.ModelSerializer):
    phone_number = serializers.CharField(source="phone", read_only=True)
    license_plate = serializers.CharField(source="address", read_only=True)
    car_name = serializers.CharField(source="address", read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            "phone",
            "phone_number",
            "address",
            "license_plate",
            "car_name",
            "profile_picture",
            "last_password_reset",
            "created_at",
            "updated_at",
        ]


class ParkingSpotSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParkingSpot
        fields = "__all__"


class ParkingLotSerializer(serializers.ModelSerializer):
    parking_spots = ParkingSpotSerializer(many=True, read_only=True)
    available_spots = serializers.ReadOnlyField()

    class Meta:
        model = ParkingLot
        fields = "__all__"


class BookingSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    parking_spot = ParkingSpotSerializer(read_only=True)
    parking_spot_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = Booking
        fields = "__all__"
        read_only_fields = [
            "total_cost",
            "status",
            "overtime_minutes",
            "overtime_cost",
            "is_overtime",
        ]


class PaymentSerializer(serializers.ModelSerializer):
    booking = BookingSerializer(read_only=True)
    booking_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = Payment
        fields = "__all__"


class WalletTransactionSerializer(serializers.ModelSerializer):
    amount = serializers.SerializerMethodField()

    class Meta:
        model = WalletTransaction
        fields = ["id", "type", "amount", "method", "note", "booking", "created_at"]

    def get_amount(self, obj):
        return float(obj.amount or 0)


class ParkingSpotDetailSerializer(serializers.ModelSerializer):
    parking_lot = ParkingLotSerializer(read_only=True)
    current_booking = serializers.SerializerMethodField()

    class Meta:
        model = ParkingSpot
        fields = "__all__"

    def get_current_booking(self, obj):
        active_booking = obj.booking_set.filter(status="active").first()
        if active_booking:
            return BookingSerializer(active_booking).data
        return None


class UserReportSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = UserReport
        fields = [
            "id",
            "message",
            "type",
            "priority",
            "status",
            "created_at",
            "user",
        ]

    def get_user(self, obj):
        try:
            if obj.user:
                return {
                    "id": obj.user.id,
                    "username": obj.user.username,
                    "email": obj.user.email,
                }
        except Exception:
            pass
        return None
