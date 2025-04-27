import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AddReminderScreenProps } from '../types/navigation';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, getDocs, query, where, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChecklistItem } from '../types/Reminder';
import { Picker } from '@react-native-picker/picker';
import NotificationService from '../services/NotificationService';

interface FamilyMember {
  id: string;
  displayName: string;
  email: string;
  role: 'parent' | 'child';
}

interface WeekDay {
  id: string;
  name: string;
  shortName: string;
}

const WEEKDAYS: WeekDay[] = [
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

export default function AddReminderScreen({ navigation, route }: AddReminderScreenProps) {
  const { user, updateUser } = useAuth();
  const cloneData = route.params?.cloneData;
  const [title, setTitle] = useState(cloneData?.title || '');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(cloneData?.checklist || []);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [dueDate, setDueDate] = useState(cloneData?.dueDate || new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [assignedTo, setAssignedTo] = useState(cloneData?.assignedTo || '');
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [isRecurring, setIsRecurring] = useState(cloneData?.isRecurring || false);
  const [selectedDays, setSelectedDays] = useState<string[]>(cloneData?.selectedDays || []);
  const [weekFrequency, setWeekFrequency] = useState(cloneData?.weekFrequency?.toString() || '1');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initializeFamily = async () => {
      if (!user) return;
      
      console.log('DEBUG: Checking user family status');
      if (!user.familyId) {
        console.log('DEBUG: User missing familyId, checking if in Bruggs family');
        const familyRef = doc(db, 'families', 'bruggs-family');
        const familyDoc = await getDoc(familyRef);
        
        if (!familyDoc.exists()) {
          console.log('DEBUG: Creating bruggs-family document');
          await setDoc(familyRef, {
            id: 'bruggs-family',
            name: 'Bruggs Family',
            parentIds: { [user.id]: true },
            childrenIds: [],
            createdAt: new Date()
          });
          console.log('DEBUG: Created family document');
        } else {
          console.log('DEBUG: Family document exists, updating parentIds');
          const familyData = familyDoc.data();
          if (!familyData.parentIds) {
            familyData.parentIds = {};
          }
          familyData.parentIds[user.id] = true;
          await updateDoc(familyRef, { parentIds: familyData.parentIds });
        }

        // Update user with familyId
        try {
          await updateUser({ familyId: 'bruggs-family' });
          console.log('DEBUG: Updated user familyId in both Firestore and auth context');
          await loadFamilyMembers();
        } catch (error) {
          console.error('DEBUG: Error updating user:', error);
        }
      } else {
        await loadFamilyMembers();
      }
    };

    initializeFamily();
  }, [user, updateUser]);

  useEffect(() => {
    if (route.params?.cloneData) {
      const { title, checklist, dueDate, assignedTo, isRecurring, selectedDays, weekFrequency } = route.params.cloneData;
      setTitle(title);
      // Reset checklist items to uncompleted state when cloning
      setChecklist(checklist.map(item => ({
        ...item,
        completed: false
      })));
      setDueDate(dueDate);
      setAssignedTo(assignedTo);
      setIsRecurring(isRecurring);
      setSelectedDays(selectedDays || []);
      setWeekFrequency(weekFrequency?.toString() || '1');
    }
  }, [route.params?.cloneData]);

  const loadFamilyMembers = async () => {
    console.log('DEBUG: Starting loadFamilyMembers function');
    if (!user?.familyId) {
      console.log('DEBUG: No familyId found for user:', user);
      return;
    }

    try {
      // If user is a child, they can only assign to themselves
      if (user.role === 'child') {
        console.log('DEBUG: User is a child, setting self as only assignee');
        const members: FamilyMember[] = [{
          id: user.id,
          displayName: user.displayName || 'Me',
          email: user.email || '',
          role: 'child' as const
        }];
        setFamilyMembers(members);
        setAssignedTo(user.id);
        return;
      }

      // Get the family document directly using the familyId
      console.log('DEBUG: Fetching family document with ID:', user.familyId);
      const familyRef = doc(db, 'families', user.familyId);
      const familySnapshot = await getDoc(familyRef);

      if (!familySnapshot.exists()) {
        console.log('DEBUG: No family document found with ID:', user.familyId);
        return;
      }

      const familyData = familySnapshot.data();
      console.log('DEBUG: Found family data:', familyData);

      // Get children IDs from the array
      const childrenIds = familyData.childrenIds || [];
      console.log('DEBUG: Found childrenIds:', childrenIds);

      // Now get the user documents for each child
      const members: FamilyMember[] = [];
      console.log('DEBUG: Starting to fetch each child document');
      
      for (const childId of childrenIds) {
        console.log('DEBUG: Fetching user document for childId:', childId);
        const userRef = doc(db, 'users', childId);
        const userSnapshot = await getDoc(userRef);
        
        if (userSnapshot.exists()) {
          const userData = userSnapshot.data();
          console.log('DEBUG: Found child data:', userData);
          members.push({
            id: childId,
            displayName: userData.displayName || 'Unknown',
            email: userData.email || '',
            role: 'child'
          });
        } else {
          console.log('DEBUG: No user document found for childId:', childId);
        }
      }

      console.log('DEBUG: Final members list:', members);
      setFamilyMembers(members);
      if (members.length > 0 && !assignedTo) {
        setAssignedTo(members[0].id);
        console.log('DEBUG: Set assignedTo to first member:', members[0].id);
      }
    } catch (error) {
      console.error('DEBUG: Error loading family members:', error);
      Alert.alert('Error', 'Failed to load family members');
    }
  };

  const addChecklistItem = () => {
    if (newChecklistItem.trim()) {
      setChecklist([
        ...checklist,
        {
          id: Date.now().toString(),
          text: newChecklistItem.trim(),
          completed: false,
        },
      ]);
      setNewChecklistItem('');
    }
  };

  const removeChecklistItem = (id: string) => {
    setChecklist(checklist.filter(item => item.id !== id));
  };

  const toggleDay = (dayId: string) => {
    setSelectedDays(prev => 
      prev.includes(dayId) 
        ? prev.filter(id => id !== dayId)
        : [...prev, dayId]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    if (!assignedTo) {
      Alert.alert('Error', 'Please select an assignee');
      return;
    }

    if (isRecurring && selectedDays.length === 0) {
      Alert.alert('Error', 'Please select at least one day for recurring reminders');
      return;
    }

    try {
      setLoading(true);
      const reminderData = {
        title: title.trim(),
        checklist,
        assignedTo,
        familyId: user?.familyId,
        createdBy: user?.id,
        createdAt: new Date(),
        dueDate,
        status: 'pending' as const,
        isRecurring,
        recurrenceConfig: isRecurring ? {
          selectedDays: selectedDays,
          weekFrequency: parseInt(weekFrequency),
          startDate: dueDate,
          lastGenerated: new Date(),
        } : null,
        snoozeCount: 0,
      };

      // Add the reminder to Firestore
      const docRef = await addDoc(collection(db, 'reminders'), reminderData);
      console.log('📝 Created reminder with ID:', docRef.id);
      console.log('📅 Reminder data:', reminderData);

      // Schedule the notification
      if (docRef.id && user?.familyId) {
        console.log('🔔 Attempting to schedule notification for reminder:', docRef.id);
        const notificationId = await NotificationService.scheduleReminderNotification({
          ...reminderData,
          id: docRef.id,
          familyId: user.familyId,
          createdBy: user.id || '',
        });
        console.log('📱 Notification scheduling result:', notificationId);
        
        // Check all scheduled notifications
        const scheduledNotifications = await NotificationService.checkScheduledNotifications();
        console.log('📋 All scheduled notifications after adding:', scheduledNotifications);
      }

      navigation.goBack();
    } catch (error) {
      console.error('Error creating reminder:', error);
      Alert.alert('Error', 'Failed to create reminder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 40}
    >
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Enter reminder title"
        />

        <Text style={styles.label}>Assign To</Text>
        <View style={styles.assigneeContainer}>
          {familyMembers.length === 0 ? (
            <View style={styles.noChildrenContainer}>
              <Text style={styles.noChildrenText}>
                {user?.role === 'parent' 
                  ? 'No children found in your family. Please add children to your family first.'
                  : 'Unable to load assignee information.'}
              </Text>
            </View>
          ) : (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.assigneePillsContainer}
            >
              {familyMembers.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={[
                    styles.assigneePill,
                    assignedTo === member.id && styles.assigneePillSelected,
                    user?.role === 'child' && styles.disabledPill
                  ]}
                  onPress={() => user?.role === 'parent' && setAssignedTo(member.id)}
                  disabled={user?.role === 'child'}
                >
                  <Text 
                    style={[
                      styles.assigneePillText,
                      assignedTo === member.id && styles.assigneePillTextSelected,
                      user?.role === 'child' && styles.disabledText
                    ]}
                  >
                    {user?.role === 'child' && member.id === user.id 
                      ? 'Me'
                      : member.displayName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <Text style={styles.label}>Checklist Items</Text>
        <View style={styles.checklistContainer}>
          {checklist.map((item) => (
            <View key={item.id} style={styles.checklistItem}>
              <Text style={styles.checklistText}>{item.text}</Text>
              <TouchableOpacity
                onPress={() => removeChecklistItem(item.id)}
                style={styles.removeButton}
              >
                <Text style={styles.removeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.addChecklistItem}>
            <TextInput
              style={styles.checklistInput}
              value={newChecklistItem}
              onChangeText={setNewChecklistItem}
              placeholder="Add checklist item"
              onSubmitEditing={addChecklistItem}
            />
            <TouchableOpacity
              onPress={addChecklistItem}
              style={styles.addButton}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.label}>Due Date</Text>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={styles.dateButton}
        >
          <Text style={styles.dateButtonText}>
            {dueDate.toLocaleDateString()} {dueDate.toLocaleTimeString()}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={dueDate}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (selectedDate) {
                setDueDate(selectedDate);
              }
            }}
          />
        )}

        <View style={styles.recurrenceSection}>
          <View style={styles.recurrenceHeader}>
            <Text style={styles.label}>Recurring Reminder</Text>
            <Switch
              value={isRecurring}
              onValueChange={(value) => {
                setIsRecurring(value);
                if (!value) {
                  setSelectedDays([]);
                  setWeekFrequency('1');
                }
              }}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={isRecurring ? '#007AFF' : '#f4f3f4'}
            />
          </View>

          {isRecurring && (
            <View style={styles.recurrenceDetailsContainer}>
              <Text style={styles.recurrenceLabel}>Select days:</Text>
              <View style={styles.daysContainer}>
                {WEEKDAYS.map((day) => (
                  <TouchableOpacity
                    key={day.id}
                    style={[
                      styles.dayPill,
                      selectedDays.includes(day.id) && styles.dayPillSelected
                    ]}
                    onPress={() => toggleDay(day.id)}
                  >
                    <Text style={[
                      styles.dayPillText,
                      selectedDays.includes(day.id) && styles.dayPillTextSelected
                    ]}>
                      {day.shortName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.recurrenceLabel}>Repeat every:</Text>
              <View style={styles.weekFrequencyContainer}>
                <TextInput
                  style={styles.weekFrequencyInput}
                  value={weekFrequency}
                  onChangeText={(text) => {
                    if (text === '') {
                      setWeekFrequency('');
                      return;
                    }
                    const num = parseInt(text);
                    if (!isNaN(num) && num >= 0 && num <= 12) {
                      setWeekFrequency(text);
                    }
                  }}
                  onBlur={() => {
                    if (weekFrequency === '' || weekFrequency === '0') {
                      setWeekFrequency('1');
                    }
                  }}
                  selectTextOnFocus={true}
                  keyboardType="numeric"
                  maxLength={2}
                />
                <Text style={styles.weekFrequencyText}>
                  {weekFrequency === '1' ? 'week' : 'weeks'}
                </Text>
              </View>

              <View style={styles.recurrenceInfo}>
                <Text style={styles.recurrenceInfoText}>
                  First occurrence: {dueDate.toLocaleDateString()}
                </Text>
                <Text style={styles.recurrenceInfoText}>
                  Repeats: Every {weekFrequency} {weekFrequency === '1' ? 'week' : 'weeks'} on{' '}
                  {selectedDays
                    .map(id => WEEKDAYS.find(day => day.id === id)?.name)
                    .join(', ')}
                </Text>
                {selectedDays.length > 0 && (
                  <Text style={styles.recurrenceInfoText}>
                    Next occurrence: {getNextOccurrence(
                      dueDate,
                      selectedDays,
                      parseInt(weekFrequency || '1')
                    ).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Creating...' : 'Create Reminder'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 80 : 40,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  checklistContainer: {
    marginBottom: 16,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  checklistText: {
    flex: 1,
    fontSize: 16,
  },
  removeButton: {
    padding: 4,
  },
  removeButtonText: {
    color: '#ff3b30',
    fontSize: 18,
  },
  addChecklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: '#f8f8f8',
  },
  sublabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    marginTop: 8,
  },
  picker: {
    height: 48,
    backgroundColor: '#fff',
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  recurrenceSection: {
    marginVertical: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  recurrenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  recurrenceDetailsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
  },
  recurrenceLabel: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  recurrenceInfo: {
    backgroundColor: '#f0f7ff',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  recurrenceInfoText: {
    fontSize: 14,
    color: '#007AFF',
    marginBottom: 4,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  assigneeContainer: {
    marginBottom: 16,
  },
  assigneePillsContainer: {
    paddingHorizontal: 4,
  },
  assigneePill: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: '#f0f0f0',
  },
  assigneePillSelected: {
    backgroundColor: '#007AFF20',
    borderColor: '#007AFF',
  },
  assigneePillText: {
    fontSize: 16,
    color: '#666',
  },
  assigneePillTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  noChildrenContainer: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  noChildrenText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dayPill: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginVertical: 4,
    borderWidth: 2,
    borderColor: '#f0f0f0',
  },
  dayPillSelected: {
    backgroundColor: '#007AFF20',
    borderColor: '#007AFF',
  },
  dayPillText: {
    fontSize: 14,
    color: '#666',
  },
  dayPillTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  weekFrequencyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  weekFrequencyInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    width: 60,
    marginRight: 8,
    fontSize: 16,
    textAlign: 'center',
  },
  weekFrequencyText: {
    fontSize: 16,
    color: '#333',
  },
  disabledPill: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ddd',
  },
  disabledText: {
    color: '#666',
  },
}); 