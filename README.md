## SmartParking – Project Overview

### Architecture

- **Mobile app (React Native)**: User auth, availability, booking, cancel, history.
- **Admin dashboard (HTML/CSS/JS)**: Dashboard, devices, bookings, users, reports, settings (dark mode). Superadmin can write; staff is read-only.
- **Backend (Django + DRF)**: REST API for auth, bookings, lots/spots, reports, IoT.
- **IoT (ESP32)**: Sends telemetry to backend; LEDs reflect slot status: Blue=booked, Green=empty, Red=occupied.

### Backend

- Apps: `parking_app`, `iot_integration`.
- Key models: `ParkingLot`, `ParkingSpot`, `Booking`, `UserProfile`, `IoTDevice`, `SensorData`, `DeviceLog`.
- Key views: auth, bookings CRUD, availability, `dashboard_reports`, `user_statistics`, IoT `register_device`, `sensor_data`, device details.
- Auth: Token-based (header `Authorization: Token <token>`). Dashboard permissions: superadmin write; staff read-only; general users no access.

### Admin Dashboard

- Location: `admin_dashboard/` → `index.html`, `styles.css`, `script.js`.
- Sections: Dashboard, Lots, Devices, Bookings, Users, Alerts, Reports, Settings.
- Core behaviors: client-side routing, manual refresh buttons (no auto-refresh churn), dark mode persisted in `localStorage`.
- Bookings: Filters (status/slot/date), CSV export, view/delete actions, slot labels normalized to “Slot A/B”.
- Users: Search (name/email), sort, CSV export, view; delete available to superadmin.

### Mobile App

- Location: `frontend/`.
- Uses fetch/axios to call DRF with stored token. Basic flow: login → view availability → book/cancel → view history.

### IoT Integration

- ESP32 posts to `iot_integration` endpoints. Backend maps telemetry to `ParkingSpot` and drives LED colors (booked=blue, empty=green, occupied=red).

### Common Endpoints (adjust to your `urls.py`)

- Auth: `POST /api/auth/login/`
- Bookings: `GET /api/admin/bookings/`, `DELETE /api/admin/bookings/{id}/`
- Spots/Lots: `GET /api/parking/spots/`
- Reports: `GET /api/dashboard_reports/`, `GET /api/user_statistics/`
- IoT: `POST /api/iot/register_device/`, `POST /api/iot/sensor_data/`, `GET /api/iot/device/details/`

### Running Locally

- Backend:
  - `cd backend`
  - `python manage.py migrate`
  - `python manage.py runserver 8000`
- Admin dashboard:
  - Open `admin_dashboard/index.html` in a browser (or serve statically).
  - Set admin token in console: `localStorage.setItem('adminToken','YOUR_TOKEN')`.
- Mobile app:
  - `cd frontend`
  - `npm install` or `yarn`
  - Configure backend base URL in services
  - `npx react-native run-android` or `run-ios`

### Notes

- If API endpoints differ, update `apiBaseUrl` and `iotApiUrl` in `admin_dashboard/script.js`.
- Staff users will see read-only actions on dashboard resources.

### Dev Quick Start (Windows)

- From repo root, run:
  - PowerShell: `powershell -ExecutionPolicy Bypass -File .\start_dev.ps1`
  - This starts:
    - Backend: `http://localhost:8000`
    - Admin dashboard: `http://localhost:5500`
- If the login page can’t reach the backend, in browser DevTools console run:
  - `localStorage.setItem('backendOrigin', 'http://localhost:8000')`
