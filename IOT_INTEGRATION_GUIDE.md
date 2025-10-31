# ESP32 IoT Integration Guide for Smart Parking App

## Overview
This guide explains how to integrate ESP32 devices with your Django backend for real-time parking monitoring and display.

## Hardware Requirements

### For Parking Sensors:
- ESP32 development board
- HC-SR04 Ultrasonic sensor
- LED indicator (optional)
- Power supply (USB or battery)

### For LED Display:
- ESP32 development board
- I2C LCD display (16x2 or 20x4)
- Power supply

## Software Requirements

### Arduino IDE Libraries:
1. **WiFi** (built-in)
2. **HTTPClient** (built-in)
3. **ArduinoJson** (install via Library Manager)
4. **Wire** (built-in, for I2C LCD)
5. **LiquidCrystal_I2C** (install via Library Manager)

## Setup Instructions

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Run migrations for IoT models
python manage.py makemigrations iot_integration
python manage.py migrate

# Run the setup script
python setup_iot.py

# Start the Django server
python manage.py runserver 0.0.0.0:8000
```

### 2. ESP32 Configuration

#### For Parking Sensors:
1. Open `esp32_parking_sensor.ino` in Arduino IDE
2. Update WiFi credentials:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
3. Update server URL if needed:
   ```cpp
   const char* serverUrl = "http://YOUR_SERVER_IP:8000/api/iot/";
   ```
4. Update device ID:
   ```cpp
   const char* deviceId = "ESP32_SENSOR_001";  // Unique for each sensor
   ```

#### For LED Display:
1. Open `esp32_led_display.ino` in Arduino IDE
2. Update WiFi credentials and server URL as above
3. Update device ID:
   ```cpp
   const char* deviceId = "ESP32_DISPLAY_001";
   ```

### 3. Hardware Connections

#### Parking Sensor Wiring:
```
ESP32 Pin 5  -> HC-SR04 TRIG
ESP32 Pin 18 -> HC-SR04 ECHO
ESP32 Pin 2  -> LED (optional)
VCC          -> 5V
GND          -> GND
```

#### LED Display Wiring:
```
ESP32 Pin 21 -> LCD SDA
ESP32 Pin 22 -> LCD SCL
VCC          -> 5V
GND          -> GND
```

## API Endpoints

### Device Management
- `POST /api/iot/devices/register/` - Register new IoT device
- `GET /api/iot/devices/` - Get all active devices
- `GET /api/iot/devices/{device_id}/data/` - Get device sensor data

### Sensor Data
- `POST /api/iot/sensor/data/` - Receive sensor data from ESP32
- `GET /api/iot/parking/availability/` - Get real-time parking availability

### Device Health
- `POST /api/iot/devices/heartbeat/` - Device connectivity check

## Data Flow

### Parking Sensor:
1. ESP32 reads ultrasonic sensor every 5 seconds
2. Determines if parking spot is occupied (distance < 50cm)
3. Sends data to Django backend via HTTP POST
4. Backend updates parking spot availability
5. LED indicator shows occupancy status

### LED Display:
1. ESP32 fetches parking availability every 10 seconds
2. Displays available/occupied counts on LCD
3. Shows real-time parking information

## Testing

### Test Sensor Data:
```bash
curl -X POST http://localhost:8000/api/iot/sensor/data/ \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "ESP32_SENSOR_001",
    "is_occupied": true,
    "distance_cm": 25.5,
    "battery_level": 85.0,
    "signal_strength": -45
  }'
```

### Test Device Registration:
```bash
curl -X POST http://localhost:8000/api/iot/devices/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "ESP32_SENSOR_001",
    "device_type": "sensor",
    "name": "Parking Sensor 1",
    "location": "Spot A01"
  }'
```

### Check Parking Availability:
```bash
curl http://localhost:8000/api/iot/parking/availability/
```

## Troubleshooting

### Common Issues:

1. **WiFi Connection Failed**
   - Check WiFi credentials
   - Ensure ESP32 is in range
   - Verify network security settings

2. **HTTP Request Failed**
   - Check server IP address
   - Verify Django server is running
   - Check firewall settings

3. **Sensor Readings Inaccurate**
   - Adjust `OCCUPIED_DISTANCE` threshold
   - Check sensor positioning
   - Clean sensor surface

4. **LCD Not Displaying**
   - Verify I2C address (usually 0x27 or 0x3F)
   - Check wiring connections
   - Test with I2C scanner

### Debug Mode:
Enable Serial Monitor in Arduino IDE to see debug messages:
- WiFi connection status
- HTTP request/response data
- Sensor readings
- Error messages

## Security Considerations

1. **Network Security**
   - Use WPA2/WPA3 WiFi encryption
   - Consider VPN for remote access
   - Implement API authentication for production

2. **Device Security**
   - Use unique device IDs
   - Implement device authentication
   - Regular firmware updates

3. **Data Privacy**
   - Encrypt sensitive data
   - Implement data retention policies
   - Comply with privacy regulations

## Scaling Up

### Multiple Sensors:
1. Use unique device IDs for each sensor
2. Update server URL to handle multiple devices
3. Consider using MQTT for better scalability

### Additional Features:
1. **Battery Monitoring** - Implement low battery alerts
2. **Temperature Monitoring** - Add temperature sensors
3. **Camera Integration** - Add ESP32-CAM for visual verification
4. **Mobile App Integration** - Real-time notifications

## Maintenance

### Regular Tasks:
1. Check device connectivity (heartbeat monitoring)
2. Monitor battery levels
3. Clean sensors regularly
4. Update firmware as needed
5. Review system logs

### Backup:
1. Regular database backups
2. Device configuration backups
3. Firmware version control

## Support

For issues or questions:
1. Check the debug logs
2. Verify hardware connections
3. Test with known working components
4. Review API documentation
5. Check Django server logs 