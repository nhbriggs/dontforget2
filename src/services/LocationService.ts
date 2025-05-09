import * as Location from 'expo-location';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

class LocationService {
  private static locationSubscription: Location.LocationSubscription | null = null;
  private static reminderLocations: Map<string, { latitude: number; longitude: number; timestamp: number }> = new Map();
  private static readonly MOVEMENT_THRESHOLD_METERS = 20; // 20 meters threshold for movement

  static async requestPermissions() {
    console.log('Requesting location permissions...');
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        console.log('Foreground location permission not granted');
        return false;
      }

      if (Platform.OS === 'android') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.log('Background location permission not granted');
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  static async startLocationTracking(reminderId: string) {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('Location permissions not granted, cannot start tracking');
        return;
      }

      // Get initial location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Store the reminder location
      this.reminderLocations.set(reminderId, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: Date.now(),
      });

      // Update the reminder document with location data
      const reminderRef = doc(db, 'reminders', reminderId);
      await updateDoc(reminderRef, {
        reminderLocation: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: new Date(),
        },
      });

      // Start watching location changes
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000, // Check every 10 seconds
          distanceInterval: 5, // Update if moved 5 meters
        },
        (newLocation) => {
          this.checkLocationChange(reminderId, newLocation);
        }
      );

      console.log('Location tracking started for reminder:', reminderId);
    } catch (error) {
      console.error('Error starting location tracking:', error);
    }
  }

  private static async checkLocationChange(reminderId: string, newLocation: Location.LocationObject) {
    const reminderLocation = this.reminderLocations.get(reminderId);
    if (!reminderLocation) return;

    // Calculate distance between reminder location and current location
    const distance = this.calculateDistance(
      reminderLocation.latitude,
      reminderLocation.longitude,
      newLocation.coords.latitude,
      newLocation.coords.longitude
    );

    // If moved more than threshold, send force notification
    if (distance > this.MOVEMENT_THRESHOLD_METERS) {
      console.log(`User moved ${distance.toFixed(2)} meters from reminder location`);
      
      // Send force notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Reminder Alert!',
          body: 'You have moved away from your reminder location. Don\'t forget to complete your task!',
          data: { reminderId, type: 'location_alert' },
        },
        trigger: null, // Show immediately
      });

      // Stop tracking for this reminder
      this.stopLocationTracking(reminderId);
    }
  }

  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  static stopLocationTracking(reminderId: string) {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
    this.reminderLocations.delete(reminderId);
    console.log('Location tracking stopped for reminder:', reminderId);
  }
}

export default LocationService; 