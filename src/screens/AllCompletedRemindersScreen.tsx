import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Reminder } from '../types/Reminder';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

interface FamilyMember {
  id: string;
  displayName: string;
}

export default function AllCompletedRemindersScreen() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string>>({});
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<string | null>(null);
  const [averageSnoozes, setAverageSnoozes] = useState<number>(0);
  const [averageCompletionTime, setAverageCompletionTime] = useState<number>(0);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const getFilteredReminders = () => {
    let filtered = reminders;

    // Apply time filter
    if (selectedTimeFilter) {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      filtered = filtered.filter(reminder => {
        const completedDate = reminder.completedAt ? new Date(reminder.completedAt) : null;
        if (!completedDate) return false;

        if (selectedTimeFilter === '7days') {
          return completedDate >= sevenDaysAgo;
        } else if (selectedTimeFilter === '30days') {
          return completedDate >= thirtyDaysAgo;
        }
        return true;
      });
    }

    // Apply child filter
    if (selectedFilter) {
      filtered = filtered.filter(r => r.assignedTo === selectedFilter);
    }

    return filtered;
  };

  const filteredReminders = getFilteredReminders();

  useEffect(() => {
    if (user?.role === 'parent' && user.familyId) {
      loadFamilyMembers();
    }
    fetchCompletedReminders();
  }, [user]);

  useEffect(() => {
    // Calculate KPIs whenever filtered reminders change
    if (filteredReminders.length > 0) {
      // Calculate average snoozes
      const totalSnoozes = filteredReminders.reduce((sum, reminder) => sum + (reminder.snoozeCount ?? 0), 0);
      const average = totalSnoozes / filteredReminders.length;
      setAverageSnoozes(Number(average.toFixed(1)));

      // Calculate average completion time
      const validReminders = filteredReminders.filter(reminder => 
        reminder.createdAt && reminder.completedAt
      );
      
      if (validReminders.length > 0) {
        const totalMinutes = validReminders.reduce((sum, reminder) => {
          if (!reminder.createdAt || !reminder.completedAt) return sum;
          const created = new Date(reminder.createdAt);
          const completed = new Date(reminder.completedAt);
          const minutes = (completed.getTime() - created.getTime()) / (1000 * 60);
          return sum + minutes;
        }, 0);
        
        const avgMinutes = totalMinutes / validReminders.length;
        setAverageCompletionTime(Number(avgMinutes.toFixed(0)));
      } else {
        setAverageCompletionTime(0);
      }
    } else {
      setAverageSnoozes(0);
      setAverageCompletionTime(0);
    }
  }, [filteredReminders]);

  const loadFamilyMembers = async () => {
    if (!user?.familyId) return;
    try {
      const familyRef = doc(db, 'families', user.familyId);
      const familySnapshot = await getDoc(familyRef);
      if (!familySnapshot.exists()) return;
      const familyData = familySnapshot.data();
      const childrenIds = familyData.childrenIds || [];
      const members: FamilyMember[] = [];
      const names: Record<string, string> = {};
      for (const childId of childrenIds) {
        const userDoc = await getDoc(doc(db, 'users', childId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          members.push({ id: childId, displayName: userData.displayName || 'Unknown' });
          names[childId] = userData.displayName || 'Unknown';
        }
      }
      setFamilyMembers(members);
      setAssigneeNames(names);
    } catch (error) {
      console.error('Error loading family members:', error);
    }
  };

  const fetchCompletedReminders = async () => {
    setLoading(true);
    const remindersRef = collection(db, 'reminders');
    const q = query(remindersRef, where('status', '==', 'completed'));
    const querySnapshot = await getDocs(q);
    const loadedReminders: Reminder[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      loadedReminders.push({
        id: doc.id,
        title: data.title || 'Untitled',
        checklist: data.checklist || [],
        assignedTo: data.assignedTo || '',
        familyId: data.familyId || '',
        createdBy: data.createdBy || '',
        status: data.status || 'completed',
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        dueDate: data.dueDate?.toDate ? data.dueDate.toDate() : data.dueDate,
        completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : data.completedAt,
        isRecurring: data.isRecurring || false,
        recurrenceConfig: data.recurrenceConfig || null,
        snoozeCount: data.snoozeCount ?? 0,
        lastSnoozedAt: data.lastSnoozedAt || null,
      });
    });
    setReminders(loadedReminders);
    setLoading(false);
  };

  // Clone reminder handler
  const handleCloneReminder = (reminder) => {
    // Prepare checklist with all items set to not completed
    const checklist = (reminder.checklist || []).map(item => ({ ...item, completed: false }));
    navigation.navigate('AddReminder', {
      cloneData: {
        title: reminder.title,
        checklist,
        dueDate: new Date(),
        assignedTo: reminder.assignedTo,
        isRecurring: reminder.isRecurring,
        selectedDays: reminder.recurrenceConfig?.selectedDays || [],
        weekFrequency: reminder.recurrenceConfig?.weekFrequency || 1,
      }
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#34c759" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 0 }}
        data={filteredReminders}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <Text style={styles.header}>All Completed Reminders</Text>
            <View style={styles.kpiContainer}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Avg Snoozes</Text>
                <View style={styles.kpiValueContainer}>
                  <MaterialCommunityIcons name="sleep" size={16} color="#b8860b" />
                  <Text style={styles.kpiValue}>{averageSnoozes}</Text>
                </View>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Avg Time to Complete</Text>
                <View style={styles.kpiValueContainer}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color="#007AFF" />
                  <Text style={[styles.kpiValue, { color: '#007AFF' }]}>{averageCompletionTime}m</Text>
                </View>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
              <TouchableOpacity
                style={[styles.filterPill, selectedTimeFilter === null && styles.filterPillSelected]}
                onPress={() => setSelectedTimeFilter(null)}
              >
                <Text style={[styles.filterPillText, selectedTimeFilter === null && styles.filterPillTextSelected]}>All Time</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, selectedTimeFilter === '7days' && styles.filterPillSelected]}
                onPress={() => setSelectedTimeFilter('7days')}
              >
                <Text style={[styles.filterPillText, selectedTimeFilter === '7days' && styles.filterPillTextSelected]}>Past 7 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, selectedTimeFilter === '30days' && styles.filterPillSelected]}
                onPress={() => setSelectedTimeFilter('30days')}
              >
                <Text style={[styles.filterPillText, selectedTimeFilter === '30days' && styles.filterPillTextSelected]}>Past Month</Text>
              </TouchableOpacity>
            </ScrollView>
            {familyMembers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterBar, styles.childFilterBar]} contentContainerStyle={styles.filterBarContent}>
                <TouchableOpacity
                  style={[styles.filterPill, selectedFilter === null && styles.filterPillSelected]}
                  onPress={() => setSelectedFilter(null)}
                >
                  <Text style={[styles.filterPillText, selectedFilter === null && styles.filterPillTextSelected]}>All Children</Text>
                </TouchableOpacity>
                {familyMembers.map(member => (
                  <TouchableOpacity
                    key={member.id}
                    style={[styles.filterPill, selectedFilter === member.id && styles.filterPillSelected]}
                    onPress={() => setSelectedFilter(member.id)}
                  >
                    <Text style={[styles.filterPillText, selectedFilter === member.id && styles.filterPillTextSelected]}>{member.displayName}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.reminderCard}>
            <View style={styles.row}>
              <MaterialCommunityIcons name="check-circle" size={20} color="#34c759" />
              <Text style={styles.title}>{item.title}</Text>
            </View>
            {/* Clone button */}
            <TouchableOpacity
              style={styles.cloneButton}
              onPress={() => handleCloneReminder(item)}
            >
              <MaterialCommunityIcons name="content-copy" size={20} color="#888" />
            </TouchableOpacity>
            <View style={styles.infoRow}>
              <Text style={styles.date}>Completed: {item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Unknown'}</Text>
              <View style={styles.rightInfo}>
                <Text style={styles.childName}>
                  {assigneeNames[item.assignedTo] || item.assignedTo || 'Unknown'}
                </Text>
                <View style={styles.snoozeContainer}>
                  <MaterialCommunityIcons name="sleep" size={14} color="#b8860b" />
                  <Text style={styles.snoozeCount}>{item.snoozeCount ?? 0}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No completed reminders found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 12,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 8,
    color: '#333',
    textAlign: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    marginBottom: 0,
    paddingVertical: 2,
  },
  filterBarContent: {
    alignItems: 'center',
    paddingBottom: 0,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    marginRight: 4,
    height: 22,
    justifyContent: 'center',
    minWidth: 36,
    alignItems: 'center',
  },
  filterPillSelected: {
    backgroundColor: '#007AFF',
  },
  filterPillText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '400',
  },
  filterPillTextSelected: {
    color: '#fff',
  },
  reminderCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
    color: '#222',
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 1,
  },
  date: {
    fontSize: 12,
    color: '#666',
  },
  childName: {
    fontSize: 12,
    color: '#007AFF',
  },
  rightInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  snoozeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  snoozeCount: {
    fontSize: 12,
    color: '#b8860b',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 16,
  },
  kpiContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    minWidth: 120,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  kpiLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  kpiValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#b8860b',
  },
  childFilterBar: {
    marginTop: 4,
  },
  cloneButton: {
    alignSelf: 'flex-end',
    marginBottom: 2,
    marginRight: 2,
    padding: 4,
  },
}); 