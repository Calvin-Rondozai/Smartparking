# Smart Parking App - API Documentation

## Base URL

```
http://localhost:8000/api/
```

## Authentication Endpoints

### 1. User Registration (Sign Up)

**POST** `/auth/signup/`

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe",
  "phoneNumber": "+1234567890",
  "numberPlate": "ABC123",
  "carName": "Toyota Camry"
}
```

**Response:**

```json
{
  "message": "User registered successfully",
  "token": "your-auth-token",
  "user": {
    "id": 1,
    "username": "user@example.com",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe"
  }
}
```

### 2. User Login (Sign In)

**POST** `/auth/signin/`

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "message": "Login successful",
  "token": "your-auth-token",
  "user": {
    "id": 1,
    "username": "user@example.com",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe"
  },
  "profile": {
    "id": 1,
    "phone_number": "+1234567890",
    "license_plate": "ABC123",
    "car_name": "Toyota Camry",
    "is_verified": false
  }
}
```

### 3. User Logout

**POST** `/auth/signout/`

**Headers:**

```
Authorization: Token your-auth-token
```

**Response:**

```json
{
  "message": "Logout successful"
}
```

### 4. Get User Profile

**GET** `/auth/profile/`

**Headers:**

```
Authorization: Token your-auth-token
```

**Response:**

```json
{
  "user": {
    "id": 1,
    "username": "user@example.com",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe"
  },
  "profile": {
    "id": 1,
    "phone_number": "+1234567890",
    "license_plate": "ABC123",
    "car_name": "Toyota Camry",
    "is_verified": false
  }
}
```

### 5. Update User Profile

**PUT** `/auth/profile/update/`

**Headers:**

```
Authorization: Token your-auth-token
```

**Request Body:**

```json
{
  "user": {
    "first_name": "John",
    "last_name": "Smith"
  },
  "profile": {
    "phone_number": "+1234567890",
    "license_plate": "XYZ789",
    "car_name": "Honda Civic"
  }
}
```

## Parking Endpoints

### 6. Get Parking Statistics

**GET** `/stats/`

**Response:**

```json
{
  "total_spots": 79,
  "available_spots": 75,
  "total_bookings": 4
}
```

### 7. Get All Parking Lots

**GET** `/parking-lots/`

**Response:**

```json
[
    {
        "id": 1,
        "name": "Downtown Parking Center",
        "address": "123 Main Street, Downtown",
        "total_spots": 50,
        "hourly_rate": "3.00",
        "rating": "4.8",
        "is_active": true,
        "available_spots": 25,
        "parking_spots": [...]
    }
]
```

### 8. Get Parking Lot Details

**GET** `/parking-lots/{id}/`

### 9. Get All Parking Spots

**GET** `/parking-spots/`

**Response:**

```json
[
  {
    "id": 1,
    "parking_lot": 1,
    "spot_number": "A01",
    "spot_type": "regular",
    "is_occupied": false,
    "is_reserved": false
  }
]
```

### 10. Get Parking Spot Details

**GET** `/parking-spots/{id}/`

## Booking Endpoints

### 11. Get User Bookings

**GET** `/bookings/`

**Headers:**

```
Authorization: Token your-auth-token
```

**Response:**

```json
[
  {
    "id": 1,
    "user": {
      "id": 1,
      "username": "user@example.com",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe"
    },
    "parking_spot": {
      "id": 1,
      "spot_number": "A01",
      "spot_type": "regular"
    },
    "start_time": "2024-01-15T10:00:00Z",
    "end_time": "2024-01-15T12:00:00Z",
    "duration_minutes": 120,
    "vehicle_name": "Toyota Camry",
    "status": "active",
    "total_cost": "6.00"
  }
]
```

### 12. Create New Booking

**POST** `/bookings/`

**Headers:**

```
Authorization: Token your-auth-token
```

**Request Body:**

```json
{
  "parking_spot_id": 1,
  "start_time": "2024-01-15T10:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "duration_minutes": 120,
  "vehicle_name": "Toyota Camry"
}
```

### 13. Get Booking Details

**GET** `/bookings/{id}/`

**Headers:**

```
Authorization: Token your-auth-token
```

### 14. Extend Booking

**POST** `/bookings/{id}/extend/`

**Headers:**

```
Authorization: Token your-auth-token
```

**Request Body:**

```json
{
  "additional_minutes": 60
}
```

**Response:**

```json
{
    "message": "Booking extended successfully",
    "booking": {
        "id": 1,
        "duration_minutes": 180,
        "total_cost": "9.00",
        ...
    }
}
```

### 15. Cancel Booking

**POST** `/bookings/{id}/cancel/`

**Headers:**

```
Authorization: Token your-auth-token
```

**Response:**

```json
{
  "message": "Booking cancelled successfully"
}
```

## Error Responses

All endpoints return error responses in this format:

```json
{
  "error": "Error message description"
}
```

Common HTTP Status Codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

## Testing the API

1. Start the Django server:

```bash
python manage.py runserver
```

2. The API will be available at: `http://localhost:8000/api/`

3. You can test endpoints using tools like:
   - Postman
   - cURL
   - Your React Native app

## Sample Data

The backend comes with sample data including:

- 2 parking lots (Downtown Parking Center & Mall Parking Complex)
- 79 parking spots (regular, handicap, and electric vehicle spots)
- Admin user (username: admin, password: admin)

## Frontend Integration

To integrate with your React Native app:

1. Use the authentication endpoints for login/signup
2. Store the token in AsyncStorage
3. Include the token in all authenticated requests:

```javascript
headers: {
    'Authorization': `Token ${token}`,
    'Content-Type': 'application/json'
}
```
