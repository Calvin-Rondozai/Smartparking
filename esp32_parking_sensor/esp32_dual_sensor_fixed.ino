#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "Redmi Note 11 Pro";
const char* password = "esskeetit";

// Server Configuration - Your computer's IP address
const char* serverUrl = "http://192.168.180.47:8000/api/iot/";  // Your computer's IP
const char* deviceId = "ESP32_DUAL_SENSOR_001";

// Pin Configuration
int buzzer = 18;
int irPin = 27;
int trigPin1 = 4;
int echoPin1 = 5;
int trigPin2 = 12;
int echoPin2 = 14;
int redSlot1 = 21;
int greenSlot1 = 19;
int blueSlot1 = 26;
int redSlot2 = 0;
int greenSlot2 = 15;
int blueSlot2 = 2;

// Timing variables
unsigned long lastSensorRead = 0;
unsigned long lastHeartbeat = 0;
const int SENSOR_INTERVAL = 5000;
const int HEARTBEAT_INTERVAL = 30000;

// Sensor states
bool slot1Occupied = false;
bool slot2Occupied = false;
bool irAlert = false;
bool wifiConnected = false;

void setup() {
  Serial.begin(115200); // Increased baud rate for better debugging
  delay(1000);
  
  Serial.println("=== ESP32 Dual Sensor Setup ===");
  
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
  digitalWrite(redSlot1, LOW);
  digitalWrite(greenSlot1, LOW);
  digitalWrite(blueSlot1, LOW);
  digitalWrite(redSlot2, LOW);
  digitalWrite(greenSlot2, LOW);
  digitalWrite(blueSlot2, LOW);
  
  Serial.println("Pins initialized");
  
  // Connect to WiFi
  connectToWiFi();
  
  if (wifiConnected) {
    // Register device with server
    registerDevice();
    Serial.println("ESP32 Dual Sensor initialized successfully!");
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
  
  // Send data to server periodically (only if WiFi is connected)
  if (wifiConnected && currentTime - lastSensorRead >= SENSOR_INTERVAL) {
    sendSensorData();
    lastSensorRead = currentTime;
  }
  
  // Send heartbeat periodically (only if WiFi is connected)
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
  const int maxAttempts = 30; // Increased attempts
  
  while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
    delay(1000);
    Serial.print(".");
    attempts++;
    
    // Show progress every 5 attempts
    if (attempts % 5 == 0) {
      Serial.print(" (");
      Serial.print(attempts);
      Serial.print("/");
      Serial.print(maxAttempts);
      Serial.print(")");
    }
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n✅ WiFi connected successfully!");
    Serial.print("📱 IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("📶 Signal Strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    Serial.print("🔗 MAC Address: ");
    Serial.println(WiFi.macAddress());
  } else {
    wifiConnected = false;
    Serial.println("\n❌ WiFi connection failed!");
    Serial.println("Possible issues:");
    Serial.println("1. Check WiFi credentials");
    Serial.println("2. Ensure WiFi is in range");
    Serial.println("3. Check if WiFi supports 2.4GHz");
    Serial.println("4. Try restarting the ESP32");
  }
}

void registerDevice() {
  if (!wifiConnected) {
    Serial.println("❌ Cannot register device - WiFi not connected");
    return;
  }
  
  Serial.println("=== Device Registration ===");
  
  HTTPClient http;
  String url = String(serverUrl) + "devices/register/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = deviceId;
  doc["device_type"] = "sensor";
  doc["name"] = "Dual Parking Sensor " + String(deviceId);
  doc["location"] = "Parking Lot A - Dual Sensor";
  doc["ip_address"] = WiFi.localIP().toString();
  doc["mac_address"] = WiFi.macAddress();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📤 Sending registration request...");
  Serial.println("URL: " + url);
  Serial.println("Data: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("✅ Registration successful! Status: ");
    Serial.println(httpResponseCode);
    Serial.println("Response: " + response);
  } else {
    Serial.print("❌ Registration failed! Error: ");
    Serial.println(http.errorToString(httpResponseCode));
    Serial.println("Check if Django server is running and accessible");
  }
  
  http.end();
}

void readSensors() {
  float distance1 = getDistance(trigPin1, echoPin1);
  float distance2 = getDistance(trigPin2, echoPin2);

  // Slot 1 Status
  bool newSlot1Occupied = (distance1 < 10);
  if (newSlot1Occupied != slot1Occupied) {
    slot1Occupied = newSlot1Occupied;
    Serial.print("🅰️  Slot 1: ");
    Serial.print(distance1);
    Serial.print("cm - ");
    Serial.println(slot1Occupied ? "🚗 Occupied" : "🟢 Empty");
  }
  
  // Slot 1 LED Control
  if (slot1Occupied) {
    digitalWrite(redSlot1, HIGH);
    digitalWrite(greenSlot1, LOW);
    digitalWrite(blueSlot1, LOW);
  } else {
    digitalWrite(redSlot1, LOW);
    digitalWrite(greenSlot1, HIGH);
    digitalWrite(blueSlot1, LOW);
  }

  // Slot 2 Status
  bool newSlot2Occupied = (distance2 < 10);
  if (newSlot2Occupied != slot2Occupied) {
    slot2Occupied = newSlot2Occupied;
    Serial.print("🅱️  Slot 2: ");
    Serial.print(distance2);
    Serial.print("cm - ");
    Serial.println(slot2Occupied ? "🚗 Occupied" : "🟢 Empty");
  }
  
  // Slot 2 LED Control
  if (slot2Occupied) {
    digitalWrite(redSlot2, HIGH);
    digitalWrite(greenSlot2, LOW);
    digitalWrite(blueSlot2, LOW);
  } else {
    digitalWrite(redSlot2, LOW);
    digitalWrite(greenSlot2, HIGH);
    digitalWrite(blueSlot2, LOW);
  }

  // IR Sensor Alert
  int irReading = digitalRead(irPin);
  bool newIrAlert = (irReading == LOW);
  
  if (newIrAlert != irAlert) {
    irAlert = newIrAlert;
    Serial.print("🚨 IR Alert: ");
    Serial.println(irAlert ? "YES - Movement detected!" : "NO");
  }
  
  // Buzzer Control
  if (irAlert) {
    digitalWrite(buzzer, HIGH);
  } else {
    digitalWrite(buzzer, LOW);
  }
}

void sendSensorData() {
  if (!wifiConnected) {
    Serial.println("❌ Cannot send sensor data - WiFi not connected");
    return;
  }
  
  HTTPClient http;
  String url = String(serverUrl) + "sensor/data/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<1024> doc;
  doc["device_id"] = deviceId;
  doc["is_occupied"] = slot1Occupied || slot2Occupied;
  doc["distance_cm"] = getDistance(trigPin1, echoPin1);
  doc["battery_level"] = 100.0;
  doc["signal_strength"] = WiFi.RSSI();
  doc["temperature"] = random(20, 30);
  doc["humidity"] = random(40, 60);
  
  // Dual sensor fields
  doc["slot1_occupied"] = slot1Occupied;
  doc["slot2_occupied"] = slot2Occupied;
  doc["ir_alert"] = irAlert;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📤 Sending sensor data...");
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("✅ Sensor data sent! Status: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print("❌ Sensor data failed! Error: ");
    Serial.println(http.errorToString(httpResponseCode));
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
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    Serial.print("✅ Heartbeat sent! Status: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print("❌ Heartbeat failed! Error: ");
    Serial.println(http.errorToString(httpResponseCode));
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