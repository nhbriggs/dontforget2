import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { Reminder } from '../types/Reminder';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getAuth } from 'firebase/auth';
import LocationService from './LocationService';

// Queue for reminder due notifications
let isNotificationHandlerSet = false;

const setupNotificationHandler = () => {
  if (isNotificationHandlerSet) {
    console.log('📱 Notification handler already set up, skipping...');
    return;
  }

  console.log('📱 Setting up notification handler for the first time');
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // Define blocking configuration
      const blockNotification = {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
        priority: Notifications.AndroidNotificationPriority.MIN,
        severity: Notifications.AndroidNotificationPriority.MIN,
        ios: {
          foregroundPresentationOptions: {
            alert: false,
            badge: false,
            sound: false,
            banner: false,
            list: false
          }
        }
      };

      // Get current user's role first, before any other processing
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        console.log('❌ No current user, blocking notification');
        return blockNotification;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) {
          console.log('❌ User document not found, blocking notification');
          return blockNotification;
        }

        const userRole = userDoc.data().role;
        const notificationType = notification.request.content.data?.type;
        
        console.log('👤 Current user role:', userRole);
        console.log('🔔 Notification type:', notificationType);

        // For test notifications, always show them
        if (notification.request.content.data?.isTest) {
          console.log('🧪 Test notification, showing it');
          return {
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            ios: {
              foregroundPresentationOptions: {
                alert: true,
                badge: false,
                sound: true,
                banner: true,
                list: true
              }
            }
          };
        }

        // Strict role-based blocking
        if (userRole === 'child' && notificationType === 'completion') {
          console.log('❌ Child user, blocking completion notification');
          return blockNotification;
        }

        if (userRole === 'parent' && notificationType !== 'completion') {
          console.log('❌ Parent user, blocking due notification');
          return blockNotification;
        }

        // Only if we pass all checks, then proceed with showing the notification
        console.log('\n🔔 ========= NOTIFICATION APPROVED =========');
        console.log('⏰ Time:', new Date().toLocaleTimeString());
        console.log('📝 Notification ID:', notification.request.identifier);
        console.log('📌 Reminder ID:', notification.request.content.data?.reminderId);
        console.log('🏷️ Title:', notification.request.content.title);
        console.log('📅 Trigger:', JSON.stringify(notification.request.trigger));
        console.log('==========================================\n');

        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          ios: {
            foregroundPresentationOptions: {
              alert: true,
              badge: false,
              sound: true,
              banner: true,
              list: true
            }
          }
        };
      } catch (error) {
        console.error('❌ Error handling notification:', error);
        return blockNotification;
      }
    }
  });
  
  isNotificationHandlerSet = true;
};

// Helper function for default notification behavior
const defaultNotificationBehavior = () => {
  if (Platform.OS === 'ios') {
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      ios: {
        foregroundPresentationOptions: {
          alert: true,
          badge: false,
          sound: true,
          banner: true,
          list: true
        }
      }
    };
  }

  // For Android
  return {
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.DEFAULT,
    sound: true,
  };
};

class NotificationService {
  // Queue for reminder due notifications
  private static dueReminderQueue: Map<string, Notifications.NotificationRequestInput> = new Map();
  // Queue for completion notifications
  private static completionQueue: Map<string, Notifications.NotificationRequestInput> = new Map();

  static async requestPermissions() {
    console.log('📱 Requesting notification permissions...');
    if (!Device.isDevice) {
      console.log('❌ Not a physical device, skipping notifications');
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('📱 Existing permission status:', existingStatus);
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        console.log('📱 Requesting permissions from user...');
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        finalStatus = status;
        console.log('📱 New permission status:', finalStatus);
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Permission not granted');
        return false;
      }

      // Set up the notification handler
      setupNotificationHandler();

      // Log device info for debugging
      console.log('📱 Device Info:', {
        isDevice: Device.isDevice,
        brand: Device.brand,
        modelName: Device.modelName,
        osName: Device.osName,
        osVersion: Device.osVersion,
        deviceType: Device.deviceType,
      });

      return true;
    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
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

    try {
      // Get the creator's role and family ID
      const creatorDoc = await getDoc(doc(db, 'users', reminder.createdBy));
      if (!creatorDoc.exists()) {
        console.log('Creator document not found');
        return null;
      }
      const creatorData = creatorDoc.data();
      const creatorRole = creatorData.role;
      const creatorFamilyId = creatorData.familyId;
      console.log('👤 Reminder creator role:', creatorRole);
      console.log('👨‍👩‍👧‍👦 Family ID:', creatorFamilyId);

      // Verify family ID matches the reminder
      if (creatorFamilyId !== reminder.familyId) {
        console.log('❌ Family ID mismatch, skipping notification');
        return null;
      }

      // For parent-created reminders: notify the assigned child
      // For child-created reminders: notify the child who created it
      const recipientId = creatorRole === 'parent' ? reminder.assignedTo : reminder.createdBy;
      
      // Get the recipient's name and verify family ID
      const recipientDoc = await getDoc(doc(db, 'users', recipientId));
      if (!recipientDoc.exists()) {
        console.log('Recipient document not found');
        return null;
      }
      const recipientData = recipientDoc.data();
      if (recipientData.familyId !== reminder.familyId) {
        console.log('❌ Recipient family ID mismatch, skipping notification');
        return null;
      }
      const recipientName = recipientData.displayName || 'User';
      console.log('👤 Notification recipient:', recipientName);

      // Ensure dates are proper Date objects
      const dueDate = reminder.dueDate instanceof Date ? reminder.dueDate : new Date(reminder.dueDate);
      
      // Check if the due date is in the past
      const now = new Date();
      if (dueDate < now) {
        console.log('⚠️ Due date is in the past, skipping notification');
        return null;
      }

      // Create the notification request for due reminder
      const notificationContent = {
        title: `${recipientName} don't forget 2 ${reminder.title}`,
        body: `It's time to ${reminder.title.toLowerCase()}!`,
        data: { 
          reminderId: reminder.id,
          createdBy: reminder.createdBy,
          creatorRole: creatorRole,
          familyId: reminder.familyId,
          type: 'due',
          isTest: reminder.title.toLowerCase().includes('test')
        },
        sound: 'default' as const,
      };

      // Add to due reminder queue
      this.dueReminderQueue.set(reminder.id, { 
        content: notificationContent, 
        trigger: { 
          type: Notifications.SchedulableTriggerInputTypes.DATE as const,
          date: dueDate 
        } 
      });
      console.log('📝 Added to due reminder queue:', reminder.id);

      // Schedule the notification
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: { 
          type: Notifications.SchedulableTriggerInputTypes.DATE as const,
          date: dueDate,
        },
      });
      console.log('🔔 Notification scheduled with ID:', notificationId);

      // Start location tracking when the reminder is due
      if (creatorRole === 'parent') {
        // For parent-created reminders, start location tracking
        setTimeout(() => {
          LocationService.startLocationTracking(reminder.id);
        }, dueDate.getTime() - now.getTime());
      }

      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  static async sendCompletionNotification(reminder: Reminder, completedBy: string) {
    console.log('Sending completion notification for reminder:', reminder.id);
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      console.log('No permission to send notification');
      return null;
    }

    try {
      // Get the creator's role and family ID
      const creatorDoc = await getDoc(doc(db, 'users', reminder.createdBy));
      if (!creatorDoc.exists()) {
        console.log('Creator document not found');
        return null;
      }
      const creatorData = creatorDoc.data();
      const creatorRole = creatorData.role;
      const creatorFamilyId = creatorData.familyId;
      console.log('👤 Reminder creator role:', creatorRole);
      console.log('👨‍👩‍👧‍👦 Family ID:', creatorFamilyId);

      // Verify family ID matches the reminder
      if (creatorFamilyId !== reminder.familyId) {
        console.log('❌ Family ID mismatch, skipping notification');
        return null;
      }

      // Only send completion notifications for parent-created reminders
      if (creatorRole !== 'parent') {
        console.log('📱 Skipping completion notification for child-created reminder');
        return null;
      }

      // Get the completer's name and verify family ID
      const completerDoc = await getDoc(doc(db, 'users', completedBy));
      if (!completerDoc.exists()) {
        console.log('Completer document not found');
        return null;
      }
      const completerData = completerDoc.data();
      if (completerData.familyId !== reminder.familyId) {
        console.log('❌ Completer family ID mismatch, skipping notification');
        return null;
      }
      const completerName = completerData.displayName || 'User';

      // Get the family document to find all parents
      const familyDoc = await getDoc(doc(db, 'families', reminder.familyId));
      if (!familyDoc.exists()) {
        console.log('Family document not found');
        return null;
      }

      const familyData = familyDoc.data();
      const parentIds = familyData.parentIds || [];
      console.log('👥 Found parent IDs:', parentIds);

      // Calculate the delay time (30 seconds from now)
      const now = new Date();
      const delayTime = new Date(now.getTime() + 30000); // 30 seconds in milliseconds
      console.log('⏰ Scheduling completion notification for:', delayTime.toISOString());

      // Create completion notification content
      const notificationContent = {
        title: 'Reminder Completed! 🎉',
        body: `${completerName} has completed the reminder: ${reminder.title}`,
        data: { 
          reminderId: reminder.id,
          type: 'completion',
          completedBy: completedBy,
          createdBy: reminder.createdBy,
          familyId: reminder.familyId,
          isTest: reminder.title.toLowerCase().includes('test')
        },
        priority: Notifications.AndroidNotificationPriority.HIGH,
        sound: 'default' as const,
      };

      // Add to completion queue
      this.completionQueue.set(reminder.id, { 
        content: notificationContent, 
        trigger: { 
          type: Notifications.SchedulableTriggerInputTypes.DATE as const,
          date: delayTime 
        } 
      });
      console.log('📝 Added to completion queue:', reminder.id);

      // Schedule notification for all parents in this family
      const notificationPromises = parentIds.map(async (parentId) => {
        // Verify each parent is still in this family
        const parentDoc = await getDoc(doc(db, 'users', parentId));
        if (!parentDoc.exists()) {
          console.log(`Parent ${parentId} document not found`);
          return null;
        }
        const parentData = parentDoc.data();
        if (parentData.familyId !== reminder.familyId) {
          console.log(`Parent ${parentId} is no longer in this family, skipping notification`);
          return null;
        }

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: notificationContent,
          trigger: { 
            type: Notifications.SchedulableTriggerInputTypes.DATE as const,
            date: delayTime,
          },
        });
        console.log(`Completion notification scheduled for parent ${parentId} with ID:`, notificationId);
        return notificationId;
      });

      const notificationIds = await Promise.all(notificationPromises);
      console.log('All completion notifications scheduled:', notificationIds.filter(Boolean));
      return notificationIds[0]; // Return the first successful notification ID
    } catch (error) {
      console.error('Error sending completion notification:', error);
      return null;
    }
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