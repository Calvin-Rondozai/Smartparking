"""
AI Analytics API Views
Provides predictions and insights for the Smart Parking System
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .predictions import predictor


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_ai_predictions(request):
    """
    Get AI predictions for occupancy, revenue, and user behavior
    Requires admin or staff access
    """
    try:
        # Check if user is admin or staff
        if not (request.user.is_superuser or request.user.is_staff):
            return Response(
                {"error": "Admin or staff access required"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get all predictions
        predictions = predictor.get_all_predictions()

        return Response(predictions, status=status.HTTP_200_OK)

    except Exception as e:
        return Response(
            {"error": f"Failed to generate predictions: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_occupancy_predictions(request):
    """
    Get occupancy predictions only
    """
    try:
        if not (request.user.is_superuser or request.user.is_staff):
            return Response(
                {"error": "Admin or staff access required"},
                status=status.HTTP_403_FORBIDDEN,
            )

        occupancy = predictor.predict_occupancy()
        return Response(occupancy, status=status.HTTP_200_OK)

    except Exception as e:
        return Response(
            {"error": f"Failed to generate occupancy predictions: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_revenue_predictions(request):
    """
    Get revenue predictions only
    """
    try:
        if not (request.user.is_superuser or request.user.is_staff):
            return Response(
                {"error": "Admin or staff access required"},
                status=status.HTTP_403_FORBIDDEN,
            )

        revenue = predictor.predict_revenue()
        return Response(revenue, status=status.HTTP_200_OK)

    except Exception as e:
        return Response(
            {"error": f"Failed to generate revenue predictions: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_user_behavior_analysis(request):
    """
    Get user behavior analysis only
    """
    try:
        if not (request.user.is_superuser or request.user.is_staff):
            return Response(
                {"error": "Admin or staff access required"},
                status=status.HTTP_403_FORBIDDEN,
            )

        user_trends = predictor.analyze_user_behavior()
        return Response(user_trends, status=status.HTTP_200_OK)

    except Exception as e:
        return Response(
            {"error": f"Failed to generate user behavior analysis: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

