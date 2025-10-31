from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator


class ParkingLot(models.Model):
    name = models.CharField(max_length=100)
    address = models.TextField()
    total_spots = models.IntegerField()
    hourly_rate = models.DecimalField(max_digits=6, decimal_places=2)
    rating = models.DecimalField(
        max_digits=3, decimal_places=1, default=4.5
    )  # Added to match frontend
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    @property
    def available_spots(self):
        return self.parkingspot_set.filter(is_occupied=False).count()


class ParkingSpot(models.Model):
    SPOT_TYPES = [
        ("regular", "Regular"),
        ("handicap", "Handicap"),
        ("electric", "Electric Vehicle"),
        ("reserved", "Reserved"),
    ]

    parking_lot = models.ForeignKey(ParkingLot, on_delete=models.CASCADE)
    spot_number = models.CharField(max_length=10)
    spot_type = models.CharField(max_length=20, choices=SPOT_TYPES, default="regular")
    is_occupied = models.BooleanField(default=False)
    is_reserved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["parking_lot", "spot_number"]

    def __str__(self):
        return f"{self.parking_lot.name} - Spot {self.spot_number}"


class Booking(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    parking_spot = models.ForeignKey(ParkingSpot, on_delete=models.CASCADE)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    duration_minutes = models.IntegerField(default=0)  # Added to match frontend
    vehicle_name = models.CharField(
        max_length=50, blank=True
    )  # Added to match frontend
    number_plate = models.CharField(max_length=20, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    total_cost = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    overtime_minutes = models.IntegerField(
        default=0, help_text="Minutes parked beyond booking time"
    )
    overtime_cost = models.DecimalField(
        max_digits=8, decimal_places=2, default=0, help_text="Cost for overtime parking"
    )
    is_overtime = models.BooleanField(
        default=False, help_text="Whether the booking is currently in overtime"
    )
    overtime_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When overtime billing actually started (5 seconds after expiry)",
    )
    iot_overtime_start = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When IoT detected red light (car still parked)",
    )
    iot_overtime_end = models.DateTimeField(
        null=True, blank=True, help_text="When IoT detected green light (car left)"
    )
    grace_period_started = models.DateTimeField(
        null=True, blank=True, help_text="When the 10-second grace period started"
    )
    grace_period_ended = models.DateTimeField(
        null=True, blank=True, help_text="When the 10-second grace period ended"
    )
    timer_started = models.DateTimeField(
        null=True, blank=True, help_text="When the countdown timer actually started"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_billing_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time progressive billing deducted from wallet",
    )
    completed_at = models.DateTimeField(
        null=True, blank=True, help_text="When the booking was completed"
    )

    def __str__(self):
        return f"{self.user.username} - {self.parking_spot}"

    def is_expired(self):
        """Check if the booking has expired"""
        from django.utils import timezone

        return timezone.now() > self.end_time

    def calculate_overtime(self):
        """Calculate overtime minutes and cost based on IoT red/green light status"""
        from django.utils import timezone
        from datetime import timedelta

        now = timezone.now()

        # Check if booking has expired
        if now <= self.end_time:
            return 0, 0

        # Calculate time since expiry
        time_since_expiry = now - self.end_time

        # Overtime only starts after 5 seconds (red light delay)
        if time_since_expiry.total_seconds() < 5:
            return 0, 0

        # If we have IoT overtime data, use that for accurate calculation
        if self.iot_overtime_start and self.iot_overtime_end:
            # Car has left (green light on) - calculate final overtime
            overtime_duration = self.iot_overtime_end - self.iot_overtime_start
            overtime_minutes = int(overtime_duration.total_seconds() / 60)
        elif self.iot_overtime_start and not self.iot_overtime_end:
            # Car still parked (red light on) - calculate current overtime
            overtime_duration = now - self.iot_overtime_start
            overtime_minutes = int(overtime_duration.total_seconds() / 60)
        else:
            # Fallback: calculate from 5 seconds after expiry
            overtime_start = self.end_time + timedelta(seconds=5)
            overtime_duration = now - overtime_start
            overtime_minutes = max(0, int(overtime_duration.total_seconds() / 60))

        # Calculate cost
        overtime_hours = overtime_minutes / 60

        # Calculate overtime cost at $1 per 30 seconds (consistent with main pricing)
        overtime_cost = (overtime_minutes * 2) / 30

        return overtime_minutes, overtime_cost

    def handle_iot_green_light(self):
        """Handle IoT green light detection (car has left)"""
        from django.utils import timezone

        if self.iot_overtime_start and not self.iot_overtime_end:
            self.iot_overtime_end = timezone.now()

            # Calculate final overtime
            overtime_minutes, overtime_cost = self.calculate_overtime()

            # Update overtime fields in database
            self.overtime_minutes = overtime_minutes
            self.overtime_cost = overtime_cost
            self.is_overtime = True

            # Save to trigger the model's save method which updates total_cost
            self.save()

            print(f"🟢 IoT green light detected for booking {self.id} - Car left")
            print(
                f"💰 Final overtime: {overtime_minutes} minutes, ${overtime_cost:.2f}"
            )
            print(
                f"💾 Saved to database: overtime_minutes={self.overtime_minutes}, overtime_cost={self.overtime_cost}, total_cost={self.total_cost}"
            )

            return overtime_minutes, overtime_cost
        return 0, 0

    def update_overtime_billing(self):
        """Update overtime billing with 5-second delay and IoT integration"""
        from django.utils import timezone
        from datetime import timedelta

        now = timezone.now()

        # Check if booking has expired
        if now <= self.end_time:
            return 0, 0

        # Calculate time since expiry
        time_since_expiry = now - self.end_time

        # Overtime only starts after 5 seconds (red light delay)
        if time_since_expiry.total_seconds() < 5:
            return 0, 0

        # Set overtime start time if not already set
        if not self.overtime_start_time:
            self.overtime_start_time = self.end_time + timedelta(seconds=5)

        # Check if we should start IoT overtime tracking
        if not self.iot_overtime_start and time_since_expiry.total_seconds() >= 5:
            # This is when the red light should turn on
            self.iot_overtime_start = now
            print(f"🚨 IoT overtime started for booking {self.id} - Red light ON")

        # Calculate current overtime
        overtime_minutes, overtime_cost = self.calculate_overtime()

        # Update overtime fields
        self.overtime_minutes = overtime_minutes
        self.overtime_cost = overtime_cost
        self.is_overtime = True
        self.save()

        print(
            f"🚨 Overtime billing updated for booking {self.id}: {overtime_minutes} minutes, ${overtime_cost:.2f}"
        )

        return overtime_minutes, overtime_cost

    def mark_as_completed_if_expired(self):
        """Mark booking as completed if it has expired"""
        if self.is_expired() and self.status == "active":
            # Calculate final overtime before completing
            self.update_overtime_billing()

            self.status = "completed"
            # Free up the parking spot
            self.parking_spot.is_occupied = False
            self.parking_spot.save()
            self.save()

            # Note: LED control will be handled by the calling view to avoid circular imports
            print(
                f"🔵 Marked expired booking {self.id} as completed - LED control handled by view"
            )

            return True
        return False

    def save(self, *args, **kwargs):
        # NOTE: total_cost is now calculated by the views using $1 per 30 seconds
        # based on actual parking time (timer_started to completion), not start_time/end_time
        # This old hourly rate calculation has been removed to prevent conflicts

        # Only handle overtime_cost addition if total_cost is already set
        if self.overtime_cost and self.overtime_cost > 0 and self.total_cost:
            # Calculate base cost (total_cost - overtime_cost)
            base_cost = float(self.total_cost or 0) - float(self.overtime_cost or 0)
            # Recalculate total as base + overtime
            self.total_cost = base_cost + float(self.overtime_cost)

        super().save(*args, **kwargs)


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    license_number = models.CharField(max_length=20, blank=True, null=True)
    number_plate = models.CharField(max_length=20, blank=True, null=True)
    profile_picture = models.ImageField(
        upload_to="profile_pics/", blank=True, null=True
    )
    last_password_reset = models.DateTimeField(
        null=True, blank=True, help_text="When the password was last reset"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.user.username}'s Profile"


class Payment(models.Model):
    PAYMENT_STATUS = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    ]

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    payment_method = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=PAYMENT_STATUS, default="pending")
    transaction_id = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Payment for {self.booking}"


class WalletTransaction(models.Model):
    TRANSACTION_TYPES = [
        ("topup", "Top-up"),
        ("parking_charge", "Parking Charge"),
        ("adjustment", "Adjustment"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    booking = models.ForeignKey(
        Booking, on_delete=models.SET_NULL, null=True, blank=True
    )
    type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=50, blank=True, null=True)
    note = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        reference = f" booking {self.booking_id}" if self.booking_id else ""
        return f"{self.type} {self.amount} for user {self.user_id}{reference}"


class UserReport(models.Model):
    REPORT_TYPES = (
        ("user_report", "User Report"),
        ("system_alert", "System Alert"),
    )
    PRIORITIES = (
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
    )

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    message = models.TextField()
    type = models.CharField(max_length=32, choices=REPORT_TYPES, default="user_report")
    priority = models.CharField(max_length=16, choices=PRIORITIES, default="medium")
    status = models.CharField(max_length=16, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        short = (self.message or "").strip().splitlines()[0][:40]
        return f"{self.get_type_display()} · {short}"
