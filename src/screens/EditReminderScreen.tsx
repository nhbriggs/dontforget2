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
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChecklistItem } from '../types/Reminder';
import { Picker } from '@react-native-picker/picker';

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

export default function EditReminderScreen({ route, navigation }: EditReminderScreenProps) {
  const { reminderId } = route.params;
  const { user } = useAuth();
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReminderData();
    loadFamilyMembers();
  }, []);

  const loadReminderData = async () => {
    try {
      const reminderDoc = await getDoc(doc(db, 'reminders', reminderId));
      if (reminderDoc.exists()) {
        const data = reminderDoc.data();
        setTitle(data.title);
        setChecklist(data.checklist || []);
        setDueDate(data.dueDate.toDate());
        setAssignedTo(data.assignedTo);
        setIsRecurring(data.isRecurring || false);
        if (data.recurrenceConfig) {
          setSelectedDays(data.recurrenceConfig.selectedDays || []);
          setWeekFrequency(data.recurrenceConfig.weekFrequency?.toString() || '1');
        }
      }
    } catch (error) {
      console.error('Error loading reminder:', error);
      Alert.alert('Error', 'Failed to load reminder details');
    }
  };

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
      await updateDoc(reminderRef, {
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
      });
      navigation.goBack();
    } catch (error) {
      console.error('Error updating reminder:', error);
      Alert.alert('Error', 'Failed to update reminder');
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
                No children found in your family. Please add children to your family first.
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
                    assignedTo === member.id && styles.assigneePillSelected
                  ]}
                  onPress={() => setAssignedTo(member.id)}
                >
                  <Text 
                    style={[
                      styles.assigneePillText,
                      assignedTo === member.id && styles.assigneePillTextSelected
                    ]}
                  >
                    {member.displayName}
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
            display="default"
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
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
            style={[styles.cloneButton, loading && styles.submitButtonDisabled]}
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
            <Text style={styles.cloneButtonText}>Clone Reminder</Text>
          </TouchableOpacity>
        </View>
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
  cloneButton: {
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cloneButtonText: {
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
}); 