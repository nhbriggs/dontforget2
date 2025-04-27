import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import AddReminderScreen from './src/screens/AddReminderScreen';
import EditReminderScreen from './src/screens/EditReminderScreen';
import { RootStackParamList } from './src/types/navigation';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import NotificationService from './src/services/NotificationService';
import * as Notifications from 'expo-notifications';

// Configure notifications to show when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

const Stack = createNativeStackNavigator<RootStackParamList>();

function Navigation() {
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    const setupNotifications = async () => {
      // Request notification permissions
      const hasPermission = await NotificationService.requestPermissions();
      console.log('🔔 Notification permission status:', hasPermission);
      
      // Check currently scheduled notifications
      const scheduledNotifications = await NotificationService.checkScheduledNotifications();
      console.log('📅 Currently scheduled notifications:', scheduledNotifications.length);

      // Set up notification listeners
      const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
        console.log('🔔 Notification received:', notification);
        Alert.alert('Notification Received', 'A notification was received!');
      });

      const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('👆 Notification tapped:', response);
      });

      // Test notification
      if (hasPermission) {
        console.log('🔔 Scheduling test notification...');
        const testNotificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Test Notification',
            body: 'This is a test notification!',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 5, // Test notification in 5 seconds
          },
        });
        console.log('📱 Test notification scheduled with ID:', testNotificationId);
      }

      return () => {
        receivedSubscription.remove();
        responseSubscription.remove();
      };
    };

    setupNotifications();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator>
      {user ? (
        // User is signed in
        <>
          <Stack.Screen 
            name="Reminders" 
            component={RemindersScreen}
            options={{
              title: user?.displayName ? `${user.displayName} Don't Forget 2` : "Don't Forget 2",
              headerStyle: {
                backgroundColor: '#fff',
              },
              headerTitleStyle: {
                fontWeight: 'bold',
              },
              headerRight: () => (
                <TouchableOpacity onPress={signOut} style={{ marginRight: 10 }}>
                  <MaterialIcons name="logout" size={24} color="black" />
                </TouchableOpacity>
              ),
            }}
          />
          <Stack.Screen 
            name="AddReminder" 
            component={AddReminderScreen}
            options={{
              title: 'Add Reminder',
              headerStyle: {
                backgroundColor: '#fff',
              },
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />
          <Stack.Screen 
            name="EditReminder" 
            component={EditReminderScreen}
            options={{
              title: 'Edit Reminder',
              headerStyle: {
                backgroundColor: '#fff',
              },
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />
        </>
      ) : (
        // No user is signed in
        <>
          <Stack.Screen 
            name="SignIn" 
            component={SignInScreen}
            options={{
              headerShown: false
            }}
          />
          <Stack.Screen 
            name="SignUp" 
            component={SignUpScreen}
            options={{
              headerShown: false
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer>
            <StatusBar style="auto" />
            <Navigation />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
} 