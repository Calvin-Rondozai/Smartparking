#!/usr/bin/env python3
"""
Notification system for parking app
Handles overtime alerts, booking completion, and user notifications
"""

import json
import requests
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

class NotificationService:
    """Service for sending notifications to users"""
    
    @staticmethod
    def send_overtime_alert(booking):
        """Send overtime alert notification"""
        try:
            # Calculate overtime
            overtime_minutes, overtime_cost = booking.calculate_overtime()
            
            # Prepare notification data
            notification_data = {
                'type': 'overtime_alert',
                'title': '🚨 Parking Time Expired!',
                'body': f'Your parking time at spot {booking.parking_spot.spot_number} has expired. '
                       f'You are being charged ${overtime_cost:.2f} for {overtime_minutes} minutes overtime.',
                'data': {
                    'booking_id': booking.id,
                    'spot_number': booking.parking_spot.spot_number,
                    'overtime_minutes': overtime_minutes,
                    'overtime_cost': float(overtime_cost),
                    'total_cost': float(booking.total_cost or 0),
                    'timestamp': timezone.now().isoformat()
                }
            }
            
            # Send to user's device (this would integrate with push notifications)
            NotificationService._send_push_notification(booking.user, notification_data)
            
            # Log the notification
            logger.info(f"Overtime alert sent for booking {booking.id}: {overtime_minutes} minutes, ${overtime_cost:.2f}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to send overtime alert for booking {booking.id}: {e}")
            return False
    
    @staticmethod
    def send_booking_completion_notification(booking):
        """Send notification when booking is completed"""
        try:
            total_cost = float(booking.total_cost or 0) + float(booking.overtime_cost or 0)
            
            notification_data = {
                'type': 'booking_completion',
                'title': '✅ Parking Session Complete',
                'body': f'Your parking session at spot {booking.parking_spot.spot_number} has ended. '
                       f'Total cost: ${total_cost:.2f}',
                'data': {
                    'booking_id': booking.id,
                    'spot_number': booking.parking_spot.spot_number,
                    'total_cost': total_cost,
                    'overtime_cost': float(booking.overtime_cost or 0),
                    'timestamp': timezone.now().isoformat()
                }
            }
            
            # Send to user's device
            NotificationService._send_push_notification(booking.user, notification_data)
            
            # Log the notification
            logger.info(f"Booking completion notification sent for booking {booking.id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to send booking completion notification for booking {booking.id}: {e}")
            return False
    
    @staticmethod
    def send_overtime_warning(booking, minutes_before_expiry=5):
        """Send warning notification before booking expires"""
        try:
            warning_time = booking.end_time - timedelta(minutes=minutes_before_expiry)
            
            if timezone.now() >= warning_time:
                notification_data = {
                    'type': 'overtime_warning',
                    'title': '⚠️ Parking Time Ending Soon',
                    'body': f'Your parking time at spot {booking.parking_spot.spot_number} '
                           f'expires in {minutes_before_expiry} minutes. Please move your vehicle.',
                    'data': {
                        'booking_id': booking.id,
                        'spot_number': booking.parking_spot.spot_number,
                        'minutes_remaining': minutes_before_expiry,
                        'expiry_time': booking.end_time.isoformat(),
                        'timestamp': timezone.now().isoformat()
                    }
                }
                
                # Send to user's device
                NotificationService._send_push_notification(booking.user, notification_data)
                
                # Log the notification
                logger.info(f"Overtime warning sent for booking {booking.id}")
                
                return True
                
        except Exception as e:
            logger.error(f"Failed to send overtime warning for booking {booking.id}: {e}")
            return False
    
    @staticmethod
    def _send_push_notification(user, notification_data):
        """Send push notification to user's device"""
        try:
            # This would integrate with your push notification service
            # (Firebase, OneSignal, etc.)
            
            # For now, we'll just log the notification
            logger.info(f"Push notification for user {user.username}: {notification_data['title']}")
            
            # You can implement actual push notification logic here:
            # - Get user's device tokens
            # - Send to Firebase/OneSignal
            # - Handle delivery status
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to send push notification: {e}")
            return False
    
    @staticmethod
    def send_iot_status_update(spot_number, status, message):
        """Send IoT status update notification"""
        try:
            notification_data = {
                'type': 'iot_status_update',
                'title': f'🔌 IoT Status Update - Spot {spot_number}',
                'body': message,
                'data': {
                    'spot_number': spot_number,
                    'status': status,
                    'timestamp': timezone.now().isoformat()
                }
            }
            
            # Log the IoT notification
            logger.info(f"IoT status update for spot {spot_number}: {status} - {message}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to send IoT status update for spot {spot_number}: {e}")
            return False

def send_overtime_notifications():
    """Send overtime notifications for all expired bookings"""
    from parking_app.models import Booking
    
    try:
        # Get all active expired bookings
        expired_bookings = Booking.objects.filter(
            status='active'
        ).exclude(
            end_time__gt=timezone.now()
        )
        
        notifications_sent = 0
        
        for booking in expired_bookings:
            # Send overtime alert
            if NotificationService.send_overtime_alert(booking):
                notifications_sent += 1
            
            # Send warning if within 5 minutes of expiry
            if NotificationService.send_overtime_warning(booking, 5):
                notifications_sent += 1
        
        logger.info(f"Sent {notifications_sent} overtime notifications")
        return notifications_sent
        
    except Exception as e:
        logger.error(f"Failed to send overtime notifications: {e}")
        return 0
