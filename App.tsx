import React, { useEffect, useRef } from 'react';
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
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from './src/config/firebase';

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
  const handledNotifications = useRef(new Set());

  useEffect(() => {
    const setupNotifications = async () => {
      // Request notification permissions
      const hasPermission = await NotificationService.requestPermissions();
      console.log('🔔 Notification permission status:', hasPermission);
      
      // Check currently scheduled notifications
      const scheduledNotifications = await NotificationService.checkScheduledNotifications();
      console.log('📅 Currently scheduled notifications:', scheduledNotifications.length);

      // Clear any existing notifications
      await Notifications.dismissAllNotificationsAsync();
      handledNotifications.current.clear();

      // Set up notification listeners
      const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
        const notificationId = notification.request.identifier;
        
        // Check if we've already handled this notification
        if (handledNotifications.current.has(notificationId)) {
          console.log('\n🚫 ========= DUPLICATE ALERT PREVENTED =========');
          console.log('📝 Notification ID:', notificationId);
          console.log('==========================================\n');
          return;
        }

        // Add to handled set
        handledNotifications.current.add(notificationId);

        const now = new Date();
        console.log('\n🔔 ========= NOTIFICATION RECEIVED =========');
        console.log('⏰ Time:', now.toLocaleTimeString());
        console.log('📝 Notification ID:', notificationId);
        console.log('📌 Reminder ID:', notification.request.content.data?.reminderId);
        console.log('🏷️ Title:', notification.request.content.title);
        console.log('📅 Trigger:', notification.request.trigger);
        console.log('==========================================\n');
        
        // Get the reminder ID from the notification data
        const reminderId = notification.request.content.data?.reminderId;
        
        // Log attempt to show Alert
        console.log('\n🚨 ========= SHOWING ALERT =========');
        console.log('⏰ Time:', new Date().toLocaleTimeString());
        console.log('📝 For Notification ID:', notificationId);
        console.log('📌 For Reminder ID:', reminderId);
        console.log('🔄 Is this a snoozed notification?:', notification.request.content.data?.isSnoozed || false);
        console.log('==========================================\n');

        Alert.alert(
          notification.request.content.title || 'Reminder',
          notification.request.content.body || 'Time for your task!',
          [
            { 
              text: 'OK', 
              style: 'default',
              onPress: async () => {
                // Clear this notification when OK is pressed
                try {
                  await Notifications.dismissNotificationAsync(notificationId);
                } catch (error) {
                  console.log('⚠️ Could not dismiss notification:', error);
                }
              }
            },
            {
              text: 'Snooze (1min)',
              style: 'default',
              onPress: async () => {
                const snoozeTime = new Date();
                console.log('\n⏰ ========= SNOOZE PRESSED =========');
                console.log('⏰ Time:', snoozeTime.toLocaleTimeString());
                console.log('📝 Original Notification ID:', notificationId);
                console.log('📌 Reminder ID:', reminderId);
                
                // Clear the current notification
                try {
                  await Notifications.dismissNotificationAsync(notificationId);
                } catch (error) {
                  console.log('⚠️ Could not dismiss notification:', error);
                }

                if (reminderId) {
                  try {
                    // Update snooze count in Firestore
                    const reminderRef = doc(db, 'reminders', reminderId as string);
                    await updateDoc(reminderRef, {
                      snoozeCount: increment(1),
                      lastSnoozedAt: new Date()
                    });
                    console.log('📊 Updated snooze count for reminder:', reminderId);
                  } catch (error) {
                    console.error('❌ Error updating snooze count:', error);
                  }
                }

                // Cancel any scheduled instance of this notification
                try {
                  await Notifications.cancelScheduledNotificationAsync(notificationId);
                  console.log('🗑️ Cancelled original notification:', notificationId);
                } catch (error) {
                  console.log('⚠️ Could not cancel notification (might already be expired):', error);
                }

                // Schedule a new notification 1 minute from now
                try {
                  const newNotificationId = await Notifications.scheduleNotificationAsync({
                    content: {
                      title: notification.request.content.title || 'Reminder',
                      body: notification.request.content.body || 'Time for your task!',
                      data: {
                        ...notification.request.content.data,
                        isSnoozed: true  // Mark this as a snoozed notification
                      },
                    },
                    trigger: {
                      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                      seconds: 60, // 1 minute
                    },
                  });
                  console.log('🆕 New snoozed notification scheduled with ID:', newNotificationId);
                  console.log('⏰ Will trigger at:', new Date(Date.now() + 60000).toLocaleTimeString());
                  console.log('==========================================\n');
                } catch (error) {
                  console.error('❌ Error scheduling new notification:', error);
                }
              },
            },
          ],
          { cancelable: false }
        );
      });

      const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('\n👆 ========= NOTIFICATION TAPPED =========');
        console.log('⏰ Time:', new Date().toLocaleTimeString());
        console.log('📝 Notification ID:', response.notification.request.identifier);
        console.log('📌 Reminder ID:', response.notification.request.content.data?.reminderId);
        console.log('==========================================\n');
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
        handledNotifications.current.clear();
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