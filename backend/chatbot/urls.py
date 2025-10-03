from django.urls import path
from . import views

urlpatterns = [
    path("current-booking/", views.current_booking, name="chatbot_current_booking"),
    path("booking-history/", views.booking_history, name="chatbot_booking_history"),
    path("available-slots/", views.available_slots, name="chatbot_available_slots"),
    path("reserve/", views.reserve_slot, name="chatbot_reserve_slot"),
    path("help/", views.help_info, name="chatbot_help_info"),
    # Twilio WhatsApp webhook endpoint
    path(
        "twilio/webhook/", views.twilio_whatsapp_webhook, name="chatbot_twilio_webhook"
    ),
]
