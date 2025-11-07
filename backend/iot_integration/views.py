from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import datetime, timedelta
import json
from decimal import Decimal, ROUND_HALF_UP

from .models import IoTDevice, SensorData, DeviceLog
from .serializers import (
    IoTDeviceSerializer,
    SensorDataSerializer,
    DeviceLogSerializer,
    IoTDeviceCreateSerializer,
    SensorDataCreateSerializer,
)
from parking_app.models import ParkingSpot, UserReport


def check_unauthorized_parking(spot):
    """Check if someone parked without a booking and create admin alert"""
    try:
        from parking_app.models import Booking

        # Check if there's an active booking for this spot
        active_booking = Booking.objects.filter(
            parking_spot=spot, status="active", timer_started__isnull=False
        ).first()

        if not active_booking:
            # No active booking found - this is unauthorized parking
            alert_message = f"🚨 UNAUTHORIZED PARKING DETECTED: Car parked in {spot.spot_number} without a booking. Immediate attention required!"

            # Create admin alert
            UserReport.objects.create(
                user=None,  # System alert
                message=alert_message,
                type="system_alert",
                priority="high",
                status="pending",
            )

            print(
                f"🚨 UNAUTHORIZED PARKING ALERT: {spot.spot_number} occupied without booking"
            )

    except Exception as e:
        print(f"Error checking unauthorized parking: {e}")


def check_grace_period_expiration():
    """Check for all bookings with expired grace periods and cancel them (like mobile app)"""
    try:
        from parking_app.models import Booking
        from chatbot.views import send_whatsapp_message

        now = timezone.now()
        # Hardcoded number for proof of concept
        test_phone = "+263713291359"

        # Find all active bookings with grace period started but timer not started yet
        # These are bookings in the grace period
        grace_period_bookings = Booking.objects.filter(
            status="active",
            grace_period_started__isnull=False,
            timer_started__isnull=True,  # Timer hasn't started yet
            grace_period_ended__isnull=True,  # Grace period hasn't been marked as ended
        ).select_related("user", "parking_spot")

        cancelled_count = 0
        for booking in grace_period_bookings:
            # Check if grace period has expired (20 seconds - same as mobile app)
            if booking.grace_period_started:
                grace_elapsed = (now - booking.grace_period_started).total_seconds()

                if grace_elapsed > 20:
                    # Grace period expired - cancel booking (exactly like mobile app detect_car_parked)
                    print(
                        f"❌ [Grace Period] Expired for booking {booking.id} (user: {booking.user.username}) - {grace_elapsed:.1f}s elapsed. Cancelling booking."
                    )

                    slot_name = booking.parking_spot.spot_number

                    # Cancel the booking (same as mobile app detect_car_parked endpoint)
                    booking.status = "cancelled"
                    booking.grace_period_ended = now
                    booking.save(update_fields=["status", "grace_period_ended"])

                    # Free up the parking spot (same as mobile app)
                    if booking.parking_spot:
                        spot = booking.parking_spot
                        spot.is_occupied = False
                        spot.save(update_fields=["is_occupied"])
                        print(
                            f"✅ Freed up parking spot {spot.spot_number} after grace period expired"
                        )

                    # Turn off LED (same as mobile app)
                    try:
                        from parking_app.views import trigger_esp32_booking_led

                        trigger_esp32_booking_led(slot_name, False)
                    except Exception as e:
                        print(f"⚠️ Error turning off LED: {e}")

                    # Clear device metadata
                    try:
                        from iot_integration.models import IoTDevice

                        device = IoTDevice.objects.filter(device_type="sensor").first()
                        if device:
                            metadata = device.metadata or {}
                            if slot_name == "Slot A":
                                metadata["slot1_booked"] = False
                                metadata["slot1_led_state"] = "off"
                            elif slot_name == "Slot B":
                                metadata["slot2_booked"] = False
                                metadata["slot2_led_state"] = "off"
                            device.metadata = metadata
                            device.save(update_fields=["metadata"])
                    except Exception as e:
                        print(f"⚠️ Error clearing metadata: {e}")

                    # Send WhatsApp notification (proof of concept: always use hardcoded number)
                    is_whatsapp_user = booking.user.username.startswith("whatsapp_")
                    print(
                        f"🔍 [Grace Period] Booking {booking.id} - username: '{booking.user.username}', is_whatsapp_user: {is_whatsapp_user}"
                    )

                    # Proof of concept: Always use hardcoded test phone number
                    phone_to_use = test_phone
                    print(
                        f"📱 [Grace Period] Using hardcoded test phone for proof of concept: {phone_to_use}"
                    )

                    # Send notification (always send for proof of concept)
                    if phone_to_use:

                        # Format slot name for display
                        if slot_name == "Slot A":
                            display_slot = "Jason Moyo Ave (Slot A)"
                        elif slot_name == "Slot B":
                            display_slot = "Nelson Mandela Ave (Slot B)"
                        else:
                            display_slot = slot_name

                        message = (
                            f"❌ Booking Cancelled\n\n"
                            f"📍 Slot: {display_slot}\n"
                            f"⏱️ Your 20-second grace period has expired.\n"
                            f"🚗 Your car was not detected within the grace period.\n\n"
                            f"Your booking has been cancelled. Please book again when you're ready to park."
                        )

                        print(
                            f"📱 [Grace Period] Attempting to send WhatsApp notification to {phone_to_use} for booking {booking.id}"
                        )
                        print(f"📱 [Grace Period] Message preview: {message[:100]}...")

                        try:
                            result = send_whatsapp_message(phone_to_use, message)
                            if result:
                                print(
                                    f"✅ [Grace Period] Cancellation notification sent successfully for booking {booking.id} to {phone_to_use}"
                                )
                            else:
                                print(
                                    f"❌ [Grace Period] Failed to send cancellation notification - send_whatsapp_message returned False for booking {booking.id} to {phone_to_use}"
                                )
                                print(
                                    f"❌ [Grace Period] Check Twilio credentials and phone number format"
                                )
                        except Exception as e:
                            print(
                                f"❌ [Grace Period] Exception while sending WhatsApp notification to {phone_to_use}: {e}"
                            )
                            import traceback

                            traceback.print_exc()
                    else:
                        print(
                            f"ℹ️ [Grace Period] Booking {booking.id} - No phone number found for user '{booking.user.username}', skipping WhatsApp notification"
                        )

                    cancelled_count += 1

        if cancelled_count > 0:
            print(
                f"✅ [Grace Period] Cancelled {cancelled_count} booking(s) due to expired grace period"
            )

    except Exception as e:
        print(f"⚠️ Error checking grace period expiration: {e}")
        import traceback

        traceback.print_exc()


def _auto_complete_booking_for_slot(spot_number):
    """Auto-complete active booking when IoT detects car left the slot"""
    try:
        from parking_app.models import Booking

        # Find active booking for this slot
        try:
            spot = ParkingSpot.objects.get(spot_number=spot_number)
            booking = Booking.objects.get(
                parking_spot=spot, status="active", timer_started__isnull=False
            )
        except (ParkingSpot.DoesNotExist, Booking.DoesNotExist):
            print(f"No active booking found for {spot_number}")
            return

        print(
            f"🚗 Auto-completing booking {booking.id} for {spot_number} - car left detected"
        )

        # Calculate final cost based on actual parked duration
        now = timezone.now()

        # Ensure timer_started exists (should always exist if we got here, but safety check)
        if not booking.timer_started:
            booking.timer_started = booking.start_time or now
            booking.save(update_fields=["timer_started"])

        elapsed_seconds = max(0, int((now - booking.timer_started).total_seconds()))

        # Calculate cost at $1 per 30 seconds
        per_second = Decimal("1") / Decimal("30")
        final_cost = (per_second * Decimal(str(elapsed_seconds))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

        # Calculate parking duration for receipt
        duration_minutes = elapsed_seconds // 60
        duration_remaining_seconds = elapsed_seconds % 60
        duration_hours = duration_minutes // 60
        duration_remaining_minutes = duration_minutes % 60

        # Format duration string
        if duration_hours > 0:
            duration_str = f"{duration_hours}h {duration_remaining_minutes}m {duration_remaining_seconds}s"
        elif duration_minutes > 0:
            duration_str = f"{duration_minutes}m {duration_remaining_seconds}s"
        else:
            duration_str = f"{duration_remaining_seconds}s"

        # Deduct from wallet BEFORE marking as completed
        try:
            from parking_app.views import deduct_from_wallet
            from parking_app.models import UserProfile

            # Get current balance before deduction
            profile, _ = UserProfile.objects.get_or_create(user=booking.user)
            old_balance = profile.balance or Decimal("0.00")

            # Deduct final cost from wallet
            deduction_result = deduct_from_wallet(
                user=booking.user,
                booking=booking,
                amount=final_cost,
                note=f"Parking charge - {duration_str} at $1/30s",
            )

            # Get new balance after deduction
            profile.refresh_from_db()
            new_balance = profile.balance or Decimal("0.00")

            print(
                f"💳 [Auto-complete] Deducted ${final_cost} from wallet for booking {booking.id}"
            )
            print(f"💳 [Auto-complete] Balance: ${old_balance} → ${new_balance}")
        except Exception as e:
            print(f"⚠️ [Auto-complete] Error deducting from wallet: {e}")
            import traceback

            traceback.print_exc()
            # Continue even if wallet deduction fails

        # Update booking and free up the slot IMMEDIATELY (priority: speed)
        slot_number = booking.parking_spot.spot_number

        # Mark booking as completed FIRST (so active_bookings endpoint immediately excludes it)
        booking.total_cost = float(final_cost)
        booking.status = "completed"
        booking.end_time = now  # Set actual end time
        booking.completed_at = now  # Set completion timestamp
        booking.duration_minutes = duration_minutes  # Store duration in minutes
        booking.save(
            update_fields=[
                "total_cost",
                "status",
                "end_time",
                "completed_at",
                "duration_minutes",
            ]
        )

        # Free up the parking spot immediately
        try:
            if booking.parking_spot:
                spot = booking.parking_spot
                spot.is_occupied = False
                spot.save(update_fields=["is_occupied"])
                print(
                    f"✅ Freed up parking spot {spot.spot_number} after IoT detected car left"
                )
            else:
                print(f"⚠️ Booking {booking.id} has no parking_spot assigned")
        except Exception as e:
            print(f"❌ ERROR: Failed to free up parking spot: {e}")
            import traceback

            traceback.print_exc()

        # Clear booking state in device metadata immediately (ESP32 reads this on next poll)
        try:
            from iot_integration.models import IoTDevice

            device = IoTDevice.objects.filter(device_type="sensor").first()
            if device:
                metadata = device.metadata or {}
                if slot_number == "Slot A":
                    metadata["slot1_booked"] = False
                    metadata["slot1_led_state"] = "off"
                elif slot_number == "Slot B":
                    metadata["slot2_booked"] = False
                    metadata["slot2_led_state"] = "off"
                device.metadata = metadata
                device.save(update_fields=["metadata"])
                print(
                    f"✅ Cleared booking state in metadata for {slot_number} (immediate)"
                )
        except Exception as e:
            print(f"⚠️ Error clearing metadata: {e}")

        # Trigger LED notification (non-blocking)
        try:
            from parking_app.views import trigger_esp32_booking_led

            trigger_esp32_booking_led(slot_number, False)
        except Exception as e:
            print(f"⚠️ LED notification error: {e}")

        # WhatsApp notification: Send receipt when car leaves (for all bookings)
        # Proof of concept: Send to hardcoded number +263713291359
        try:
            from chatbot.views import send_whatsapp_message
            from parking_app.models import UserProfile

            # Hardcoded number for proof of concept
            test_phone = "+263713291359"

            # Format slot name for display
            slot_name = booking.parking_spot.spot_number
            if slot_name == "Slot A":
                display_slot = "Jason Moyo Ave (Slot A)"
            elif slot_name == "Slot B":
                display_slot = "Nelson Mandela Ave (Slot B)"
            else:
                display_slot = slot_name

            # Get final balance after deduction
            try:
                profile = UserProfile.objects.get(user=booking.user)
                final_balance = float(profile.balance or 0)
            except:
                final_balance = 0.00

            # Format receipt message
            message = (
                f"📋 Parking Receipt\n\n"
                f"📍 Slot: {display_slot}\n"
                f"🕐 Parking Duration: {duration_str}\n"
                f"💰 Total Cost: ${final_cost:.2f}\n"
                f"💳 Wallet Balance: ${final_balance:.2f}\n\n"
                f"✅ Thank you for using Smart Parking!\n"
                f"🚗 Drive safely!"
            )

            print(
                f"📱 [Auto-complete] Sending receipt notification to {test_phone} for booking {booking.id}"
            )
            print(
                f"📱 [Auto-complete] Receipt details: Duration={duration_str}, Cost=${final_cost:.2f}"
            )

            result = send_whatsapp_message(test_phone, message)
            if result:
                print(
                    f"✅ [Auto-complete] Receipt notification sent successfully for booking {booking.id}!"
                )
            else:
                print(
                    f"⚠️ [Auto-complete] Receipt notification failed to send for booking {booking.id}"
                )
        except Exception as e:
            print(f"⚠️ [Auto-complete] Error sending receipt notification: {e}")
            import traceback

            traceback.print_exc()

        print(
            f"✅ Booking {booking.id} completed - Duration: {duration_str}, Cost: ${final_cost:.2f}"
        )

    except Exception as e:
        print(f"Error auto-completing booking for {spot_number}: {e}")


@api_view(["POST"])
@permission_classes([AllowAny])
def register_device(request):
    """Register a new IoT device"""
    try:
        serializer = IoTDeviceCreateSerializer(data=request.data)
        if serializer.is_valid():
            device = serializer.save()
            DeviceLog.objects.create(
                device=device,
                log_type="info",
                message=f"Device registered successfully",
            )
            return Response(
                {
                    "message": "Device registered successfully",
                    "device": IoTDeviceSerializer(device).data,
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([AllowAny])
def sensor_data(request):
    """Receive sensor data from ESP32 devices"""
    try:
        print("SENSOR DATA RECEIVED:", request.data)

        device_id = request.data.get("device_id")
        if not device_id:
            return Response(
                {"error": "device_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            device = IoTDevice.objects.get(device_id=device_id, is_active=True)
        except IoTDevice.DoesNotExist:
            return Response(
                {"error": "Device not found or inactive"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Update device last seen
        device.last_seen = timezone.now()
        device.save()

        # Create sensor data
        sensor_data = {
            "device": device.id,
            "is_occupied": request.data.get("is_occupied", False),
            "distance_cm": request.data.get("distance_cm"),
            "battery_level": request.data.get("battery_level"),
            "signal_strength": request.data.get("signal_strength"),
            "temperature": request.data.get("temperature"),
            "humidity": request.data.get("humidity"),
            "slot1_occupied": request.data.get("slot1_occupied"),
            "slot2_occupied": request.data.get("slot2_occupied"),
            "ir_alert": request.data.get("ir_alert"),
        }

        # Handle dual sensor data if available (only if columns exist)
        try:
            slot1_occupied = request.data.get("slot1_occupied")
            slot2_occupied = request.data.get("slot2_occupied")
            ir_alert = request.data.get("ir_alert")

            if slot1_occupied is not None:
                sensor_data["slot1_occupied"] = slot1_occupied
            if slot2_occupied is not None:
                sensor_data["slot2_occupied"] = slot2_occupied
            if ir_alert is not None:
                sensor_data["ir_alert"] = ir_alert
        except:
            # If dual sensor fields don't exist, skip them
            pass

        # Check for expired grace periods (for WhatsApp bookings)
        check_grace_period_expiration()

        # Update parking spots based on dual sensor data
        from parking_app.models import ParkingLot, ParkingSpot

        try:
            lot = ParkingLot.objects.get(name="IoT Smart Parking")
            slot1_occupied = request.data.get("slot1_occupied")
            slot2_occupied = request.data.get("slot2_occupied")

            # Update Slot A
            if slot1_occupied is not None:
                try:
                    slot_a = ParkingSpot.objects.get(
                        parking_lot=lot, spot_number="Slot A"
                    )
                    was_occupied = slot_a.is_occupied
                    slot_a.is_occupied = slot1_occupied
                    slot_a.save()
                    print(
                        f"Updated Slot A: {'Occupied' if slot1_occupied else 'Available'}"
                    )

                    # Detect car parked: Slot transition from Available → Occupied
                    if not was_occupied and slot1_occupied:
                        # Slot just became occupied - check for active booking and notify user
                        print(f"🔍 [Slot A] Detected transition: Available → Occupied")
                        try:
                            from parking_app.models import Booking
                            from chatbot.views import send_whatsapp_message

                            # Check for active booking (including those with grace period)
                            active_booking = Booking.objects.filter(
                                parking_spot=slot_a, status="active"
                            ).first()

                            if active_booking:
                                print(
                                    f"🔍 [Slot A] Found active booking {active_booking.id} for user {active_booking.user.username}"
                                )

                                # Start the timer if it hasn't been started yet
                                now = timezone.now()
                                timer_was_started = (
                                    active_booking.timer_started is not None
                                )

                                if not active_booking.timer_started:
                                    # Car just parked - start the timer
                                    active_booking.timer_started = now
                                    if active_booking.grace_period_started:
                                        active_booking.grace_period_ended = now
                                    active_booking.last_billing_at = now
                                    active_booking.save(
                                        update_fields=[
                                            "timer_started",
                                            "grace_period_ended",
                                            "last_billing_at",
                                        ]
                                    )
                                    print(
                                        f"⏰ [Slot A] Timer started for booking {active_booking.id} - Car detected!"
                                    )

                                    # Format slot name for display
                                    slot_name = slot_a.spot_number
                                    if slot_name == "Slot A":
                                        display_slot = "Jason Moyo Ave (Slot A)"
                                    elif slot_name == "Slot B":
                                        display_slot = "Nelson Mandela Ave (Slot B)"
                                    else:
                                        display_slot = slot_name

                                    # Send WhatsApp notification to all bookings (proof of concept)
                                    # Hardcoded number for proof of concept
                                    test_phone = "+263713291359"

                                    message = (
                                        f"✅ Car Parked Successfully!\n\n"
                                        f"📍 Slot: {display_slot}\n"
                                        f"🚗 Your car has been detected.\n"
                                        f"⏰ Parking timer has started.\n"
                                        f"💰 You'll be charged $1 per 30 seconds.\n\n"
                                        f"Thank you for using Smart Parking! 🚗"
                                    )

                                    print(
                                        f"📱 [Slot A] Sending parking notification to {test_phone} for booking {active_booking.id}"
                                    )

                                    try:
                                        result = send_whatsapp_message(
                                            test_phone, message
                                        )
                                        if result:
                                            print(
                                                f"✅ [Slot A] Parking notification sent successfully!"
                                            )
                                        else:
                                            print(
                                                f"⚠️ [Slot A] Parking notification failed to send"
                                            )
                                    except Exception as e:
                                        print(
                                            f"⚠️ [Slot A] Error sending parking notification: {e}"
                                        )
                                        import traceback

                                        traceback.print_exc()
                                else:
                                    print(
                                        f"ℹ️ [Slot A] Timer already started for booking {active_booking.id} (car was already detected)"
                                    )
                            else:
                                print(
                                    f"ℹ️ [Slot A] No active booking found - unauthorized parking detected"
                                )
                                # Check for unauthorized parking
                                check_unauthorized_parking(slot_a)
                        except Exception as e:
                            print(f"⚠️ [Slot A] Error processing car detection: {e}")
                            import traceback

                            traceback.print_exc()

                    # Auto-complete booking if slot became free and there's an active booking
                    # LED changed from red to green (car left) - release slot and notify
                    if was_occupied and not slot1_occupied:
                        # Auto-complete booking (this will free the slot and send WhatsApp notification for WhatsApp bookings)
                        _auto_complete_booking_for_slot("Slot A")

                except ParkingSpot.DoesNotExist:
                    print("Slot A not found")

            # Update Slot B
            if slot2_occupied is not None:
                try:
                    slot_b = ParkingSpot.objects.get(
                        parking_lot=lot, spot_number="Slot B"
                    )
                    was_occupied = slot_b.is_occupied
                    slot_b.is_occupied = slot2_occupied
                    slot_b.save()
                    print(
                        f"Updated Slot B: {'Occupied' if slot2_occupied else 'Available'}"
                    )

                    # Detect car parked: Slot transition from Available → Occupied
                    if not was_occupied and slot2_occupied:
                        # Slot just became occupied - check for active booking and notify user
                        print(f"🔍 [Slot B] Detected transition: Available → Occupied")
                        try:
                            from parking_app.models import Booking
                            from chatbot.views import send_whatsapp_message

                            # Check for active booking (including those with grace period)
                            active_booking = Booking.objects.filter(
                                parking_spot=slot_b, status="active"
                            ).first()

                            if active_booking:
                                print(
                                    f"🔍 [Slot B] Found active booking {active_booking.id} for user {active_booking.user.username}"
                                )

                                # Start the timer if it hasn't been started yet
                                now = timezone.now()
                                timer_was_started = (
                                    active_booking.timer_started is not None
                                )

                                if not active_booking.timer_started:
                                    # Car just parked - start the timer
                                    active_booking.timer_started = now
                                    if active_booking.grace_period_started:
                                        active_booking.grace_period_ended = now
                                    active_booking.last_billing_at = now
                                    active_booking.save(
                                        update_fields=[
                                            "timer_started",
                                            "grace_period_ended",
                                            "last_billing_at",
                                        ]
                                    )
                                    print(
                                        f"⏰ [Slot B] Timer started for booking {active_booking.id} - Car detected!"
                                    )

                                    # Format slot name for display
                                    slot_name = slot_b.spot_number
                                    if slot_name == "Slot A":
                                        display_slot = "Jason Moyo Ave (Slot A)"
                                    elif slot_name == "Slot B":
                                        display_slot = "Nelson Mandela Ave (Slot B)"
                                    else:
                                        display_slot = slot_name

                                    # Send WhatsApp notification to all bookings (proof of concept)
                                    # Hardcoded number for proof of concept
                                    test_phone = "+263713291359"

                                    message = (
                                        f"✅ Car Parked Successfully!\n\n"
                                        f"📍 Slot: {display_slot}\n"
                                        f"🚗 Your car has been detected.\n"
                                        f"⏰ Parking timer has started.\n"
                                        f"💰 You'll be charged $1 per 30 seconds.\n\n"
                                        f"Thank you for using Smart Parking! 🚗"
                                    )

                                    print(
                                        f"📱 [Slot B] Sending parking notification to {test_phone} for booking {active_booking.id}"
                                    )

                                    try:
                                        result = send_whatsapp_message(
                                            test_phone, message
                                        )
                                        if result:
                                            print(
                                                f"✅ [Slot B] Parking notification sent successfully!"
                                            )
                                        else:
                                            print(
                                                f"⚠️ [Slot B] Parking notification failed to send"
                                            )
                                    except Exception as e:
                                        print(
                                            f"⚠️ [Slot B] Error sending parking notification: {e}"
                                        )
                                        import traceback

                                        traceback.print_exc()
                                else:
                                    print(
                                        f"ℹ️ [Slot B] Timer already started for booking {active_booking.id} (car was already detected)"
                                    )
                            else:
                                print(
                                    f"ℹ️ [Slot B] No active booking found - unauthorized parking detected"
                                )
                                # Check for unauthorized parking
                                check_unauthorized_parking(slot_b)
                        except Exception as e:
                            print(f"⚠️ [Slot B] Error processing car detection: {e}")
                            import traceback

                            traceback.print_exc()

                    # Auto-complete booking if slot became free and there's an active booking
                    # LED changed from red to green (car left) - release slot and notify
                    if was_occupied and not slot2_occupied:
                        # Auto-complete booking (this will free the slot and send WhatsApp notification for WhatsApp bookings)
                        _auto_complete_booking_for_slot("Slot B")

                except ParkingSpot.DoesNotExist:
                    print("Slot B not found")

        except ParkingLot.DoesNotExist:
            print("IoT Smart Parking lot not found")

        serializer = SensorDataCreateSerializer(data=sensor_data)
        if serializer.is_valid():
            sensor_data_obj = serializer.save()

            # Log the data
            DeviceLog.objects.create(
                device=device,
                log_type="info",
                message=f'Sensor data received: {"Occupied" if sensor_data["is_occupied"] else "Empty"}',
            )

            return Response(
                {
                    "message": "Sensor data received successfully",
                    "data": SensorDataSerializer(sensor_data_obj).data,
                },
                status=status.HTTP_201_CREATED,
            )

        print("SERIALIZER ERRORS:", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    except Exception as e:
        print("SENSOR DATA ERROR:", e)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_devices(request):
    """Get all IoT devices"""
    try:
        devices = IoTDevice.objects.filter(is_active=True)
        # Use a simpler serializer without nested objects
        data = []
        for device in devices:
            data.append(
                {
                    "id": device.id,
                    "device_id": device.device_id,
                    "device_type": device.device_type,
                    "name": device.name,
                    "location": device.location,
                    "ip_address": device.ip_address,
                    "mac_address": device.mac_address,
                    "is_active": device.is_active,
                    "last_seen": device.last_seen,
                    "created_at": device.created_at,
                }
            )
        return Response(data)
    except Exception as e:
        print("GET_DEVICES ERROR:", e)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_device_data(request, device_id):
    """Get sensor data for a specific device"""
    try:
        device = IoTDevice.objects.get(device_id=device_id)
        sensor_data = SensorData.objects.filter(device=device).order_by("-timestamp")[
            :50
        ]
        serializer = SensorDataSerializer(sensor_data, many=True)
        return Response(serializer.data)
    except IoTDevice.DoesNotExist:
        return Response({"error": "Device not found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_parking_availability(request):
    """Get real-time parking availability from IoT sensors"""
    try:
        # Check if any IoT devices are connected and sending recent data
        from django.utils import timezone
        from parking_app.models import ParkingLot, ParkingSpot

        # Check for recent sensor data (within last 60 seconds)
        recent_sensor_data = SensorData.objects.filter(
            timestamp__gte=timezone.now() - timedelta(seconds=60)
        ).exists()

        if not recent_sensor_data:
            # No recent sensor data - ESP32 is offline
            return Response(
                {
                    "total_spots": 0,
                    "available_spots": 0,
                    "occupied_spots": 0,
                    "spots": [],
                    "offline": True,
                    "message": "ESP32 sensors offline - no real-time data available",
                },
                status=status.HTTP_200_OK,
            )

        # ESP32 is online - get real-time data
        try:
            lot = ParkingLot.objects.get(name="IoT Smart Parking")
        except ParkingLot.DoesNotExist:
            # Create the parking lot if it doesn't exist
            lot = ParkingLot.objects.create(
                name="IoT Smart Parking",
                address="IoT Smart Parking Location",
                total_spots=2,
            )
            print(f"Created parking lot: {lot.name}")

        # Get or create parking spots
        spots = []
        for slot_name in ["Slot A", "Slot B"]:
            spot, created = ParkingSpot.objects.get_or_create(
                parking_lot=lot,
                spot_number=slot_name,
                defaults={
                    "name": slot_name,
                    "is_occupied": False,
                    "price_per_hour": 2.50,
                },
            )
            if created:
                print(f"Created parking spot: {slot_name}")
            spots.append(spot)

        # Update slot availability based on latest sensor data
        devices = IoTDevice.objects.filter(is_active=True)
        for i, device in enumerate(devices):
            latest_data = (
                SensorData.objects.filter(device=device).order_by("-timestamp").first()
            )
            if latest_data:
                # Only update if sensor data is recent (within last 60 seconds)
                time_diff = timezone.now() - latest_data.timestamp
                if time_diff.total_seconds() < 60:  # Update if data is recent
                    slot_name = f"Slot {'A' if i == 0 else 'B'}"
                    try:
                        spot = ParkingSpot.objects.get(
                            parking_lot=lot, spot_number=slot_name
                        )

                        # Store previous occupancy state
                        was_occupied = spot.is_occupied

                        # Use the dual sensor data if available
                        if (
                            hasattr(latest_data, "slot1_occupied")
                            and latest_data.slot1_occupied is not None
                        ):
                            if i == 0:  # Slot A
                                spot.is_occupied = latest_data.slot1_occupied
                            elif i == 1:  # Slot B
                                spot.is_occupied = (
                                    latest_data.slot2_occupied
                                    if hasattr(latest_data, "slot2_occupied")
                                    else latest_data.is_occupied
                                )
                        else:
                            # Fallback to general occupancy
                            spot.is_occupied = latest_data.is_occupied

                        spot.save()

                        # Check for unauthorized parking (car detected but no active booking)
                        if spot.is_occupied and not was_occupied:
                            check_unauthorized_parking(spot)

                        print(
                            f"Updated {slot_name}: {'Occupied' if spot.is_occupied else 'Available'}"
                        )
                    except ParkingSpot.DoesNotExist:
                        print(f"Parking spot {slot_name} not found")
                        pass

        # Get updated spots data
        spots = ParkingSpot.objects.filter(parking_lot=lot)
        total_spots = spots.count()
        available_spots = spots.filter(is_occupied=False).count()
        occupied_spots = spots.filter(is_occupied=True).count()

        spots_data = []
        for spot in spots:
            spots_data.append(
                {
                    "id": spot.id,
                    "spot_number": spot.spot_number,
                    "is_available": not spot.is_occupied,
                    "name": spot.spot_number,
                }
            )

        return Response(
            {
                "total_spots": total_spots,
                "available_spots": available_spots,
                "occupied_spots": occupied_spots,
                "spots": spots_data,
                "offline": False,
                "message": "Real-time data from ESP32 sensors",
            }
        )

    except Exception as e:
        print(f"Error getting parking availability: {e}")
        return Response(
            {
                "total_spots": 2,
                "available_spots": 2,
                "occupied_spots": 0,
                "spots": [
                    {
                        "id": 1,
                        "spot_number": "Slot A",
                        "is_available": True,
                        "name": "Slot A",
                    },
                    {
                        "id": 2,
                        "spot_number": "Slot B",
                        "is_available": True,
                        "name": "Slot B",
                    },
                ],
            }
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def test_occupancy(request):
    """Test endpoint to manually set slot occupancy for testing"""
    try:
        from parking_app.models import ParkingLot, ParkingSpot

        slot_name = request.data.get("slot_name")  # 'Slot A' or 'Slot B'
        is_occupied = request.data.get("is_occupied", False)

        if not slot_name:
            return Response(
                {"error": "slot_name is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            lot = ParkingLot.objects.get(name="IoT Smart Parking")
            spot = ParkingSpot.objects.get(parking_lot=lot, spot_number=slot_name)
            spot.is_occupied = is_occupied
            spot.save()

            print(
                f"TEST: Set {slot_name} to {'Occupied' if is_occupied else 'Available'}"
            )

            return Response(
                {
                    "message": f'{slot_name} set to {"Occupied" if is_occupied else "Available"}',
                    "slot": slot_name,
                    "is_occupied": is_occupied,
                }
            )

        except ParkingLot.DoesNotExist:
            return Response(
                {"error": "IoT Smart Parking lot not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ParkingSpot.DoesNotExist:
            return Response(
                {"error": f"Slot {slot_name} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([AllowAny])
def device_heartbeat(request):
    """Device heartbeat to check connectivity"""
    try:
        device_id = request.data.get("device_id")
        if not device_id:
            return Response(
                {"error": "device_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            device = IoTDevice.objects.get(device_id=device_id)
            device.last_seen = timezone.now()
            device.save()

            return Response(
                {"message": "Heartbeat received", "timestamp": device.last_seen}
            )
        except IoTDevice.DoesNotExist:
            return Response(
                {"error": "Device not found"}, status=status.HTTP_404_NOT_FOUND
            )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([AllowAny])
def control_esp32_booking(request):
    """Control ESP32 booking states (blue light)"""
    try:
        device_id = request.data.get("device_id")
        slot_number = request.data.get("slot_number")  # 'Slot A' or 'Slot B'
        led_state = request.data.get("led_state")
        is_booked = request.data.get("is_booked")

        # Determine is_booked from led_state if not provided
        if is_booked is None:
            if led_state == "blue":
                is_booked = True
            elif led_state == "off" or led_state is False:
                is_booked = False
            else:
                # Default to True for red (overtime) or other states
                is_booked = True

        if not device_id or not slot_number:
            return Response(
                {"error": "device_id and slot_number are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            device = IoTDevice.objects.get(device_id=device_id, is_active=True)
        except IoTDevice.DoesNotExist:
            return Response(
                {"error": "Device not found or inactive"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Store booking state in device metadata for ESP32 to read
        metadata = device.metadata or {}
        if slot_number == "Slot A":
            metadata["slot1_booked"] = is_booked
            if led_state:
                metadata["slot1_led_state"] = led_state
        elif slot_number == "Slot B":
            metadata["slot2_booked"] = is_booked
            if led_state:
                metadata["slot2_led_state"] = led_state

        device.metadata = metadata
        device.save()

        DeviceLog.objects.create(
            device=device,
            log_type="info",
            message=f'Booking state updated: {slot_number} = {"Booked" if is_booked else "Available"} (LED: {led_state or "N/A"})',
        )

        return Response(
            {
                "message": f"{slot_number} booking state updated successfully",
                "slot_number": slot_number,
                "is_booked": is_booked,
                "led_state": led_state,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        import traceback

        error_trace = traceback.format_exc()
        print(f"❌ ESP32 LED control error: {e}")
        print(f"Traceback: {error_trace}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST", "GET"])
@permission_classes([AllowAny])
def check_grace_periods(request):
    """Check and cancel bookings with expired grace periods (like mobile app detect_car_parked)"""
    try:
        # Call the grace period check function
        check_grace_period_expiration()

        return Response(
            {"message": "Grace period check completed", "status": "success"},
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        print(f"⚠️ Error in check_grace_periods endpoint: {e}")
        import traceback

        traceback.print_exc()
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def active_bookings(request):
    """Get active bookings for ESP32 LED control (robust JSON payload)"""
    try:
        from parking_app.models import Booking
        from django.utils import timezone
        from django.db.models import Q, F

        now = timezone.now()

        # Include bookings that are active and either:
        # 1. Have a future end_time (fixed duration bookings)
        # 2. Have end_time == start_time (pay-per-use bookings that haven't ended)
        # Use select_for_update(nowait=True) to avoid stale reads, or just ensure fresh query
        active_bookings_qs = (
            Booking.objects.filter(
                Q(start_time__lte=now)
                & (Q(end_time__gte=now) | Q(end_time=F("start_time"))),
                status="active",
            )
            .select_related("parking_spot", "user")
            .order_by("id")
        )

        bookings_data = []
        for booking in active_bookings_qs:
            spot = getattr(booking, "parking_spot", None)
            spot_number = None
            if spot is not None:
                spot_number = (
                    getattr(spot, "spot_number", None)
                    or getattr(spot, "name", None)
                    or f"Spot {spot.id}"
                )

            # Serialize datetimes to ISO strings to avoid renderer issues
            start_iso = (
                booking.start_time.isoformat()
                if getattr(booking, "start_time", None)
                else None
            )
            end_iso = (
                booking.end_time.isoformat()
                if getattr(booking, "end_time", None)
                else None
            )

            bookings_data.append(
                {
                    "id": booking.id,
                    "parking_spot": (
                        {
                            "id": getattr(spot, "id", None),
                            "spot_number": spot_number,
                            "name": spot_number,
                        }
                        if spot is not None
                        else None
                    ),
                    "start_time": start_iso,
                    "end_time": end_iso,
                    "is_active": getattr(booking, "status", "") == "active",
                    "user": getattr(
                        getattr(booking, "user", None), "username", "Unknown"
                    ),
                }
            )

        result = {
            "bookings": bookings_data,
            "total_active": len(bookings_data),
            "timestamp": now.isoformat(),
        }

        # Debug logging
        if bookings_data:
            print(
                f"📋 Active bookings endpoint: Found {len(bookings_data)} active booking(s)"
            )
            for booking in bookings_data:
                spot_num = booking.get("parking_spot", {}).get("spot_number", "Unknown")
                print(f"  - {spot_num}: Active booking (ID: {booking.get('id')})")
        else:
            print(f"📋 Active bookings endpoint: No active bookings found")

        return Response(result, status=status.HTTP_200_OK)

    except Exception as e:
        # Avoid leaking stack traces to clients; provide stable error
        return Response(
            {"error": f"Failed to fetch active bookings: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([AllowAny])
def get_device_health(request):
    """Get device health and system status"""
    try:
        from django.utils import timezone

        # Get all active devices
        devices = IoTDevice.objects.filter(is_active=True)

        # Calculate device health metrics
        total_devices = devices.count()
        online_devices = 0
        offline_devices = 0

        # Check device status based on last seen time
        now = timezone.now()
        for device in devices:
            if device.last_seen:
                time_diff = now - device.last_seen
                if time_diff.total_seconds() < 300:  # 5 minutes
                    online_devices += 1
                else:
                    offline_devices += 1
            else:
                offline_devices += 1

        # Calculate uptime percentage
        uptime_percentage = 0
        if total_devices > 0:
            uptime_percentage = round((online_devices / total_devices) * 100)

        # Get system latency (mock data for now)
        system_latency = {
            "sensor_data": 45,  # ms
            "led_control": 12,  # ms
            "api_response": 25,  # ms
        }

        # Get recent device logs for alerts
        recent_logs = DeviceLog.objects.filter(
            timestamp__gte=now - timedelta(hours=1)
        ).order_by("-timestamp")[:10]

        alerts = []
        for log in recent_logs:
            if log.log_type in ["error", "warning"]:
                alerts.append(
                    {
                        "id": log.id,
                        "type": log.log_type,
                        "title": f"Device {log.device.device_id} Alert",
                        "message": log.message,
                        "created_at": log.timestamp,
                        "device_id": log.device.device_id,
                    }
                )

        return Response(
            {
                "devices": {
                    "total": total_devices,
                    "online": online_devices,
                    "offline": offline_devices,
                    "uptime": uptime_percentage,
                },
                "latency": system_latency,
                "alerts": alerts,
                "last_updated": now,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_alerts(request):
    """Get system alerts and notifications"""
    try:
        from django.utils import timezone

        # Get recent device logs that could be alerts
        recent_logs = DeviceLog.objects.filter(
            timestamp__gte=timezone.now() - timedelta(hours=24)
        ).order_by("-timestamp")[:20]

        alerts = []
        for log in recent_logs:
            # Determine alert type based on log type and message
            alert_type = "info"
            if log.log_type == "error":
                alert_type = "error"
            elif log.log_type == "warning":
                alert_type = "warning"
            elif "offline" in log.message.lower():
                alert_type = "warning"
            elif "booking" in log.message.lower():
                alert_type = "info"

            alerts.append(
                {
                    "id": log.id,
                    "type": alert_type,
                    "title": f"Device {log.device.device_id} Alert",
                    "message": log.message,
                    "created_at": log.timestamp,
                    "device_id": log.device.device_id,
                }
            )

        # Add some system alerts based on device status
        devices = IoTDevice.objects.filter(is_active=True)
        now = timezone.now()

        for device in devices:
            if device.last_seen:
                time_diff = now - device.last_seen
                if time_diff.total_seconds() > 300:  # 5 minutes
                    alerts.append(
                        {
                            "id": f"offline_{device.id}",
                            "type": "warning",
                            "title": "Device Offline",
                            "message": f"{device.device_id} has been offline for {int(time_diff.total_seconds() / 60)} minutes",
                            "created_at": device.last_seen,
                            "device_id": device.device_id,
                        }
                    )

        # Sort alerts by creation time (newest first)
        alerts.sort(key=lambda x: x["created_at"], reverse=True)

        return Response(
            {
                "alerts": alerts[:10],  # Return only latest 10 alerts
                "total_alerts": len(alerts),
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_device_details(request):
    """Get comprehensive device details including real-time sensor data and metrics"""
    try:
        devices = IoTDevice.objects.filter(is_active=True)
        device_details = []

        for device in devices:
            # Get latest sensor data
            latest_data = (
                SensorData.objects.filter(device=device).order_by("-timestamp").first()
            )

            # Get device logs for error/warning counts
            error_count = DeviceLog.objects.filter(
                device=device, log_type="error"
            ).count()
            warning_count = DeviceLog.objects.filter(
                device=device, log_type="warning"
            ).count()

            # Calculate uptime (time since last restart - using created_at as proxy)
            from django.utils import timezone

            now = timezone.now()
            uptime_seconds = int((now - device.created_at).total_seconds())

            # Get extra info from latest sensor data if available
            memory_free = None
            memory_total = None
            cpu_frequency = None
            wifi_ssid = None
            wifi_strength = None

            if latest_data:
                # Extract additional data if available in sensor data
                if hasattr(latest_data, "battery_level") and latest_data.battery_level:
                    # Convert battery level to memory-like metric for demo
                    memory_free = int(latest_data.battery_level * 1000)  # Convert to KB
                    memory_total = 327680  # Standard ESP32 memory in KB

                # Use signal strength as WiFi strength indicator
                if (
                    hasattr(latest_data, "signal_strength")
                    and latest_data.signal_strength is not None
                ):
                    wifi_strength = latest_data.signal_strength

                # Use temperature as CPU frequency indicator (normalized)
                if (
                    hasattr(latest_data, "temperature")
                    and latest_data.temperature is not None
                ):
                    cpu_frequency = int(
                        240 + (latest_data.temperature - 25) * 2
                    )  # Normalize around 240MHz

            # Determine device status based on last seen
            time_diff = now - device.last_seen
            if time_diff.total_seconds() < 60:  # Online if seen in last minute
                status = "online"
            elif time_diff.total_seconds() < 300:  # Warning if seen in last 5 minutes
                status = "warning"
            else:
                status = "offline"

            # Get connected sensors based on device type and available data
            connected_sensors = []
            if device.device_type == "sensor":
                if (
                    latest_data
                    and hasattr(latest_data, "slot1_occupied")
                    and latest_data.slot1_occupied is not None
                ):
                    connected_sensors = ["Ultrasonic Sensor 1", "Ultrasonic Sensor 2"]
                else:
                    connected_sensors = ["Ultrasonic Sensor 1"]

            # Firmware version not stored; leave as None unless provided via metadata
            firmware_version = (
                device.__dict__.get("firmware_version")
                if hasattr(device, "__dict__")
                else None
            )

            device_info = {
                "id": device.device_id,
                "name": device.name or f"ESP32 {device.device_type.title()}",
                "type": "ESP32",
                "ip_address": device.ip_address or None,
                "wifi_ssid": wifi_ssid or None,
                "wifi_strength": wifi_strength if wifi_strength is not None else None,
                "mac_address": device.mac_address or None,
                "firmware_version": firmware_version,
                "uptime": uptime_seconds,
                "last_seen": (
                    device.last_seen.isoformat()
                    if device.last_seen
                    else now.isoformat()
                ),
                "status": status,
                "sensor_count": len(connected_sensors),
                "temperature": (
                    latest_data.temperature
                    if latest_data and latest_data.temperature is not None
                    else None
                ),
                "memory_free": memory_free,
                "memory_total": memory_total,
                "cpu_frequency": cpu_frequency,
                "connected_sensors": connected_sensors,
                "last_restart": device.created_at.isoformat(),
                "error_count": error_count,
                "warning_count": warning_count,
                "device_type": device.device_type,
                "location": device.location or "Parking Lot",
                "created_at": device.created_at.isoformat(),
                "last_updated": device.updated_at.isoformat(),
                "is_active": device.is_active,
                "parking_lot": device.parking_lot.name if device.parking_lot else None,
                "parking_spot": (
                    device.parking_spot.spot_number if device.parking_spot else None
                ),
            }

            device_details.append(device_info)

        return Response(
            {
                "devices": device_details,
                "total_devices": len(device_details),
                "online_devices": len(
                    [d for d in device_details if d["status"] == "online"]
                ),
                "offline_devices": len(
                    [d for d in device_details if d["status"] == "offline"]
                ),
                "last_updated": now.isoformat(),
            }
        )

    except Exception as e:
        print("GET_DEVICE_DETAILS ERROR:", e)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_parking_statistics(request):
    """Get parking statistics for the frontend"""
    try:
        from parking_app.models import ParkingLot, ParkingSpot

        # Get the IoT Smart Parking lot
        try:
            lot = ParkingLot.objects.get(name="IoT Smart Parking")
        except ParkingLot.DoesNotExist:
            return Response(
                {"error": "IoT Smart Parking lot not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get parking spots for this lot
        spots = ParkingSpot.objects.filter(parking_lot=lot)
        total_spots = spots.count()
        occupied_spots = spots.filter(is_occupied=True).count()
        available_spots = total_spots - occupied_spots

        # Calculate occupancy rate
        occupancy_rate = (occupied_spots / total_spots * 100) if total_spots > 0 else 0

        # Get active IoT devices
        active_devices = IoTDevice.objects.filter(is_active=True).count()

        return Response(
            {
                "totalSpots": total_spots,
                "availableSpots": available_spots,
                "occupiedSpots": occupied_spots,
                "occupancyRate": round(occupancy_rate, 1),
                "activeDevices": active_devices,
                "lastUpdated": timezone.now().isoformat(),
            }
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_real_time_sensor_data(request):
    """Get real-time sensor data for admin dashboard"""
    try:
        from django.utils import timezone

        # Get all active devices
        devices = IoTDevice.objects.filter(is_active=True)
        sensors_data = []

        for device in devices:
            # Get latest sensor data for each device
            latest_data = (
                SensorData.objects.filter(device=device).order_by("-timestamp").first()
            )

            if latest_data:
                # Calculate time since last reading
                time_diff = timezone.now() - latest_data.timestamp
                is_recent = time_diff.total_seconds() < 60  # Within last minute

                sensor_info = {
                    "device_id": device.device_id,
                    "device_name": device.name or f"ESP32 {device.device_type.title()}",
                    "sensor_type": "ultrasonic",
                    "current_value": latest_data.distance_cm or 0,
                    "unit": "cm",
                    "last_reading": latest_data.timestamp.isoformat(),
                    "is_recent": is_recent,
                    "battery_level": latest_data.battery_level,
                    "signal_strength": latest_data.signal_strength,
                    "temperature": latest_data.temperature,
                    "humidity": latest_data.humidity,
                    "is_occupied": latest_data.is_occupied,
                    "slot1_occupied": getattr(latest_data, "slot1_occupied", None),
                    "slot2_occupied": getattr(latest_data, "slot2_occupied", None),
                }
                sensors_data.append(sensor_info)

        return Response(
            {
                "sensors": sensors_data,
                "total_sensors": len(sensors_data),
                "active_sensors": len([s for s in sensors_data if s["is_recent"]]),
                "last_updated": timezone.now().isoformat(),
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        print("GET_REAL_TIME_SENSOR_DATA ERROR:", e)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_system_status(request):
    """Get overall system status for the frontend"""
    try:
        # Get parking availability
        from .views import get_parking_availability

        availability_response = get_parking_availability(request)
        parking_data = availability_response.data

        # Get device count
        devices_count = IoTDevice.objects.filter(is_active=True).count()

        return Response(
            {
                "online": True,
                "devicesCount": devices_count,
                "parkingData": parking_data,
                "lastUpdate": timezone.now().isoformat(),
            }
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
