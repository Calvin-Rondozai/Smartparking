#!/usr/bin/env python3
"""
Django management command to automatically check and bill overtime bookings
This command should be run every minute via cron job or celery
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from parking_app.models import Booking
from parking_app.views import check_if_car_still_parked, trigger_esp32_booking_led
from parking_app.notifications import NotificationService
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Check and bill overtime bookings automatically'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))
        
        self.stdout.write('🕐 Checking for overtime bookings...')
        
        # Get all active bookings that have expired
        expired_bookings = Booking.objects.filter(
            status='active'
        ).exclude(
            end_time__gt=timezone.now()
        )
        
        if not expired_bookings.exists():
            self.stdout.write(self.style.SUCCESS('✅ No expired bookings found'))
            return
        
        self.stdout.write(f'📋 Found {expired_bookings.count()} expired bookings')
        
        processed_count = 0
        completed_count = 0
        billing_count = 0
        
        for booking in expired_bookings:
            try:
                self.stdout.write(f'  📍 Processing booking {booking.id} (Spot {booking.parking_spot.spot_number})')
                
                # Calculate overtime
                overtime_minutes, overtime_cost = booking.calculate_overtime()
                
                if overtime_minutes > 0:
                    self.stdout.write(f'    ⏰ Overtime: {overtime_minutes} minutes (${overtime_cost:.2f})')
                    
                    if not dry_run:
                        # Update overtime billing
                        booking.update_overtime_billing()
                        
                        # Check if car is still parked
                        is_still_parked = check_if_car_still_parked(booking.parking_spot)
                        
                        if is_still_parked:
                            self.stdout.write(f'    🚗 Car still parked - continuing overtime billing')
                            billing_count += 1
                            
                            # Send overtime alert notification
                            NotificationService.send_overtime_alert(booking)
                            
                            # Turn on red light (overtime warning)
                            try:
                                trigger_esp32_booking_led(booking.parking_spot.spot_number, True)
                                self.stdout.write(f'    🔴 Red light activated for overtime')
                            except Exception as e:
                                self.stdout.write(f'    ⚠️  Failed to activate red light: {e}')
                        else:
                            self.stdout.write(f'    🚗 Car has left - completing booking')
                            
                            # Mark as completed
                            with transaction.atomic():
                                booking.status = 'completed'
                                booking.parking_spot.is_occupied = False
                                booking.parking_spot.save()
                                booking.save()
                            
                            # Send completion notification
                            NotificationService.send_booking_completion_notification(booking)
                            
                            # Turn off lights
                            try:
                                trigger_esp32_booking_led(booking.parking_spot.spot_number, False)
                                self.stdout.write(f'    🔵 Lights turned off')
                            except Exception as e:
                                self.stdout.write(f'    ⚠️  Failed to turn off lights: {e}')
                            
                            completed_count += 1
                    else:
                        self.stdout.write(f'    🚗 Would check car occupancy and update billing')
                        billing_count += 1
                
                processed_count += 1
                
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'    ❌ Error processing booking {booking.id}: {e}')
                )
        
        # Summary
        self.stdout.write('\n📊 Summary:')
        self.stdout.write(f'  📋 Total processed: {processed_count}')
        self.stdout.write(f'  💰 Overtime billing: {billing_count}')
        self.stdout.write(f'  ✅ Completed: {completed_count}')
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\n💡 This was a dry run. Run without --dry-run to apply changes.'))
        else:
            self.stdout.write(self.style.SUCCESS('\n✅ Overtime check completed successfully!'))
