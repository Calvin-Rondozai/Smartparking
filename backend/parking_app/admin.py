from django.contrib import admin
from django.contrib.admin import ModelAdmin
from django.contrib.auth.models import User
from .models import ParkingLot, ParkingSpot, Booking, UserProfile, Payment


class ReadOnlyAdminMixin:
    """Mixin to make admin read-only for staff users"""

    def has_add_permission(self, request):
        # Only superusers can add
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        # Only superusers can change
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        # Only superusers can delete
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        # Both superusers and staff can view
        return request.user.is_superuser or request.user.is_staff


@admin.register(ParkingLot)
class ParkingLotAdmin(ReadOnlyAdminMixin, ModelAdmin):
    list_display = [
        "name",
        "address",
        "total_spots",
        "hourly_rate",
        "is_active",
        "created_at",
    ]
    list_filter = ["is_active", "created_at"]
    search_fields = ["name", "address"]

    def get_readonly_fields(self, request, obj=None):
        # If staff user, make all fields readonly
        if request.user.is_staff and not request.user.is_superuser:
            return [f.name for f in self.model._meta.fields]
        return self.readonly_fields


@admin.register(ParkingSpot)
class ParkingSpotAdmin(ReadOnlyAdminMixin, ModelAdmin):
    list_display = [
        "parking_lot",
        "spot_number",
        "spot_type",
        "is_occupied",
        "is_reserved",
    ]
    list_filter = ["parking_lot", "spot_type", "is_occupied", "is_reserved"]
    search_fields = ["spot_number", "parking_lot__name"]

    def get_readonly_fields(self, request, obj=None):
        # If staff user, make all fields readonly
        if request.user.is_staff and not request.user.is_superuser:
            return [f.name for f in self.model._meta.fields]
        return self.readonly_fields


@admin.register(Booking)
class BookingAdmin(ReadOnlyAdminMixin, ModelAdmin):
    list_display = [
        "user",
        "parking_spot",
        "start_time",
        "end_time",
        "status",
        "total_cost",
    ]
    list_filter = ["status", "start_time", "end_time"]
    search_fields = ["user__username", "parking_spot__spot_number"]

    def get_readonly_fields(self, request, obj=None):
        # If staff user, make all fields readonly
        if request.user.is_staff and not request.user.is_superuser:
            return [f.name for f in self.model._meta.fields]
        return self.readonly_fields


@admin.register(UserProfile)
class UserProfileAdmin(ReadOnlyAdminMixin, ModelAdmin):
    list_display = ["user", "phone", "address", "created_at"]
    list_filter = ["created_at"]
    search_fields = ["user__username", "phone", "address"]

    def get_readonly_fields(self, request, obj=None):
        # If staff user, make all fields readonly
        if request.user.is_staff and not request.user.is_superuser:
            return [f.name for f in self.model._meta.fields]
        return self.readonly_fields


@admin.register(Payment)
class PaymentAdmin(ReadOnlyAdminMixin, ModelAdmin):
    list_display = ["booking", "amount", "payment_method", "status", "created_at"]
    list_filter = ["status", "payment_method", "created_at"]
    search_fields = ["booking__user__username", "transaction_id"]

    def get_readonly_fields(self, request, obj=None):
        # If staff user, make all fields readonly
        if request.user.is_staff and not request.user.is_superuser:
            return [f.name for f in self.model._meta.fields]
        return self.readonly_fields
