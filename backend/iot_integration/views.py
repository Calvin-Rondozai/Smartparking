from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import datetime, timedelta
import json

from .models import IoTDevice, SensorData, DeviceLog
from .serializers import (
    IoTDeviceSerializer, SensorDataSerializer, DeviceLogSerializer,
    IoTDeviceCreateSerializer, SensorDataCreateSerializer
)
from parking_app.models import ParkingSpot

@api_view(['POST'])
@permission_classes([AllowAny])
def register_device(request):
    """Register a new IoT device"""
    try:
        serializer = IoTDeviceCreateSerializer(data=request.data)
        if serializer.is_valid():
            device = serializer.save()
            DeviceLog.objects.create(
                device=device,
                log_type='info',
                message=f'Device registered successfully'
            )
            return Response({
                'message': 'Device registered successfully',
                'device': IoTDeviceSerializer(device).data
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([AllowAny])
def sensor_data(request):
    """Receive sensor data from ESP32 devices"""
    try:
        print('SENSOR DATA RECEIVED:', request.data)
        
        device_id = request.data.get('device_id')
        if not device_id:
            return Response({
                'error': 'device_id is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            device = IoTDevice.objects.get(device_id=device_id, is_active=True)
        except IoTDevice.DoesNotExist:
            return Response({
                'error': 'Device not found or inactive'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Update device last seen
        device.last_seen = timezone.now()
        device.save()
        
        # Create sensor data
        sensor_data = {
            'device': device.id,
            'is_occupied': request.data.get('is_occupied', False),
            'distance_cm': request.data.get('distance_cm'),
            'battery_level': request.data.get('battery_level'),
            'signal_strength': request.data.get('signal_strength'),
            'temperature': request.data.get('temperature'),
            'humidity': request.data.get('humidity'),
            'slot1_occupied': request.data.get('slot1_occupied'),
            'slot2_occupied': request.data.get('slot2_occupied'),
            'ir_alert': request.data.get('ir_alert'),
        }
        
        # Handle dual sensor data if available (only if columns exist)
        try:
            slot1_occupied = request.data.get('slot1_occupied')
            slot2_occupied = request.data.get('slot2_occupied')
            ir_alert = request.data.get('ir_alert')
            
            if slot1_occupied is not None:
                sensor_data['slot1_occupied'] = slot1_occupied
            if slot2_occupied is not None:
                sensor_data['slot2_occupied'] = slot2_occupied
            if ir_alert is not None:
                sensor_data['ir_alert'] = ir_alert
        except:
            # If dual sensor fields don't exist, skip them
            pass
        
        # Update parking spots based on dual sensor data
        from parking_app.models import ParkingLot, ParkingSpot
        
        try:
            lot = ParkingLot.objects.get(name="IoT Smart Parking")
            slot1_occupied = request.data.get('slot1_occupied')
            slot2_occupied = request.data.get('slot2_occupied')
            
            # Update Slot A
            if slot1_occupied is not None:
                try:
                    slot_a = ParkingSpot.objects.get(parking_lot=lot, spot_number="Slot A")
                    slot_a.is_occupied = slot1_occupied
                    slot_a.save()
                    print(f"Updated Slot A: {'Occupied' if slot1_occupied else 'Available'}")
                except ParkingSpot.DoesNotExist:
                    print("Slot A not found")
            
            # Update Slot B
            if slot2_occupied is not None:
                try:
                    slot_b = ParkingSpot.objects.get(parking_lot=lot, spot_number="Slot B")
                    slot_b.is_occupied = slot2_occupied
                    slot_b.save()
                    print(f"Updated Slot B: {'Occupied' if slot2_occupied else 'Available'}")
                except ParkingSpot.DoesNotExist:
                    print("Slot B not found")
                    
        except ParkingLot.DoesNotExist:
            print("IoT Smart Parking lot not found")
        
        serializer = SensorDataCreateSerializer(data=sensor_data)
        if serializer.is_valid():
            sensor_data_obj = serializer.save()
            
            # Log the data
            DeviceLog.objects.create(
                device=device,
                log_type='info',
                message=f'Sensor data received: {"Occupied" if sensor_data["is_occupied"] else "Empty"}'
            )
            
            return Response({
                'message': 'Sensor data received successfully',
                'data': SensorDataSerializer(sensor_data_obj).data
            }, status=status.HTTP_201_CREATED)
        
        print('SERIALIZER ERRORS:', serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        print('SENSOR DATA ERROR:', e)
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_devices(request):
    """Get all IoT devices"""
    try:
        devices = IoTDevice.objects.filter(is_active=True)
        # Use a simpler serializer without nested objects
        data = []
        for device in devices:
            data.append({
                'id': device.id,
                'device_id': device.device_id,
                'device_type': device.device_type,
                'name': device.name,
                'location': device.location,
                'ip_address': device.ip_address,
                'mac_address': device.mac_address,
                'is_active': device.is_active,
                'last_seen': device.last_seen,
                'created_at': device.created_at,
            })
        return Response(data)
    except Exception as e:
        print('GET_DEVICES ERROR:', e)
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_device_data(request, device_id):
    """Get sensor data for a specific device"""
    try:
        device = IoTDevice.objects.get(device_id=device_id)
        sensor_data = SensorData.objects.filter(device=device).order_by('-timestamp')[:50]
        serializer = SensorDataSerializer(sensor_data, many=True)
        return Response(serializer.data)
    except IoTDevice.DoesNotExist:
        return Response({
            'error': 'Device not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_parking_availability(request):
    """Get real-time parking availability from IoT sensors"""
    try:
        # Get IoT Smart Parking lot and slots
        from parking_app.models import ParkingLot, ParkingSpot
        
        try:
            lot = ParkingLot.objects.get(name="IoT Smart Parking")
        except ParkingLot.DoesNotExist:
            # Create the parking lot if it doesn't exist
            lot = ParkingLot.objects.create(
                name="IoT Smart Parking",
                address="IoT Smart Parking Location",
                total_spots=2
            )
            print(f"Created parking lot: {lot.name}")
        
        # Get or create parking spots
        spots = []
        for slot_name in ["Slot A", "Slot B"]:
            spot, created = ParkingSpot.objects.get_or_create(
                parking_lot=lot,
                spot_number=slot_name,
                defaults={
                    'name': slot_name,
                    'is_occupied': False,
                    'price_per_hour': 2.50
                }
            )
            if created:
                print(f"Created parking spot: {slot_name}")
            spots.append(spot)
        
        # Update slot availability based on latest sensor data
        devices = IoTDevice.objects.filter(is_active=True)
        for i, device in enumerate(devices):
            latest_data = SensorData.objects.filter(device=device).order_by('-timestamp').first()
            if latest_data:
                # Only update if sensor data is recent (within last 60 seconds)
                from django.utils import timezone
                time_diff = timezone.now() - latest_data.timestamp
                if time_diff.total_seconds() < 60:  # Update if data is recent
                    slot_name = f"Slot {'A' if i == 0 else 'B'}"
                    try:
                        spot = ParkingSpot.objects.get(parking_lot=lot, spot_number=slot_name)
                        # Use the dual sensor data if available
                        if hasattr(latest_data, 'slot1_occupied') and latest_data.slot1_occupied is not None:
                            if i == 0:  # Slot A
                                spot.is_occupied = latest_data.slot1_occupied
                            elif i == 1:  # Slot B
                                spot.is_occupied = latest_data.slot2_occupied if hasattr(latest_data, 'slot2_occupied') else latest_data.is_occupied
                        else:
                            # Fallback to general occupancy
                            spot.is_occupied = latest_data.is_occupied
                        spot.save()
                        print(f"Updated {slot_name}: {'Occupied' if spot.is_occupied else 'Available'}")
                    except ParkingSpot.DoesNotExist:
                        print(f"Parking spot {slot_name} not found")
                        pass
        
        # Get updated spots data
        spots = ParkingSpot.objects.filter(parking_lot=lot)
        total_spots = spots.count()
        available_spots = spots.filter(is_occupied=False).count()
        occupied_spots = spots.filter(is_occupied=True).count()
        
        spots_data = []
        for spot in spots:
            spots_data.append({
                'id': spot.id,
                'spot_number': spot.spot_number,
                'is_available': not spot.is_occupied,
                'name': spot.spot_number
            })
        
        return Response({
            'total_spots': total_spots,
            'available_spots': available_spots,
            'occupied_spots': occupied_spots,
            'spots': spots_data
        })
        
        # Get latest sensor data to update slot availability (only if there's recent sensor data)
        devices = IoTDevice.objects.filter(is_active=True)
        for i, device in enumerate(devices):
            latest_data = SensorData.objects.filter(device=device).order_by('-timestamp').first()
            if latest_data:
                # Only update if sensor data is very recent (within last 30 seconds)
                from django.utils import timezone
                time_diff = timezone.now() - latest_data.timestamp
                if time_diff.total_seconds() < 30:  # Only update if data is recent
                    slot_name = f"Slot {'A' if i == 0 else 'B'}"
                    try:
                        spot = ParkingSpot.objects.get(parking_lot=lot, spot_number=slot_name)
                        # Use the dual sensor data if available, otherwise use the general is_occupied
                        if hasattr(latest_data, 'slot1_occupied') and latest_data.slot1_occupied is not None:
                            if i == 0:  # Slot A
                                spot.is_occupied = latest_data.slot1_occupied
                            elif i == 1:  # Slot B
                                spot.is_occupied = latest_data.slot2_occupied if hasattr(latest_data, 'slot2_occupied') else latest_data.is_occupied
                        else:
                            # Fallback to general occupancy for both slots
                            spot.is_occupied = latest_data.is_occupied
                        spot.save()
                        print(f"Updated {slot_name}: {'Occupied' if spot.is_occupied else 'Available'}")
                    except ParkingSpot.DoesNotExist:
                        print(f"Parking spot {slot_name} not found")
                        pass
        
        # Get updated spots data
        spots = ParkingSpot.objects.filter(parking_lot=lot)
        total_spots = spots.count()
        available_spots = spots.filter(is_occupied=False).count()
        occupied_spots = spots.filter(is_occupied=True).count()
        
        spots_data = []
        for spot in spots:
            spots_data.append({
                'id': spot.id,
                'spot_number': spot.spot_number,
                'is_available': not spot.is_occupied,
                'name': spot.spot_number
            })
        
        return Response({
            'total_spots': total_spots,
            'available_spots': available_spots,
            'occupied_spots': occupied_spots,
            'spots': spots_data
        })
        
    except Exception as e:
        print(f"Error getting parking availability: {e}")
        return Response({
            'total_spots': 2,
            'available_spots': 2,
            'occupied_spots': 0,
            'spots': [
                {'id': 1, 'spot_number': 'Slot A', 'is_available': True, 'name': 'Slot A'},
                {'id': 2, 'spot_number': 'Slot B', 'is_available': True, 'name': 'Slot B'}
            ]
        })

@api_view(['POST'])
@permission_classes([AllowAny])
def test_occupancy(request):
    """Test endpoint to manually set slot occupancy for testing"""
    try:
        from parking_app.models import ParkingLot, ParkingSpot
        
        slot_name = request.data.get('slot_name')  # 'Slot A' or 'Slot B'
        is_occupied = request.data.get('is_occupied', False)
        
        if not slot_name:
            return Response({
                'error': 'slot_name is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            lot = ParkingLot.objects.get(name="IoT Smart Parking")
            spot = ParkingSpot.objects.get(parking_lot=lot, spot_number=slot_name)
            spot.is_occupied = is_occupied
            spot.save()
            
            print(f"TEST: Set {slot_name} to {'Occupied' if is_occupied else 'Available'}")
            
            return Response({
                'message': f'{slot_name} set to {"Occupied" if is_occupied else "Available"}',
                'slot': slot_name,
                'is_occupied': is_occupied
            })
            
        except ParkingLot.DoesNotExist:
            return Response({
                'error': 'IoT Smart Parking lot not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except ParkingSpot.DoesNotExist:
            return Response({
                'error': f'Slot {slot_name} not found'
            }, status=status.HTTP_404_NOT_FOUND)
            
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([AllowAny])
def device_heartbeat(request):
    """Device heartbeat to check connectivity"""
    try:
        device_id = request.data.get('device_id')
        if not device_id:
            return Response({
                'error': 'device_id is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            device = IoTDevice.objects.get(device_id=device_id)
            device.last_seen = timezone.now()
            device.save()
            
            return Response({
                'message': 'Heartbeat received',
                'timestamp': device.last_seen
            })
        except IoTDevice.DoesNotExist:
            return Response({
                'error': 'Device not found'
            }, status=status.HTTP_404_NOT_FOUND)
            
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR) 

@api_view(['POST'])
@permission_classes([AllowAny])
def control_esp32_booking(request):
    """Control ESP32 booking states (blue light)"""
    try:
        device_id = request.data.get('device_id')
        slot_number = request.data.get('slot_number')  # 'Slot A' or 'Slot B'
        is_booked = request.data.get('is_booked', False)
        
        if not device_id or not slot_number:
            return Response({
                'error': 'device_id and slot_number are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            device = IoTDevice.objects.get(device_id=device_id, is_active=True)
        except IoTDevice.DoesNotExist:
            return Response({
                'error': 'Device not found or inactive'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Store booking state in device metadata for ESP32 to read
        metadata = device.metadata or {}
        if slot_number == 'Slot A':
            metadata['slot1_booked'] = is_booked
        elif slot_number == 'Slot B':
            metadata['slot2_booked'] = is_booked
        
        device.metadata = metadata
        device.save()
        
        DeviceLog.objects.create(
            device=device,
            log_type='booking_control',
            message=f'Booking state updated: {slot_number} = {"Booked" if is_booked else "Available"}'
        )
        
        return Response({
            'message': f'{slot_number} booking state updated successfully',
            'slot_number': slot_number,
            'is_booked': is_booked
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR) 