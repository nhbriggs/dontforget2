import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ReminderCompletion } from '../types/Reminder';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ReminderCompletionsScreenProps } from '../types/navigation';

export default function ReminderCompletionsScreen({ route, navigation }: ReminderCompletionsScreenProps) {
  const { reminderId, reminderTitle } = route.params;
  const [loading, setLoading] = useState(true);
  const [completions, setCompletions] = useState<ReminderCompletion[]>([]);

  useEffect(() => {
    loadCompletions();
  }, []);

  const loadCompletions = async () => {
    try {
      const completionsRef = collection(db, 'reminderCompletions');
      const q = query(
        completionsRef,
        where('reminderId', '==', reminderId),
        orderBy('completedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const loadedCompletions: ReminderCompletion[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedCompletions.push({
          id: doc.id,
          reminderId: data.reminderId,
          completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate() : data.completedAt,
          completedBy: data.completedBy,
          dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : data.dueDate,
          checklist: data.checklist,
        });
      });

      setCompletions(loadedCompletions);
      setLoading(false);
    } catch (error) {
      console.error('Error loading completions:', error);
      setLoading(false);
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
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{reminderTitle}</Text>
        <Text style={styles.subtitle}>Completion History</Text>
      </View>

      {completions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No completions recorded yet</Text>
        </View>
      ) : (
        completions.map((completion, index) => (
          <View key={completion.id} style={styles.completionCard}>
            <View style={styles.completionHeader}>
              <MaterialCommunityIcons name="check-circle" size={24} color="#4CAF50" />
              <Text style={styles.completionDate}>
                {completion.completedAt.toLocaleString()}
              </Text>
            </View>

            <View style={styles.dueDateContainer}>
              <MaterialCommunityIcons name="calendar" size={20} color="#666" />
              <Text style={styles.dueDate}>
                Due: {completion.dueDate.toLocaleString()}
              </Text>
            </View>

            <View style={styles.checklistContainer}>
              {completion.checklist.map((item, itemIndex) => (
                <View key={item.id} style={styles.checklistItem}>
                  <MaterialCommunityIcons
                    name={item.completed ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={20}
                    color={item.completed ? "#4CAF50" : "#666"}
                  />
                  <Text style={[
                    styles.checklistText,
                    item.completed && styles.completedText
                  ]}>
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  completionCard: {
    backgroundColor: '#fff',
    margin: 8,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  completionDate: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  dueDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dueDate: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  checklistContainer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  checklistText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#333',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#4CAF50',
  },
}); 