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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { EditReminderScreenProps } from '../types/navigation';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChecklistItem, Reminder } from '../types/Reminder';
import { Picker } from '@react-native-picker/picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NotificationService from '../services/NotificationService';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

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

const EditReminderScreen: React.FC<EditReminderScreenProps> = ({ route, navigation }) => {
  const { reminderId, canEdit } = route.params;
  const { user } = useAuth();
  const navigationNative = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [title, setTitle] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [assignedTo, setAssignedTo] = useState('');
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [weekFrequency, setWeekFrequency] = useState('1');

  useEffect(() => {
    const loadReminder = async () => {
      if (!user) return;

      try {
        const reminderDoc = await getDoc(doc(db, 'reminders', reminderId));
        if (reminderDoc.exists()) {
          const reminderData = reminderDoc.data() as Reminder;
          setReminder(reminderData);
          
          // If the reminder is completed, don't set up the edit form
          if (reminderData.status === 'completed') {
            setLoading(false);
            return;
          }

          setTitle(reminderData.title);
          setChecklist(reminderData.checklist);
          if (reminderData.dueDate instanceof Timestamp) {
            setDueDate(reminderData.dueDate.toDate());
          }
          setAssignedTo(reminderData.assignedTo);
          setIsRecurring(reminderData.isRecurring);
          if (reminderData.recurrenceConfig) {
            setSelectedDays(reminderData.recurrenceConfig.selectedDays);
            setWeekFrequency(reminderData.recurrenceConfig.weekFrequency.toString());
          }
        }
        setLoading(false);
      } catch (error) {
        console.error('Error loading reminder:', error);
        Alert.alert('Error', 'Failed to load reminder');
        setLoading(false);
      }
    };

    loadReminder();
    loadFamilyMembers();
  }, [reminderId, user]);

  const loadFamilyMembers = async () => {
    if (!user?.familyId) return;

    try {
      // If user is a child, they can only assign to themselves
      if (user.role === 'child') {
        setFamilyMembers([{
          id: user.id,
          displayName: user.displayName || 'Me',
          email: user.email || '',
          role: 'child'
        }]);
        // Auto-assign to themselves
        setAssignedTo(user.id);
        return;
      }

      // For parents, load all children as before
      const familyRef = doc(db, 'families', user.familyId);
      const familySnapshot = await getDoc(familyRef);

      if (!familySnapshot.exists()) return;

      const familyData = familySnapshot.data();
      const childrenIds = familyData.childrenIds || [];

      const members: FamilyMember[] = [];
      
      for (const childId of childrenIds) {
        const userRef = doc(db, 'users', childId);
        const userSnapshot = await getDoc(userRef);
        
        if (userSnapshot.exists()) {
          const userData = userSnapshot.data();
          members.push({
            id: childId,
            displayName: userData.displayName || 'Unknown',
            email: userData.email || '',
            role: 'child'
          });
        }
      }

      setFamilyMembers(members);
    } catch (error) {
      console.error('Error loading family members:', error);
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
      const reminderRef = doc(db, 'reminders', reminderId);
      
      // Get all scheduled notifications
      const scheduledNotifications = await NotificationService.checkScheduledNotifications();
      
      // Find and cancel the existing notification for this reminder
      const existingNotification = scheduledNotifications.find(
        n => n.content.data?.reminderId === reminderId
      );
      if (existingNotification) {
        console.log('🔔 Cancelling existing notification:', existingNotification.identifier);
        await Notifications.cancelScheduledNotificationAsync(existingNotification.identifier);
      }

      // Update the reminder in Firestore
      const updatedData = {
        title: title.trim(),
        checklist,
        assignedTo,
        dueDate,
        isRecurring,
        recurrenceConfig: isRecurring ? {
          selectedDays: selectedDays,
          weekFrequency: parseInt(weekFrequency),
          startDate: dueDate,
          lastGenerated: new Date(),
        } : null,
        updatedAt: new Date(),
      };
      
      await updateDoc(reminderRef, updatedData);
      console.log('📝 Updated reminder:', reminderId);

      // Schedule new notification
      console.log('🔔 Scheduling new notification for updated reminder');
      const notificationId = await NotificationService.scheduleReminderNotification({
        ...updatedData,
        id: reminderId,
        familyId: user?.familyId || '',
        createdBy: user?.id || '',
        createdAt: new Date(),
        status: 'pending',
      });
      console.log('📱 New notification scheduled with ID:', notificationId);

      navigation.goBack();
    } catch (error) {
      console.error('Error updating reminder:', error);
      Alert.alert('Error', 'Failed to update reminder');
    } finally {
      setLoading(false);
    }
  };

  if (!canEdit || loading || !reminder) {
    return (
      <ScrollView style={styles.readOnlyContainer}>
        <View style={styles.readOnlyCard}>
          <Text style={styles.readOnlyTitle}>{title}</Text>
          
          <View style={styles.readOnlyRow}>
            <MaterialCommunityIcons name="account" size={24} color="#666" style={styles.readOnlyIcon} />
            <View>
              <Text style={styles.readOnlyLabel}>Assigned to</Text>
              <Text style={styles.readOnlyText}>{familyMembers.find(m => m.id === assignedTo)?.displayName || 'Not assigned'}</Text>
            </View>
          </View>

          <View style={styles.readOnlyRow}>
            <MaterialCommunityIcons name="calendar" size={24} color="#666" style={styles.readOnlyIcon} />
            <View>
              <Text style={styles.readOnlyLabel}>Due Date</Text>
              <Text style={styles.readOnlyText}>{dueDate.toLocaleDateString()}</Text>
            </View>
          </View>

          {isRecurring && (
            <View style={styles.readOnlyRow}>
              <MaterialCommunityIcons name="refresh" size={24} color="#666" style={styles.readOnlyIcon} />
              <View>
                <Text style={styles.readOnlyLabel}>Recurrence</Text>
                <Text style={styles.readOnlyText}>
                  {`Every ${weekFrequency} week(s) on ${selectedDays
                    .map((day) => WEEKDAYS.find(d => d.id === day)?.name)
                    .join(', ')}`}
                </Text>
              </View>
            </View>
          )}
        </View>

        {checklist.length > 0 && (
          <View style={styles.readOnlyChecklistContainer}>
            <Text style={[styles.readOnlyLabel, { marginBottom: 12 }]}>Checklist</Text>
            {checklist.map((item, index) => (
              <View key={index} style={styles.readOnlyChecklistItem}>
                <MaterialCommunityIcons 
                  name={item.completed ? "checkbox-marked" : "checkbox-blank-outline"} 
                  size={24} 
                  color={item.completed ? "#4CAF50" : "#666"} 
                  style={styles.readOnlyIcon} 
                />
                <Text style={[styles.readOnlyText, { marginBottom: 0 }]}>{item.text}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity 
          style={styles.duplicateButton}
          onPress={() => {
            navigation.navigate('AddReminder', {
              cloneData: {
                title,
                checklist,
                dueDate,
                assignedTo,
                isRecurring,
                selectedDays,
                weekFrequency: parseInt(weekFrequency),
              }
            });
          }}
        >
          <Text style={styles.duplicateButtonText}>Clone Reminder</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (reminder.status === 'completed') {
    return (
      <ScrollView style={styles.readOnlyContainer}>
        <View style={styles.readOnlyCard}>
          <Text style={styles.readOnlyTitle}>{reminder.title}</Text>
          
          <View style={styles.readOnlyRow}>
            <MaterialCommunityIcons name="check-circle" size={24} color="#4CAF50" style={styles.readOnlyIcon} />
            <View>
              <Text style={styles.readOnlyLabel}>Completed</Text>
              <Text style={styles.readOnlyText}>
                {reminder.completedAt instanceof Timestamp 
                  ? reminder.completedAt.toDate().toLocaleString() 
                  : reminder.completedAt instanceof Date 
                    ? reminder.completedAt.toLocaleString()
                    : 'Date not available'}
              </Text>
            </View>
          </View>

          <View style={styles.readOnlyRow}>
            <MaterialCommunityIcons name="account" size={24} color="#666" style={styles.readOnlyIcon} />
            <View>
              <Text style={styles.readOnlyLabel}>Completed by</Text>
              <Text style={styles.readOnlyText}>
                {familyMembers.find(m => m.id === reminder.assignedTo)?.displayName || 'Unknown'}
              </Text>
            </View>
          </View>

          <View style={styles.readOnlyRow}>
            <MaterialCommunityIcons name="calendar" size={24} color="#666" style={styles.readOnlyIcon} />
            <View>
              <Text style={styles.readOnlyLabel}>Original Due Date</Text>
              <Text style={styles.readOnlyText}>
                {reminder.dueDate instanceof Timestamp ? reminder.dueDate.toDate().toLocaleString() : 'Date not available'}
              </Text>
            </View>
          </View>

          {reminder.isRecurring && reminder.recurrenceConfig && (
            <View style={styles.readOnlyRow}>
              <MaterialCommunityIcons name="refresh" size={24} color="#666" style={styles.readOnlyIcon} />
              <View>
                <Text style={styles.readOnlyLabel}>Was Recurring</Text>
                <Text style={styles.readOnlyText}>
                  {`Every ${reminder.recurrenceConfig.weekFrequency} week(s) on ${reminder.recurrenceConfig.selectedDays
                    .map((day) => WEEKDAYS.find(d => d.id === day)?.name)
                    .join(', ')}`}
                </Text>
              </View>
            </View>
          )}
        </View>

        {reminder.checklist.length > 0 && (
          <View style={styles.readOnlyChecklistContainer}>
            <Text style={[styles.readOnlyLabel, { marginBottom: 12 }]}>Completed Checklist</Text>
            {reminder.checklist.map((item, index) => (
              <View key={index} style={styles.readOnlyChecklistItem}>
                <MaterialCommunityIcons 
                  name={item.completed ? "checkbox-marked" : "checkbox-blank-outline"} 
                  size={24} 
                  color={item.completed ? "#4CAF50" : "#666"} 
                  style={styles.readOnlyIcon} 
                />
                <Text style={[
                  styles.readOnlyText, 
                  { marginBottom: 0 },
                  item.completed && styles.completedChecklistText
                ]}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.cloneButton}
          onPress={() => {
            if (reminder.dueDate instanceof Timestamp) {
              navigationNative.navigate('AddReminder', {
                cloneData: {
                  title: reminder.title,
                  checklist: reminder.checklist,
                  dueDate: reminder.dueDate.toDate(),
                  assignedTo: reminder.assignedTo,
                  isRecurring: reminder.isRecurring,
                  selectedDays: reminder.recurrenceConfig?.selectedDays || [],
                  weekFrequency: reminder.recurrenceConfig?.weekFrequency || 1,
                },
              });
            }
          }}
        >
          <Text style={styles.cloneButtonText}>Clone Reminder</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

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
            </View>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.duplicateButton, loading && styles.submitButtonDisabled]}
            onPress={() => {
              navigation.navigate('AddReminder', {
                cloneData: {
                  title,
                  checklist,
                  dueDate,
                  assignedTo,
                  isRecurring,
                  selectedDays,
                  weekFrequency: parseInt(weekFrequency),
                }
              });
            }}
            disabled={loading}
          >
            <Text style={styles.duplicateButtonText}>Clone Reminder</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 16,
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
  },
  picker: {
    height: 50,
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
  buttonContainer: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 16,
    marginBottom: 32,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  readOnlyContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  readOnlyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  readOnlyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  readOnlySection: {
    marginBottom: 12,
  },
  readOnlyLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  readOnlyText: {
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 8,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  readOnlyIcon: {
    marginRight: 8,
    width: 24,
  },
  readOnlyChecklistContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  readOnlyChecklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  duplicateButton: {
    backgroundColor: '#4a90e2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  duplicateButtonText: {
    color: '#ffffff',
    fontSize: 16,
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
  disabledInput: {
    backgroundColor: '#f5f5f5',
    color: '#666',
  },
  disabledPill: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ddd',
  },
  disabledText: {
    color: '#666',
  },
  completedContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  completedText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  cloneButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    width: '80%',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
    alignSelf: 'center',
  },
  cloneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  completedChecklistText: {
    textDecorationLine: 'line-through',
    color: '#4CAF50',
  },
});

export default EditReminderScreen; 