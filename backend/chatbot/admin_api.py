from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.models import User
from parking_app.models import Booking, UserProfile, ParkingSpot, UserReport
from django.db.models import Q
from datetime import datetime
import json


@csrf_exempt
@require_http_methods(["GET"])
def admin_users(request):
    try:
        users = User.objects.all().values(
            "id",
            "username",
            "email",
            "is_active",
            "date_joined",
            "is_superuser",
            "first_name",
            "last_name",
        )
        user_list = []
        for user in users:
            try:
                profile = UserProfile.objects.get(user_id=user["id"])
                user_data = dict(user)
                user_data.update(
                    {
                        "balance": float(profile.balance),
                        "phone": profile.phone,
                        "address": profile.address,
                        "license_number": profile.license_number,
                        "number_plate": profile.number_plate,
                    }
                )
                user_list.append(user_data)
            except UserProfile.DoesNotExist:
                user_data = dict(user)
                user_data.update(
                    {
                        "balance": 0.0,
                        "phone": "",
                        "address": "",
                        "license_number": "",
                        "number_plate": "",
                    }
                )
                user_list.append(user_data)
        return JsonResponse({"success": True, "users": user_list})
    except Exception as e:
        return JsonResponse(
            {"success": False, "message": f"Error fetching users: {str(e)}"},
            status=500,
        )


@csrf_exempt
@require_http_methods(["GET"])
def admin_bookings(request):
    try:
        # Optional filters
        status = request.GET.get("status")
        slot = request.GET.get("slot")
        search = request.GET.get("search")

        bookings_qs = Booking.objects.select_related("user", "parking_spot").all()
        if status:
            bookings_qs = bookings_qs.filter(status__iexact=status)
        if slot:
            bookings_qs = bookings_qs.filter(parking_spot__spot_number__iexact=slot)
        if search:
            bookings_qs = bookings_qs.filter(
                Q(user__username__icontains=search)
                | Q(number_plate__icontains=search)
                | Q(id__icontains=search)
            )

        def serialize_booking(b: Booking):
            # Calculate actual duration from start/end times
            actual_duration = 0
            if b.start_time and b.end_time:
                delta = b.end_time - b.start_time
                actual_duration = int(delta.total_seconds() / 60)

            # Get number plate from user profile (correct source)
            number_plate = ""
            if b.user_id:
                try:
                    profile = UserProfile.objects.get(user_id=b.user_id)
                    number_plate = profile.number_plate or ""
                except UserProfile.DoesNotExist:
                    number_plate = ""

            return {
                "id": b.id,
                "user": b.user.username if b.user_id else None,
                "user_id": b.user_id,
                "email": b.user.email if b.user_id else None,
                "slot": getattr(b.parking_spot, "spot_number", None)
                or getattr(b.parking_spot, "name", None),
                "slot_id": b.parking_spot_id,
                "start_time": b.start_time.isoformat() if b.start_time else None,
                "end_time": b.end_time.isoformat() if b.end_time else None,
                "status": b.status,
                "number_plate": number_plate,
                "duration_minutes": actual_duration,
                # amount maps to the stored total_cost for charts/exports
                "amount": float(getattr(b, "total_cost", 0) or 0),
            }

        data = [serialize_booking(b) for b in bookings_qs.order_by("-start_time")[:500]]
        return JsonResponse({"success": True, "bookings": data})
    except Exception as e:
        return JsonResponse(
            {"success": False, "message": f"Error fetching bookings: {str(e)}"},
            status=500,
        )


@csrf_exempt
@require_http_methods(["GET"])
def admin_parking_spots(request):
    try:
        from django.db.models import Count

        # Count bookings referencing each spot via reverse relation
        spots_with_counts = (
            ParkingSpot.objects.annotate(booking_count=Count("booking", distinct=True))
            .values("id", "spot_number", "name", "is_occupied", "booking_count")
            .order_by("id")
        )

        data = []
        for s in spots_with_counts:
            data.append(
                {
                    "id": s["id"],
                    "name": s.get("spot_number") or s.get("name") or f"Slot {s['id']}",
                    "spot_number": s.get("spot_number") or s.get("name"),
                    "is_occupied": bool(s.get("is_occupied", False)),
                    "booking_count": int(s.get("booking_count") or 0),
                }
            )
        return JsonResponse({"success": True, "spots": data})
    except Exception as e:
        return JsonResponse(
            {"success": False, "message": f"Error fetching spots: {str(e)}"},
            status=500,
        )


# ============ Admin User Management (Writes) ============


def _require_admin_token(request):
    token = request.META.get("HTTP_AUTHORIZATION", "").replace("Token ", "")
    return token == "admin_authenticated"


def _check_superadmin_permission(request):
    """Check if user has superadmin permissions (can edit/delete/create)"""
    # For hardcoded admin bypass
    token = request.META.get("HTTP_AUTHORIZATION", "").replace("Token ", "")
    if token == "admin_authenticated":
        # Check if we can get user info from session or token
        # For now, we'll check if user is superadmin via User model
        # This is a simplified check - in production, you'd want proper session/token validation
        return True  # Hardcoded admin is always superadmin

    # Try to get user from request if available
    if hasattr(request, "user") and request.user.is_authenticated:
        return request.user.is_superuser

    # If we can't determine, deny access (fail safe)
    return False


def _check_staff_permission(request):
    """Check if user has staff permissions (can view)"""
    token = request.META.get("HTTP_AUTHORIZATION", "").replace("Token ", "")
    if token == "admin_authenticated":
        return True  # If authenticated, allow view

    if hasattr(request, "user") and request.user.is_authenticated:
        return request.user.is_staff or request.user.is_superuser

    return False


@csrf_exempt
@require_http_methods(["POST"])
def admin_users_create(request):
    if not _require_admin_token(request):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    # Only superadmin can create users
    if not _check_superadmin_permission(request):
        return JsonResponse(
            {
                "success": False,
                "message": "Access denied. Only superadmin can create users.",
            },
            status=403,
        )
    try:
        data = json.loads(request.body or "{}")
        username = data.get("username")
        email = data.get("email", "")
        password = data.get("password") or "password123"
        first_name = data.get("first_name", "")
        last_name = data.get("last_name", "")

        if not username:
            return JsonResponse(
                {"success": False, "error": "username is required"}, status=400
            )

        if User.objects.filter(username=username).exists():
            return JsonResponse(
                {"success": False, "error": "username already exists"}, status=400
            )

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
        )

        # Ensure profile exists
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.phone = data.get("phone", profile.phone)
        profile.address = data.get("address", profile.address)
        if "balance" in data:
            try:
                profile.balance = float(data.get("balance") or 0)
            except Exception:
                profile.balance = 0
        profile.save()

        return JsonResponse({"success": True, "id": user.id})
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
def admin_users_update(request, user_id):
    if not _require_admin_token(request):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    # Only superadmin can update users
    if not _check_superadmin_permission(request):
        return JsonResponse(
            {
                "success": False,
                "message": "Access denied. Only superadmin can update users.",
            },
            status=403,
        )
    try:
        data = json.loads(request.body or "{}")
        user = User.objects.get(id=user_id)

        # Debug: Log incoming data
        print(f"🔍 [Admin API] Updating user {user_id} ({user.username})")
        print(f"🔍 [Admin API] Received data: {json.dumps(data, indent=2)}")

        # Store original role for logging
        original_is_superuser = user.is_superuser
        original_is_staff = user.is_staff
        print(
            f"🔍 [Admin API] Current role - is_superuser: {original_is_superuser}, is_staff: {original_is_staff}"
        )

        # Update core fields
        for field in [
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
        ]:
            if field in data:
                setattr(user, field, data[field])

        # Handle role changes (is_staff and is_superuser)
        # Role logic:
        # - superuser: is_superuser=True, is_staff=True
        # - staff: is_superuser=False, is_staff=True
        # - user: is_superuser=False, is_staff=False

        # Check if role fields are being updated
        if "is_superuser" in data or "is_staff" in data:
            # Get new values from data (use current values as defaults if not provided)
            if "is_superuser" in data:
                is_superuser_new = bool(data["is_superuser"])
            else:
                is_superuser_new = user.is_superuser

            if "is_staff" in data:
                is_staff_new = bool(data["is_staff"])
            else:
                is_staff_new = user.is_staff

            print(
                f"🔍 [Admin API] Role update - is_superuser: {is_superuser_new}, is_staff: {is_staff_new}"
            )

            # Ensure consistency: superuser always implies staff
            if is_superuser_new and not is_staff_new:
                is_staff_new = True
                print(
                    f"⚠️ [Admin] User {user.username} - Superuser requires staff, auto-setting is_staff=True"
                )

            # Ensure consistency: non-staff cannot be superuser
            if not is_staff_new and is_superuser_new:
                is_superuser_new = False
                print(
                    f"⚠️ [Admin] User {user.username} - Non-staff cannot be superuser, auto-setting is_superuser=False"
                )

            # Apply the values
            user.is_superuser = is_superuser_new
            user.is_staff = is_staff_new

            # Log the change
            if is_superuser_new:
                print(
                    f"✅ [Admin] User {user.username} role set to SUPERADMIN (is_superuser=True, is_staff=True)"
                )
            elif is_staff_new:
                print(
                    f"✅ [Admin] User {user.username} role set to STAFF (is_superuser=False, is_staff=True)"
                )
            else:
                print(
                    f"✅ [Admin] User {user.username} role set to USER (is_superuser=False, is_staff=False)"
                )

        # Log role changes
        if (
            original_is_superuser != user.is_superuser
            or original_is_staff != user.is_staff
        ):
            role_before = (
                "superadmin"
                if original_is_superuser
                else ("staff" if original_is_staff else "user")
            )
            role_after = (
                "superadmin"
                if user.is_superuser
                else ("staff" if user.is_staff else "user")
            )
            print(
                f"🔄 [Admin] Role change for {user.username}: {role_before} → {role_after}"
            )
            print(
                f"🔍 [Admin API] Final role - is_superuser: {user.is_superuser}, is_staff: {user.is_staff}"
            )
        else:
            print(f"ℹ️ [Admin API] No role change - role remains the same")

        # Update password if provided
        if data.get("password"):
            user.set_password(data["password"])
            print(f"✅ [Admin] Password updated for user {user.username}")

        user.save()

        # Update profile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        for pfield in ["phone", "address", "license_number", "number_plate"]:
            if pfield in data:
                setattr(profile, pfield, data[pfield])
        if "balance" in data:
            try:
                profile.balance = float(data.get("balance") or 0)
            except Exception:
                pass
        profile.save()

        # Return updated user data including role information
        return JsonResponse(
            {
                "success": True,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "is_staff": user.is_staff,
                    "is_superuser": user.is_superuser,
                    "is_active": user.is_active,
                    "role": (
                        "superadmin"
                        if user.is_superuser
                        else ("staff" if user.is_staff else "user")
                    ),
                },
            }
        )
    except User.DoesNotExist:
        return JsonResponse({"success": False, "error": "User not found"}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def admin_users_delete(request, user_id):
    if not _require_admin_token(request):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    # Only superadmin can delete users
    if not _check_superadmin_permission(request):
        return JsonResponse(
            {
                "success": False,
                "message": "Access denied. Only superadmin can delete users.",
            },
            status=403,
        )
    try:
        user = User.objects.get(id=user_id)
        user.delete()
        return JsonResponse({"success": True})
    except User.DoesNotExist:
        return JsonResponse({"success": False, "error": "User not found"}, status=404)
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def admin_users_toggle_status(request, user_id):
    if not _require_admin_token(request):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    # Only superadmin can toggle user status
    if not _check_superadmin_permission(request):
        return JsonResponse(
            {
                "success": False,
                "message": "Access denied. Only superadmin can change user status.",
            },
            status=403,
        )
    try:
        user = User.objects.get(id=user_id)
        user.is_active = not user.is_active
        user.save()
        return JsonResponse(
            {
                "success": True,
                "message": f"User {'activated' if user.is_active else 'deactivated'}",
            }
        )
    except User.DoesNotExist:
        return JsonResponse({"success": False, "error": "User not found"}, status=404)
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def admin_users_reset_password(request, user_id):
    if not _require_admin_token(request):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    # Only superadmin can reset passwords
    if not _check_superadmin_permission(request):
        return JsonResponse(
            {
                "success": False,
                "message": "Access denied. Only superadmin can reset passwords.",
            },
            status=403,
        )
    try:
        data = json.loads(request.body or "{}")
        new_password = data.get("password") or "Password123!"
        user = User.objects.get(id=user_id)
        user.set_password(new_password)
        user.save()
        # Touch profile reset timestamp if present
        try:
            from django.utils import timezone

            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.last_password_reset = timezone.now()
            profile.save(update_fields=["last_password_reset"])
        except Exception:
            pass
        return JsonResponse({"success": True})
    except User.DoesNotExist:
        return JsonResponse({"success": False, "error": "User not found"}, status=404)
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def admin_bookings_delete(request, booking_id):
    if not _require_admin_token(request):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    # Only superadmin can delete bookings
    if not _check_superadmin_permission(request):
        return JsonResponse(
            {
                "success": False,
                "message": "Access denied. Only superadmin can delete bookings.",
            },
            status=403,
        )
    try:
        booking = Booking.objects.get(id=booking_id)
        booking.delete()
        return JsonResponse({"success": True})
    except Booking.DoesNotExist:
        return JsonResponse(
            {"success": False, "error": "Booking not found"}, status=404
        )
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def admin_user_reports(request):
    """Fetch user reports/feedback from the database"""
    try:
        reports = UserReport.objects.select_related("user").order_by("-created_at")[:50]

        data = [
            {
                "id": r.id,
                "user": (
                    {
                        "id": r.user.id,
                        "username": r.user.username,
                        "email": r.user.email,
                        "first_name": r.user.first_name,
                        "last_name": r.user.last_name,
                        "full_name": (f"{r.user.first_name} {r.user.last_name}").strip()
                        or r.user.username,
                    }
                    if r.user
                    else None
                ),
                "user_id": r.user_id,
                "message": r.message,
                "type": r.type,
                "priority": r.priority,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reports
        ]

        return JsonResponse({"success": True, "reports": data})
    except Exception as e:
        return JsonResponse(
            {"success": False, "message": f"Error fetching reports: {str(e)}"},
            status=500,
        )


@csrf_exempt
@require_http_methods(["GET"])
def admin_unbooked_occupied_alerts(request):
    """Return alerts for occupied spots without an active booking."""
    try:
        from django.utils import timezone

        # Spots marked occupied
        occupied = ParkingSpot.objects.filter(is_occupied=True)
        alerts = []
        for spot in occupied:
            has_active = Booking.objects.filter(
                parking_spot=spot, status="active"
            ).exists()
            if not has_active:
                alerts.append(
                    {
                        "id": f"unbooked_{spot.id}",
                        "slot": spot.spot_number or spot.name or f"Spot {spot.id}",
                        "message": f"UNAUTHORIZED PARKING DETECTED: Car parked in {spot.spot_number or spot.name or f'Spot {spot.id}'} without a booking.",
                        "type": "error",
                        "priority": "high",
                        "created_at": timezone.now().isoformat(),
                    }
                )
        return JsonResponse({"success": True, "alerts": alerts})
    except Exception as e:
        return JsonResponse(
            {"success": False, "message": f"Error checking unbooked spots: {str(e)}"},
            status=500,
        )


@csrf_exempt
@require_http_methods(["POST"])
def admin_user_report_resolve(request, report_id: int):
    """Mark a UserReport as resolved"""
    try:
        # Check admin token
        if not _require_admin_token(request):
            return JsonResponse(
                {"success": False, "message": "Unauthorized"}, status=401
            )

        # Only superadmin can resolve reports
        if not _check_superadmin_permission(request):
            return JsonResponse(
                {
                    "success": False,
                    "message": "Access denied. Only superadmin can resolve reports.",
                },
                status=403,
            )

        try:
            report = UserReport.objects.get(id=report_id)
        except UserReport.DoesNotExist:
            return JsonResponse(
                {"success": False, "error": "Report not found"}, status=404
            )
        report.status = "resolved"
        report.save(update_fields=["status"])
        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)
