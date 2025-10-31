from django.urls import path
from . import views

urlpatterns = [
    path("predictions/", views.get_ai_predictions, name="ai_predictions"),
    path("occupancy/", views.get_occupancy_predictions, name="ai_occupancy"),
    path("revenue/", views.get_revenue_predictions, name="ai_revenue"),
    path("user-behavior/", views.get_user_behavior_analysis, name="ai_user_behavior"),
]

