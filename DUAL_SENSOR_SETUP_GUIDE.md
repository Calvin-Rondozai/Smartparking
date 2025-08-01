# ESP32 Dual Sensor Integration Guide

## Overview

This guide will help you integrate your ESP32 dual sensor setup with the Django backend for real-time parking monitoring.

## What You Have

- ESP32 with 2 ultrasonic sensors (HC-SR04)
- 2 RGB LED indicators
- 1 IR sensor for alerts
- 1 Buzzer for notifications

## Quick Setup Steps

### 1. Backend Setup (Django)

```bash
# Navigate to backend directory
cd backend

# Run migrations (if not done already)
python manage.py makemigrations iot_integration
python manage.py migrate

# Run the dual sensor setup
python setup_dual_sensor.py

# Start Django server
python manage.py runserver 0.0.0.0:8000
```

### 2. ESP32 Code Setup

1. **Open Arduino IDE**
2. **Install Required Libraries:**

   - Go to Tools → Manage Libraries
   - Search and install:
     - `ArduinoJson` by Benoit Blanchon
     - `WiFi` (built-in)
     - `HTTPClient` (built-in)

3. **Open the integrated code:**

   - Open `esp32_parking_sensor/esp32_dual_sensor_integrated.ino`

4. **Update Configuration:**

   ```cpp
   // WiFi Configuration
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";

   // Server Configuration (update IP if needed)
   const char* serverUrl = "http://10.0.2.2:8000/api/iot/";
   const char* deviceId = "ESP32_DUAL_SENSOR_001";
   ```

5. **Upload to ESP32**

### 3. Hardware Connections

Your current wiring is perfect! Here's the pin mapping:

```
ESP32 Pin 4  -> HC-SR04 #1 TRIG (Slot 1)
ESP32 Pin 5  -> HC-SR04 #1 ECHO (Slot 1)
ESP32 Pin 12 -> HC-SR04 #2 TRIG (Slot 2)
ESP32 Pin 14 -> HC-SR04 #2 ECHO (Slot 2)

ESP32 Pin 21 -> RGB LED #1 RED (Slot 1)
ESP32 Pin 19 -> RGB LED #1 GREEN (Slot 1)
ESP32 Pin 26 -> RGB LED #1 BLUE (Slot 1)

ESP32 Pin 0  -> RGB LED #2 RED (Slot 2)
ESP32 Pin 15 -> RGB LED #2 GREEN (Slot 2)
ESP32 Pin 2  -> RGB LED #2 BLUE (Slot 2)

ESP32 Pin 27 -> IR Sensor
ESP32 Pin 18 -> Buzzer
```

## How It Works

### Data Flow

1. **ESP32 reads sensors every 200ms**

   - Ultrasonic sensors measure distance
   - IR sensor detects movement
   - RGB LEDs show status (Red=Occupied, Green=Empty)

2. **Data sent to Django every 5 seconds**

   - Slot 1 occupancy status
   - Slot 2 occupancy status
   - IR alert status
   - Distance measurements
   - Device health data

3. **Django backend processes data**
   - Updates parking spot availability
   - Stores sensor data
   - Logs device activity

### LED Indicators

- **Slot 1 (Pins 21/19/26):**

  - Red = Occupied
  - Green = Empty
  - Blue = Reserved for future use

- **Slot 2 (Pins 0/15/2):**
  - Red = Occupied
  - Green = Empty
  - Blue = Reserved for future use

### Buzzer Alert

- Activates when IR sensor detects movement
- Helps with security monitoring

## Testing the Integration

### 1. Test Backend

```bash
cd backend
python test_iot_integration.py
```

### 2. Test ESP32

1. Open Serial Monitor in Arduino IDE (115200 baud)
2. Check for:
   - WiFi connection success
   - Device registration success
   - Sensor data being sent
   - Server responses

### 3. Manual Testing

```bash
# Test device registration
curl -X POST http://localhost:8000/api/iot/devices/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "ESP32_DUAL_SENSOR_001",
    "device_type": "sensor",
    "name": "Dual Parking Sensor",
    "location": "Test Location"
  }'

# Test sensor data
curl -X POST http://localhost:8000/api/iot/sensor/data/ \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "ESP32_DUAL_SENSOR_001",
    "is_occupied": true,
    "distance_cm": 25.5,
    "slot1_occupied": true,
    "slot2_occupied": false,
    "ir_alert": false
  }'

# Check parking availability
curl http://localhost:8000/api/iot/parking/availability/
```

## API Endpoints

### Device Management

- `POST /api/iot/devices/register/` - Register device
- `GET /api/iot/devices/` - List all devices
- `GET /api/iot/devices/{device_id}/data/` - Get device data

### Sensor Data

- `POST /api/iot/sensor/data/` - Send sensor data
- `GET /api/iot/parking/availability/` - Get real-time availability

### Device Health

- `POST /api/iot/devices/heartbeat/` - Device connectivity check

## Troubleshooting

### Common Issues

1. **WiFi Connection Failed**

   - Check WiFi credentials
   - Ensure ESP32 is in range
   - Verify network security

2. **HTTP Request Failed**

   - Check server IP address
   - Verify Django server is running
   - Check firewall settings

3. **Sensor Readings Inaccurate**

   - Adjust distance threshold (currently 10cm)
   - Check sensor positioning
   - Clean sensor surface

4. **LEDs Not Working**
   - Check wiring connections
   - Verify pin assignments
   - Test individual pins

### Debug Mode

Enable Serial Monitor to see:

- WiFi connection status
- HTTP request/response data
- Sensor readings
- Error messages

## Integration with Mobile App

Your React Native app can now:

1. **Get real-time parking data** from IoT sensors
2. **Show live availability** for both slots
3. **Receive alerts** when IR sensor detects movement
4. **Monitor device health** and connectivity

## Next Steps

1. **Test the integration** with the provided test scripts
2. **Update your mobile app** to fetch real-time data
3. **Add notifications** for IR alerts
4. **Scale up** by adding more sensors
5. **Implement advanced features** like:
   - Battery monitoring
   - Temperature sensors
   - Camera integration
   - Payment integration

## Support

If you encounter issues:

1. Check the debug logs
2. Verify hardware connections
3. Test with the provided scripts
4. Review the API documentation
5. Check Django server logs

## Files Created

- `esp32_parking_sensor/esp32_dual_sensor_integrated.ino` - Integrated ESP32 code
- `backend/iot_integration/` - Django IoT integration
- `backend/setup_dual_sensor.py` - Setup script
- `backend/test_iot_integration.py` - Test script
- `DUAL_SENSOR_SETUP_GUIDE.md` - This guide

Your dual sensor setup is now ready for integration! 🚀
