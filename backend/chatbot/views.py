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
    Only show slots A and B (your actual parking slots).
    """
    try:
        # Only show slots A and B that are not occupied
        spots = ParkingSpot.objects.filter(
            is_occupied=False, spot_number__in=["A", "B"]
        )
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
            number_plate=(
                getattr(request.user.profile, "number_plate", "")
                if hasattr(request.user, "profile")
                else ""
            ),
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


# Helper functions for WhatsApp webhook - exactly matching mobile app logic
def parse_whatsapp_intent(raw):
    """Parse user intent from WhatsApp message - matches mobile app logic"""
    import re

    if not raw:
        return {"type": "none"}

    s = re.sub(r"\s+", " ", raw.lower()).strip()

    # Greeting
    if re.match(r"^(hi|hello|hey)\b", s):
        return {"type": "greet"}

    # Goodbye
    if re.search(r"\b(bye|goodbye|see you|thanks,? bye)\b", s):
        return {"type": "goodbye"}

    # Help
    if re.search(r"(help|manual|how to|guide|instructions)", s):
        return {"type": "help"}

    # Current booking
    if re.search(r"(current|my booking|time left|remaining)", s):
        return {"type": "current"}

    # Book/Slot
    if re.search(r"\bslot\s*a\b|\ba\b(?!\w)", s):
        return {"type": "reserve", "slot": "A"}
    if re.search(r"\bslot\s*b\b|\bb\b(?!\w)", s):
        return {"type": "reserve", "slot": "B"}

    # Reserve/Book intent
    if re.search(r"(reserve|book|hold|save)\b", s):
        slot = None
        if re.search(r"\bslot\s*a\b|\ba\b(?!\w)", s):
            slot = "A"
        elif re.search(r"\bslot\s*b\b|\bb\b(?!\w)", s):
            slot = "B"
        return {"type": "reserve", "slot": slot}

    # Cancel
    if re.search(r"(cancel|stop|end|terminate|delete)\b", s) or s == "cancel":
        return {"type": "cancel"}

    # Balance
    if re.search(r"(balance|wallet)", s):
        return {"type": "balance"}

    # Bookings/History
    if re.search(r"(bookings|history)", s):
        return {"type": "bookings"}

    # Extend
    if re.search(r"(extend|add|increase)\b", s):
        minutes_match = re.search(r"(\d+)", s)
        minutes = int(minutes_match.group(1)) if minutes_match else None
        return {"type": "extend", "minutes": minutes}

    # Report
    if re.search(r"(report|issue|problem|complaint)", s):
        return {"type": "report"}

    # Date search
    date_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", s)
    if date_match:
        return {"type": "search_date", "date": date_match.group(1)}

    # Slots/Available
    if re.search(r"(slots|available)", s):
        return {"type": "slots"}

    # Login
    if re.search(r"(login|sign in|auth)", s):
        return {"type": "login"}

    # Book intent
    if re.search(r"(book|reserve|hold|save)\b", s) and re.search(
        r"(slot|\b[a|b]\b|#|\d)", s
    ):
        slot = (
            "A" if re.search(r"\ba\b", s) else "B" if re.search(r"\bb\b", s) else None
        )
        return {"type": "book", "slot": slot}

    return {"type": "unknown"}


def get_whatsapp_user(from_number):
    """Get or create user for WhatsApp number"""
    from parking_app.models import UserProfile
    from django.contrib.auth.models import User

    from_number_clean = from_number.replace("+", "").replace(" ", "")
    username = f"whatsapp_{from_number_clean}"

    try:
        return User.objects.get(username=username)
    except User.DoesNotExist:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@whatsapp.local",
            password="".join(
                [
                    str(int(from_number_clean[i : i + 2]) % 10)
                    for i in range(min(8, len(from_number_clean)))
                ]
            ),
        )
        UserProfile.objects.create(
            user=user,
            phone_number=from_number_clean,
            balance=100.00,
        )
        return user


def authenticate_whatsapp_user(username, password):
    """Authenticate user for WhatsApp"""
    from django.contrib.auth import authenticate
    from django.contrib.auth.models import User
    from parking_app.models import UserProfile
    import logging

    logger = logging.getLogger(__name__)

    # Try to find user by username (case-insensitive)
    try:
        user_obj = User.objects.get(username__iexact=username.strip())
        logger.info(f"Found user: {user_obj.username}")

        # Authenticate with the actual username from database
        user = authenticate(username=user_obj.username, password=password)

        if user is None:
            logger.warning("Authentication failed - invalid password")
            return None, "Invalid username or password"

        if not user.is_active:
            logger.warning("User is not active")
            return None, "Account is deactivated"

        # Check if profile exists
        try:
            profile = UserProfile.objects.get(user=user)
            logger.info(f"Authentication successful for: {user.username}")
            return user, None
        except UserProfile.DoesNotExist:
            logger.warning("User profile not found")
            return None, "User profile not found"

    except User.DoesNotExist:
        logger.warning(f"User not found: {username}")
        return None, "Invalid username or password"
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        return None, f"Authentication error: {str(e)}"


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def twilio_whatsapp_webhook(request):
    """
    Twilio WhatsApp webhook endpoint - uses the same logic as mobile app chatbot.
    Calls existing chatbot APIs for consistency.
    Configure Twilio WhatsApp webhook URL to: /api/chatbot/twilio/webhook/
    """
    import logging
    import traceback
    from django.conf import settings
    from parking_app.models import UserProfile, ParkingSpot
    from django.contrib.auth.models import User
    from datetime import timedelta
    from django.utils import timezone
    from parking_app.serializers import BookingSerializer
    import re

    logger = logging.getLogger(__name__)

    # Helper function to call existing chatbot APIs (same as mobile app)
    def call_chatbot_api(endpoint, method="GET", data=None):
        """Call the exact same API endpoints the mobile app uses"""
        from django.test import RequestFactory
        from django.contrib.auth.models import AnonymousUser

        factory = RequestFactory()
        if method == "GET":
            req = factory.get(f"/api/chatbot/{endpoint}/")
        else:
            req = factory.post(f"/api/chatbot/{endpoint}/", data or {})

        # Set user for authenticated endpoints
        user = get_user()
        req.user = user if user else AnonymousUser()

        # Import and call the actual view functions
        if endpoint == "available-slots":
            return available_slots(req)
        elif endpoint == "current-booking":
            return current_booking(req)
        elif endpoint == "booking-history":
            return booking_history(req)
        elif endpoint == "reserve":
            return reserve_slot(req)
        elif endpoint == "help":
            return help_info(req)

        return None

    # Translation support for multi-language (English, Shona, Ndebele)
    translations = {
        "en": {
            "greet": "Greetings👋! I'm Calvin, your Smart Parking assistant!",
            "menu": "What would you like to do?\n\n1️⃣ Book a slot\n2️⃣ Check current booking\n3️⃣ View booking history\n4️⃣ Search bookings by date\n5️⃣ Report an issue\n6️⃣ Help & Support\n7️⃣ Check balance\n8️⃣ Language\n9️⃣ Logout\n\nJust type the number (1-9) to select an option!\n\n💡 Tip: Type 'menu' anytime to return here!",
            "booked": lambda slot: f'✅ Successfully booked Slot {slot}!\n\n📱 Navigate to the "Current Bookings" page to view your booking details.',
            "expiry_warn": "⏰ Time expired before you entered the slot.",
            "left_slot": lambda amount: f"🚗 You left the slot. Amount charged: ${amount:.2f}.",
            "receipt": lambda data: f"🧾 PARKING RECEIPT\n━━━━━━━━━━━━━━━━━━━━\n📍 Slot: {data['slot']}\n🕐 Parked: {data['startTime']}\n🕑 Left: {data['endTime']}\n⏱️ Duration: {data['duration']}\n💰 Amount: ${data['amount']:.2f}\n💳 Balance: ${data['balance']:.2f}\n━━━━━━━━━━━━━━━━━━━━\n✅ Payment successful!\n\nThank you for using Smart Parking! 🚗",
            "balance_is": lambda bal: f"💳 Your wallet balance is ${bal:.2f}.",
            "choose_lang": "🌐 Choose language:\n \n1. English \n2. Shona \n3. Ndebele",
            "lang_set": lambda l: f"✅ Language set to {l}.",
            "available_intro": "🅿️ Here's what I have right now",
            "tap_to_reserve": "👆 Tap a slot below to reserve.",
            "occupied_start": "✅ Car parked successfully! Timer started.",
            "parking_confirmed": lambda slot: f"🚗 You're now parked in {slot}!\n⏰ Timer is running - you'll be charged $1 per 30 seconds.\n🔴 Red light indicates your slot is occupied.",
            "no_booking": "❌ You don't have an active booking.",
            "booking_cancelled": "✅ Booking cancelled successfully!",
            "booking_extended": lambda minutes: f"✅ Booking extended by {minutes} minutes!",
            "no_bookings": "📋 You have no bookings yet.",
            "no_slots": "🚫 No slots available right now.",
            "slot_not_available": lambda slot: f"❌ Slot {slot} is not available right now.",
            "reservation_failed": "❌ Reservation failed. Please try again.",
            "system_offline": "⚠️ Sorry, the system is currently offline. I Cannot perform action while IoT system is offline.",
            "grace_countdown": lambda seconds: f"⏳ {seconds}s remaining in grace period...",
            "invalid_date": "❌ Please enter a valid date in YYYY-MM-DD format.",
            "report_too_short": "❌ Please provide more details (at least 10 characters).",
            "report_sent": "✅ Thank you for your report! I've forwarded it to the admin team.",
            "report_failed": "❌ Sorry, there was an issue sending your report.",
            "goodbye": "👋 Goodbye! Drive safe 🚗✨\n\nIf you need anything else, just say 'hi' or 'menu'!",
            "help_message": "ℹ️ Here to help! Try saying: show available slots, reserve A, or my bookings.",
            "invalid_option": "❌ Invalid option. Please type a number between 1-8.",
            "didnt_understand": "🤔I didnSorry but 't understand that. Kindly type in 'menu' to see available options, or try:\n• 'book slot' - Make a reservation\n• 'my booking' - Check current booking\n• 'balance' - Check wallet balance",
        },
        "sn": {
            "greet": "Mhoro! Ndini Calvin, mubatsiri weSmart Parking! 🤖",
            "menu": "Ungadei kuita?\n\n1️⃣ Bhuka slot\n2️⃣ Tarisa booking yazvino\n3️⃣ Ongorora nhoroondo\n4️⃣ Tsvaga ma bookings nezuva\n5️⃣ Tumira dambudziko\n6️⃣ Rubatsiro & Support\n7️⃣ Tarisa balance\n8️⃣ Mutauro\n\nNyora nhamba (1-8) kusarudza!\n\n💡 Nyora 'menu' kudzokera pano!",
            "booked": lambda slot: f'✅ Wabhuka pa Slot {slot}!\n\n📱 Enda ku "Current Bookings" page kuti uone booking yako.',
            "expiry_warn": "⏰ Nguva yapera usati wapinda mu slot.",
            "left_slot": lambda amount: f"🚗 Wabuda pa slot. Wakabhadharwa: ${amount:.2f}.",
            "receipt": lambda data: f"🧾 RECEIPT YE PARKING\n━━━━━━━━━━━━━━━━━━━━\n📍 Slot: {data['slot']}\n🕐 Wakapinda: {data['startTime']}\n🕑 Wabuda: {data['endTime']}\n⏱️ Nguva: {data['duration']}\n💰 Mari: ${data['amount']:.2f}\n💳 Balance: ${data['balance']:.2f}\n━━━━━━━━━━━━━━━━━━━━\n✅ Kubhadhara kwabudirira!\n\nTinokutenda kushandisa Smart Parking! 🚗",
            "balance_is": lambda bal: f"💳 Balance yako ndeye ${bal:.2f}.",
            "choose_lang": "🌐 Sarudza mutauro: 1) Chirungu 2) Shona 3) Ndebele",
            "lang_set": lambda l: f"✅ Mutauro wasarudzwa: {l}.",
            "available_intro": "🅿️ Zviripo pari zvino",
            "tap_to_reserve": "👆 Dzvanya slot pasi apa kuti ubhuke.",
            "occupied_start": "✅ Mota yakamira! Timer yatanga.",
            "parking_confirmed": lambda slot: f"🚗 Zvino wamira pa {slot}!\n⏰ Timer iri kushanda - uchabhadharwa $1 pa30 seconds.\n🔴 Chiedza chitsvuku chinoratidzira kuti slot yako ine mota.",
            "no_booking": "❌ Hauna booking yauri kushandisa.",
            "booking_cancelled": "✅ Booking yakanzurwa!",
            "booking_extended": lambda minutes: f"✅ Booking yakawedzerwa neminutes {minutes}!",
            "no_bookings": "📋 Hauna ma bookings.",
            "no_slots": "🚫 Hapana ma slots aripo pari zvino.",
            "slot_not_available": lambda slot: f"❌ Slot {slot} haina kuwanikwa pari zvino.",
            "reservation_failed": "❌ Kubhuka kwakundikana. Edza zvakare.",
            "system_offline": "⚠️ Haigone kuita izvi IoT system isiri kushanda.",
            "grace_countdown": lambda seconds: f"⏳ {seconds}s yasara mu grace period...",
            "invalid_date": "❌ Isa zuva rakanaka mu YYYY-MM-DD format.",
            "report_too_short": "❌ Ipa mamwe mashoko (anoda 10 characters).",
            "report_sent": "✅ Tinokutenda! Ndatumira report yako ku admin team.",
            "report_failed": "❌ Pane dambudziko rekutumira report yako.",
            "goodbye": "👋 Chisarai! Tyaira wakachengeteka 🚗✨\n\nKana uchida chimwe chinhu, iti 'hi' kana 'menu'!",
            "help_message": "ℹ️ Ndiri pano kubatsira! Edza kuti: ratidza ma slots, bhuka A, kana ma bookings angu.",
            "invalid_option": "❌ Nhamba isina kukwana. Isa nhamba iri pakati pe1-8.",
            "didnt_understand": "🤔 Handina kunzwisisa izvo. Nyora 'menu' kuona zvinoitwa, kana:\n• 'book slot' - Bhuka nzvimbo\n• 'my booking' - Tarisa booking yako\n• 'balance' - Tarisa mari yako",
        },
        "nd": {
            "greet": "Sawubona! Ngingu Calvin, umsizi weSmart Parking! 🤖",
            "menu": "Ufuna ukwenzani?\n\n1️⃣ Bhuka i-slot\n2️⃣ Bheka i-booking yamanje\n3️⃣ Bukela umlando\n4️⃣ Sesha ama booking ngosuku\n5️⃣ Bika inkinga\n6️⃣ Usizo & Support\n7️⃣ Bheka ibhalansi\n8️⃣ Ulimi\n\nBhala inombolo (1-8) ukukhetha!\n\n💡 Bhala 'menu' ukubuyela lapha!",
            "booked": lambda slot: f'✅ Ubukhile i-Slot {slot}!\n\n📱 Hamba ku "Current Bookings" page ukubona i-booking yakho.',
            "expiry_warn": "⏰ Isikhathi siphelile ungakangenisi imoto.",
            "left_slot": lambda amount: f"🚗 Usushiyile i-slot. Ukhokhisiwe: ${amount:.2f}.",
            "receipt": lambda data: f"🧾 I-RECEIPT YE PARKING\n━━━━━━━━━━━━━━━━━━━━\n📍 I-Slot: {data['slot']}\n🕐 Wangena: {data['startTime']}\n🕑 Waphuma: {data['endTime']}\n⏱️ Isikhathi: {data['duration']}\n💰 Imali: ${data['amount']:.2f}\n💳 Ibhalansi: ${data['balance']:.2f}\n━━━━━━━━━━━━━━━━━━━━\n✅ Ukukhokhela kuphumelele!\n\nSiyabonga ukusebenzisa Smart Parking! 🚗",
            "balance_is": lambda bal: f"💳 Ibhalaansi yakho ${bal:.2f}.",
            "choose_lang": "🌐 Khetha ulimi: 1) English 2) Shona 3) Ndebele",
            "lang_set": lambda l: f"✅ Ulimi lubekiwe: {l}.",
            "available_intro": "🅿️ Okukhona manje",
            "tap_to_reserve": "👆 Thepha i-slot ngezansi ukuze ubhuke.",
            "occupied_start": "✅ Imoto imisiwe! Isikhathi siqalile.",
            "parking_confirmed": lambda slot: f"🚗 Manje umisile e {slot}!\n⏰ Isikhathi siyasebenza - uzakhokhiswa $1 nge30 seconds.\n🔴 Ukukhanya okubomvu kuveza ukuthi i-slot yakho inemoto.",
            "no_booking": "❌ Awunayo i-booking esebenzayo.",
            "booking_cancelled": "✅ I-booking icinyiwe ngempumelelo!",
            "booking_extended": lambda minutes: f"✅ I-booking yelulwe ngemizuzu engu{minutes}!",
            "no_bookings": "📋 Awunayo ama-booking okwamanje.",
            "no_slots": "🚫 Azikho izindawo ezitholakalayo manje.",
            "slot_not_available": lambda slot: f"❌ I-Slot {slot} ayitholakali manje.",
            "reservation_failed": "❌ Ukubhuka kuhlulekile. Zama futhi.",
            "system_offline": "⚠️ Ngeke kwenziwe lokhu ngoba i-IoT system ayisebenzi.",
            "grace_countdown": lambda seconds: f"⏳ {seconds}s esele ku-grace period...",
            "invalid_date": "❌ Faka usuku olulungile nge-YYYY-MM-DD format.",
            "report_too_short": "❌ Nikeza imininingwane eyengeziwe (okungenani amagama ayi-10).",
            "report_sent": "✅ Siyabonga! Ngithumele umbiko wakho ku-admin team.",
            "report_failed": "❌ Uxolo, kukhona inkinga yokuthumela umbiko wakho.",
            "goodbye": "👋 Hamba kahle! Shayela uphephile 🚗✨\n\nUma udinga okunye, yithi 'hi' noma 'menu'!",
            "help_message": "ℹ️ Ngilapha ukusiza! Zama ukuthi: khombisa ama-slots atholakalayo, bhuka A, noma ama-booking ami.",
            "invalid_option": "❌ Inombolo engalungile. Bhala inombolo ephakathi kuka-1-8.",
            "didnt_understand": "🤔 Angikuqondile lokho. Bhala 'menu' ukubona ongakwenza, noma:\n• 'book slot' - Bhuka indawo\n• 'my booking' - Bheka i-booking yakho\n• 'balance' - Bheka imali yakho",
        },
    }

    def t(key, *args):
        # Get user's language preference from session, default to English
        lang = request.session.get("whatsapp_language", "en")
        trans = translations.get(lang, translations["en"])
        val = trans.get(key)
        if callable(val):
            return val(*args)
        return val or key

    def reply_text(text: str) -> HttpResponse:
        resp = MessagingResponse()
        resp.message(text)
        logger.info(f"📤 Replying with: {text[:100]}")
        return HttpResponse(str(resp), content_type="application/xml")

    def reply_messages(messages: list) -> HttpResponse:
        """Send multiple messages as separate WhatsApp messages"""
        resp = MessagingResponse()
        for msg in messages:
            resp.message(msg)
        logger.info(f"📤 Replying with: {messages[0][:100] if messages else ''}")
        return HttpResponse(str(resp), content_type="application/xml")

    # Intent parsing helpers
    def normalize(s):
        if not s:
            return ""
        return re.sub(r"\s+", " ", s.lower()).strip()

    def extract_slot(s):
        if re.search(r"\bslot\s*a\b|\ba\b(?!\w)", s, re.I):
            return "A"
        if re.search(r"\bslot\s*b\b|\bb\b(?!\w)", s, re.I):
            return "B"
        return None

    def extract_date(s):
        m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", s)
        return m.group(1) if m else None

    def is_greet(s):
        return bool(re.match(r"^(hi|hello|hey)\b", s.lower()))

    def is_goodbye(s):
        return bool(re.search(r"\b(bye|goodbye|see you|thanks,? bye)\b", s.lower()))

    def is_help(s):
        return bool(re.search(r"(help|manual|how to|guide|instructions)", s.lower()))

    def is_current_booking(s):
        return bool(re.search(r"(current|my booking|time left|remaining)", s.lower()))

    def is_reserve_intent(s):
        return bool(re.search(r"(reserve|book|hold|save)\b", s.lower())) and bool(
            re.search(r"(slot|\b[a|b]\b|#|\d)", s.lower())
        )

    def is_extend_intent(s):
        return bool(re.search(r"(extend|add|increase)\b", s.lower())) and bool(
            re.search(r"(minute|min|hour|hr|hrs|\d+)", s.lower())
        )

    def is_cancel_intent(s):
        return bool(
            (
                re.search(r"(cancel|stop|end|terminate|delete)\b", s.lower())
                and re.search(r"(booking|reservation|slot|my booking)", s.lower())
            )
            or s.lower().strip() == "cancel"
        )

    def is_report_intent(s):
        return bool(
            re.search(r"(report|issue|problem|complaint|bug|error|feedback)", s.lower())
        )

    try:
        # Log all incoming data for debugging
        logger.info(f"🔍 Webhook called - Method: {request.method}")
        logger.info(f"🔍 POST data: {dict(request.POST)}")

        # Simple test response for GET requests
        if request.method == "GET":
            return HttpResponse(
                "WhatsApp webhook is working! Send POST requests from Twilio."
            )

        body = (request.POST.get("Body") or "").strip()
        from_number = request.POST.get("From", "").replace("whatsapp:", "")
        body_lower = body.lower().strip()

        # Log incoming message for debugging
        logger.info(f"📱 WhatsApp message from {from_number}: '{body}'")
        logger.info(f"📱 Body length: {len(body)}, From: {from_number}")

        # Helper function to get user - check if authenticated first
        def get_user():
            # Check if user is authenticated
            authenticated_user_id = request.session.get(
                "whatsapp_authenticated_user_id"
            )
            if authenticated_user_id:
                try:
                    from django.contrib.auth.models import User

                    return User.objects.get(id=authenticated_user_id)
                except User.DoesNotExist:
                    pass
            # Fall back to guest user
            return get_whatsapp_user(from_number)

        # Initialize session if needed
        if "whatsapp_conversation" not in request.session:
            request.session["whatsapp_conversation"] = True
            request.session["whatsapp_language"] = "en"
            request.session["whatsapp_menu_mode"] = False
            request.session["whatsapp_flow"] = "idle"

        if not body:
            # Just show menu
            logger.info("📱 Empty body received - showing greeting")
            return reply_text(
                "Greetings👋! I'm Calvin, your Smart Parking assistant!\n\nReply with 'menu' to see options!"
            )

        # Parse intent using global function
        intent = parse_whatsapp_intent(body)
        flow = request.session.get("whatsapp_flow", "idle")
        menu_mode = request.session.get("whatsapp_menu_mode", False)

        # Handle greeting and menu - check authentication first
        if intent["type"] == "greet" or body_lower in ("hi", "hello", "menu", "hey"):
            # Check if user is authenticated
            if not request.session.get("whatsapp_authenticated_user_id"):
                logger.info(
                    "📱 Greeting detected but user not authenticated - prompting login"
                )
                request.session["whatsapp_flow"] = "login_username"
                return reply_text(
                    "🔐 *Welcome to Smart Parking!*\n\n"
                    "Please login to continue:\n"
                    "Enter your username:"
                )

            # User is authenticated, show menu
            logger.info(
                f"📱 Greeting detected - authenticated user, intent: {intent['type']}, body: '{body_lower}'"
            )
            msg = f"{t('greet')}\n\n{t('menu')}"
            request.session["whatsapp_menu_mode"] = True
            request.session["whatsapp_flow"] = "idle"
            logger.info(f"📱 Sending greeting menu: {msg[:100]}")
            return reply_text(msg)

        if "help" in body_lower or is_help(body):
            return reply_text(t("help_message"))

        if is_goodbye(body):
            return reply_text(t("goodbye"))

        # Handle login flow
        if request.session.get("whatsapp_flow") == "login_username":
            # User provided username, now ask for password
            request.session["whatsapp_login_username"] = body
            request.session["whatsapp_flow"] = "login_password"
            return reply_text("🔐 Enter your password:")

        if request.session.get("whatsapp_flow") == "login_password":
            # User provided password, authenticate
            username = request.session.get("whatsapp_login_username")
            password = body

            # Clear password from memory after use (security)
            try:
                user, error = authenticate_whatsapp_user(username, password)
                # password variable will be out of scope after this block

                if user and not error:
                    # Successfully authenticated
                    request.session["whatsapp_authenticated_user_id"] = user.id
                    request.session["whatsapp_flow"] = "idle"
                    request.session.pop(
                        "whatsapp_login_username", None
                    )  # Clear username from session

                    # Set active session
                    request.session["whatsapp_active_session"] = True

                    # Check if there's a pending action
                    pending_action = request.session.get("whatsapp_pending_action")
                    if pending_action:
                        # Send success message only
                        success_msg = (
                            f"✅ Login successful!\n\n" f"Welcome {user.username}!"
                        )

                        # Clear pending action flag
                        request.session.pop("whatsapp_pending_action", None)

                        # Process the pending action immediately
                        if pending_action == 1:  # Book a slot
                            spots = ParkingSpot.objects.filter(
                                is_occupied=False, spot_number__in=["A", "B"]
                            )
                            if not spots.exists():
                                return reply_messages([success_msg, t("no_slots")])
                            slot_a = spots.filter(spot_number="A").first()
                            slot_b = spots.filter(spot_number="B").first()
                            msg = f"{t('available_intro')} 🚗:\n"
                            if slot_a:
                                msg += f"• {slot_a.spot_number} (#{slot_a.id})\n"
                            if slot_b:
                                msg += f"• {slot_b.spot_number} (#{slot_b.id})\n"
                            msg += (
                                f"\n{t('tap_to_reserve')}\n\nType 'book A' or 'book B'"
                            )
                            return reply_messages([success_msg, msg])
                        elif pending_action == 2:  # Check booking
                            booking = (
                                Booking.objects.filter(user=user, status="active")
                                .order_by("-start_time")
                                .first()
                            )
                            if not booking:
                                return reply_messages([success_msg, t("no_booking")])
                            remaining_seconds = max(
                                0,
                                int(
                                    (booking.end_time - timezone.now()).total_seconds()
                                ),
                            )
                            minutes = remaining_seconds // 60
                            seconds = remaining_seconds % 60
                            return reply_messages(
                                [
                                    success_msg,
                                    f"📋 Current Booking:\n\n"
                                    f"Slot: {booking.parking_spot.spot_number}\n"
                                    f"Time Remaining: {minutes}m {seconds}s\n"
                                    f"Status: {booking.status}",
                                ]
                            )
                        elif pending_action == 3:  # History
                            bookings = Booking.objects.filter(user=user).order_by(
                                "-start_time"
                            )[:3]
                            if not bookings:
                                return reply_messages([success_msg, t("no_bookings")])
                            msg = "📋 Your Recent Bookings:\n\n"
                            for i, b in enumerate(bookings, 1):
                                start = (
                                    b.start_time.strftime("%Y-%m-%d %H:%M")
                                    if b.start_time
                                    else "-"
                                )
                                end = (
                                    b.end_time.strftime("%Y-%m-%d %H:%M")
                                    if b.end_time
                                    else "-"
                                )
                                msg += (
                                    f"#{i} {b.parking_spot.spot_number} | {b.status}\n"
                                )
                                msg += f"Start: {start}\nEnd: {end}\n\n"
                            return reply_messages([success_msg, msg.strip()])
                        elif pending_action == 4:  # Search
                            request.session["whatsapp_flow"] = "search_date"
                            return reply_messages(
                                [
                                    success_msg,
                                    "Please enter a date in YYYY-MM-DD format (e.g., 2025-01-15):",
                                ]
                            )
                        elif pending_action == 7:  # Balance
                            profile = UserProfile.objects.get(user=user)
                            return reply_messages(
                                [success_msg, t("balance_is", float(profile.balance))]
                            )

                    # Send two separate messages
                    success_msg = (
                        f"✅ Login successful!\n\n" f"Welcome {user.username}!"
                    )

                    # Get the menu message
                    menu_msg = f"{t('greet')}\n\n{t('menu')}"

                    return reply_messages([success_msg, menu_msg])
                else:
                    # Authentication failed - restart login
                    request.session["whatsapp_flow"] = "login_username"
                    request.session.pop("whatsapp_login_username", None)
                    return reply_text(
                        f"❌ Login failed: {error or 'Invalid credentials'}\n\n"
                        f"Please try again.\n\n"
                        f"Enter your username:"
                    )
            except Exception as e:
                import traceback

                traceback.print_exc()
                request.session["whatsapp_flow"] = "login_username"
                request.session.pop("whatsapp_login_username", None)
                return reply_text(
                    f"❌ Login error: {str(e)}\n\n"
                    f"Please try again.\n\n"
                    f"Enter your username:"
                )
            finally:
                # Ensure password is cleared (it's in local scope 'password')
                password = None  # Explicitly clear

        # Handle login intent (optional - user can type "login" to restart flow)
        if intent["type"] == "login" or "login" in body_lower:
            request.session["whatsapp_flow"] = "login_username"
            request.session.pop(
                "whatsapp_login_username", None
            )  # Reset any previous attempt
            return reply_text("🔐 Enter your username:")

        # Allow login flows even when not authenticated
        is_in_login_flow = request.session.get("whatsapp_flow") in (
            "login_username",
            "login_password",
        )

        # Check if in menu mode and user typed a number
        logger.info(
            f"📱 Checking menu mode: {request.session.get('whatsapp_menu_mode', False)}"
        )
        logger.info(
            f"📱 Body matches pattern: {bool(re.match(r'^[1-9]$', body_lower))}"
        )

        if request.session.get("whatsapp_menu_mode", False) and re.match(
            r"^[1-9]$", body_lower
        ):
            menu_choice = int(body_lower)
            logger.info(f"📱 Menu choice: {menu_choice}")
            request.session["whatsapp_menu_mode"] = False

            # Check authentication for all menu options
            if not request.session.get("whatsapp_authenticated_user_id"):
                logger.info(
                    f"📱 Menu choice {menu_choice} but user not authenticated - prompting login"
                )
                request.session["whatsapp_flow"] = "login_username"
                return reply_text(
                    "🔐 Please login first to use this feature:\n"
                    "Enter your username:"
                )

            if menu_choice == 1:  # Book a slot
                logger.info("📱 Processing option 1 - Book a slot")
                # Use the exact same API as mobile app
                try:
                    api_response = call_chatbot_api("available-slots")
                    if api_response.status_code == 200:
                        slots_data = api_response.data.get("available_spots", [])

                        if not slots_data:
                            return reply_text("🚫 No slots available right now.")

                        msg = "🅿️ Available slots:\n"
                        for slot in slots_data:
                            msg += f"• {slot['name']} (#{slot['id']})\n"
                        msg += "\nType 'book A' or 'book B' to reserve"

                        return reply_text(msg)
                    else:
                        return reply_text("🚫 No slots available right now.")
                except Exception as e:
                    logger.error(f"Error getting available slots: {e}")
                    return reply_text("🚫 No slots available right now.")

            elif menu_choice == 2:  # Check current booking
                # Use the exact same API as mobile app
                try:
                    api_response = call_chatbot_api("current-booking")
                    if api_response.status_code == 200:
                        data = api_response.data
                        if data.get("hasBooking"):
                            slot = data.get("slot", "Unknown")
                            remaining_time = data.get("remaining_time", "0m 0s")
                            status = data.get("status", "active")

                            return reply_text(
                                f"📋 Current Booking:\n\n"
                                f"Slot: {slot}\n"
                                f"Time Remaining: {remaining_time}\n"
                                f"Status: {status}"
                            )
                        else:
                            return reply_text(t("no_booking"))
                    else:
                        return reply_text(t("no_booking"))
                except Exception as e:
                    logger.error(f"Error getting current booking: {e}")
                    return reply_text(t("no_booking"))

            elif menu_choice == 3:  # View booking history
                logger.info("📱 Processing option 3 - View booking history")
                # Use the exact same API as mobile app
                try:
                    api_response = call_chatbot_api("booking-history")
                    logger.info(f"📱 API response status: {api_response.status_code}")
                    logger.info(f"📱 API response data: {api_response.data}")

                    if api_response.status_code == 200:
                        bookings = (
                            api_response.data
                        )  # Data is returned directly as a list
                        logger.info(f"📱 Found {len(bookings)} bookings")

                        if not bookings:
                            logger.info("📱 No bookings found")
                            return reply_text(t("no_bookings"))

                        msg = "📋 Your Recent Bookings:\n\n"
                        for i, b in enumerate(bookings[:3], 1):
                            # Get slot from parking_spot data
                            slot = "Unknown"
                            if b.get("parking_spot"):
                                slot = b["parking_spot"].get("spot_number", "Unknown")

                            status = b.get("status", "unknown")
                            start = b.get("start_time", "-")
                            end = b.get("end_time", "-")

                            # Format dates if they exist
                            if start and start != "-":
                                try:
                                    from datetime import datetime

                                    start_dt = datetime.fromisoformat(
                                        start.replace("Z", "+00:00")
                                    )
                                    start = start_dt.strftime("%Y-%m-%d %H:%M")
                                except:
                                    pass

                            if end and end != "-":
                                try:
                                    from datetime import datetime

                                    end_dt = datetime.fromisoformat(
                                        end.replace("Z", "+00:00")
                                    )
                                    end = end_dt.strftime("%Y-%m-%d %H:%M")
                                except:
                                    pass

                            msg += f"#{i} Slot {slot} | {status}\n"
                            msg += f"Start: {start}\nEnd: {end}\n\n"

                        logger.info(f"📱 Sending booking history: {msg[:100]}")
                        return reply_text(msg.strip())
                    else:
                        logger.error(
                            f"📱 API returned status {api_response.status_code}"
                        )
                        return reply_text(t("no_bookings"))
                except Exception as e:
                    logger.error(f"Error getting booking history: {e}")
                    import traceback

                    logger.error(traceback.format_exc())
                    return reply_text(t("no_bookings"))

            elif menu_choice == 4:  # Search by date
                logger.info("📱 Processing option 4 - Search bookings by date")
                request.session["whatsapp_flow"] = "search_date"
                return reply_text(
                    "📅 Please enter a date in YYYY-MM-DD format (e.g., 2025-01-15):"
                )

            elif menu_choice == 5:  # Report issue
                request.session["whatsapp_flow"] = "report_issue"
                return reply_text(
                    "Please describe the issue or problem you're experiencing:"
                )

            elif menu_choice == 6:  # Help & Support
                return reply_text(
                    "🅿️ *Smart Parking Help*\n\n"
                    "I can help you with:\n"
                    "• Booking slots\n"
                    "• Checking your booking\n"
                    "• Viewing booking history\n"
                    "• Checking your balance\n"
                    "\nJust type 'menu' to see all options!"
                )

            elif menu_choice == 7:  # Check balance
                user = get_user()
                profile = UserProfile.objects.get(user=user)
                return reply_text(t("balance_is", float(profile.balance)))

            elif menu_choice == 8:  # Language selection
                request.session["whatsapp_flow"] = "choose_language"
                return reply_text(t("choose_lang"))

            elif menu_choice == 9:  # Logout
                logger.info("📱 Processing option 9 - Logout")
                # Clear all authentication data
                request.session.pop("whatsapp_authenticated_user_id", None)
                request.session.pop("whatsapp_login_username", None)
                request.session["whatsapp_flow"] = "login_username"
                request.session["whatsapp_menu_mode"] = False

                return reply_text(
                    "👋 You have been logged out successfully!\n\n"
                    "To continue, please login again:\n"
                    "Enter your username:"
                )

        # Language selection handler
        if request.session.get("whatsapp_flow") == "choose_language":
            if body_lower in ("1", "2", "3"):
                lang_map = {"1": "en", "2": "sn", "3": "nd"}
                lang_name_map = {"1": "English", "2": "Shona", "3": "Ndebele"}

                request.session["whatsapp_language"] = lang_map[body_lower]
                request.session["whatsapp_flow"] = "idle"

                return reply_text(t("lang_set", lang_name_map[body_lower]))
            else:
                return reply_text(t("choose_lang"))

        # Date search handler
        if request.session.get("whatsapp_flow") == "search_date":
            logger.info(f"📱 Processing date search input: '{body}'")
            date_match = re.match(r"^\d{4}-\d{2}-\d{2}$", body)
            if date_match:
                date_str = date_match.group()
                logger.info(f"📱 Searching bookings for date: {date_str}")

                try:
                    user = get_user()
                    logger.info(f"📱 Searching bookings for user: {user.username}")

                    # Get all bookings for the user
                    bookings = Booking.objects.filter(user=user).order_by("-start_time")
                    logger.info(f"📱 Found {bookings.count()} total bookings for user")

                    # Filter bookings for the specific date
                    on_date = []
                    for b in bookings:
                        if (
                            b.start_time
                            and b.start_time.strftime("%Y-%m-%d") == date_str
                        ):
                            on_date.append(b)

                    logger.info(f"📱 Found {len(on_date)} bookings on {date_str}")

                    if not on_date:
                        request.session["whatsapp_flow"] = "idle"
                        return reply_text(
                            f"📅 No bookings found on {date_str}.\n\nType 'menu' to see other options."
                        )

                    msg = f"📅 Bookings on {date_str}:\n\n"
                    for i, b in enumerate(on_date[:5], 1):
                        start = (
                            b.start_time.strftime("%Y-%m-%d %H:%M")
                            if b.start_time
                            else "-"
                        )
                        end = (
                            b.end_time.strftime("%Y-%m-%d %H:%M") if b.end_time else "-"
                        )
                        slot = getattr(b.parking_spot, "spot_number", "Unknown")
                        msg += f"#{i} Slot {slot} | {b.status}\n"
                        msg += f"Start: {start}\nEnd: {end}\n\n"

                    request.session["whatsapp_flow"] = "idle"
                    logger.info(f"📱 Sending date search results: {msg[:100]}")
                    return reply_text(msg.strip())

                except Exception as e:
                    logger.error(f"Error searching bookings by date: {e}")
                    import traceback

                    logger.error(traceback.format_exc())
                    request.session["whatsapp_flow"] = "idle"
                    return reply_text(
                        f"❌ Error searching bookings: {str(e)}\n\nType 'menu' to try again."
                    )
            else:
                logger.info(f"📱 Invalid date format received: '{body}'")
                return reply_text(
                    "❌ Invalid date format!\n\n"
                    "Please enter a date in YYYY-MM-DD format (e.g., 2025-01-15):\n\n"
                    "Or type 'menu' to go back to main menu."
                )

        # Report issue handler
        if request.session.get("whatsapp_flow") == "report_issue":
            if len(body) < 10:
                return reply_text(t("report_too_short"))

            # Persist report to database so it shows on admin dashboard alerts
            try:
                from parking_app.models import UserReport

                user = get_user()  # may be guest if not authenticated
                UserReport.objects.create(
                    user=user if user and getattr(user, "id", None) else None,
                    message=body,
                    type="user_report",
                    priority="medium",
                    status="pending",
                )
            except Exception as e:
                logger.error(f"Failed to save UserReport: {e}")
            finally:
                request.session["whatsapp_flow"] = "idle"
            return reply_text(t("report_sent"))

        # Slot availability check - require authentication
        if "slots" in body_lower or "available" in body_lower:
            if not request.session.get("whatsapp_authenticated_user_id"):
                logger.info(
                    "📱 Slot check requested but user not authenticated - prompting login"
                )
                request.session["whatsapp_flow"] = "login_username"
                return reply_text(
                    "🔐 Please login first to check available slots:\n"
                    "Enter your username:"
                )

            spots = ParkingSpot.objects.filter(
                is_occupied=False, spot_number__in=["A", "B"]
            )
            if not spots.exists():
                return reply_text(t("no_slots"))

            slot_a = spots.filter(spot_number="A").first()
            slot_b = spots.filter(spot_number="B").first()

            msg = f"{t('available_intro')} 🚗:\n"
            if slot_a:
                msg += f"• {slot_a.spot_number} (#{slot_a.id})\n"
            if slot_b:
                msg += f"• {slot_b.spot_number} (#{slot_b.id})\n"
            msg += f"\n{t('tap_to_reserve')}\n\nType 'book A' or 'book B'"

            return reply_text(msg)

        # Book slot handler - require authentication
        if "book" in body_lower or "reserve" in body_lower:
            if not request.session.get("whatsapp_authenticated_user_id"):
                logger.info(
                    "📱 Booking requested but user not authenticated - prompting login"
                )
                request.session["whatsapp_flow"] = "login_username"
                return reply_text(
                    "🔐 Please login first to book a slot:\n" "Enter your username:"
                )

            slot_input = extract_slot(body) or (
                body_lower.split()[-1].upper()
                if body_lower.split()[-1] in ("a", "b")
                else None
            )

            if not slot_input:
                return reply_text(
                    "❌ Please specify a slot (A or B)\n\n"
                    "Example: *book A* or *book B*"
                )

            try:
                # Find available spot (only A or B)
                if slot_input not in ["A", "B"]:
                    return reply_text(
                        "❌ Only slots A and B are available for booking."
                    )

                spot = ParkingSpot.objects.filter(
                    is_occupied=False, spot_number=slot_input
                ).first()

                if not spot:
                    return reply_text(t("slot_not_available", slot_input))

                user = get_user()

                # Check existing booking
                existing = Booking.objects.filter(user=user, status="active").first()
                if existing:
                    return reply_text(
                        f"⚠️ You already have an active booking for {existing.parking_spot.spot_number}. "
                        f"Please complete or cancel it first."
                    )

                # Check balance
                profile = UserProfile.objects.get(user=user)
                if float(profile.balance) < 1.00:
                    return reply_text("❌ Insufficient balance. Minimum $1 required.")

                # Create booking
                now = timezone.now()
                booking = Booking.objects.create(
                    user=user,
                    parking_spot=spot,
                    start_time=now,
                    end_time=now + timedelta(hours=12),
                    duration_minutes=0,
                    vehicle_name="WhatsApp User",
                    status="active",
                    grace_period_started=now,
                    timer_started=None,
                    number_plate=getattr(profile, "number_plate", ""),
                )

                # Trigger ESP32 LED
                try:
                    from parking_app.views import trigger_esp32_booking_led

                    trigger_esp32_booking_led(spot.spot_number, "blue")
                except:
                    pass

                # End session after booking
                request.session["whatsapp_active_session"] = False
                request.session.pop("whatsapp_authenticated_user_id", None)

                return reply_text(t("booked", spot.spot_number))

            except Exception as e:
                return reply_text(f"❌ Booking failed: {str(e)}")

        # Status check handler - require authentication
        if "status" in body_lower or is_current_booking(body):
            if not request.session.get("whatsapp_authenticated_user_id"):
                logger.info(
                    "📱 Status check requested but user not authenticated - prompting login"
                )
                request.session["whatsapp_flow"] = "login_username"
                return reply_text(
                    "🔐 Please login first to check your booking status:\n"
                    "Enter your username:"
                )

            user = get_user()
            booking = (
                Booking.objects.filter(user=user, status="active")
                .order_by("-start_time")
                .first()
            )

            if not booking:
                return reply_text(t("no_booking"))

            remaining_seconds = max(
                0, int((booking.end_time - timezone.now()).total_seconds())
            )
            minutes = remaining_seconds // 60
            seconds = remaining_seconds % 60

            return reply_text(
                f"📋 Current Booking:\n\n"
                f"Slot: {booking.parking_spot.spot_number}\n"
                f"Time Remaining: {minutes}m {seconds}s\n"
                f"Status: {booking.status}"
            )

        # Balance check handler - require authentication
        if "balance" in body_lower:
            if not request.session.get("whatsapp_authenticated_user_id"):
                logger.info(
                    "📱 Balance check requested but user not authenticated - prompting login"
                )
                request.session["whatsapp_flow"] = "login_username"
            return reply_text(
                "🔐 Please login first to check your balance:\n" "Enter your username:"
            )

            user = get_user()
            profile = UserProfile.objects.get(user=user)
            return reply_text(t("balance_is", float(profile.balance)))

        # Cancel booking handler - require authentication
        if is_cancel_intent(body):
            if not request.session.get("whatsapp_authenticated_user_id"):
                logger.info(
                    "📱 Cancel booking requested but user not authenticated - prompting login"
                )
                request.session["whatsapp_flow"] = "login_username"
            return reply_text(
                "🔐 Please login first to cancel your booking:\n" "Enter your username:"
            )

            user = get_user()
            booking = (
                Booking.objects.filter(user=user, status="active")
                .order_by("-start_time")
                .first()
            )

            if not booking:
                return reply_text(t("no_booking"))

            booking.status = "cancelled"
            booking.save()

            return reply_text(t("booking_cancelled"))

        # History check handler - require authentication
        if "history" in body_lower or "bookings" in body_lower:
            if not request.session.get("whatsapp_authenticated_user_id"):
                logger.info(
                    "📱 History check requested but user not authenticated - prompting login"
                )
                request.session["whatsapp_flow"] = "login_username"
            return reply_text(
                "🔐 Please login first to view your booking history:\n"
                "Enter your username:"
            )

            user = get_user()
            bookings = Booking.objects.filter(user=user).order_by("-start_time")[:3]

            if not bookings:
                return reply_text(t("no_bookings"))

            msg = "📋 Your Recent Bookings:\n\n"
            for i, b in enumerate(bookings, 1):
                start = b.start_time.strftime("%Y-%m-%d %H:%M") if b.start_time else "-"
                end = b.end_time.strftime("%Y-%m-%d %H:%M") if b.end_time else "-"
                msg += f"#{i} {b.parking_spot.spot_number} | {b.status}\n"
                msg += f"Start: {start}\nEnd: {end}\n\n"

            return reply_text(msg.strip())

        # Default fallback
        # If we get here, we didn't handle the message - send fallback
        logger.info(f"📱 No handler found for message: '{body}' - sending fallback")
        return reply_text(
            "🤔 Sorry but I didn't understand that. Kindly type in 'menu' to see options or 'hi' to start over!"
        )

    except Exception as e:
        # Always return valid TwiML even on error
        import traceback

        # Log the error for debugging
        logger.error(f"WhatsApp webhook error: {str(e)}")
        logger.error(traceback.format_exc())

        # Return a helpful error message in TwiML format
        resp = MessagingResponse()
        resp.message(
            "⚠️ Sorry, I encountered an error. "
            "Please try again or contact support.\n\n"
            "Type 'menu' to start over."
        )
        return HttpResponse(str(resp), content_type="application/xml")
