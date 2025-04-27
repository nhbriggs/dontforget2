import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { Reminder } from '../types/Reminder';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

class NotificationService {
  static async requestPermissions() {
    console.log('Requesting notification permissions...');
    if (!Device.isDevice) {
      console.log('Not a physical device, skipping notifications');
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('Existing permission status:', existingStatus);
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        console.log('Requesting permissions from user...');
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        finalStatus = status;
        console.log('New permission status:', finalStatus);
      }

      if (finalStatus !== 'granted') {
        console.log('Permission not granted');
        return false;
      }

      // Set notification handler
      console.log('Setting up notification handler');
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        }),
      });

      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  static async scheduleReminderNotification(reminder: Reminder) {
    console.log('Scheduling notification for reminder:', reminder.id);
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      console.log('No permission to schedule notification');
      return null;
    }

    // Ensure dates are proper Date objects
    const dueDate = reminder.dueDate instanceof Date ? reminder.dueDate : new Date(reminder.dueDate);
    console.log('📅 Original due date:', reminder.dueDate);
    console.log('📅 Converted due date:', dueDate);

    // Check if the due date is in the past
    const now = new Date();
    console.log('⏰ Current time:', now.toISOString());
    console.log('📅 Reminder due date:', dueDate.toISOString());
    
    if (dueDate < now) {
      console.log('⚠️ Due date is in the past, skipping notification');
      return null;
    }

    // Get the assigned child's display name from Firestore
    console.log('👤 Getting child name for:', reminder.assignedTo);
    const userDoc = await getDoc(doc(db, 'users', reminder.assignedTo));
    const childName = userDoc.exists() ? userDoc.data().displayName : 'Child';
    console.log('👶 Child name:', childName);

    // Schedule the notification
    try {
      console.log('🔔 Attempting to schedule notification for:', dueDate.toISOString());
      
      // For recurring reminders, schedule the next occurrence
      if (reminder.isRecurring && reminder.recurrenceConfig) {
        const { selectedDays, weekFrequency } = reminder.recurrenceConfig;
        const startDate = reminder.recurrenceConfig.startDate instanceof Date ? 
          reminder.recurrenceConfig.startDate : 
          new Date(reminder.recurrenceConfig.startDate);

        console.log('🔄 Recurring reminder config:', {
          selectedDays,
          weekFrequency,
          startDate: startDate.toISOString()
        });
        
        // Find the next occurrence based on the recurrence pattern
        const nextDate = this.getNextOccurrence(startDate, selectedDays, weekFrequency);
        console.log('📅 Next occurrence date:', nextDate.toISOString());
        
        if (nextDate > now) {
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: `${childName} don't forget 2 ${reminder.title}`,
              body: `It's time to ${reminder.title.toLowerCase()}!`,
              data: { 
                reminderId: reminder.id,
                isRecurring: true,
                recurrenceConfig: reminder.recurrenceConfig
              },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: nextDate,
            },
          });
          console.log('🔔 Recurring notification scheduled with ID:', notificationId);
          return notificationId;
        }
      } else {
        // One-time notification
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: `${childName} don't forget 2 ${reminder.title}`,
            body: `It's time to ${reminder.title.toLowerCase()}!`,
            data: { reminderId: reminder.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: dueDate,
          },
        });
        console.log('🔔 One-time notification scheduled with ID:', notificationId);
        return notificationId;
      }
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  private static getNextOccurrence(startDate: Date, selectedDays: string[], weekFrequency: number): Date {
    const today = new Date();
    today.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
    
    // If start date is in the future, and its day is selected, return it
    if (startDate > today && selectedDays.includes(startDate.getDay().toString())) {
      return startDate;
    }

    // Find the next occurrence
    let nextDate = new Date(today);
    let daysChecked = 0;
    const maxDays = 7 * weekFrequency * 2; // Look ahead maximum 2 cycles

    while (daysChecked < maxDays) {
      nextDate.setDate(nextDate.getDate() + 1);
      const dayOfWeek = nextDate.getDay().toString();
      
      if (selectedDays.includes(dayOfWeek)) {
        // Check if this occurrence aligns with the week frequency
        const weeksSinceStart = Math.floor(
          (nextDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );
        if (weeksSinceStart % weekFrequency === 0) {
          nextDate.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
          return nextDate;
        }
      }
      daysChecked++;
    }

    return nextDate; // Fallback, should rarely happen
  }

  // Add a method to check scheduled notifications
  static async checkScheduledNotifications() {
    try {
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      console.log('Currently scheduled notifications:', 
        scheduledNotifications.map(n => ({
          id: n.identifier,
          title: n.content.title,
          date: n.trigger && 'date' in n.trigger ? new Date(n.trigger.date) : 'unknown',
          data: n.content.data
        }))
      );
      return scheduledNotifications;
    } catch (error) {
      console.error('Error checking scheduled notifications:', error);
      return [];
    }
  }
}

export default NotificationService; 