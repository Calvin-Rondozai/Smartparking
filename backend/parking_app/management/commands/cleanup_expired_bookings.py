from django.core.management.base import BaseCommand
from django.utils import timezone
from parking_app.models import Booking

class Command(BaseCommand):
    help = 'Mark expired bookings as completed and free up parking spots'

    def handle(self, *args, **options):
        # Get all active bookings that have expired
        expired_bookings = Booking.objects.filter(
            status='active',
            end_time__lt=timezone.now()
        )
        
        count = 0
        for booking in expired_bookings:
            if booking.mark_as_completed_if_expired():
                count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Marked booking {booking.id} as completed and freed spot {booking.parking_spot.spot_number}'
                    )
                )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully processed {count} expired bookings'
            )
        ) 