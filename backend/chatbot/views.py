from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import timedelta

from parking_app.models import Booking, ParkingSpot
from parking_app.serializers import BookingSerializer

# Twilio imports for WhatsApp webhook
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse

try:
    from twilio.twiml.messaging_response import MessagingResponse
except ImportError:
    MessagingResponse = None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_booking(request):
    """
    Return the user's current active booking with remaining time and costs.
    """
    try:
        booking = (
            Booking.objects.filter(user=request.user, status="active")
            .order_by("-start_time")
            .first()
        )
        if not booking:
            return Response({"hasBooking": False, "message": "No active booking"})

        # Calculate remaining time
        now = timezone.now()
        remaining_seconds = max(0, int((booking.end_time - now).total_seconds()))

        # Compose summary
        data = BookingSerializer(booking).data
        data.update(
            {
                "hasBooking": True,
                "booking_id": booking.id,  # Add booking ID for cancel/extend operations
                "slot": getattr(booking, "slot_name", None)
                or getattr(booking, "spot", None)
                or getattr(booking.parking_spot, "spot_number", None)
                or f"Slot {booking.parking_spot.id}",
                "spot_number": getattr(booking.parking_spot, "spot_number", None),
                "slot_name": getattr(booking.parking_spot, "spot_number", None),
                "remaining_seconds": remaining_seconds,
                "can_extend": remaining_seconds > 0,
                "can_cancel": remaining_seconds > 60,  # basic guard
            }
        )
        return Response(data)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def booking_history(request):
    """
    Return user's booking history with optional filter window: days, weeks, months.
    Query params: window=days|weeks|months, value=<int>
    """
    try:
        window = request.query_params.get("window", "days")
        value = int(request.query_params.get("value", "7"))

        delta = timedelta(days=7)
        if window == "days":
            delta = timedelta(days=value)
        elif window == "weeks":
            delta = timedelta(weeks=value)
        elif window == "months":
            # Approximate month as 30 days; adjust later if needed
            delta = timedelta(days=30 * value)

        since = timezone.now() - delta
        bookings = Booking.objects.filter(
            user=request.user, start_time__gte=since
        ).order_by("-start_time")
        return Response(BookingSerializer(bookings, many=True).data)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def available_slots(request):
    """
    Return available slots in real time using existing ParkingSpot data.
    """
    try:
        spots = ParkingSpot.objects.filter(is_occupied=False)
        result = [
            {
                "id": s.id,
                "name": getattr(s, "spot_number", None)
                or getattr(s, "name", None)
                or f"Slot {s.id}",
            }
            for s in spots
        ]
        return Response({"available_spots": result})
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reserve_slot(request):
    """
    Reserve a slot directly from chat by calling existing booking flow.
    Expected body: { slot_id: number, duration_minutes: number }
    TODO: Integrate with your exact Booking creation logic if different.
    """
    try:
        slot_id = request.data.get("slot_id")
        duration_minutes = int(request.data.get("duration_minutes") or 60)
        if not slot_id:
            return Response(
                {"error": "slot_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Minimal placeholder: create active booking using existing fields
        # Replace with service/helper if you have one already.
        spot = ParkingSpot.objects.get(id=slot_id)
        start = timezone.now()
        end = start + timedelta(minutes=duration_minutes)

        booking = Booking.objects.create(
            user=request.user,
            parking_spot=spot,
            start_time=start,
            end_time=end,
            duration_minutes=duration_minutes,
            status="active",
            grace_period_started=start,  # Enable timer detection
            timer_started=None,  # Will be set when car detected
        )
        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)
    except ParkingSpot.DoesNotExist:
        return Response({"error": "Slot not found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def help_info(request):
    """Static help responses for the chatbot."""
    return Response(
        {
            "message": (
                "Hi, I’m Calvin 🤖\n\n"
                "What I can do:\n"
                "• Show parking status and devices online\n"
                "• Show your current booking (time left, totals)\n"
                "• List bookings by date (e.g. 2025-09-03)\n"
                "• Show available slots (A/B) and reserve directly\n\n"
                "How to use me:\n"
                "• Say ‘hi’ to see options 👋\n"
                "• ‘show available slots’ → pick A or B\n"
                "• ‘reserve A 60’ → book Slot A for 60 minutes 🅿️\n"
                "• ‘my bookings on 2025-09-03’ → list for that date\n\n"
                "Tips:\n"
                "• You can also type: reserve <A|B|slotId> <minutes>\n"
                "• If A/B is not available, I’ll tell you what is."
            )
        }
    )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def twilio_whatsapp_webhook(request):
    """
    Twilio WhatsApp webhook endpoint for basic chatbot functionality.
    Configure Twilio WhatsApp webhook URL to: /api/chatbot/twilio/webhook/
    """
    try:
        body = (request.data.get("Body") or "").strip()
        body_lower = body.lower()

        def reply_text(text: str) -> HttpResponse:
            if MessagingResponse is None:
                return HttpResponse(text, content_type="text/plain")
            resp = MessagingResponse()
            resp.message(text)
            return HttpResponse(str(resp), content_type="application/xml")

        if not body:
            return reply_text("Hi, I'm Calvin 🤖. Reply with 'menu' to see options.")

        # Basic commands for WhatsApp
        if body_lower in ("hi", "hello", "menu"):
            msg = (
                "Hi👋! I'm Calvin, your Smart Parking assistant!\n\n"
                "1) Book a slot\n2) Current booking\n3) Booking history\n4) Available slots\n5) Help\n\n"
                "Reply with a number or command."
            )
            return reply_text(msg)

        if "current" in body_lower or "my booking" in body_lower:
            return reply_text(
                "To view your current booking, please use the mobile app."
            )

        if "available" in body_lower or "slots" in body_lower:
            spots = ParkingSpot.objects.filter(is_occupied=False)[:2]
            if not spots:
                return reply_text("No slots available right now.")
            names = [getattr(s, "spot_number", f"Slot {s.id}") for s in spots]
            return reply_text("Available: " + ", ".join(names))

        if body_lower.startswith("reserve"):
            return reply_text(
                "Reservation via WhatsApp is not enabled yet. Please use the app to reserve."
            )

        if "help" in body_lower:
            return reply_text(
                "Try: 'menu', 'available slots', 'current booking', or use the app to reserve."
            )

        # Default fallback
        return reply_text(
            "I didn't understand that. Reply 'menu' to see options, or use the app."
        )

    except Exception as e:
        return HttpResponse(f"Error: {e}", content_type="text/plain", status=500)
