from django.urls import path
from . import views

urlpatterns = [
    # Authentication endpoints
    path('auth/signup/', views.signup, name='signup'),
    path('auth/signin/', views.signin, name='signin'),
    path('auth/signout/', views.signout, name='signout'),
    path('auth/profile/', views.get_user_profile, name='get_profile'),
    path('auth/profile/update/', views.update_user_profile, name='update_profile'),
    path('auth/change-password/', views.change_password, name='change_password'),
    
    # Parking lot endpoints
    path('parking-lots/', views.ParkingLotList.as_view(), name='parking_lot_list'),
    path('parking-lots/<int:pk>/', views.ParkingLotDetail.as_view(), name='parking_lot_detail'),
    
    # Parking spot endpoints
    path('parking-spots/', views.ParkingSpotList.as_view(), name='parking_spot_list'),
    path('parking-spots/<int:pk>/', views.ParkingSpotDetail.as_view(), name='parking_spot_detail'),
    
    # Booking endpoints
    path('bookings/', views.BookingList.as_view(), name='booking_list'),
    path('bookings/<int:pk>/', views.BookingDetail.as_view(), name='booking_detail'),
    path('bookings/<int:booking_id>/extend/', views.extend_booking, name='extend_booking'),
    path('bookings/<int:booking_id>/cancel/', views.cancel_booking, name='cancel_booking'),
    
    # Statistics endpoint
    path('stats/', views.get_parking_stats, name='parking_stats'),
] 