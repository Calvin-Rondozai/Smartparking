#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "Redmi Note 11 Pro";
const char* password = "esskeetit";

// Server Configuration - FIXED: Use the correct server IP
const char* serverUrl = "http://10.187.189.47:8000/api/iot/";
const char* deviceId = "ESP32_DUAL_SENSOR_001";

// Pin Configuration
int buzzer = 18;
int irPin = 27;
int trigPin1 = 4;
int echoPin1 = 5;
int trigPin2 = 25;
int echoPin2 = 14;
int redSlot1 = 21;
int greenSlot1 = 19;
int blueSlot1 = 26;
int redSlot2 = 23;
int greenSlot2 = 15;
int blueSlot2 = 2;

// Timing variables
unsigned long lastSensorRead = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastBookingCheck = 0;
const int SENSOR_INTERVAL = 5000;
const int HEARTBEAT_INTERVAL = 30000;
const int BOOKING_CHECK_INTERVAL = 10000; // Check bookings every 10 seconds

// Sensor states
bool slot1Occupied = false;
bool slot2Occupied = false;
bool irAlert = false;
bool wifiConnected = false;

// Booking states
bool slot1Booked = false;
bool slot2Booked = false;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("=== ESP32 Booking LED Control Setup ===");
  
  // Initialize pins
  pinMode(trigPin1, OUTPUT);
  pinMode(echoPin1, INPUT);
  pinMode(trigPin2, OUTPUT);
  pinMode(echoPin2, INPUT);
  pinMode(irPin, INPUT);
  pinMode(buzzer, OUTPUT);
  pinMode(redSlot1, OUTPUT);
  pinMode(greenSlot1, OUTPUT);
  pinMode(blueSlot1, OUTPUT);
  pinMode(redSlot2, OUTPUT);
  pinMode(greenSlot2, OUTPUT);
  pinMode(blueSlot2, OUTPUT);
  
  // Turn off all LEDs initially
  turnOffAllLEDs();
  
  Serial.println("Pins initialized");

  // Prime initial LED state
  delay(200);
  readSensors();
  updateSlot1LEDs();
  updateSlot2LEDs();
  
  // Connect to WiFi
  connectToWiFi();
  
  if (wifiConnected) {
    registerDevice();
    printFirmwareInfo();
    printWiFiInfo();
    Serial.println("ESP32 Booking LED Control initialized successfully!");
  } else {
    Serial.println("ESP32 initialized but WiFi connection failed!");
  }
}

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Attempting to reconnect...");
    wifiConnected = false;
    connectToWiFi();
  }
  
  unsigned long currentTime = millis();
  
  // Read sensors
  readSensors();
  
  // Check bookings
  if (wifiConnected && currentTime - lastBookingCheck >= BOOKING_CHECK_INTERVAL) {
    checkActiveBookings();
    lastBookingCheck = currentTime;
  }
  
  // Send data to server
  if (wifiConnected && currentTime - lastSensorRead >= SENSOR_INTERVAL) {
    sendSensorData();
    lastSensorRead = currentTime;
  }
  
  // Heartbeat
  if (wifiConnected && currentTime - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeat = currentTime;
  }
  
  delay(200);
}

void connectToWiFi() {
  Serial.println("=== WiFi Connection ===");
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  const int maxAttempts = 30;
  
  while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n✅ WiFi connected successfully!");
    printWiFiInfo();
  } else {
    wifiConnected = false;
    Serial.println("\n❌ WiFi connection failed!");
  }
}

void registerDevice() {
  if (!wifiConnected) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "devices/register/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<512> doc;
  doc["device_id"] = deviceId;
  doc["device_type"] = "sensor";
  doc["name"] = "Dual Parking Sensor " + String(deviceId);
  doc["location"] = "Parking Lot A - Dual Sensor";
  doc["ip_address"] = WiFi.localIP().toString();
  doc["mac_address"] = WiFi.macAddress();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📡 Registering device...");
  Serial.println("URL: " + url);
  Serial.println("Payload: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  // Enhanced error reporting
  Serial.printf("HTTP Response Code: %d\n", httpResponseCode);
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Response: " + response);
    Serial.println("✅ Device registered successfully!");
  } else {
    Serial.printf("❌ Device registration failed! Error: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  
  http.end();
}

void checkActiveBookings() {
  if (!wifiConnected) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "bookings/active/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  Serial.println("📋 Checking active bookings...");
  Serial.println("URL: " + url);
  
  int httpResponseCode = http.GET();
  
  // Enhanced error reporting
  Serial.printf("HTTP Response Code: %d\n", httpResponseCode);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Response: " + response);
    
    StaticJsonDocument<1024> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (!error) {
      bool newSlot1Booked = false;
      bool newSlot2Booked = false;
      
      if (doc.containsKey("bookings")) {
        JsonArray bookings = doc["bookings"];
        
        for (JsonObject booking : bookings) {
          String spotNumber = booking["parking_spot"]["spot_number"];
          bool isActive = booking["is_active"];
          
          if (isActive) {
            if (spotNumber == "Slot A") newSlot1Booked = true;
            else if (spotNumber == "Slot B") newSlot2Booked = true;
          }
        }
      }
      
      bool slot1Changed = (newSlot1Booked != slot1Booked);
      bool slot2Changed = (newSlot2Booked != slot2Booked);
      
      if (slot1Changed) {
        slot1Booked = newSlot1Booked;
        Serial.print("🅰️  Slot 1 Booking: ");
        Serial.println(slot1Booked ? "🔵 BOOKED" : "🟢 Available");
        updateSlot1LEDs();
      }
      
      if (slot2Changed) {
        slot2Booked = newSlot2Booked;
        Serial.print("🅱️  Slot 2 Booking: ");
        Serial.println(slot2Booked ? "🔵 BOOKED" : "🟢 Available");
        updateSlot2LEDs();
      }
    } else {
      Serial.println("❌ Failed to parse booking data");
      Serial.println("Parse error: " + String(error.c_str()));
    }
  } else {
    Serial.printf("❌ Failed to check bookings! Error: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  
  http.end();
}

void readSensors() {
  float distance1 = getDistance(trigPin1, echoPin1);
  float distance2 = getDistance(trigPin2, echoPin2);

  bool newSlot1Occupied = (distance1 < 10);
  if (newSlot1Occupied != slot1Occupied) {
    slot1Occupied = newSlot1Occupied;
    Serial.print("🅰️  Slot 1: ");
    Serial.print(distance1);
    Serial.print("cm - ");
    Serial.println(slot1Occupied ? "🚗 Occupied" : "🟢 Empty");
    updateSlot1LEDs();
  }

  bool newSlot2Occupied = (distance2 < 10);
  if (newSlot2Occupied != slot2Occupied) {
    slot2Occupied = newSlot2Occupied;
    Serial.print("🅱️  Slot 2: ");
    Serial.print(distance2);
    Serial.print("cm - ");
    Serial.println(slot2Occupied ? "🚗 Occupied" : "🟢 Empty");
    updateSlot2LEDs();
  }

  int irReading = digitalRead(irPin);
  bool newIrAlert = (irReading == LOW);
  
  if (newIrAlert != irAlert) {
    irAlert = newIrAlert;
    Serial.print("🚨 IR Alert: ");
    Serial.println(irAlert ? "YES - Movement detected!" : "NO");
  }
  
  digitalWrite(buzzer, irAlert ? HIGH : LOW);
}

void updateSlot1LEDs() {
  if (slot1Occupied) {
    digitalWrite(redSlot1, HIGH);
    digitalWrite(greenSlot1, LOW);
    digitalWrite(blueSlot1, LOW);
    Serial.println("🔴 Slot 1: Red LED ON (Occupied)");
  } else if (slot1Booked) {
    digitalWrite(redSlot1, LOW);
    digitalWrite(greenSlot1, LOW);
    digitalWrite(blueSlot1, HIGH);
    Serial.println("🔵 Slot 1: Blue LED ON (Booked)");
  } else {
    digitalWrite(redSlot1, LOW);
    digitalWrite(greenSlot1, HIGH);
    digitalWrite(blueSlot1, LOW);
    Serial.println("🟢 Slot 1: Green LED ON (Available)");
  }
}

void updateSlot2LEDs() {
  if (slot2Occupied) {
    digitalWrite(redSlot2, HIGH);
    digitalWrite(greenSlot2, LOW);
    digitalWrite(blueSlot2, LOW);
    Serial.println("🔴 Slot 2: Red LED ON (Occupied)");
  } else if (slot2Booked) {
    digitalWrite(redSlot2, LOW);
    digitalWrite(greenSlot2, LOW);
    digitalWrite(blueSlot2, HIGH);
    Serial.println("🔵 Slot 2: Blue LED ON (Booked)");
  } else {
    digitalWrite(redSlot2, LOW);
    digitalWrite(greenSlot2, HIGH);
    digitalWrite(blueSlot2, LOW);
    Serial.println("🟢 Slot 2: Green LED ON (Available)");
  }
}

void turnOffAllLEDs() {
  digitalWrite(redSlot1, LOW);
  digitalWrite(greenSlot1, LOW);
  digitalWrite(blueSlot1, LOW);
  digitalWrite(redSlot2, LOW);
  digitalWrite(greenSlot2, LOW);
  digitalWrite(blueSlot2, LOW);
}

void sendSensorData() {
  if (!wifiConnected) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "sensor/data/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<1024> doc;
  doc["device_id"] = deviceId;
  doc["is_occupied"] = slot1Occupied || slot2Occupied;
  doc["distance_cm"] = getDistance(trigPin1, echoPin1);
  doc["battery_level"] = 100.0;
  doc["signal_strength"] = WiFi.RSSI();
  doc["temperature"] = random(20, 30);
  doc["humidity"] = random(40, 60);
  doc["slot1_occupied"] = slot1Occupied;
  doc["slot2_occupied"] = slot2Occupied;
  doc["ir_alert"] = irAlert;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📡 Sending sensor data...");
  Serial.println("URL: " + url);
  Serial.println("Payload: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  // Enhanced error reporting
  Serial.printf("HTTP Response Code: %d\n", httpResponseCode);
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Response: " + response);
    Serial.println("✅ Sensor data sent!");
  } else {
    Serial.printf("❌ Sensor data failed! Error: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  
  http.end();
}

void sendHeartbeat() {
  if (!wifiConnected) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "devices/heartbeat/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<128> doc;
  doc["device_id"] = deviceId;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("💓 Sending heartbeat...");
  Serial.println("URL: " + url);
  Serial.println("Payload: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  // Enhanced error reporting
  Serial.printf("HTTP Response Code: %d\n", httpResponseCode);
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Response: " + response);
    Serial.println("💓 Heartbeat sent!");
  } else {
    Serial.printf("❌ Heartbeat failed! Error: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  
  http.end();
}

float getDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);
  if (duration == 0) return 999;

  return duration * 0.034 / 2;
}

// ==============================
// Firmware & WiFi Diagnostics
// ==============================
void printFirmwareInfo() {
  Serial.println("=== ESP32 Firmware & System Info ===");
  Serial.printf("SDK Version: %s\n", ESP.getSdkVersion());
  Serial.printf("Chip Revision: %d\n", ESP.getChipRevision());
  Serial.printf("Flash Size: %d MB\n", ESP.getFlashChipSize() / (1024 * 1024));
  Serial.printf("CPU Frequency: %d MHz\n", ESP.getCpuFreqMHz());
  Serial.printf("Sketch Size: %d KB\n", ESP.getSketchSize() / 1024);
  Serial.printf("Free Heap: %d bytes\n", ESP.getFreeHeap());
  Serial.println("====================================");
}

void printWiFiInfo() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("=== WiFi Connection Info ===");
    Serial.printf("SSID: %s\n", WiFi.SSID().c_str());
    Serial.printf("IP Address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("MAC Address: %s\n", WiFi.macAddress().c_str());
    Serial.printf("Signal Strength (RSSI): %d dBm\n", WiFi.RSSI());
    Serial.printf("Channel: %d\n", WiFi.channel());
    Serial.println("=============================");
  } else {
    Serial.println("⚠️ WiFi not connected!");
  }
}