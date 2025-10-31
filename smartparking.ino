// Buzzer
int buzzer = 18;

// IR Sensors (combined to one pin)
int irPin = 27;

// Ultrasonic Sensor 1 (Slot 1)
int trigPin1 = 4;
int echoPin1 = 5;

// Ultrasonic Sensor 2 (Slot 2)
int trigPin2 = 12;
int echoPin2 = 14; // Valid GPIO

// RGB LED for Slot 1
int redSlot1 = 21;
int greenSlot1 = 19;
int blueSlot1 = 26;

// RGB LED for Slot 2
int redSlot2 = 0;
int greenSlot2 = 15;
int blueSlot2 = 2;

void setup() {
  Serial.begin(9600);

  // Ultrasonic pins
  pinMode(trigPin1, OUTPUT);
  pinMode(echoPin1, INPUT);
  pinMode(trigPin2, OUTPUT);
  pinMode(echoPin2, INPUT);

  // IR and Buzzer
  pinMode(irPin, INPUT);
  pinMode(buzzer, OUTPUT);

  // RGB Slot 1
  pinMode(redSlot1, OUTPUT);
  pinMode(greenSlot1, OUTPUT);
  pinMode(blueSlot1, OUTPUT);

  // RGB Slot 2
  pinMode(redSlot2, OUTPUT);
  pinMode(greenSlot2, OUTPUT);
  pinMode(blueSlot2, OUTPUT);
}

void loop() {
  float distance1 = getDistance(trigPin1, echoPin1);
  float distance2 = getDistance(trigPin2, echoPin2);

  // -------- SLOT 1 STATUS (RGB 21/19/26) --------
  Serial.print("Ultrasonic 1: ");
  Serial.print(distance1);
  Serial.print(" cm - ");
  if (distance1 < 10) {
    Serial.println("Parked");
    digitalWrite(redSlot1, HIGH);
    digitalWrite(greenSlot1, LOW);
    digitalWrite(blueSlot1, LOW);
  } else {
    Serial.println("Empty");
    digitalWrite(redSlot1, LOW);
    digitalWrite(greenSlot1, HIGH);
    digitalWrite(blueSlot1, LOW);
  }

  // -------- SLOT 2 STATUS (RGB 0/15/2) --------
  Serial.print("Ultrasonic 2: ");
  Serial.print(distance2);
  Serial.print(" cm - ");
  if (distance2 < 10) {
    Serial.println("Parked");
    digitalWrite(redSlot2, HIGH);
    digitalWrite(greenSlot2, LOW);
    digitalWrite(blueSlot2, LOW);
  } else {
    Serial.println("Empty");
    digitalWrite(redSlot2, LOW);
    digitalWrite(greenSlot2, HIGH);
    digitalWrite(blueSlot2, LOW);
  }

  // -------- IR SENSOR ALERT --------
  int irReading = digitalRead(irPin);
  if (irReading == LOW) {  // LOW = object detected
    digitalWrite(buzzer, HIGH);
  } else {
    digitalWrite(buzzer, LOW);
  }

  delay(200); // Responsive delay
}

// -------- DISTANCE FUNCTION --------
float getDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
  if (duration == 0) return 999; // Timeout = far distance

  return duration * 0.034 / 2;
}
