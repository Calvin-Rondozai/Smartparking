# 🚨 Overtime Billing System Guide

## Overview

The SmartParking app now includes a comprehensive overtime billing system that automatically detects when parking time expires and bills users for additional time. The system integrates with IoT sensors to detect if cars are still parked and provides real-time notifications.

## 🎯 Key Features

### 1. **Automatic Overtime Detection**

- Detects when booking time expires
- Calculates overtime minutes and costs
- Updates billing in real-time

### 2. **IoT Integration**

- Uses ESP32 sensors to detect car occupancy
- Red light turns on when overtime begins
- Automatically stops billing when car leaves

### 3. **Smart Notifications**

- Warning notifications before expiry
- Overtime alerts when time expires
- Completion notifications when session ends

### 4. **Real-time Billing**

- Continuous overtime billing while car is parked
- Automatic completion when car leaves
- Transparent cost breakdown

## 🔧 System Components

### Backend Components

#### 1. **Overtime Management Views**

- `check_and_bill_overtime` - Check and bill overtime for a booking
- `get_active_overtime_bookings` - Get all active overtime bookings
- `complete_overtime_booking` - Manually complete an overtime booking

#### 2. **Notification Service**

- `NotificationService.send_overtime_alert()` - Send overtime alert
- `NotificationService.send_overtime_warning()` - Send warning before expiry
- `NotificationService.send_booking_completion()` - Send completion notification

#### 3. **Management Command**

- `check_overtime_bookings` - Automated overtime checking (runs every minute)

#### 4. **Model Enhancements**

- `Booking.calculate_overtime()` - Calculate overtime minutes and cost
- `Booking.update_overtime_billing()` - Update overtime billing fields
- `Booking.is_expired()` - Check if booking has expired

### Frontend Components

#### 1. **API Service Functions**

- `checkAndBillOvertime()` - Check and bill overtime
- `completeOvertimeBooking()` - Complete overtime booking
- `getActiveOvertimeBookings()` - Get active overtime bookings

#### 2. **Notification Service**

- Local push notifications for overtime alerts
- Scheduled warnings before expiry
- Real-time notification handling

## 📱 User Experience Flow

### 1. **Normal Parking Session**

```
User books parking → Blue light on → Normal billing
```

### 2. **Approaching Expiry (5 minutes before)**

```
⚠️ Warning notification → "Parking time ending soon"
```

### 3. **Time Expires**

```
🚨 Overtime alert → Red light on → Overtime billing starts
```

### 4. **Car Still Parked**

```
💰 Continuous overtime billing → Red light stays on
```

### 5. **Car Leaves**

```
✅ Completion notification → Lights turn off → Billing stops
```

## 🚀 API Endpoints

### Overtime Management

#### Check and Bill Overtime

```http
POST /api/bookings/{booking_id}/overtime/check/
```

**Response:**

```json
{
  "overtime_minutes": 15,
  "overtime_cost": 3.75,
  "is_overtime": true,
  "total_cost_with_overtime": 8.75,
  "car_still_parked": true,
  "message": "Overtime billing active - car still parked"
}
```

#### Complete Overtime Booking

```http
POST /api/bookings/{booking_id}/overtime/complete/
```

**Response:**

```json
{
  "message": "Overtime booking completed successfully",
  "overtime_minutes": 20,
  "overtime_cost": 5.0,
  "total_cost_with_overtime": 10.0,
  "status": "completed"
}
```

#### Get Active Overtime Bookings

```http
GET /api/bookings/overtime/active/
```

**Response:**

```json
{
  "overtime_bookings": [
    {
      "booking_id": 123,
      "parking_spot": "A1",
      "end_time": "2024-01-01T10:00:00Z",
      "overtime_minutes": 30,
      "overtime_cost": 7.5,
      "total_cost": 5.0,
      "total_cost_with_overtime": 12.5
    }
  ],
  "total_overtime_cost": 7.5
}
```

## 🔌 IoT Integration

### ESP32 LED Control

#### Red Light (Overtime Warning)

- Activates when booking expires
- Stays on while car is parked overtime
- Indicates additional charges are being applied

#### Blue Light (Normal Booking)

- Activates when booking is active
- Turns off when booking expires or completes

#### Light Off

- When car leaves and booking is completed
- When booking is cancelled

### Sensor Integration

The system checks car occupancy using:

1. **Primary**: IoT sensor data from ESP32
2. **Fallback**: Parking spot `is_occupied` status

## 📊 Billing Calculation

### Overtime Rate

- **Default**: $2.50/hour
- **Custom**: Uses parking lot's `hourly_rate`
- **Formula**: `(overtime_minutes / 60) × hourly_rate`

### Example Calculation

```
Booking duration: 2 hours
Hourly rate: $3.00
Overtime: 30 minutes

Base cost: 2 × $3.00 = $6.00
Overtime cost: (30/60) × $3.00 = $1.50
Total cost: $6.00 + $1.50 = $7.50
```

## 🚨 Notification System

### Notification Types

#### 1. **Overtime Warning** (5 minutes before expiry)

- Title: "⚠️ Parking Time Ending Soon"
- Body: "Your parking time expires in 5 minutes"
- Priority: Normal

#### 2. **Overtime Alert** (When time expires)

- Title: "🚨 Parking Time Expired!"
- Body: "You are being charged $X.XX for X minutes overtime"
- Priority: High

#### 3. **Booking Completion** (When car leaves)

- Title: "✅ Parking Session Complete"
- Body: "Total cost: $X.XX"
- Priority: Normal

### Notification Channels

#### Android

- `overtime-alerts` - High priority, red light
- `booking-updates` - Normal priority, green light

#### iOS

- Standard push notification handling
- Custom sound and vibration patterns

## ⚙️ Setup and Configuration

### 1. **Backend Setup**

#### Install Dependencies

```bash
pip install -r requirements.txt
```

#### Run Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

#### Test the System

```bash
python test_overtime_system.py
```

### 2. **Automated Overtime Checking**

#### Manual Run

```bash
python manage.py check_overtime_bookings
```

#### Dry Run (Test Mode)

```bash
python manage.py check_overtime_bookings --dry-run
```

#### Cron Job Setup (Recommended)

```bash
# Add to crontab - runs every minute
* * * * * cd /path/to/smartparking && python manage.py check_overtime_bookings
```

### 3. **Frontend Setup**

#### Install Expo Notifications

```bash
expo install expo-notifications expo-device
```

#### Configure Notifications

```javascript
import notificationService from "./services/notificationService";

// Initialize notifications
await notificationService.initialize();

// Schedule notifications for bookings
await notificationService.scheduleNotificationsForBookings(bookings);
```

## 🧪 Testing

### 1. **Backend Testing**

#### Test Overtime System

```bash
python test_overtime_system.py
```

#### Test Management Command

```bash
python manage.py check_overtime_bookings --dry-run
```

#### Test API Endpoints

```bash
# Test overtime check
curl -X POST "http://localhost:8000/api/bookings/1/overtime/check/" \
  -H "Authorization: Token YOUR_TOKEN"
```

### 2. **Frontend Testing**

#### Test Notifications

```javascript
// Test immediate notification
await notificationService.scheduleOvertimeAlert(booking, 15, 3.75);

// Test scheduled warning
await notificationService.scheduleOvertimeWarning(booking, 5);
```

#### Test API Integration

```javascript
// Check overtime billing
const overtimeData = await bookingAPI.checkAndBillOvertime(bookingId);

// Complete overtime booking
await bookingAPI.completeOvertimeBooking(bookingId);
```

## 🔍 Monitoring and Debugging

### 1. **Log Monitoring**

#### Backend Logs

```bash
# Watch Django logs
tail -f logs/django.log

# Watch overtime command logs
python manage.py check_overtime_bookings --verbosity=2
```

#### Frontend Logs

```javascript
// Enable debug logging
console.log("Overtime data:", overtimeData);
console.log("Notification scheduled:", notificationId);
```

### 2. **Database Queries**

#### Check Overtime Bookings

```sql
-- Active overtime bookings
SELECT * FROM parking_app_booking
WHERE status = 'active' AND is_overtime = 1;

-- Overtime costs by user
SELECT user_id, SUM(overtime_cost) as total_overtime
FROM parking_app_booking
WHERE is_overtime = 1
GROUP BY user_id;
```

## 🚨 Troubleshooting

### Common Issues

#### 1. **Notifications Not Working**

- Check notification permissions
- Verify Expo notifications setup
- Check device notification settings

#### 2. **Overtime Not Calculating**

- Verify booking end_time is set
- Check if booking status is 'active'
- Ensure timezone settings are correct

#### 3. **IoT Integration Issues**

- Check ESP32 connection
- Verify sensor data is being received
- Check IoT device status in admin

#### 4. **Billing Not Updating**

- Check if management command is running
- Verify database permissions
- Check for error logs

### Debug Commands

#### Check System Status

```bash
# Check Django status
python manage.py check

# Check database
python manage.py dbshell

# Check migrations
python manage.py showmigrations
```

#### Test IoT Integration

```bash
# Test ESP32 connection
python manage.py check_esp32_data

# Test sensor data
python manage.py check_iot_data
```

## 📈 Performance Optimization

### 1. **Database Optimization**

- Index on `status`, `is_overtime`, `end_time`
- Regular cleanup of old bookings
- Efficient overtime queries

### 2. **Notification Optimization**

- Batch notification processing
- Rate limiting for frequent updates
- Smart notification scheduling

### 3. **IoT Integration**

- Efficient sensor data polling
- Connection pooling for ESP32
- Fallback mechanisms for sensor failures

## 🔮 Future Enhancements

### 1. **Advanced Billing**

- Dynamic pricing based on demand
- Peak hour overtime rates
- Loyalty program discounts

### 2. **Enhanced Notifications**

- SMS notifications
- Email receipts
- Push notification preferences

### 3. **IoT Improvements**

- Real-time occupancy tracking
- Predictive analytics
- Smart lighting control

### 4. **User Experience**

- Overtime cost preview
- Extension options
- Payment integration

## 📞 Support

For technical support or questions about the overtime system:

1. **Check the logs** for error messages
2. **Review this documentation** for setup steps
3. **Test with the provided scripts** to isolate issues
4. **Check the API endpoints** for proper responses

---

**🎉 The overtime billing system is now fully integrated and ready for production use!**
