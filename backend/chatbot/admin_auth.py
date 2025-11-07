from django.http import JsonResponse
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json


def _add_cors_headers(response, request=None):
    # Dynamically echo request Origin if present; fallback to common local origins
    origin = None
    if request is not None:
        origin = request.META.get("HTTP_ORIGIN")
    # Allow typical localhost dev origins and null (file://) scenarios
    allowed_origins = {
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "null",  # some browsers send 'null' for file:// origin
    }
    if origin and (
        origin in allowed_origins
        or origin.startswith("http://")
        or origin.startswith("https://")
    ):
        response["Access-Control-Allow-Origin"] = origin
    else:
        response["Access-Control-Allow-Origin"] = "http://localhost:5500"
    response["Access-Control-Allow-Credentials"] = "true"
    response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def admin_login(request):
    """Custom admin login endpoint for the admin dashboard"""
    try:
        # CORS preflight
        if request.method == "OPTIONS":
            return _add_cors_headers(JsonResponse({}, status=200), request)

        data = json.loads(request.body)
        username = data.get("username")
        password = data.get("password")

        if not username or not password:
            return _add_cors_headers(
                JsonResponse(
                    {"success": False, "message": "Username and password are required"},
                    status=400,
                ),
                request,
            )

        # HARD-CODED ADMIN BYPASS (dashboard only) - Superadmin role
        # Accept fixed credentials regardless of DB state
        HARDCODED_USER = "admin"
        HARDCODED_PASS = "admin123"
        if username == HARDCODED_USER and password == HARDCODED_PASS:
            return _add_cors_headers(
                JsonResponse(
                    {
                        "success": True,
                        "message": "Login successful",
                        "user": {
                            "id": 0,
                            "username": HARDCODED_USER,
                            "email": "",
                            "is_superuser": True,
                            "is_staff": True,
                            "role": "superadmin",
                            "permissions": {
                                "can_view": True,
                                "can_edit": True,
                                "can_delete": True,
                                "can_create": True,
                            },
                            "full_name": "Admin",
                        },
                        "token": "admin_authenticated",
                    }
                ),
                request,
            )

        # Otherwise, fall back to real authentication
        user = authenticate(username=username, password=password)

        if user is None:
            return _add_cors_headers(
                JsonResponse(
                    {"success": False, "message": "Invalid username or password"},
                    status=401,
                ),
                request,
            )

        # Check if user is active
        if not user.is_active:
            return _add_cors_headers(
                JsonResponse(
                    {"success": False, "message": "Account is disabled"}, status=401
                ),
                request,
            )

        # Role-based access control
        # Only superusers and staff can access admin dashboard
        # Regular users (is_staff=False) cannot login
        if not user.is_staff and not user.is_superuser:
            return _add_cors_headers(
                JsonResponse(
                    {
                        "success": False,
                        "message": "Access denied. You do not have permission to access the admin dashboard.",
                    },
                    status=403,
                ),
                request,
            )

        # Determine user role
        if user.is_superuser:
            role = "superadmin"
            permissions = {
                "can_view": True,
                "can_edit": True,
                "can_delete": True,
                "can_create": True,
            }
        elif user.is_staff:
            role = "staff"
            permissions = {
                "can_view": True,
                "can_edit": False,
                "can_delete": False,
                "can_create": False,
            }
        else:
            role = "user"
            permissions = {
                "can_view": False,
                "can_edit": False,
                "can_delete": False,
                "can_create": False,
            }

        # Login successful
        return _add_cors_headers(
            JsonResponse(
                {
                    "success": True,
                    "message": "Login successful",
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "email": user.email,
                        "is_superuser": user.is_superuser,
                        "is_staff": user.is_staff,
                        "role": role,
                        "permissions": permissions,
                    },
                    "token": "admin_authenticated",
                }
            ),
            request,
        )

    except json.JSONDecodeError:
        return _add_cors_headers(
            JsonResponse(
                {"success": False, "message": "Invalid JSON data"}, status=400
            ),
            request,
        )
    except Exception as e:
        return _add_cors_headers(
            JsonResponse(
                {"success": False, "message": f"Server error: {str(e)}"}, status=500
            ),
            request,
        )


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def verify_token(request):
    """Verify admin token"""
    try:
        if request.method == "OPTIONS":
            return _add_cors_headers(JsonResponse({}, status=200), request)
        # Get token from Authorization header
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Token "):
            return _add_cors_headers(
                JsonResponse(
                    {"success": False, "message": "Invalid token format"}, status=401
                ),
                request,
            )

        token = auth_header.replace("Token ", "")

        # For now, accept any non-empty token as valid
        # In production, you'd want proper token validation
        if token and token == "admin_authenticated":
            return _add_cors_headers(
                JsonResponse({"success": True, "message": "Token is valid"}), request
            )
        else:
            return _add_cors_headers(
                JsonResponse(
                    {"success": False, "message": "Invalid token"}, status=401
                ),
                request,
            )

    except Exception as e:
        return _add_cors_headers(
            JsonResponse(
                {"success": False, "message": f"Token verification error: {str(e)}"},
                status=500,
            ),
            request,
        )
