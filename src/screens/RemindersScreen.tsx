import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, DocumentData, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RemindersScreenProps } from '../types/navigation';
import { useFocusEffect } from '@react-navigation/native';
import { Reminder } from '../types/Reminder';
import { MaterialCommunityIcons, Ionicons, AntDesign } from '@expo/vector-icons';
import NotificationService from '../services/NotificationService';

interface FamilyMember {
  id: string;
  displayName: string;
}

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
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string>>({});
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  // Define filter type and state
  type FilterType = null | 'assigned-by-parent' | 'assigned-by-me' | string;
  const [selectedFilter, setSelectedFilter] = useState<FilterType>(null);

  useFocusEffect(
    React.useCallback(() => {
      console.log('Screen focused, loading reminders');
      loadReminders();
      loadFamilyMembers();
    }, [user])
  );

  // Redirect new parents with no children to ManageFamily
  useEffect(() => {
    const checkFamilyChildren = async () => {
      if (user?.role === 'parent' && user.familyId) {
        const familyRef = doc(db, 'families', user.familyId);
        const familySnapshot = await getDoc(familyRef);
        const familyData = familySnapshot.data();
        if (familyData && (!familyData.childrenIds || familyData.childrenIds.length === 0)) {
          navigation.navigate('ManageFamily');
        }
      }
    };
    checkFamilyChildren();
  }, [user]);

  const loadFamilyMembers = async () => {
    if (!user?.familyId) return;

    try {
      const familyRef = doc(db, 'families', user.familyId);
      const familySnapshot = await getDoc(familyRef);

      if (!familySnapshot.exists()) return;

      const familyData = familySnapshot.data();
      const childrenIds = familyData.childrenIds || [];

      const members: FamilyMember[] = [];
      for (const childId of childrenIds) {
        const userDoc = await getDoc(doc(db, 'users', childId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          members.push({
            id: childId,
            displayName: userData.displayName || 'Unknown',
          });
        }
      }

      setFamilyMembers(members);
    } catch (error) {
      console.error('Error loading family members:', error);
    }
  };

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

      if (user.role === 'parent' && user.familyId) {
        // If user is a parent, get reminders that are either:
        // 1. Created by children in the family, or
        // 2. Assigned to children in the family
        const familyRef = doc(db, 'families', user.familyId);
        const familySnapshot = await getDoc(familyRef);
        const familyData = familySnapshot.data();
        const childrenIds = familyData?.childrenIds || [];

        // Prevent Firestore 'in' filter error: skip query if childrenIds is empty
        if (!childrenIds.length) {
          setReminders([]);
          setAssigneeNames({});
          setLoading(false);
          return;
        }

        // We need to make two separate queries since Firestore doesn't support OR conditions
        const createdByChildrenQuery = query(
          remindersRef,
          where('familyId', '==', user.familyId),
          where('createdBy', 'in', childrenIds),
          orderBy('createdAt', 'desc')
        );

        const assignedToChildrenQuery = query(
          remindersRef,
          where('familyId', '==', user.familyId),
          where('assignedTo', 'in', childrenIds),
          orderBy('createdAt', 'desc')
        );

        // Execute both queries
        const [createdBySnapshot, assignedToSnapshot] = await Promise.all([
          getDocs(createdByChildrenQuery),
          getDocs(assignedToChildrenQuery)
        ]);

        // Combine results, removing duplicates
        const seenIds = new Set();
        const loadedReminders: Reminder[] = [];
        const assigneeIds = new Set<string>();

        const processSnapshot = (snapshot: any) => {
          snapshot.forEach((doc: any) => {
            if (!seenIds.has(doc.id)) {
              seenIds.add(doc.id);
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
            }
          });
        };

        processSnapshot(createdBySnapshot);
        processSnapshot(assignedToSnapshot);

        // Sort combined results by createdAt
        loadedReminders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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
      } else {
        // If user is a child or has no familyId, get only their reminders
        q = query(
          remindersRef,
          where('assignedTo', '==', user.id),
          orderBy('createdAt', 'desc')
        );

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
      }
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

  const filteredReminders = React.useMemo(() => {
    if (!selectedFilter) {
      return reminders;
    }

    if (selectedFilter === 'assigned-by-parent') {
      return reminders.filter(reminder => 
        reminder.assignedTo === user?.id && reminder.createdBy !== user?.id
      );
    }

    if (selectedFilter === 'assigned-by-me') {
      return reminders.filter(reminder => 
        reminder.createdBy === user?.id
      );
    }

    // For parent users, filter by assignedTo
    return reminders.filter(reminder => reminder.assignedTo === selectedFilter);
  }, [selectedFilter, reminders, user]);

  const testCompletionNotification = async () => {
    if (!user || !familyMembers.length) return;
    
    // Create a test reminder
    const testReminder: Reminder = {
      id: 'test-reminder-' + Date.now(),
      title: 'Test Notification',
      status: 'completed',
      createdAt: new Date(),
      dueDate: new Date(),
      assignedTo: familyMembers[0].id,
      familyId: user.familyId!,
      isRecurring: false,
      recurrenceConfig: null,
      checklist: [],
      createdBy: user.id,
    };

    // Send the completion notification
    await NotificationService.sendCompletionNotification(testReminder, familyMembers[0].id);
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
      {user?.role === 'parent' && (
        <TouchableOpacity
          style={styles.testButton}
          onPress={testCompletionNotification}
        >
          <Text style={styles.testButtonText}>Test Completion Notification</Text>
        </TouchableOpacity>
      )}
      <View style={styles.topSection}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reminders</Text>
          <TouchableOpacity
            style={styles.completedButton}
            onPress={() => navigation.navigate('AllCompletedReminders')}
          >
            <MaterialCommunityIcons name="check-all" size={22} color="#34c759" />
            <Text style={styles.completedButtonText}>Completed</Text>
          </TouchableOpacity>
        </View>

        {familyMembers.length > 0 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            <TouchableOpacity
              style={[
                styles.filterPill,
                selectedFilter === null && styles.filterPillSelected
              ]}
              onPress={() => setSelectedFilter(null)}
            >
              <Text style={[
                styles.filterPillText,
                selectedFilter === null && styles.filterPillTextSelected
              ]}>All</Text>
            </TouchableOpacity>

            {user?.role === 'child' ? (
              // Child user filters
              <>
                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    selectedFilter === 'assigned-by-parent' && styles.filterPillSelected
                  ]}
                  onPress={() => setSelectedFilter('assigned-by-parent')}
                >
                  <Text style={[
                    styles.filterPillText,
                    selectedFilter === 'assigned-by-parent' && styles.filterPillTextSelected
                  ]}>by Parent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    selectedFilter === 'assigned-by-me' && styles.filterPillSelected
                  ]}
                  onPress={() => setSelectedFilter('assigned-by-me')}
                >
                  <Text style={[
                    styles.filterPillText,
                    selectedFilter === 'assigned-by-me' && styles.filterPillTextSelected
                  ]}>by Me</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Parent user filters - show all family members
              familyMembers.map(member => (
                <TouchableOpacity
                  key={member.id}
                  style={[
                    styles.filterPill,
                    selectedFilter === member.id && styles.filterPillSelected
                  ]}
                  onPress={() => setSelectedFilter(member.id)}
                >
                  <Text style={[
                    styles.filterPillText,
                    selectedFilter === member.id && styles.filterPillTextSelected
                  ]}>{member.displayName}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadReminders} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredReminders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.noReminders}>No reminders found</Text>
          <Text style={styles.emptySubtext}>
            {user?.familyId 
              ? selectedFilter 
                ? `No reminders assigned to ${assigneeNames[selectedFilter]}`
                : 'Create a new reminder to get started'
              : 'Join a family to see shared reminders'
            }
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.reminderList}
          data={filteredReminders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => navigation.navigate('EditReminder', { 
                reminderId: item.id,
                canEdit: user?.id === item.createdBy
              })}
              style={styles.reminderItem}
            >
              <View style={styles.reminderContent}>
                <Text style={styles.reminderTitle}>{item.title}</Text>
                <View style={styles.reminderField}>
                  <MaterialCommunityIcons name="account-circle" size={16} color="#666" />
                  <Text style={styles.reminderAssignee}>
                    {' '}{assigneeNames[item.assignedTo] || 'Loading...'}
                  </Text>
                </View>
                <View style={styles.reminderField}>
                  <MaterialCommunityIcons name="account" size={16} color="#666" />
                  <Text style={styles.reminderCreator}>
                    {' '}Created by: {item.createdBy === user?.id ? 'Me' : assigneeNames[item.createdBy] || 'Unknown'}
                  </Text>
                </View>
                <View style={styles.reminderField}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color="#666" />
                  <Text style={[
                    styles.reminderDueDate,
                    new Date() > item.dueDate && styles.reminderOverdue
                  ]}>
                    {' '}{formatDueDate(item.dueDate)}
                  </Text>
                </View>
                {item.isRecurring && item.recurrenceConfig && (
                  <View style={styles.reminderField}>
                    <MaterialCommunityIcons name="refresh" size={16} color="#007AFF" />
                    <Text style={styles.nextOccurrence}>
                      {' '}{formatDueDate(getNextOccurrence(
                        item.recurrenceConfig.startDate,
                        item.recurrenceConfig.selectedDays,
                        item.recurrenceConfig.weekFrequency
                      ))}
                    </Text>
                  </View>
                )}
                <View style={styles.reminderField}>
                  <Ionicons 
                    name={item.status === 'completed' ? 'checkmark-circle' : 'hourglass-outline'} 
                    size={16} 
                    color={item.status === 'completed' ? '#34c759' : '#999'} 
                  />
                  <Text style={[
                    styles.reminderStatus,
                    item.status === 'completed' && styles.statusCompleted
                  ]}>
                    {' '}
                    {item.status === 'completed'
                      ? `completed (${item.snoozeCount && item.snoozeCount > 0 ? `snoozed ${item.snoozeCount} times` : 'no snoozes'})`
                      : item.status}
                  </Text>
                </View>
                {item.checklist && item.checklist.length > 0 && (
                  <View style={styles.checklistContainer}>
                    {item.checklist.slice(0, 3).map((checkItem, index) => (
                      <View key={index} style={styles.checklistItem}>
                        <MaterialCommunityIcons 
                          name={checkItem.completed ? "checkbox-marked-outline" : "checkbox-blank-outline"} 
                          size={16} 
                          color={checkItem.completed ? "#34c759" : "#666"} 
                        />
                        <Text style={[
                          styles.checklistText,
                          checkItem.completed && styles.checklistCompleted
                        ]}>
                          {' '}{checkItem.text}
                        </Text>
                      </View>
                    ))}
                    {item.checklist.length > 3 && (
                      <Text style={styles.moreItems}>
                        {`... and ${item.checklist.length - 3} more items`}
                      </Text>
                    )}
                  </View>
                )}
              </View>
              {/* Only show delete button if user created the reminder */}
              {user?.id === item.createdBy && (
                <TouchableOpacity
                  onPress={() => handleDeleteReminder(item.id)}
                  style={styles.deleteButton}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={22} color="#ff3b30" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
      )}
      <TouchableOpacity 
        onPress={() => navigation.navigate('AddReminder', {})} 
        style={styles.fabButton}
      >
        <AntDesign name="plus" size={20} color="#fff" />
        <Text style={styles.fabButtonText}>New Reminder</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topSection: {
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
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
    paddingVertical: 12,
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
  deleteButton: {
    padding: 8,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextOccurrence: {
    fontSize: 14,
    color: '#007AFF',
    fontStyle: 'italic',
  },
  filterContainer: {
    height: 36,
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 0,
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    marginRight: 6,
    height: 24,
    justifyContent: 'center',
    minWidth: 40,
    alignItems: 'center',
  },
  filterPillSelected: {
    backgroundColor: '#007AFF',
  },
  filterPillText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '400',
  },
  filterPillTextSelected: {
    color: '#fff',
  },
  reminderList: {
    flex: 1,
  },
  fabButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#007AFF',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  fabButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  checklistContainer: {
    marginVertical: 4,
    marginLeft: 4,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  checklistText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  checklistCompleted: {
    color: '#666',
    textDecorationLine: 'line-through',
  },
  moreItems: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 2,
    marginLeft: 24,
  },
  reminderCreator: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  testButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 8,
    margin: 10,
    alignItems: 'center',
  },
  testButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  completedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f9ec',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  completedButtonText: {
    color: '#34c759',
    fontWeight: 'bold',
    marginLeft: 4,
  },
}); 