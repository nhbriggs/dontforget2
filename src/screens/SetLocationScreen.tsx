import React from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import LocationService from '../services/LocationService';
import * as Location from 'expo-location';
import { RootStackParamList } from '../types/navigation';

type SetLocationScreenProps = StackScreenProps<RootStackParamList, 'SetLocation'>;

const SetLocationScreen: React.FC<SetLocationScreenProps> = ({ route, navigation }) => {
  const { reminderId } = route.params;
  const isNewReminder = reminderId === 'new';

  const handleSetLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to set the reminder location.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: new Date(),
      };

      if (isNewReminder) {
        // For new reminders, call the callback if provided
        if (route.params.onLocationSet) {
          route.params.onLocationSet(locationData);
        }
        navigation.goBack();
        return;
      } else {
        // For existing reminders, update Firestore
        await LocationService.captureAndStoreLocation(reminderId);
        Alert.alert('Location Set', 'Your location has been saved for this reminder.', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      }
    } catch (error) {
      console.error('Error setting location:', error);
      Alert.alert('Error', 'Failed to set location. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set Your Location</Text>
      <Text style={styles.subtitle}>Pin your current location for this reminder.</Text>
      {/* In the future, add a map here for pinning */}
      <Button title="Set Location Now" onPress={handleSetLocation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
});

export default SetLocationScreen; 