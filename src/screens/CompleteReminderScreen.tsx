import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ChecklistItem } from '../types/Reminder';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CompleteReminderScreenProps } from '../types/navigation';

export default function CompleteReminderScreen({ route, navigation }: CompleteReminderScreenProps) {
  const { reminderId } = route.params;
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  useEffect(() => {
    loadReminderData();
  }, []);

  const loadReminderData = async () => {
    try {
      const reminderDoc = await getDoc(doc(db, 'reminders', reminderId));
      if (reminderDoc.exists()) {
        const data = reminderDoc.data();
        setTitle(data.title);
        setChecklist(data.checklist || []);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading reminder:', error);
      Alert.alert('Error', 'Failed to load reminder details');
      setLoading(false);
    }
  };

  const toggleChecklistItem = async (itemId: string) => {
    const updatedChecklist = checklist.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setChecklist(updatedChecklist);

    try {
      const reminderRef = doc(db, 'reminders', reminderId);
      const allCompleted = updatedChecklist.every(item => item.completed);
      
      await updateDoc(reminderRef, {
        checklist: updatedChecklist,
        status: allCompleted ? 'completed' : 'pending',
        updatedAt: new Date(),
        ...(allCompleted ? { completedAt: new Date() } : {}),
      });
    } catch (error) {
      console.error('Error updating checklist:', error);
      Alert.alert('Error', 'Failed to update checklist');
    }
  };

  const handleComplete = async () => {
    try {
      const allCompleted = checklist.every(item => item.completed);
      if (!allCompleted) {
        Alert.alert(
          'Incomplete Items',
          'Some items are not checked. Do you want to mark the reminder as complete anyway?',
          [
            { text: 'No', style: 'cancel' },
            {
              text: 'Yes',
              style: 'default',
              onPress: async () => {
                await updateDoc(doc(db, 'reminders', reminderId), {
                  status: 'completed',
                  updatedAt: new Date(),
                  completedAt: new Date(),
                });
                navigation.goBack();
              },
            },
          ]
        );
      } else {
        await updateDoc(doc(db, 'reminders', reminderId), {
          status: 'completed',
          updatedAt: new Date(),
          completedAt: new Date(),
        });
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error completing reminder:', error);
      Alert.alert('Error', 'Failed to complete reminder');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
        </View>

        {checklist.length > 0 ? (
          <View style={styles.checklistContainer}>
            {checklist.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.checklistItem}
                onPress={() => toggleChecklistItem(item.id)}
              >
                <MaterialCommunityIcons
                  name={item.completed ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={24}
                  color={item.completed ? "#4CAF50" : "#666"}
                />
                <Text style={[
                  styles.checklistText,
                  item.completed && styles.completedText
                ]}>
                  {item.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.noChecklistContainer}>
            <Text style={styles.noChecklistText}>No checklist items</Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.completeButton}
        onPress={handleComplete}
      >
        <Text style={styles.completeButtonText}>Complete Reminder</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  titleContainer: {
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  checklistContainer: {
    padding: 16,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginBottom: 8,
  },
  checklistText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  noChecklistContainer: {
    padding: 16,
    alignItems: 'center',
  },
  noChecklistText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  completeButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
}); 