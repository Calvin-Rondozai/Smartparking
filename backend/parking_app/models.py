from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator

class ParkingLot(models.Model):
    name = models.CharField(max_length=100)
    address = models.TextField()
    total_spots = models.IntegerField()
    hourly_rate = models.DecimalField(max_digits=6, decimal_places=2)
    rating = models.DecimalField(max_digits=3, decimal_places=1, default=4.5)  # Added to match frontend
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
        ('regular', 'Regular'),
        ('handicap', 'Handicap'),
        ('electric', 'Electric Vehicle'),
        ('reserved', 'Reserved'),
    ]
    
    parking_lot = models.ForeignKey(ParkingLot, on_delete=models.CASCADE)
    spot_number = models.CharField(max_length=10)
    spot_type = models.CharField(max_length=20, choices=SPOT_TYPES, default='regular')
    is_occupied = models.BooleanField(default=False)
    is_reserved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['parking_lot', 'spot_number']

    def __str__(self):
        return f"{self.parking_lot.name} - Spot {self.spot_number}"

class Booking(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    parking_spot = models.ForeignKey(ParkingSpot, on_delete=models.CASCADE)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    duration_minutes = models.IntegerField(default=0)  # Added to match frontend
    vehicle_name = models.CharField(max_length=50, blank=True)  # Added to match frontend
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    total_cost = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} - {self.parking_spot}"

    def save(self, *args, **kwargs):
        if not self.total_cost and self.start_time and self.end_time:
            duration = self.end_time - self.start_time
            hours = duration.total_seconds() / 3600
            self.total_cost = hours * self.parking_spot.parking_lot.hourly_rate
        super().save(*args, **kwargs)

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    phone_number = models.CharField(max_length=15, blank=True)
    license_plate = models.CharField(max_length=20, blank=True)
    car_name = models.CharField(max_length=50, blank=True)  # Added to match frontend
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user.username

class Payment(models.Model):
    PAYMENT_STATUS = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]
    
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    payment_method = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=PAYMENT_STATUS, default='pending')
    transaction_id = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Payment for {self.booking}"
