import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, DocumentData, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RemindersScreenProps } from '../types/navigation';
import { useFocusEffect } from '@react-navigation/native';
import { Reminder } from '../types/Reminder';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

const WEEKDAYS = [
  { id: '0', name: 'Sunday', shortName: 'Sun' },
  { id: '1', name: 'Monday', shortName: 'Mon' },
  { id: '2', name: 'Tuesday', shortName: 'Tue' },
  { id: '3', name: 'Wednesday', shortName: 'Wed' },
  { id: '4', name: 'Thursday', shortName: 'Thu' },
  { id: '5', name: 'Friday', shortName: 'Fri' },
  { id: '6', name: 'Saturday', shortName: 'Sat' },
];

const getNextOccurrence = (startDate: Date, selectedDays: string[], weekFrequency: number): Date => {
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
};

export default function RemindersScreen({ navigation }: RemindersScreenProps) {
  const { user, signOut } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string>>({});

  useFocusEffect(
    React.useCallback(() => {
      console.log('Screen focused, loading reminders');
      loadReminders();
    }, [user])
  );

  const loadReminders = async () => {
    try {
      if (!user) {
        setReminders([]);
        return;
      }

      setLoading(true);
      setError(null);

      const remindersRef = collection(db, 'reminders');
      let q;

      if (user.familyId) {
        // If user has a familyId, get reminders for that family
        q = query(
          remindersRef,
          where('familyId', '==', user.familyId),
          orderBy('createdAt', 'desc')
        );
      } else {
        // If no familyId, get reminders assigned to this user
        q = query(
          remindersRef,
          where('assignedTo', '==', user.id),
          orderBy('createdAt', 'desc')
        );
      }

      const querySnapshot = await getDocs(q);
      
      const loadedReminders: Reminder[] = [];
      const assigneeIds = new Set<string>();
      
      querySnapshot.forEach((doc) => {
        const data = doc.data() as DocumentData;
        assigneeIds.add(data.assignedTo);
        loadedReminders.push({
          id: doc.id,
          title: data.title,
          status: data.status,
          createdAt: data.createdAt.toDate(),
          assignedTo: data.assignedTo,
          familyId: data.familyId,
          dueDate: data.dueDate.toDate(),
          isRecurring: data.isRecurring || false,
          recurrenceConfig: data.recurrenceConfig ? {
            selectedDays: data.recurrenceConfig.selectedDays,
            weekFrequency: data.recurrenceConfig.weekFrequency,
            startDate: data.recurrenceConfig.startDate.toDate(),
            lastGenerated: data.recurrenceConfig.lastGenerated.toDate(),
          } : null,
          checklist: data.checklist || [],
          createdBy: data.createdBy,
        });
      });

      // Load assignee names
      const names: Record<string, string> = {};
      for (const assigneeId of assigneeIds) {
        try {
          const userDoc = await getDoc(doc(db, 'users', assigneeId));
          if (userDoc.exists()) {
            names[assigneeId] = userDoc.data().displayName || 'Unknown';
          }
        } catch (error) {
          console.error('Error loading assignee name:', error);
        }
      }
      
      setAssigneeNames(names);
      setReminders(loadedReminders);
    } catch (error) {
      console.error('Error loading reminders:', error);
      setError('Failed to load reminders. Please try again.');
      Alert.alert('Error', 'Failed to load reminders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReminder = async (reminderId: string) => {
    try {
      await deleteDoc(doc(db, 'reminders', reminderId));
      setReminders(reminders.filter(reminder => reminder.id !== reminderId));
    } catch (error) {
      console.error('Error deleting reminder:', error);
      Alert.alert('Error', 'Failed to delete reminder. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  const formatDueDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today at ${date.toLocaleTimeString()}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${date.toLocaleTimeString()}`;
    } else {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reminders</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            onPress={() => navigation.navigate('AddReminder' as const)} 
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>Add Reminder</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleSignOut} 
            style={styles.signOutButton}
          >
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadReminders} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : reminders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.noReminders}>No reminders found</Text>
          <Text style={styles.emptySubtext}>
            {user?.familyId ? 'Create a new reminder to get started' : 'Join a family to see shared reminders'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => navigation.navigate('EditReminder' as const, { reminderId: item.id })}
              style={styles.reminderItem}
            >
              <View style={styles.reminderContent}>
                <Text style={styles.reminderTitle}>{item.title}</Text>
                <View style={styles.reminderField}>
                  <MaterialCommunityIcons name="account-circle" size={16} color="#666" />
                  <Text style={styles.reminderAssignee}>
                    {' Assigned to: '}{assigneeNames[item.assignedTo] || 'Loading...'}
                  </Text>
                </View>
                <View style={styles.reminderField}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color="#666" />
                  <Text style={[
                    styles.reminderDueDate,
                    new Date() > item.dueDate && styles.reminderOverdue
                  ]}>
                    {' Due: '}{formatDueDate(item.dueDate)}
                  </Text>
                </View>
                {item.isRecurring && item.recurrenceConfig && (
                  <View style={styles.reminderField}>
                    <MaterialCommunityIcons name="refresh" size={16} color="#007AFF" />
                    <Text style={styles.nextOccurrence}>
                      {' Next occurrence: '}{formatDueDate(getNextOccurrence(
                        item.recurrenceConfig.startDate,
                        item.recurrenceConfig.selectedDays,
                        item.recurrenceConfig.weekFrequency
                      ))}
                    </Text>
                  </View>
                )}
                <View style={styles.reminderField}>
                  <Ionicons 
                    name={item.status === 'completed' ? 'checkmark-circle' : 
                          item.status === 'verified' ? 'shield-checkmark' : 'hourglass-outline'} 
                    size={16} 
                    color={item.status === 'completed' ? '#34c759' : 
                          item.status === 'verified' ? '#007aff' : '#999'} 
                  />
                  <Text style={[
                    styles.reminderStatus,
                    item.status === 'completed' && styles.statusCompleted,
                    item.status === 'verified' && styles.statusVerified
                  ]}>
                    {' Status: '}{item.status}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteReminder(item.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  signOutButton: {
    backgroundColor: '#ff3b30',
    padding: 8,
    borderRadius: 4,
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noReminders: {
    textAlign: 'center',
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    textAlign: 'center',
    fontSize: 14,
    color: '#999',
  },
  reminderItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  reminderContent: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  reminderField: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  reminderAssignee: {
    fontSize: 14,
    color: '#666',
  },
  reminderDueDate: {
    fontSize: 14,
    color: '#666',
  },
  reminderOverdue: {
    color: '#ff3b30',
  },
  reminderStatus: {
    fontSize: 14,
    color: '#999',
  },
  statusCompleted: {
    color: '#34c759',
  },
  statusVerified: {
    color: '#007aff',
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    padding: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  nextOccurrence: {
    fontSize: 14,
    color: '#007AFF',
    fontStyle: 'italic',
  },
}); 