from django.shortcuts import render
from rest_framework import status, generics, serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate, login
from django.contrib.auth.models import User
from django.db import transaction
from django.contrib.auth.hashers import make_password
from .models import (
    ParkingLot,
    ParkingSpot,
    Booking,
    UserProfile,
    Payment,
    WalletTransaction,
    UserReport,
)
from .serializers import (
    UserSerializer,
    UserProfileSerializer,
    ParkingLotSerializer,
    ParkingSpotSerializer,
    BookingSerializer,
    PaymentSerializer,
    WalletTransactionSerializer,
    UserReportSerializer,
)
from .notifications import NotificationService
from decimal import Decimal, ROUND_HALF_UP


def _progress_booking_billing(booking):
    try:
        from django.utils import timezone

        now = timezone.now()
        # Billing only during active timer window
        if not booking.timer_started or booking.status != "active":
            return
        # Determine end threshold for normal time (no overtime handling here)
        bill_until = min(now, booking.end_time)
        # Initialize last_billing_at
        if (
            not booking.last_billing_at
            or booking.last_billing_at < booking.timer_started
        ):
            booking.last_billing_at = booking.timer_started
        if bill_until <= booking.last_billing_at:
            return
        elapsed_seconds = (bill_until - booking.last_billing_at).total_seconds()
        # Billing unit: 30 seconds counts as 1 minute charge unit
        billing_units = int(elapsed_seconds // 30)
        if billing_units <= 0:
            return
        # Fixed pricing: $1 per 30 seconds (do not surface in UI)
        # billing_units are 30-second units, so simply charge $1 per unit
        amount = Decimal("1.00") * Decimal(billing_units)
        amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        # Deduct from wallet (allow negative)
        profile, _ = UserProfile.objects.get_or_create(user=booking.user)
        profile.balance = (profile.balance or Decimal("0.00")) - amount
        profile.save()
        # Record transaction
        WalletTransaction.objects.create(
            user=booking.user,
            booking=booking,
            type="parking_charge",
            amount=amount,
            method="Wallet",
            note=f"Progressive deduction {billing_units} units (30s each)",
        )
        # Advance last_billing_at by whole minutes billed
        from datetime import timedelta

        booking.last_billing_at = booking.last_billing_at + timedelta(
            seconds=30 * billing_units
        )
        booking.save(update_fields=["last_billing_at"])
    except Exception as e:
        print(
            f"Billing progression error for booking {booking.id if booking else 'unknown'}: {e}"
        )


def deduct_from_wallet(user, booking, amount, note="Parking charge"):
    """
    Deduct amount from user's wallet and create transaction record.
    Allows negative balance (overdraft).

    Args:
        user: User object
        booking: Booking object (can be None)
        amount: Decimal amount to deduct
        note: Transaction note

    Returns:
        dict: {'success': bool, 'new_balance': Decimal, 'transaction_id': int}
    """
    try:
        from decimal import Decimal

        # Ensure amount is Decimal
        if not isinstance(amount, Decimal):
            amount = Decimal(str(amount))

        # Get or create user profile
        profile, _ = UserProfile.objects.get_or_create(user=user)

        # Calculate new balance (allow negative)
        old_balance = profile.balance or Decimal("0.00")
        new_balance = old_balance - amount

        # Update profile balance
        profile.balance = new_balance
        profile.save()

        # Create transaction record
        transaction = WalletTransaction.objects.create(
            user=user,
            booking=booking,
            type="parking_charge",
            amount=amount,
            method="Wallet",
            note=note,
        )

        # Check if balance went negative and create admin alert
        if new_balance < Decimal("0.00") and old_balance >= Decimal("0.00"):
            from .models import UserReport
            from django.utils import timezone

            # Create alert for admin dashboard
            alert_message = f"User {user.username} (ID: {user.id}) has negative balance: ${new_balance:.2f}. Overtime charges from parking session."
            if booking:
                alert_message += f" Booking ID: {booking.id}, Slot: {booking.parking_spot.spot_number if booking.parking_spot else 'Unknown'}"

            UserReport.objects.create(
                user=user,
                message=alert_message,
                type="system_alert",
                priority="high",
                status="pending",
            )

            print(
                f"🚨 NEGATIVE BALANCE ALERT: User {user.username} balance: ${new_balance:.2f}"
            )

        print(
            f"💰 Wallet deduction: User {user.id}, Amount: ${amount}, Old: ${old_balance}, New: ${new_balance}"
        )

        return {
            "success": True,
            "new_balance": new_balance,
            "transaction_id": transaction.id,
            "amount_deducted": amount,
        }

    except Exception as e:
        print(f"❌ Wallet deduction error: {e}")
        return {
            "success": False,
            "error": str(e),
            "new_balance": (
                profile.balance if "profile" in locals() else Decimal("0.00")
            ),
        }


# Global variable to store the current booking's total cost
CURRENT_BOOKING_TOTAL_COST = None


def compute_final_cost_for_seconds(seconds: int) -> Decimal:
    """
    Global function to compute total cost at $1 per 30 seconds for a given elapsed seconds.
    This ensures consistent pricing calculation across all functions.
    """
    from decimal import Decimal, ROUND_HALF_UP

    per_second_local = Decimal("1") / Decimal("30")
    total_cost = (per_second_local * Decimal(str(max(0, int(seconds))))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    # Store globally for access by other functions
    global CURRENT_BOOKING_TOTAL_COST
    CURRENT_BOOKING_TOTAL_COST = total_cost

    return total_cost


def trigger_esp32_booking_led(slot_number, led_state):
    """Trigger ESP32 LED control for booking status"""
    try:
        import requests
        from iot_integration.models import IoTDevice

        # Find the ESP32 device
        device = IoTDevice.objects.filter(device_type="sensor").first()

        if not device:
            print("No active ESP32 device found")
            return

        # Prepare the request data based on LED state
        if led_state == "red":
            # Red light for overtime
            data = {
                "device_id": device.device_id,
                "slot_number": slot_number,
                "led_state": "red",
                "message": "OVERTIME - Car still parked after expiry",
            }
            print(f"🔴 ESP32: Turn ON red LED for slot {slot_number} (OVERTIME)")
        elif led_state == "blue":
            # Blue light for active booking
            data = {
                "device_id": device.device_id,
                "slot_number": slot_number,
                "led_state": "blue",
                "message": "ACTIVE BOOKING",
            }
            print(f"🔵 ESP32: Turn ON blue LED for slot {slot_number} (ACTIVE BOOKING)")
        elif led_state == False:
            # Turn off LED (completed/cancelled)
            data = {
                "device_id": device.device_id,
                "slot_number": slot_number,
                "led_state": "off",
                "message": "COMPLETED - LED OFF",
            }
            print(f"⚫ ESP32: Turn OFF LED for slot {slot_number} (COMPLETED)")
        else:
            # Default blue light for booking
            data = {
                "device_id": device.device_id,
                "slot_number": slot_number,
                "led_state": "blue",
                "message": "BOOKED",
            }
            print(f"🔵 ESP32: Turn ON blue LED for slot {slot_number} (BOOKED)")

        # Send request to ESP32 control endpoint
        response = requests.post(
            "http://localhost:8000/api/iot/control/booking/", json=data, timeout=5
        )

        if response.status_code == 200:
            print(f"✅ ESP32 LED control successful for {slot_number}")
        else:
            print(f"❌ ESP32 LED control failed: {response.status_code}")

    except Exception as e:
        print(f"⚠️  ESP32 LED control error: {e}")


# Create your views here.


# Fallback wallet charge endpoint to deduct an explicit amount from the wallet
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def wallet_charge(request):
    """
    Body: { amount: number, booking_id?: number, note?: string }
    Deducts the specified amount from the authenticated user's wallet.
    Links the transaction to a booking if provided. Allows negative balances.
    """
    try:
        raw_amount = request.data.get("amount")
        if raw_amount is None:
            return Response(
                {"error": "amount is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            amount = Decimal(str(raw_amount))
        except Exception:
            return Response(
                {"error": "invalid amount"}, status=status.HTTP_400_BAD_REQUEST
            )

        note = request.data.get("note") or "Manual charge from receipt"
        booking = None
        booking_id = request.data.get("booking_id")
        if booking_id:
            try:
                booking = Booking.objects.get(id=booking_id, user=request.user)
            except Booking.DoesNotExist:
                booking = None

        result = deduct_from_wallet(
            user=request.user,
            booking=booking,
            amount=amount,
            note=note,
        )

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response(
            {
                "message": (
                    "Wallet charged successfully"
                    if result.get("success")
                    else "Wallet charge failed"
                ),
                "success": bool(result.get("success")),
                "amount_deducted": float(result.get("amount_deducted") or 0),
                "balance": float(profile.balance or 0),
                "transaction_id": result.get("transaction_id"),
            },
            status=(
                status.HTTP_200_OK
                if result.get("success")
                else status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Authentication Views
@api_view(["POST"])
@permission_classes([AllowAny])
def signup(request):
    """User registration endpoint (now with username)"""
    try:
        with transaction.atomic():
            # Extract user data
            username = request.data.get("username")
            email = request.data.get("email")
            password = request.data.get("password")
            full_name = request.data.get("fullName", "")

            # Split full name into first and last name
            name_parts = full_name.split(" ", 1)
            first_name = name_parts[0] if name_parts else ""
            last_name = name_parts[1] if len(name_parts) > 1 else ""

            # Validate required fields
            if not all([username, email, password, full_name]):
                return Response(
                    {"error": "Username, email, password, and full name are required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Validate password length
            if len(password) < 6:
                return Response(
                    {"error": "Password must be at least 6 characters long"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Validate email format
            if "@" not in email or "." not in email:
                return Response(
                    {"error": "Please enter a valid email address"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Check if user already exists
            if User.objects.filter(username=username).exists():
                return Response(
                    {"error": "Username already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if User.objects.filter(email=email).exists():
                return Response(
                    {"error": "Email already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Create user
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
            )

            # Create user profile (store number plate in address)
            number_plate = request.data.get("numberPlate", "")
            phone = request.data.get("phoneNumber", "")
            # We only keep address (number plate) per requirements; phone is not stored/shown
            UserProfile.objects.create(
                user=user,
                phone=phone or None,
                address=number_plate or None,
            )

            return Response(
                {
                    "message": "User registered successfully. Please log in to continue.",
                    "user": UserSerializer(user).data,
                },
                status=status.HTTP_201_CREATED,
            )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 20 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 20:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 20 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 20:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([AllowAny])
def signin(request):
    print("SIGNIN DATA:", request.data)
    try:
        username = request.data.get("username")
        password = request.data.get("password")
        email = request.data.get("email")
        is_admin_login = request.data.get(
            "is_admin_login", False
        )  # Flag to check if this is admin login

        print(
            "SIGNIN username:",
            username,
            "password:",
            "*" * len(password) if password else None,
            "is_admin:",
            is_admin_login,
        )

        if not (username or email) or not password:
            return Response(
                {"error": "Username/email and password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Normalize input
        username = (username or "").strip()
        email = (email or "").strip().lower()

        # Resolve the account by username or email in one go
        from django.db.models import Q

        resolved_user = None
        lookup_values = []
        if username:
            lookup_values.append(username)
        if email and email not in lookup_values:
            lookup_values.append(email)

        for val in lookup_values:
            try:
                candidate = User.objects.filter(
                    Q(username__iexact=val) | Q(email__iexact=val)
                ).first()
                if candidate:
                    resolved_user = candidate
                    break
            except Exception:
                pass

        # Optional fallback: allow login using phone number stored in profile
        if resolved_user is None and username:
            try:
                profile_candidate = (
                    UserProfile.objects.select_related("user")
                    .filter(
                        Q(phone_number__iexact=username) | Q(phone__iexact=username)
                    )
                    .first()
                )
                if profile_candidate:
                    resolved_user = profile_candidate.user
            except Exception:
                pass

        # If account exists but is inactive, return explicit message
        if resolved_user is not None and not getattr(resolved_user, "is_active", True):
            return Response(
                {"error": "Account is deactivated. Please contact support."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Authenticate if we resolved an account
        if resolved_user is not None:
            user = authenticate(username=resolved_user.username, password=password)
        else:
            user = None
        print("SIGNIN user:", user)

        if user is None:
            return Response(
                {"error": "Invalid username or password"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Check if user is active
        if not user.is_active:
            return Response(
                {"error": "Account is deactivated. Please contact support."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # If this is an admin login attempt, check if user has admin privileges
        if is_admin_login:
            if not (user.is_staff or user.is_superuser):
                return Response(
                    {
                        "error": "Access denied. Only staff and superusers can access admin dashboard."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        token, created = Token.objects.get_or_create(user=user)
        # Update last_login explicitly so dashboard shows correct timestamp
        try:
            from django.utils import timezone

            user.last_login = timezone.now()
            user.save(update_fields=["last_login"])
        except Exception:
            pass

        try:
            profile = UserProfile.objects.get(user=user)
            profile_data = UserProfileSerializer(profile).data
        except UserProfile.DoesNotExist:
            profile_data = {}

        return Response(
            {
                "message": "Login successful",
                "token": token.key,
                "user": UserSerializer(user).data,
                "profile": profile_data,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        print("SIGNIN EXCEPTION:", e)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 20 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 20:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def signout(request):
    """User logout endpoint"""
    try:
        # Delete the token
        try:
            request.user.auth_token.delete()
        except:
            pass
        return Response({"message": "Logout successful"}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 20 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 20:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                # Initialize progressive billing start
                booking.last_billing_at = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                # Send WhatsApp notification when car parks
                try:
                    from chatbot.views import send_whatsapp_message
                    from parking_app.models import UserProfile

                    profile = UserProfile.objects.filter(user=booking.user).first()
                    if profile and profile.phone:
                        slot_name = booking.parking_spot.spot_number
                        message = (
                            f"✅ Car parked successfully!\n\n"
                            f"📍 Slot: {slot_name}\n"
                            f"⏰ Timer started - You'll be charged $1 per 30 seconds.\n"
                            f"🔴 Red light indicates your slot is occupied.\n\n"
                            f"Thank you for using Smart Parking! 🚗"
                        )
                        send_whatsapp_message(profile.phone, message)
                except Exception as e:
                    print(f"⚠️ Failed to send WhatsApp notification: {e}")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace expired: if car is parked, start timer; otherwise cancel
                spot = booking.parking_spot
                is_occupied = getattr(spot, "is_occupied", False)
                if is_occupied:
                    booking.timer_started = now
                    booking.grace_period_ended = now
                    booking.last_billing_at = now
                    booking.save()
                    return Response(
                        {
                            "message": "Grace expired but car present. Timer started.",
                            "booking_id": booking.id,
                            "timer_started": booking.timer_started,
                            "grace_duration": grace_elapsed,
                        },
                        status=status.HTTP_200_OK,
                    )
                else:
                    booking.status = "cancelled"
                    booking.grace_period_ended = now
                    booking.save()
                    # Free up the parking spot
                    booking.parking_spot.is_occupied = False
                    booking.parking_spot.save()
                    return Response(
                        {
                            "message": "Grace period expired. Booking cancelled.",
                            "booking_id": booking.id,
                            "status": "cancelled",
                            "grace_duration": grace_elapsed,
                        }
                    )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def verify_auth(request):
    """Verify authentication token and return user info"""
    try:
        # Check if user has admin privileges
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {
                    "error": "Access denied. Only staff and superusers can access admin dashboard."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            profile = UserProfile.objects.get(user=request.user)
            profile_data = UserProfileSerializer(profile).data
        except UserProfile.DoesNotExist:
            profile_data = {}

        return Response(
            {
                "user": UserSerializer(request.user).data,
                "profile": profile_data,
                "is_staff": request.user.is_staff,
                "is_superuser": request.user.is_superuser,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_user_profile(request):
    """Get current user profile"""
    print(
        f"[get_user_profile] User: {request.user}, Authenticated: {request.user.is_authenticated}"
    )
    try:
        profile = UserProfile.objects.get(user=request.user)
        print(f"[get_user_profile] Profile found: {profile}")
        return Response(
            {
                "user": UserSerializer(request.user).data,
                "profile": UserProfileSerializer(profile).data,
            },
            status=status.HTTP_200_OK,
        )
    except UserProfile.DoesNotExist:
        print(f"[get_user_profile] Profile not found for user: {request.user}")
        return Response(
            {"error": "Profile not found"}, status=status.HTTP_404_NOT_FOUND
        )


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def update_user_profile(request):
    """Update current user profile"""
    print(f"[update_user_profile] Request data: {request.data}")
    try:
        profile = UserProfile.objects.get(user=request.user)
        print(f"[update_user_profile] Found profile: {profile}")

        # Update user data if provided
        user_data = request.data.get("user", {})
        if user_data:
            if "first_name" in user_data:
                request.user.first_name = user_data["first_name"]
            if "last_name" in user_data:
                request.user.last_name = user_data["last_name"]
            if "email" in user_data:
                # Check if email is already taken by another user
                if (
                    User.objects.filter(email=user_data["email"])
                    .exclude(id=request.user.id)
                    .exists()
                ):
                    return Response(
                        {"error": "Email already exists"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                request.user.email = user_data["email"]
            request.user.save()

        # Update profile data if provided
        profile_data = request.data.get("profile", {})
        print(f"[update_user_profile] Profile data: {profile_data}")
        if profile_data:
            if "phone_number" in profile_data:
                profile.phone = profile_data["phone_number"]
                print(
                    f"[update_user_profile] Updated phone: {profile_data['phone_number']}"
                )
            if "license_plate" in profile_data:
                profile.address = profile_data["license_plate"]
                print(
                    f"[update_user_profile] Updated address/license_plate: {profile_data['license_plate']}"
                )
            if "car_name" in profile_data:
                # Store car name in address field if no license plate
                if not profile.address:
                    profile.address = profile_data["car_name"]
                    print(
                        f"[update_user_profile] Updated address/car_name: {profile_data['car_name']}"
                    )
            profile.save()
            print(f"[update_user_profile] Profile saved successfully")

        return Response(
            {
                "message": "Profile updated successfully",
                "user": UserSerializer(request.user).data,
                "profile": UserProfileSerializer(profile).data,
            },
            status=status.HTTP_200_OK,
        )

    except UserProfile.DoesNotExist:
        return Response(
            {"error": "Profile not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change user password"""
    try:
        current_password = request.data.get("current_password")
        new_password = request.data.get("new_password")

        if not current_password or not new_password:
            return Response(
                {"error": "Current password and new password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify current password
        if not request.user.check_password(current_password):
            return Response(
                {"error": "Current password is incorrect"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if new password is different
        if current_password == new_password:
            return Response(
                {"error": "New password must be different from current password"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update password
        request.user.set_password(new_password)
        request.user.save()

        return Response(
            {"message": "Password changed successfully"}, status=status.HTTP_200_OK
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_booking_overtime(request, booking_id):
    """Get overtime information for a booking"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        if booking.status == "active" and booking.is_expired():
            overtime_minutes, overtime_cost = booking.update_overtime_billing()

            return Response(
                {
                    "overtime_minutes": overtime_minutes,
                    "overtime_cost": float(overtime_cost),
                    "is_overtime": True,
                    "total_cost_with_overtime": float(booking.total_cost or 0)
                    + float(overtime_cost),
                }
            )
        else:
            return Response(
                {
                    "overtime_minutes": booking.overtime_minutes,
                    "overtime_cost": float(booking.overtime_cost),
                    "is_overtime": booking.is_overtime,
                    "total_cost_with_overtime": float(booking.total_cost or 0)
                    + float(booking.overtime_cost),
                }
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Parking Views
class ParkingLotList(generics.ListCreateAPIView):
    queryset = ParkingLot.objects.filter(is_active=True)
    serializer_class = ParkingLotSerializer
    permission_classes = [AllowAny]


class ParkingLotDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ParkingLot.objects.all()
    serializer_class = ParkingLotSerializer
    permission_classes = [AllowAny]


class ParkingSpotList(generics.ListCreateAPIView):
    queryset = ParkingSpot.objects.all()
    serializer_class = ParkingSpotSerializer
    permission_classes = [AllowAny]


class ParkingSpotDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ParkingSpot.objects.all()
    serializer_class = ParkingSpotSerializer
    permission_classes = [AllowAny]


class BookingList(generics.ListCreateAPIView):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user_bookings = Booking.objects.filter(user=self.request.user)
        print(f"=== Fetching bookings for user {self.request.user.username} ===")
        print(f"Found {user_bookings.count()} bookings")

        # Check for expired bookings and mark them as completed
        for booking in user_bookings.filter(status="active"):
            if booking.mark_as_completed_if_expired():
                print(f"  - Marked expired booking {booking.id} as completed")
                # Handle LED control here to avoid circular imports
                try:
                    trigger_esp32_booking_led(booking.parking_spot.spot_number, False)
                    print(
                        f"🔵 Turned off blue LED for expired booking: {booking.parking_spot.spot_number}"
                    )
                except Exception as e:
                    print(f"⚠️  Failed to turn off ESP32 LED: {e}")

        # Refresh the queryset after potential status changes
        user_bookings = Booking.objects.filter(user=self.request.user)
        for booking in user_bookings:
            # Only run progressive billing for active bookings
            if booking.status == "active":
                try:
                    _progress_booking_billing(booking)
                except Exception as e:
                    print(
                        f"Wallet billing progression failed for booking {booking.id}: {e}"
                    )
            print(
                f"  - Booking {booking.id}: {booking.parking_spot.spot_number} ({booking.status})"
            )
        return user_bookings

    def perform_create(self, serializer):
        try:
            print("=== Starting booking creation ===")

            # Check if user already has an active booking
            existing_active_booking = Booking.objects.filter(
                user=self.request.user, status="active"
            ).first()

            if existing_active_booking:
                print(f"User already has active booking: {existing_active_booking.id}")
                raise serializers.ValidationError(
                    {
                        "non_field_errors": "You already have an active booking. Please cancel your current booking before making a new one."
                    }
                )

            # Get parking spot from parking_spot_id
            parking_spot_id = serializer.validated_data.get("parking_spot_id")
            print(f"Parking spot ID: {parking_spot_id}")

            try:
                parking_spot = ParkingSpot.objects.get(id=parking_spot_id)
                print(f"Found parking spot: {parking_spot.spot_number}")
            except ParkingSpot.DoesNotExist:
                print(f"Parking spot {parking_spot_id} not found")
                raise serializers.ValidationError(
                    {"parking_spot_id": "Parking spot not found."}
                )

            # Check if the parking spot is available
            if parking_spot.is_occupied:
                print(f"Parking spot {parking_spot.spot_number} is occupied")
                raise serializers.ValidationError(
                    {
                        "parking_spot_id": "This parking spot is currently occupied and cannot be booked."
                    }
                )

            # Balance check: require at least $1 (equivalent to 30 seconds)
            min_required = 1.00
            profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
            if float(profile.balance) < min_required:
                raise serializers.ValidationError(
                    {
                        "non_field_errors": "Insufficient funds. Please top up your wallet."
                    }
                )

            # Create the booking with minimal data
            from django.utils import timezone

            now = timezone.now()

            # Open-ended booking: no need for client to specify duration
            from datetime import timedelta

            default_window = now + timedelta(hours=12)
            booking_data = {
                "user": self.request.user,
                "parking_spot": parking_spot,
                "start_time": now,
                "end_time": default_window,
                "duration_minutes": serializer.validated_data.get("duration_minutes", 0)
                or 0,
                "vehicle_name": serializer.validated_data.get("vehicle_name", ""),
                "status": "active",
                "grace_period_started": now,  # Start grace period; timer starts on detect
                "timer_started": None,  # Timer will start when car is detected
                "number_plate": (
                    getattr(self.request.user.profile, "number_plate", "")
                    if hasattr(self.request.user, "profile")
                    else ""
                ),
            }

            print(f"Creating booking with data: {booking_data}")
            booking = Booking.objects.create(**booking_data)
            print(f"✅ Booking created successfully: {booking.id}")
            print(f"🕐 Grace period started at: {now}")
            print(f"⏰ Timer will start when car is detected (within 10 seconds)")

            # Trigger ESP32 LED control for the booked slot
            try:
                trigger_esp32_booking_led(booking.parking_spot.spot_number, "blue")
                print(f"🔵 Triggered blue LED for {booking.parking_spot.spot_number}")
            except Exception as e:
                print(f"⚠️  Failed to trigger ESP32 LED: {e}")

            return booking

        except Exception as e:
            print(f"❌ Error in booking creation: {e}")
            import traceback

            traceback.print_exc()
            raise


class BookingDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Admins can access any booking, regular users only their own
        if self.request.user.is_superuser:
            return Booking.objects.all()
        return Booking.objects.filter(user=self.request.user)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_wallet(request):
    try:
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        transactions = WalletTransaction.objects.filter(user=request.user).order_by(
            "-created_at"
        )[:50]
        return Response(
            {
                "balance": float(profile.balance or 0),
                "transactions": WalletTransactionSerializer(
                    transactions, many=True
                ).data,
            }
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def wallet_top_up(request):
    try:
        amount = request.data.get("amount")
        method = request.data.get("method")
        if amount is None:
            return Response(
                {"error": "Amount is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            amount = Decimal(str(amount))
        except Exception:
            return Response(
                {"error": "Invalid amount"}, status=status.HTTP_400_BAD_REQUEST
            )
        if amount <= Decimal("0"):
            return Response(
                {"error": "Amount must be positive"}, status=status.HTTP_400_BAD_REQUEST
            )

        profile, _ = UserProfile.objects.get_or_create(user=request.user)

        profile.balance = (profile.balance or Decimal("0.00")) + amount
        profile.save()

        WalletTransaction.objects.create(
            user=request.user,
            type="topup",
            amount=amount,
            method=method or "Unknown",
            note="User wallet top-up",
        )

        return Response(
            {
                "message": f"You've successfully loaded ${amount.quantize(Decimal('0.01'))} via {method}",
                "balance": float(profile.balance or Decimal("0.00")),
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete_active_booking(request, booking_id):
    """Finalize a booking and reconcile wallet charges.

    - If booking is active: stop timer now, compute total by elapsed seconds, deduct delta.
    - If booking is already completed: recompute final total from stored times (or keep stored total), deduct any missing delta.
    Always returns final total and updated wallet balance.
    """
    try:
        from django.utils import timezone
        from decimal import Decimal

        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Use global function to compute total cost at $1 per 30 seconds

        # Determine elapsed seconds depending on status
        if booking.timer_started is None:
            # If timer never started, start it now and calculate cost from booking creation
            now = timezone.now()
            # Use start_time as the timer start if timer_started is missing
            timer_start = booking.start_time or now
            booking.timer_started = timer_start
            booking.save()
            print(
                f"⚠️ Timer never started for booking {booking_id}, using start_time as timer_started: {timer_start}"
            )

        # Calculate elapsed time and complete the booking
        now = timezone.now()
        elapsed_seconds = max(0, int((now - booking.timer_started).total_seconds()))
        final_cost = compute_final_cost_for_seconds(elapsed_seconds)

        # Mark booking completed and persist completion details
        booking.completed_at = now
        booking.end_time = now
        booking.status = "completed"
        # Persist duration in minutes from timer start to completion
        try:
            booking.duration_minutes = int(elapsed_seconds // 60)
        except Exception:
            pass

        # Calculate total amount to deduct
        # Sum already deducted parking_charge txns for this booking
        deducted_total = Decimal("0.00")
        transactions = WalletTransaction.objects.filter(
            user=request.user, booking=booking, type="parking_charge"
        )
        print(
            f"🔍 Found {transactions.count()} parking charge transactions for booking {booking.id}"
        )
        for tx in transactions:
            try:
                deducted_total += Decimal(str(tx.amount))
                print(f"🔍 Transaction {tx.id}: ${tx.amount} - Note: {tx.note}")
            except Exception as e:
                print(f"🔍 Error processing transaction {tx.id}: {e}")
                continue
        print(f"🔍 Total already deducted: ${deducted_total}")

        # Calculate remaining amount to deduct
        remaining_to_deduct = (final_cost - deducted_total).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

        print(
            f"🔍 Deduction calculation: Final cost: ${final_cost}, Already deducted: ${deducted_total}, Remaining: ${remaining_to_deduct}"
        )
        print(f"🔍 Total amount to return: ${deducted_total + remaining_to_deduct}")

        # Deduct remaining amount using our new function
        deduction_result = None
        if remaining_to_deduct > Decimal("0.00"):
            deduction_result = deduct_from_wallet(
                user=request.user,
                booking=booking,
                amount=remaining_to_deduct,
                note=f"Final parking charge - {elapsed_seconds}s at $1/30s",
            )
            print(
                f"💳 Final deduction: ${remaining_to_deduct}, Success: {deduction_result['success']}"
            )

        # Get current balance for response (refresh after any deductions)
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.refresh_from_db()
        current_balance = profile.balance or Decimal("0.00")

        print(
            f"💰 Final booking cost: ${final_cost}, Balance after deduction: ${current_balance}"
        )

        # Persist final total_cost and completion details
        booking.total_cost = float(CURRENT_BOOKING_TOTAL_COST or final_cost)
        try:
            # Free up the parking spot after completion
            if (
                booking.parking_spot
                and getattr(booking.parking_spot, "is_occupied", None) is not None
            ):
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()
        except Exception:
            pass
        booking.save()
        print(f"💾 Stored total_cost in database: ${booking.total_cost}")

        # Turn off LED best-effort
        try:
            trigger_esp32_booking_led(booking.parking_spot.spot_number, False)
        except Exception:
            pass

        # Send WhatsApp notification when car leaves
        try:
            from chatbot.views import send_whatsapp_message
            from parking_app.models import UserProfile

            profile = UserProfile.objects.filter(user=request.user).first()
            if profile and profile.phone:
                slot_name = booking.parking_spot.spot_number
                duration_minutes = elapsed_seconds // 60
                duration_seconds = elapsed_seconds % 60
                message = (
                    f"🚗 You left the slot!\n\n"
                    f"📍 Slot: {slot_name}\n"
                    f"⏱️ Duration: {duration_minutes}m {duration_seconds}s\n"
                    f"💰 Amount charged: ${float(CURRENT_BOOKING_TOTAL_COST or final_cost):.2f}\n"
                    f"💳 Balance: ${float(current_balance):.2f}\n\n"
                    f"✅ Payment successful!\n"
                    f"Thank you for using Smart Parking! 🚗"
                )
                send_whatsapp_message(profile.phone, message)
        except Exception as e:
            print(f"⚠️ Failed to send WhatsApp notification: {e}")

        return Response(
            {
                "message": "Booking completed",
                "elapsed_seconds": elapsed_seconds,
                "total_cost": float(CURRENT_BOOKING_TOTAL_COST or final_cost),
                "status": "completed",
                "balance": float(current_balance),
                "deduction": {
                    "amount_deducted": float(
                        CURRENT_BOOKING_TOTAL_COST or final_cost
                    ),  # Always return the total cost as amount deducted
                    "remaining_deducted": float(
                        remaining_to_deduct
                    ),  # Amount deducted in final step
                    "success": (
                        deduction_result["success"] if deduction_result else True
                    ),
                    "transaction_id": (
                        deduction_result.get("transaction_id")
                        if deduction_result
                        else None
                    ),
                },
            },
            status=status.HTTP_200_OK,
        )
    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def extend_booking(request, booking_id):
    """Extend booking duration"""
    try:
        print(f"Extend booking called for booking {booking_id}")
        print(f"Request data: {request.data}")

        booking = Booking.objects.get(id=booking_id, user=request.user)
        additional_minutes = request.data.get("additional_minutes", 0)

        print(f"Additional minutes: {additional_minutes}")

        if additional_minutes <= 0:
            return Response(
                {"error": "Additional minutes must be greater than 0"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update end time and duration
        from datetime import timedelta

        booking.end_time += timedelta(minutes=additional_minutes)
        booking.duration_minutes += additional_minutes

        # Recalculate cost safely
        # NOTE: total_cost is now calculated by complete_active_booking using $1 per 30 seconds
        # This old hourly rate calculation has been removed to prevent conflicts
        # The total_cost should be set by the completion endpoint, not here

        booking.save()

        print(
            f"Booking extended successfully. New duration: {booking.duration_minutes} minutes"
        )

        return Response(
            {
                "message": "Booking extended successfully",
                "booking": BookingSerializer(booking).data,
            },
            status=status.HTTP_200_OK,
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        print(f"Error in extend_booking: {e}")
        return Response(
            {"error": "Failed to extend booking"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_booking(request, booking_id):
    """Cancel booking - admins can cancel any booking, users can only cancel their own"""
    try:
        # Check if user is admin (superuser)
        if request.user.is_superuser:
            # Admin can cancel any booking
            booking = Booking.objects.get(id=booking_id)
        else:
            # Regular users can only cancel their own bookings
            booking = Booking.objects.get(id=booking_id, user=request.user)

        if booking.status != "active":
            return Response(
                {"error": "Only active bookings can be cancelled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark booking as cancelled
        booking.status = "cancelled"
        booking.save()

        # Free up the parking spot
        parking_spot = booking.parking_spot
        parking_spot.is_occupied = False
        parking_spot.save()

        # Try to control ESP32 (but don't fail if it doesn't work)
        try:
            import requests
            from iot_integration.models import IoTDevice

            # Find the IoT device
            device = IoTDevice.objects.filter(device_type="sensor").first()
            if device:
                # Send booking control to ESP32
                control_url = f"http://192.168.180.47:8000/api/iot/control/booking/"
                control_data = {
                    "device_id": device.device_id,
                    "slot_number": parking_spot.spot_number,
                    "is_booked": False,
                }

                response = requests.post(control_url, json=control_data, timeout=3)
                if response.status_code == 200:
                    print(
                        f"✅ ESP32 booking control sent for {parking_spot.spot_number} (cancelled)"
                    )
                else:
                    print(
                        f"⚠️ ESP32 booking control failed: {response.status_code} - but booking was cancelled"
                    )
        except Exception as e:
            print(
                f"⚠️ ESP32 booking control error: {e} - but booking was cancelled successfully"
            )

        return Response(
            {"message": "Booking cancelled successfully"}, status=status.HTTP_200_OK
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_parking_stats(request):
    """Get parking statistics for home screen"""
    try:
        # Get total parking spots
        total_spots = ParkingSpot.objects.count()
        available_spots = ParkingSpot.objects.filter(is_occupied=False).count()

        # Get total bookings
        total_bookings = Booking.objects.count()

        return Response(
            {
                "total_spots": total_spots,
                "available_spots": available_spots,
                "total_bookings": total_bookings,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes += overtime_minutes
        booking.overtime_cost += overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_all_bookings_admin(request):
    """Get all bookings for admin users (superusers and staff)"""
    try:
        # Check if user is admin or staff
        if not (request.user.is_superuser or request.user.is_staff):
            return Response(
                {"error": "Admin or staff access required"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get all bookings with related user, profile, and parking spot data
        bookings = (
            Booking.objects.select_related("user", "parking_spot", "user__profile")
            .all()
            .order_by("-created_at")
        )

        results = []
        for b in bookings:
            user_profile = getattr(b.user, "profile", None)
            user_address = (
                getattr(user_profile, "address", None) if user_profile else None
            )
            results.append(
                {
                    "id": b.id,
                    "user": {
                        "id": b.user.id,
                        "username": b.user.username,
                        "email": b.user.email,
                        "first_name": b.user.first_name,
                        "last_name": b.user.last_name,
                        "address": user_address,
                    },
                    "parking_spot": {
                        "id": b.parking_spot.id,
                        "spot_number": b.parking_spot.spot_number,
                        "spot_type": b.parking_spot.spot_type,
                    },
                    "start_time": b.start_time,
                    "end_time": b.end_time,
                    "duration_minutes": b.duration_minutes,
                    "status": b.status,
                    "total_cost": b.total_cost,
                    "created_at": b.created_at,
                    "updated_at": b.updated_at,
                }
            )

        return Response(results, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes += overtime_minutes
        booking.overtime_cost += overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_all_users_admin(request):
    """Get all users for admin users (superusers and staff)"""
    try:
        # Check if user is admin or staff
        if not (request.user.is_superuser or request.user.is_staff):
            return Response(
                {"error": "Admin or staff access required"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get all users
        from django.contrib.auth import get_user_model

        User = get_user_model()
        users = User.objects.all().order_by("-date_joined")

        # Get booking statistics for each user
        user_data = []
        for user in users:
            # Count user's bookings
            user_bookings = Booking.objects.filter(user=user)
            total_bookings = user_bookings.count()

            # Calculate total spent from actual booking costs
            total_spent = sum(
                booking.total_cost for booking in user_bookings if booking.total_cost
            )

            # Get user profile information
            try:
                profile = user.profile
                phone = profile.phone if profile else None
                address = profile.address if profile else None
                last_password_reset = profile.last_password_reset if profile else None
                wallet_balance = (
                    float(profile.balance) if profile and profile.balance else 0.0
                )
            except:
                phone = None
                address = None
                last_password_reset = None
                wallet_balance = 0.0

            user_data.append(
                {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name or "",
                    "last_name": user.last_name or "",
                    "phone": phone,
                    "address": address,
                    "is_active": user.is_active,
                    "is_staff": user.is_staff,
                    "is_superuser": user.is_superuser,
                    "date_joined": user.date_joined,
                    "last_login": user.last_login,
                    "last_password_reset": last_password_reset,
                    "total_bookings": total_bookings,
                    "total_spent": total_spent,
                    "wallet_balance": wallet_balance,
                }
            )

        return Response(user_data, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_negative_balance_users_admin(request):
    """Get users with negative wallet balances for admin users (superusers and staff)"""
    try:
        # Check if user is admin or staff
        if not (request.user.is_superuser or request.user.is_staff):
            return Response(
                {"error": "Admin or staff access required"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get all users with negative balances
        from django.contrib.auth import get_user_model
        from django.db.models import Q

        User = get_user_model()
        users_with_negative_balance = (
            User.objects.filter(profile__balance__lt=0)
            .select_related("profile")
            .order_by("profile__balance")
        )

        negative_users_data = []
        for user in users_with_negative_balance:
            try:
                profile = user.profile
                wallet_balance = (
                    float(profile.balance) if profile and profile.balance else 0.0
                )

                # Get number plate from profile
                number_plate = None
                if profile and profile.address:
                    # Extract number plate from address field (assuming format like "Number Plate|Address")
                    if "|" in profile.address:
                        parts = profile.address.split("|")
                        number_plate = parts[0].strip() if parts[0].strip() else None
                    else:
                        # If no pipe separator, check if it looks like a number plate
                        address = profile.address.strip()
                        if len(address) <= 10 and any(c.isalnum() for c in address):
                            number_plate = address

                negative_users_data.append(
                    {
                        "id": user.id,
                        "username": user.username,
                        "email": user.email,
                        "first_name": user.first_name or "",
                        "last_name": user.last_name or "",
                        "full_name": f"{user.first_name or ''} {user.last_name or ''}".strip()
                        or user.username,
                        "number_plate": number_plate or "N/A",
                        "wallet_balance": wallet_balance,
                        "date_joined": user.date_joined,
                    }
                )
            except Exception as e:
                print(f"Error processing user {user.username}: {e}")
                continue

        return Response(negative_users_data, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_user_admin(request):
    """Create a new user (superuser only)"""
    try:
        # Check if user is superuser (only superusers can create users)
        if not request.user.is_superuser:
            return Response(
                {"error": "Superuser access required"}, status=status.HTTP_403_FORBIDDEN
            )

        # Extract user data
        username = request.data.get("username")
        email = request.data.get("email")
        password = request.data.get("password")
        first_name = request.data.get("first_name", "")
        last_name = request.data.get("last_name", "")
        is_staff = request.data.get("is_staff", False)
        is_superuser = request.data.get("is_superuser", False)

        # Validate required fields
        if not all([username, email, password]):
            return Response(
                {"error": "Username, email, and password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if user already exists
        from django.contrib.auth import get_user_model

        User = get_user_model()

        if User.objects.filter(username=username).exists():
            return Response(
                {"error": "Username already exists"}, status=status.HTTP_400_BAD_REQUEST
            )

        if User.objects.filter(email=email).exists():
            return Response(
                {"error": "Email already exists"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Create the user
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            is_staff=is_staff,
            is_superuser=is_superuser,
        )

        # Create user profile for mobile app compatibility
        try:
            number_plate = (
                request.data.get("number_plate")
                or request.data.get("numberPlate")
                or ""
            )
            UserProfile.objects.create(
                user=user, phone=None, address=number_plate or None
            )
            print(f"UserProfile created for {username}")
        except Exception as e:
            print(f"Warning: Could not create UserProfile for {username}: {e}")

        return Response(
            {
                "message": "User created successfully",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "is_staff": user.is_staff,
                    "is_superuser": user.is_superuser,
                    "is_active": user.is_active,
                    "date_joined": user.date_joined,
                    "last_login": user.last_login,
                },
            },
            status=status.HTTP_201_CREATED,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def update_user_admin(request, user_id):
    """Update a user (superuser only)"""
    try:
        # Check if user is superuser (only superusers can update users)
        if not request.user.is_superuser:
            return Response(
                {"error": "Superuser access required"}, status=status.HTTP_403_FORBIDDEN
            )

        # Get the user to update
        from django.contrib.auth import get_user_model

        User = get_user_model()

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Update user fields
        if "username" in request.data:
            # Check if username is already taken by another user
            if (
                User.objects.filter(username=request.data["username"])
                .exclude(id=user_id)
                .exists()
            ):
                return Response(
                    {"error": "Username already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.username = request.data["username"]

        if "email" in request.data:
            # Check if email is already taken by another user
            if (
                User.objects.filter(email=request.data["email"])
                .exclude(id=user_id)
                .exists()
            ):
                return Response(
                    {"error": "Email already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.email = request.data["email"]

        if "first_name" in request.data:
            user.first_name = request.data["first_name"]

        if "last_name" in request.data:
            user.last_name = request.data["last_name"]

        if "is_active" in request.data:
            user.is_active = request.data["is_active"]

        if "is_staff" in request.data:
            user.is_staff = request.data["is_staff"]

        if "is_superuser" in request.data:
            user.is_superuser = request.data["is_superuser"]

        # Update password if provided
        if "password" in request.data and request.data["password"]:
            user.set_password(request.data["password"])

        user.save()

        # Update profile fields if provided
        try:
            profile, _ = UserProfile.objects.get_or_create(user=user)

            # Update number plate
            if "number_plate" in request.data or "numberPlate" in request.data:
                number_plate = request.data.get("number_plate") or request.data.get(
                    "numberPlate"
                )
                profile.address = number_plate or None
                print(f"[update_user_admin] Updated number plate: {number_plate}")

            # Update car name (license number)
            if "car_name" in request.data:
                car_name = request.data.get("car_name")
                # Store separately if model has dedicated field; else keep for audit via address fallback
                try:
                    setattr(profile, "car_name", car_name or None)
                except Exception:
                    pass
                print(f"[update_user_admin] Updated car name: {car_name}")

            # Update phone
            if "phone" in request.data:
                profile.phone = request.data.get("phone") or None
                print(f"[update_user_admin] Updated phone: {profile.phone}")

            # Update wallet balance
            if "balance" in request.data:
                try:
                    profile.balance = request.data.get("balance") or 0
                    print(f"[update_user_admin] Updated balance: {profile.balance}")
                except Exception as e:
                    print(f"[update_user_admin] Could not set balance: {e}")

            profile.save()
        except Exception as e:
            print(f"Warning: could not update user profile: {e}")

        return Response(
            {
                "message": "User updated successfully",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "is_staff": user.is_staff,
                    "is_superuser": user.is_superuser,
                    "is_active": user.is_active,
                    "date_joined": user.date_joined,
                    "last_login": user.last_login,
                },
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_user_admin(request, user_id):
    """Delete a user (superuser only)"""
    try:
        # Check if user is superuser (only superusers can delete users)
        if not request.user.is_superuser:
            return Response(
                {"error": "Superuser access required"}, status=status.HTTP_403_FORBIDDEN
            )

        # Get the user to delete
        from django.contrib.auth import get_user_model

        User = get_user_model()

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Prevent admin from deleting themselves
        if user.id == request.user.id:
            return Response(
                {"error": "Cannot delete your own account"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delete the user
        username = user.username
        user.delete()

        return Response(
            {"message": f"User {username} deleted successfully"},
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_user_status_admin(request, user_id):
    """Toggle user active status (superuser only)"""
    try:
        # Check if user is superuser (only superusers can toggle user status)
        if not request.user.is_superuser:
            return Response(
                {"error": "Superuser access required"}, status=status.HTTP_403_FORBIDDEN
            )

        # Get the user to toggle
        from django.contrib.auth import get_user_model

        User = get_user_model()

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Toggle the status
        user.is_active = not user.is_active
        user.save()

        status_text = "activated" if user.is_active else "deactivated"

        return Response(
            {
                "message": f"User {user.username} {status_text} successfully",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "is_active": user.is_active,
                },
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reset_user_password_admin(request, user_id):
    """Reset user password (superuser only)"""
    try:
        # Check if user is superuser (only superusers can reset passwords)
        if not request.user.is_superuser:
            return Response(
                {"error": "Superuser access required"}, status=status.HTTP_403_FORBIDDEN
            )

        # Get the user to reset password
        from django.contrib.auth import get_user_model

        User = get_user_model()

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Get the new password from request data
        new_password = request.data.get("new_password")
        if not new_password:
            return Response(
                {"error": "New password is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Set the new password
        user.set_password(new_password)
        user.save()

        # Invalidate all existing tokens for this user (force re-login)
        try:
            from rest_framework.authtoken.models import Token

            Token.objects.filter(user=user).delete()
            print(f"Invalidated all tokens for user {user.username}")
        except Exception as e:
            print(f"Warning: Could not invalidate tokens: {e}")

        # Update the user profile with password reset timestamp
        try:
            from .models import UserProfile

            profile, created = UserProfile.objects.get_or_create(user=user)
            from django.utils import timezone

            profile.last_password_reset = timezone.now()
            profile.save()
        except Exception as e:
            print(f"Warning: Could not update password reset timestamp: {e}")

        return Response(
            {
                "message": f"Password reset successfully for {user.username}",
                "user": {"id": user.id, "username": user.username},
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_reports(request):
    """Get dashboard reports data (admin/staff only)"""
    try:
        # Check if user has admin privileges
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {
                    "error": "Access denied. Only staff and superusers can access dashboard."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        from django.db.models import Count, Sum, Q
        from django.utils import timezone
        from datetime import timedelta

        # Get date range (last 30 days by default)
        end_date = timezone.now()
        start_date = end_date - timedelta(days=30)

        # Get total bookings in date range
        total_bookings = Booking.objects.filter(
            created_at__gte=start_date, created_at__lte=end_date
        ).count()

        # Get active bookings
        active_bookings = Booking.objects.filter(status="active").count()

        # Get completed bookings
        completed_bookings = Booking.objects.filter(status="completed").count()

        # Get total revenue - match booking volume exactly
        total_revenue = (
            Booking.objects.filter(
                created_at__gte=start_date, created_at__lte=end_date
            ).aggregate(total=Sum("total_cost"))["total"]
            or 0
        )

        # Get slot distribution
        slot_distribution = ParkingSpot.objects.values("status").annotate(
            count=Count("id")
        )

        # Get peak hours (bookings by hour)
        peak_hours = (
            Booking.objects.filter(created_at__gte=start_date, created_at__lte=end_date)
            .extra(select={"hour": "EXTRACT(hour FROM created_at)"})
            .values("hour")
            .annotate(count=Count("id"))
            .order_by("-count")[:6]
        )

        # Get daily booking data for charts
        daily_bookings = (
            Booking.objects.filter(created_at__gte=start_date, created_at__lte=end_date)
            .extra(select={"date": "DATE(created_at)"})
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
        )

        # Get daily revenue data for charts - match booking volume exactly
        daily_revenue = (
            Booking.objects.filter(created_at__gte=start_date, created_at__lte=end_date)
            .extra(select={"date": "DATE(created_at)"})
            .values("date")
            .annotate(revenue=Sum("total_cost"))
            .order_by("date")
        )

        return Response(
            {
                "totals": {
                    "bookings": total_bookings,
                    "active_bookings": active_bookings,
                    "completed_bookings": completed_bookings,
                    "revenue": float(total_revenue),
                },
                "by_day": [
                    {
                        "date": booking["date"].strftime("%Y-%m-%d"),
                        "count": booking["count"],
                    }
                    for booking in daily_bookings
                ],
                "revenue_by_day": [
                    {
                        "date": revenue["date"].strftime("%Y-%m-%d"),
                        "amount": float(revenue["revenue"] or 0),
                    }
                    for revenue in daily_revenue
                ],
                "slot_distribution": list(slot_distribution),
                "peak_hours": list(peak_hours),
                "date_range": {"start": start_date, "end": end_date},
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_statistics(request):
    """Get user statistics for dashboard (admin/staff only)"""
    try:
        # Check if user has admin privileges
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {
                    "error": "Access denied. Only staff and superusers can access dashboard."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        from django.contrib.auth.models import User
        from django.db.models import Count, Q
        from django.utils import timezone
        from datetime import timedelta

        # Get date range (last 30 days by default)
        end_date = timezone.now()
        start_date = end_date - timedelta(days=30)

        # Get total users
        total_users = User.objects.count()

        # Get active users (users with bookings in last 30 days)
        active_users = (
            User.objects.filter(
                booking__created_at__gte=start_date, booking__created_at__lte=end_date
            )
            .distinct()
            .count()
        )

        # Get new users in date range
        new_users = User.objects.filter(
            date_joined__gte=start_date, date_joined__lte=end_date
        ).count()

        # Get staff users
        staff_users = User.objects.filter(is_staff=True).count()

        # Get superusers
        superusers = User.objects.filter(is_superuser=True).count()

        # Get users by status
        active_accounts = User.objects.filter(is_active=True).count()
        inactive_accounts = User.objects.filter(is_active=False).count()

        return Response(
            {
                "total_users": total_users,
                "active_users": active_users,
                "new_users": new_users,
                "staff_users": staff_users,
                "superusers": superusers,
                "active_accounts": active_accounts,
                "inactive_accounts": inactive_accounts,
                "date_range": {"start": start_date, "end": end_date},
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password(request):
    """Reset password by verifying full name and email, then setting new password"""
    try:
        full_name = request.data.get("full_name", "").strip()
        email = request.data.get("email", "").strip()
        new_password = request.data.get("new_password", "")

        # Validate required fields
        if not all([full_name, email, new_password]):
            return Response(
                {"error": "Full name, email, and new password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate password length
        if len(new_password) < 6:
            return Response(
                {"error": "Password must be at least 6 characters long"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate email format
        if "@" not in email or "." not in email:
            return Response(
                {"error": "Please enter a valid email address"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find user by email
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {"error": "No user found with this email address"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Verify full name matches
        user_full_name = f"{user.first_name} {user.last_name}".strip()
        if user_full_name.lower() != full_name.lower():
            return Response(
                {"error": "Full name does not match the email address"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update password
        user.password = make_password(new_password)
        user.save()

        return Response(
            {
                "message": "Password reset successful. You can now sign in with your new password.",
                "user_id": user.id,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response(
            {"error": f"Password reset failed: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    """Reset password by verifying license number and number plate, then setting new password"""
    try:
        license_number = request.data.get("license_number", "").strip()
        number_plate = request.data.get("number_plate", "").strip()
        new_password = request.data.get("new_password", "")

        print(
            f"[Forgot Password] Request received - License: {license_number[:3]}***, Plate: {number_plate[:3]}***"
        )

        # Validate required fields
        if not all([license_number, number_plate, new_password]):
            return Response(
                {
                    "error": "License number, number plate, and new password are required"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate password length
        if len(new_password) < 6:
            return Response(
                {"error": "Password must be at least 6 characters long"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find user profile by license number and number plate
        try:
            from django.db.models import Q

            print(
                f"[Forgot Password] Searching for license: '{license_number}', plate: '{number_plate}'"
            )

            # Build query - both fields must match (case-insensitive)
            # Exclude NULL and empty values
            query = Q()
            query &= Q(license_number__isnull=False) & ~Q(license_number="")
            query &= Q(license_number__iexact=license_number)
            query &= Q(number_plate__isnull=False) & ~Q(number_plate="")
            query &= Q(number_plate__iexact=number_plate)

            profiles = UserProfile.objects.filter(query)

            if not profiles.exists():
                print(
                    f"[Forgot Password] No user found with license '{license_number}' and plate '{number_plate}'"
                )
                # Log available profiles for debugging (first 5 only)
                sample_profiles = UserProfile.objects.filter(
                    license_number__isnull=False
                ).exclude(license_number="")[:5]
                print(
                    f"[Forgot Password] Sample profiles in DB: {[(p.user.username if p.user else 'N/A', p.license_number, p.number_plate) for p in sample_profiles]}"
                )

                return Response(
                    {
                        "error": "No user found with matching license number and number plate. Please verify your information and try again."
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            # Use the first matching profile
            profile = profiles.first()
            user = profile.user

            if not user:
                print(f"[Forgot Password] Profile found but no associated user!")
                return Response(
                    {"error": "User account not found. Please contact support."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            print(f"[Forgot Password] Found user: {user.username} (ID: {user.id})")

        except Exception as lookup_error:
            print(f"[Forgot Password] Error during lookup: {str(lookup_error)}")
            return Response(
                {
                    "error": "Failed to find user account. Please verify your license number and number plate are correct."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Update password
        user.password = make_password(new_password)
        user.save()

        # Update last_password_reset timestamp
        from django.utils import timezone

        profile.last_password_reset = timezone.now()
        profile.save()

        print(
            f"✅ Password reset successful for user {user.username} (ID: {user.id}) via forgot password"
        )

        return Response(
            {
                "message": "Password reset successful! You can now sign in with your new password.",
                "user_id": user.id,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        import traceback

        print(f"❌ Forgot password error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        return Response(
            {"error": f"Password reset failed: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def check_and_bill_overtime(request, booking_id):
    """Check and bill overtime for a specific booking with 5-second delay and IoT integration"""
    try:
        try:
            booking = Booking.objects.get(id=booking_id, user=request.user)
        except Booking.DoesNotExist:
            return Response(
                {
                    "overtime_minutes": 0,
                    "overtime_cost": 0.00,
                    "is_overtime": False,
                    "total_cost_with_overtime": 0.00,
                    "message": "Booking not found or access denied",
                }
            )

        if booking.status != "active":
            return Response(
                {
                    "overtime_minutes": 0,
                    "overtime_cost": 0.00,
                    "is_overtime": False,
                    "total_cost_with_overtime": float(booking.total_cost or 0),
                    "message": "Booking is not active",
                }
            )

        # Check if booking has expired
        if not booking.is_expired():
            return Response(
                {
                    "overtime_minutes": 0,
                    "overtime_cost": 0.00,
                    "is_overtime": False,
                    "total_cost_with_overtime": float(booking.total_cost or 0),
                    "message": "Booking has not expired yet",
                }
            )

        # Check if 5 seconds have passed since expiry
        from django.utils import timezone
        from datetime import timedelta

        now = timezone.now()
        time_since_expiry = now - booking.end_time

        if time_since_expiry.total_seconds() < 5:
            # Still in grace period, no overtime yet
            return Response(
                {
                    "overtime_minutes": 0,
                    "overtime_cost": 0.00,
                    "is_overtime": False,
                    "total_cost_with_overtime": float(booking.total_cost or 0),
                    "grace_period_remaining": 5
                    - int(time_since_expiry.total_seconds()),
                    "message": "Still in 5-second grace period",
                }
            )

        # Update overtime billing (starts after 5 seconds)
        overtime_minutes, overtime_cost = booking.update_overtime_billing()

        # Send overtime alert notification
        NotificationService.send_overtime_alert(booking)

        # Check if car is still parked (red light on) using IoT
        is_still_parked = check_if_car_still_parked(booking.parking_spot)

        if is_still_parked:
            # Car still parked - continue overtime billing
            # Turn on red light if not already on
            if not booking.iot_overtime_start:
                trigger_esp32_booking_led(booking.parking_spot.spot_number, "red")
                print(f"🔴 Red light ON for overtime booking {booking.id}")

            return Response(
                {
                    "overtime_minutes": overtime_minutes,
                    "overtime_cost": float(overtime_cost),
                    "is_overtime": True,
                    "total_cost_with_overtime": float(booking.total_cost or 0)
                    + float(overtime_cost),
                    "car_still_parked": True,
                    "red_light_on": True,
                    "message": "Overtime billing active - Red light ON, car still parked",
                }
            )
        else:
            # Car has left (green light detected) - stop billing and complete
            if booking.iot_overtime_start and not booking.iot_overtime_end:
                # Handle IoT green light detection
                final_overtime_minutes, final_overtime_cost = (
                    booking.handle_iot_green_light()
                )

                # Mark as completed (keep slot occupied)
                booking.status = "completed"
                booking.save()

                # Send completion notification
                NotificationService.send_booking_completion_notification(booking)

                # Turn off red light (green light is now on)
                trigger_esp32_booking_led(booking.parking_spot.spot_number, False)
                print(f"🟢 Green light ON - Car left, booking {booking.id} completed")

                return Response(
                    {
                        "overtime_minutes": final_overtime_minutes,
                        "overtime_cost": float(final_overtime_cost),
                        "is_overtime": True,
                        "total_cost_with_overtime": float(booking.total_cost or 0)
                        + float(final_overtime_cost),
                        "car_still_parked": False,
                        "red_light_off": True,
                        "green_light_on": True,
                        "message": "Booking completed - Green light ON, car has left",
                        "status": "completed",
                    }
                )

            return Response(
                {
                    "overtime_minutes": overtime_minutes,
                    "overtime_cost": float(overtime_cost),
                    "is_overtime": True,
                    "total_cost_with_overtime": float(booking.total_cost or 0)
                    + float(overtime_cost),
                    "car_still_parked": False,
                    "message": "Car has left - overtime calculation complete",
                }
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_active_overtime_bookings(request):
    """Get all active overtime bookings for the user"""
    try:
        active_bookings = Booking.objects.filter(
            user=request.user, status="active", is_overtime=True
        )

        overtime_data = []
        for booking in active_bookings:
            overtime_minutes, overtime_cost = booking.calculate_overtime()
            overtime_data.append(
                {
                    "booking_id": booking.id,
                    "parking_spot": booking.parking_spot.spot_number,
                    "end_time": booking.end_time,
                    "overtime_minutes": overtime_minutes,
                    "overtime_cost": float(overtime_cost),
                    "total_cost": float(booking.total_cost or 0),
                    "total_cost_with_overtime": float(booking.total_cost or 0)
                    + float(overtime_cost),
                }
            )

        return Response(
            {
                "overtime_bookings": overtime_data,
                "total_overtime_cost": sum(
                    item["overtime_cost"] for item in overtime_data
                ),
            }
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def check_if_car_still_parked(parking_spot):
    """Check if a car is still parked in the spot using the same logic as home page"""
    try:
        from iot_integration.models import IoTDevice, SensorData
        from django.utils import timezone
        from datetime import timedelta

        # Use the same logic as get_parking_availability
        # Check for recent sensor data (within last 60 seconds)
        recent_sensor_data = SensorData.objects.filter(
            timestamp__gte=timezone.now() - timedelta(seconds=60)
        ).exists()

        if not recent_sensor_data:
            # No recent sensor data - ESP32 is offline, use parking spot status
            print(
                f"⚠️  No recent sensor data for {parking_spot.spot_number}, using parking spot status"
            )
            return parking_spot.is_occupied

        # ESP32 is online - get real-time data using same logic as home page
        devices = IoTDevice.objects.filter(is_active=True).order_by("id")

        # Map slot names to device indices (same as home page logic)
        slot_mapping = {"Slot A": 0, "Slot B": 1}
        device_index = slot_mapping.get(parking_spot.spot_number)

        if device_index is not None and device_index < devices.count():
            device = devices[device_index]
            latest_data = (
                SensorData.objects.filter(device=device).order_by("-timestamp").first()
            )

            if latest_data:
                # Check if sensor data is recent (within last 60 seconds)
                time_diff = timezone.now() - latest_data.timestamp
                if time_diff.total_seconds() < 60:
                    # Use the dual sensor data if available (same as home page)
                    if (
                        hasattr(latest_data, "slot1_occupied")
                        and latest_data.slot1_occupied is not None
                    ):
                        if device_index == 0:  # Slot A
                            is_occupied = latest_data.slot1_occupied
                        elif device_index == 1:  # Slot B
                            is_occupied = (
                                latest_data.slot2_occupied
                                if hasattr(latest_data, "slot2_occupied")
                                else latest_data.is_occupied
                            )
                        else:
                            is_occupied = latest_data.is_occupied
                    else:
                        # Fallback to general occupancy
                        is_occupied = latest_data.is_occupied

                    print(
                        f"🔍 IoT Sensor check for {parking_spot.spot_number}: {'Occupied' if is_occupied else 'Available'} (device {device_index})"
                    )
                    return is_occupied
                else:
                    print(
                        f"⚠️  Sensor data too old for {parking_spot.spot_number} ({time_diff.total_seconds():.0f}s ago)"
                    )

        # Fallback: use parking spot status (which should be updated by get_parking_availability)
        print(
            f"⚠️  Using parking spot status for {parking_spot.spot_number}: {'Occupied' if parking_spot.is_occupied else 'Available'}"
        )
        return parking_spot.is_occupied

    except Exception as e:
        print(f"⚠️  Error checking car occupancy for {parking_spot.spot_number}: {e}")
        # Final fallback to parking spot status
        return parking_spot.is_occupied


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_parking_spot_led_status(request, spot_number):
    """Get the current LED/RGB light status for a parking spot"""
    try:
        from iot_integration.models import IoTDevice, SensorData
        from django.utils import timezone

        # Find the parking spot
        try:
            parking_spot = ParkingSpot.objects.get(spot_number=spot_number)
        except ParkingSpot.DoesNotExist:
            return Response(
                {"error": "Parking spot not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Get the latest sensor data for this spot using same logic as home page
        devices = IoTDevice.objects.filter(is_active=True).order_by("id")
        slot_mapping = {"Slot A": 0, "Slot B": 1}
        device_index = slot_mapping.get(parking_spot.spot_number)

        latest_sensor_data = None
        if device_index is not None and device_index < devices.count():
            device = devices[device_index]
            latest_sensor_data = (
                SensorData.objects.filter(device=device).order_by("-timestamp").first()
            )

        # Determine LED status based on booking and sensor data
        led_status = "off"  # Default: no light
        led_color = "none"
        led_message = "No active booking"

        # Check if there's an active booking for this spot
        active_booking = Booking.objects.filter(
            parking_spot=parking_spot, status="active"
        ).first()

        if active_booking:
            # Check if booking is in overtime
            if active_booking.is_overtime:
                # Check if car is still parked (red light)
                is_car_still_parked = check_if_car_still_parked(parking_spot)

                if is_car_still_parked:
                    led_status = "on"
                    led_color = "red"
                    led_message = "OVERTIME - Car still parked after expiry"
                else:
                    led_status = "on"
                    led_color = "green"
                    led_message = "Green light - Vehicle has departed"
            else:
                # Normal active booking (blue light)
                led_status = "on"
                led_color = "blue"
                led_message = "ACTIVE BOOKING - Normal parking time"

        # Get sensor data info using same logic as home page
        sensor_info = None
        if latest_sensor_data:
            time_diff = timezone.now() - latest_sensor_data.timestamp

            # Use dual sensor data if available (same as home page logic)
            is_occupied = latest_sensor_data.is_occupied
            if (
                hasattr(latest_sensor_data, "slot1_occupied")
                and latest_sensor_data.slot1_occupied is not None
            ):
                if device_index == 0:  # Slot A
                    is_occupied = latest_sensor_data.slot1_occupied
                elif device_index == 1:  # Slot B
                    is_occupied = (
                        latest_sensor_data.slot2_occupied
                        if hasattr(latest_sensor_data, "slot2_occupied")
                        else latest_sensor_data.is_occupied
                    )

            sensor_info = {
                "is_occupied": is_occupied,
                "last_seen_seconds_ago": int(time_diff.total_seconds()),
                "distance_cm": getattr(latest_sensor_data, "distance_cm", None),
                "slot1_occupied": getattr(latest_sensor_data, "slot1_occupied", None),
                "slot2_occupied": getattr(latest_sensor_data, "slot2_occupied", None),
                "timestamp": latest_sensor_data.timestamp.isoformat(),
                "device_index": device_index,
            }

        return Response(
            {
                "spot_number": spot_number,
                "led_status": led_status,
                "led_color": led_color,
                "led_message": led_message,
                "is_occupied": parking_spot.is_occupied,
                "has_active_booking": active_booking is not None,
                "booking_id": active_booking.id if active_booking else None,
                "is_overtime": active_booking.is_overtime if active_booking else False,
                "sensor_data": sensor_info,
                "last_updated": timezone.now().isoformat(),
            }
        )

    except Exception as e:
        print(f"Error getting LED status for spot {spot_number}: {e}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete_overtime_booking(request, booking_id):
    """Manually complete an overtime booking (when car leaves)"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        if booking.status != "active":
            return Response(
                {"error": "Booking is not active"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Calculate final overtime
        overtime_minutes, overtime_cost = booking.update_overtime_billing()

        # Update total cost to include overtime
        base_cost = float(booking.total_cost or 0)
        booking.total_cost = base_cost + float(overtime_cost)

        # Mark as completed (keep slot occupied)
        booking.status = "completed"
        booking.save()

        # Send completion notification
        NotificationService.send_booking_completion_notification(booking)

        # Trigger ESP32 to turn off red light
        trigger_esp32_booking_led(booking.parking_spot.spot_number, False)

        return Response(
            {
                "message": "Overtime booking completed successfully",
                "overtime_minutes": overtime_minutes,
                "overtime_cost": float(overtime_cost),
                "total_cost_with_overtime": float(booking.total_cost or 0)
                + float(overtime_cost),
                "status": "completed",
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def check_all_overtime_bookings(request):
    """Check all active bookings for overtime - can be called periodically"""
    try:
        # Get all active bookings that have expired
        from django.utils import timezone

        expired_bookings = Booking.objects.filter(status="active").exclude(
            end_time__gt=timezone.now()
        )

        processed_bookings = []

        for booking in expired_bookings:
            try:
                # Calculate overtime
                overtime_minutes, overtime_cost = booking.calculate_overtime()

                if overtime_minutes > 0:
                    # Update overtime billing
                    booking.update_overtime_billing()

                    # Check if car is still parked
                    is_still_parked = check_if_car_still_parked(booking.parking_spot)

                    if is_still_parked:
                        # Send overtime alert notification
                        NotificationService.send_overtime_alert(booking)

                        processed_bookings.append(
                            {
                                "booking_id": booking.id,
                                "spot_number": booking.parking_spot.spot_number,
                                "overtime_minutes": overtime_minutes,
                                "overtime_cost": float(overtime_cost),
                                "total_cost_with_overtime": float(
                                    booking.total_cost or 0
                                )
                                + float(overtime_cost),
                                "status": "overtime_billing",
                            }
                        )
                    else:
                        # Car has left, complete the booking
                        # Update total cost to include overtime
                        base_cost = float(booking.total_cost or 0)
                        booking.total_cost = base_cost + float(overtime_cost)

                        booking.status = "completed"
                        booking.save()

                        # Send completion notification
                        NotificationService.send_booking_completion_notification(
                            booking
                        )

                        # Trigger ESP32 to turn off red light
                        trigger_esp32_booking_led(
                            booking.parking_spot.spot_number, False
                        )

                        processed_bookings.append(
                            {
                                "booking_id": booking.id,
                                "spot_number": booking.parking_spot.spot_number,
                                "overtime_minutes": overtime_minutes,
                                "overtime_cost": float(overtime_cost),
                                "total_cost_with_overtime": float(
                                    booking.total_cost or 0
                                )
                                + float(overtime_cost),
                                "status": "completed",
                            }
                        )

            except Exception as e:
                print(f"Error processing booking {booking.id}: {e}")

        return Response(
            {
                "message": f"Processed {len(processed_bookings)} overtime bookings",
                "processed_bookings": processed_bookings,
            }
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_update_booking_cost(request, booking_id):
    """Test endpoint to manually update booking total cost with overtime"""
    try:
        booking = Booking.objects.get(id=booking_id, user=request.user)

        # Get overtime data
        overtime_minutes = request.data.get("overtime_minutes", 0)
        overtime_cost = request.data.get("overtime_cost", 0)

        # Update overtime fields
        booking.overtime_minutes = overtime_minutes
        booking.overtime_cost = overtime_cost
        booking.is_overtime = overtime_minutes > 0

        # Save to trigger the model's save method
        booking.save()

        return Response(
            {
                "message": "Booking cost updated successfully",
                "booking_id": booking.id,
                "base_cost": float(booking.total_cost or 0)
                - float(booking.overtime_cost or 0),
                "overtime_cost": float(booking.overtime_cost or 0),
                "total_cost": float(booking.total_cost or 0),
                "overtime_minutes": booking.overtime_minutes,
            }
        )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def detect_car_parked(request, booking_id):
    """Detect when car is parked and start the timer"""
    try:
        from django.utils import timezone

        booking = Booking.objects.get(id=booking_id, user=request.user)
        now = timezone.now()

        # Check if grace period is still active (within 10 seconds)
        if booking.grace_period_started:
            grace_elapsed = (now - booking.grace_period_started).total_seconds()

            if grace_elapsed <= 10:
                # Car parked within grace period - start timer
                booking.timer_started = now
                booking.grace_period_ended = now
                booking.save()

                print(
                    f"✅ Car detected for booking {booking_id} - Timer started at {now}"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Car detected! Timer started.",
                        "booking_id": booking.id,
                        "timer_started": booking.timer_started,
                        "grace_duration": grace_elapsed,
                    }
                )
            else:
                # Grace period expired - auto-cancel booking
                booking.status = "cancelled"
                booking.grace_period_ended = now
                booking.save()

                # Free up the parking spot
                booking.parking_spot.is_occupied = False
                booking.parking_spot.save()

                print(
                    f"❌ Grace period expired for booking {booking_id} - Auto-cancelled"
                )
                print(f"⏰ Grace period duration: {grace_elapsed:.1f} seconds")

                return Response(
                    {
                        "message": "Grace period expired. Booking cancelled.",
                        "booking_id": booking.id,
                        "status": "cancelled",
                        "grace_duration": grace_elapsed,
                    }
                )
        else:
            return Response(
                {"error": "No grace period found for this booking"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([AllowAny])
def submit_user_report(request):
    """Submit a user report to admin dashboard"""
    try:
        from django.utils import timezone

        # Accept JSON body or query params
        message = (
            (request.data.get("message") if hasattr(request, "data") else None)
            or request.query_params.get("message")
            or ""
        )
        message = str(message).strip()
        report_type = (
            (request.data.get("type") if hasattr(request, "data") else None)
            or request.query_params.get("type")
            or "user_report"
        )
        priority = (
            (request.data.get("priority") if hasattr(request, "data") else None)
            or request.query_params.get("priority")
            or "medium"
        )

        if not message or len(message) < 10:
            return Response(
                {"error": "Report message must be at least 10 characters long"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Persist to database
        report = UserReport.objects.create(
            user=request.user if request.user.is_authenticated else None,
            message=message,
            type=report_type,
            priority=priority,
            status="pending",
        )

        print(
            f"🚨 USER REPORT RECEIVED: id={report.id}, type={report.type}, priority={report.priority}, ts={report.created_at}"
        )

        return Response(
            {
                "message": "Report submitted successfully",
                "report_id": report.id,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        # Print full traceback for debugging
        try:
            import traceback

            traceback.print_exc()
        except Exception:
            pass
        print(f"Error processing user report: {e}")
        return Response(
            {"error": "Failed to submit report"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([AllowAny])
def get_admin_reports(request):
    """Get all user reports for admin dashboard"""
    try:
        from django.utils import timezone

        # Return latest 50 reports
        qs = UserReport.objects.all().order_by("-created_at")[:50]
        data = UserReportSerializer(qs, many=True).data
        return Response({"reports": data}, status=status.HTTP_200_OK)

    except Exception as e:
        print(f"Error fetching admin reports: {e}")
        return Response(
            {"error": "Failed to fetch reports"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
