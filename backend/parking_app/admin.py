from django.contrib import admin
from .models import ParkingLot, ParkingSpot, Booking, UserProfile, Payment

@admin.register(ParkingLot)
class ParkingLotAdmin(admin.ModelAdmin):
    list_display = ['name', 'address', 'total_spots', 'hourly_rate', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'address']

@admin.register(ParkingSpot)
class ParkingSpotAdmin(admin.ModelAdmin):
    list_display = ['parking_lot', 'spot_number', 'spot_type', 'is_occupied', 'is_reserved']
    list_filter = ['parking_lot', 'spot_type', 'is_occupied', 'is_reserved']
    search_fields = ['spot_number', 'parking_lot__name']

@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ['user', 'parking_spot', 'start_time', 'end_time', 'status', 'total_cost']
    list_filter = ['status', 'start_time', 'end_time']
    search_fields = ['user__username', 'parking_spot__spot_number']

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'phone', 'address', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__username', 'phone', 'address']

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['booking', 'amount', 'payment_method', 'status', 'created_at']
    list_filter = ['status', 'payment_method', 'created_at']
    search_fields = ['booking__user__username', 'transaction_id']
