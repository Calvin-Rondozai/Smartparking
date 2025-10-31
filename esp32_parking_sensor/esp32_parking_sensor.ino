#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server Configuration
const char* serverUrl = "http://10.0.2.2:8000/api/iot/";  // Change to your Django server IP
const char* deviceId = "ESP32_SENSOR_001";  // Unique device ID

// Pin Configuration
const int TRIG_PIN = 5;    // Ultrasonic sensor trigger pin
const int ECHO_PIN = 18;   // Ultrasonic sensor echo pin
const int LED_PIN = 2;     // Status LED

// Sensor Configuration
const int OCCUPIED_DISTANCE = 50;  // Distance in cm to consider spot occupied
const int SENSOR_INTERVAL = 5000;  // Send data every 5 seconds
const int HEARTBEAT_INTERVAL = 30000;  // Send heartbeat every 30 seconds

// Variables
unsigned long lastSensorRead = 0;
unsigned long lastHeartbeat = 0;
bool isOccupied = false;
float batteryLevel = 100.0;  // Simulated battery level
int signalStrength = 0;

void setup() {
  Serial.begin(115200);
  
  // Initialize pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  
  // Connect to WiFi
  connectToWiFi();
  
  // Register device with server
  registerDevice();
  
  Serial.println("ESP32 Parking Sensor initialized!");
}

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }
  
  unsigned long currentTime = millis();
  
  // Read sensor data periodically
  if (currentTime - lastSensorRead >= SENSOR_INTERVAL) {
    readSensorData();
    lastSensorRead = currentTime;
  }
  
  // Send heartbeat periodically
  if (currentTime - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeat = currentTime;
  }
  
  delay(1000);
}

void connectToWiFi() {
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    signalStrength = WiFi.RSSI();
    digitalWrite(LED_PIN, HIGH);
  } else {
    Serial.println("\nWiFi connection failed!");
    digitalWrite(LED_PIN, LOW);
  }
}

void registerDevice() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "devices/register/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = deviceId;
  doc["device_type"] = "sensor";
  doc["name"] = "Parking Sensor " + String(deviceId);
  doc["location"] = "Parking Lot A";
  doc["ip_address"] = WiFi.localIP().toString();
  doc["mac_address"] = WiFi.macAddress();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Registering device...");
  Serial.println(jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Device registration response: " + response);
  } else {
    Serial.println("Device registration failed: " + http.errorToString(httpResponseCode));
  }
  
  http.end();
}

void readSensorData() {
  // Read ultrasonic sensor
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  long duration = pulseIn(ECHO_PIN, HIGH);
  float distance = duration * 0.034 / 2;
  
  // Determine if spot is occupied
  bool newOccupied = (distance < OCCUPIED_DISTANCE);
  
  // Only send data if occupancy status changed or every 10 readings
  static int readCount = 0;
  if (newOccupied != isOccupied || readCount % 10 == 0) {
    isOccupied = newOccupied;
    sendSensorData(distance);
  }
  
  readCount++;
  
  // Update LED based on occupancy
  digitalWrite(LED_PIN, isOccupied ? LOW : HIGH);
  
  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.print(" cm, Occupied: ");
  Serial.println(isOccupied ? "YES" : "NO");
}

void sendSensorData(float distance) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "sensor/data/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = deviceId;
  doc["is_occupied"] = isOccupied;
  doc["distance_cm"] = distance;
  doc["battery_level"] = batteryLevel;
  doc["signal_strength"] = signalStrength;
  doc["temperature"] = random(20, 30);  // Simulated temperature
  doc["humidity"] = random(40, 60);     // Simulated humidity
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Sending sensor data...");
  Serial.println(jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Sensor data response: " + response);
  } else {
    Serial.println("Sensor data failed: " + http.errorToString(httpResponseCode));
  }
  
  http.end();
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "devices/heartbeat/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<128> doc;
  doc["device_id"] = deviceId;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Sending heartbeat...");
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Heartbeat response: " + response);
  } else {
    Serial.println("Heartbeat failed: " + http.errorToString(httpResponseCode));
  }
  
  http.end();
} 