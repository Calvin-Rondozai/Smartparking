#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "Redmi Note 11 Pro";
const char* password = "esskeetit";

// Server Configuration
const char* serverUrl = "http://192.168.180.47:8000/api/iot/";
const char* deviceId = "ESP32_DUAL_SENSOR_001";

// Pin Configuration
int buzzer = 18;
int irPin = 27;

// Ultrasonic Sensor 1 (Slot 1)
int trigPin1 = 4;
int echoPin1 = 5;

// Ultrasonic Sensor 2 (Slot 2)
int trigPin2 = 25;
int echoPin2 = 14;

// RGB LED for Slot 1
int redSlot1 = 21;
int greenSlot1 = 19;
int blueSlot1 = 26;

// RGB LED for Slot 2
int redSlot2 = 32;
int greenSlot2 = 15;
int blueSlot2 = 2;

// Timing
unsigned long lastSensorRead = 0;
unsigned long lastHeartbeat = 0;
const int SENSOR_INTERVAL = 5000;
const int HEARTBEAT_INTERVAL = 30000;

// Sensor states
bool slot1Occupied = false;
bool slot2Occupied = false;
bool slot1Booked = false;  // New: Booking state for Slot 1
bool slot2Booked = false;  // New: Booking state for Slot 2
bool irAlert = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

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

  // Turn off LEDs initially
  digitalWrite(redSlot1, LOW);
  digitalWrite(greenSlot1, LOW);
  digitalWrite(blueSlot1, LOW);
  digitalWrite(redSlot2, LOW);
  digitalWrite(greenSlot2, LOW);
  digitalWrite(blueSlot2, LOW);

  connectToWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    registerDevice();
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  unsigned long currentTime = millis();

  readSensors();

  if (WiFi.status() == WL_CONNECTED && currentTime - lastSensorRead >= SENSOR_INTERVAL) {
    sendSensorData();
    getBookingStates(); // Get booking states from server
    lastSensorRead = currentTime;
  }

  if (WiFi.status() == WL_CONNECTED && currentTime - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeat = currentTime;
  }

  delay(200);
}

void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Connected to WiFi!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ Failed to connect to WiFi");
  }
}

void registerDevice() {
  HTTPClient http;
  String url = String(serverUrl) + "devices/register/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> doc;
  doc["device_id"] = deviceId;
  doc["device_type"] = "sensor";
  doc["name"] = "Dual Parking Sensor";
  doc["location"] = "Lot A";
  doc["ip_address"] = WiFi.localIP().toString();
  doc["mac_address"] = WiFi.macAddress();

  String jsonString;
  serializeJson(doc, jsonString);

  int httpResponseCode = http.POST(jsonString);
  if (httpResponseCode > 0) {
    Serial.println("✅ Registered with server");
  } else {
    Serial.println("❌ Registration failed");
  }

  http.end();
}

void readSensors() {
  float distance1 = getDistance(trigPin1, echoPin1);
  float distance2 = getDistance(trigPin2, echoPin2);

  // Debug: Print distances
  Serial.print("Distance 1: ");
  Serial.print(distance1);
  Serial.print("cm, Distance 2: ");
  Serial.print(distance2);
  Serial.println("cm");

  bool newSlot1Occupied = (distance1 < 10 && distance1 > 2);
  bool newSlot2Occupied = (distance2 < 10 && distance2 > 2);

  if (newSlot1Occupied != slot1Occupied) {
    slot1Occupied = newSlot1Occupied;
    Serial.print("Slot 1: ");
    Serial.println(slot1Occupied ? "OCCUPIED" : "EMPTY");
  }

  if (newSlot2Occupied != slot2Occupied) {
    slot2Occupied = newSlot2Occupied;
    Serial.print("Slot 2: ");
    Serial.println(slot2Occupied ? "OCCUPIED" : "EMPTY");
  }

  updateRGB(slot1Occupied, slot1Booked, redSlot1, greenSlot1, blueSlot1);
  updateRGB(slot2Occupied, slot2Booked, redSlot2, greenSlot2, blueSlot2);

  int irReading = digitalRead(irPin);
  irAlert = (irReading == LOW);
  digitalWrite(buzzer, irAlert ? HIGH : LOW);
}

void updateRGB(bool occupied, bool booked, int rPin, int gPin, int bPin) {
  if (booked) {
    // Blue light for booked slots
    digitalWrite(rPin, LOW);
    digitalWrite(gPin, LOW);
    digitalWrite(bPin, HIGH);
  } else if (occupied) {
    // Red light for occupied slots
    digitalWrite(rPin, HIGH);
    digitalWrite(gPin, LOW);
    digitalWrite(bPin, LOW);
  } else {
    // Green light for available slots
    digitalWrite(rPin, LOW);
    digitalWrite(gPin, HIGH);
    digitalWrite(bPin, LOW);
  }
}

void sendSensorData() {
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
  doc["slot1_booked"] = slot1Booked;
  doc["slot2_booked"] = slot2Booked;
  doc["ir_alert"] = irAlert;

  String jsonString;
  serializeJson(doc, jsonString);

  int httpResponseCode = http.POST(jsonString);
  if (httpResponseCode > 0) {
    Serial.println("✅ Sensor data sent!");
  } else {
    Serial.println("❌ Failed to send sensor data");
  }

  http.end();
}

void sendHeartbeat() {
  HTTPClient http;
  String url = String(serverUrl) + "devices/heartbeat/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> doc;
  doc["device_id"] = deviceId;

  String jsonString;
  serializeJson(doc, jsonString);

  int httpResponseCode = http.POST(jsonString);
  if (httpResponseCode > 0) {
    Serial.println("❤️ Heartbeat sent");
  } else {
    Serial.println("❌ Heartbeat failed");
  }

  http.end();
}

void getBookingStates() {
  HTTPClient http;
  String url = String(serverUrl) + "devices/" + deviceId + "/data/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int httpResponseCode = http.GET();
  if (httpResponseCode > 0) {
    String response = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (!error) {
      // Check if metadata exists and contains booking states
      if (doc.containsKey("metadata")) {
        JsonObject metadata = doc["metadata"];
        
        // Update booking states
        if (metadata.containsKey("slot1_booked")) {
          slot1Booked = metadata["slot1_booked"];
          Serial.print("Slot 1 Booked: ");
          Serial.println(slot1Booked ? "YES" : "NO");
        }
        
        if (metadata.containsKey("slot2_booked")) {
          slot2Booked = metadata["slot2_booked"];
          Serial.print("Slot 2 Booked: ");
          Serial.println(slot2Booked ? "YES" : "NO");
        }
      }
    }
  } else {
    Serial.println("❌ Failed to get booking states");
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

  float distance = duration * 0.034 / 2;
  return (distance > 2 && distance < 400) ? distance : 999;
} 