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
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';

interface Reminder {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'completed' | 'verified';
  createdAt: Date;
  assignedTo: string;
  familyId?: string;
}

export default function RemindersScreen() {
  const { user, signOut } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReminders();
  }, [user]); // Reload when user changes

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
      querySnapshot.forEach((doc) => {
        const data = doc.data() as DocumentData;
        loadedReminders.push({
          id: doc.id,
          title: data.title,
          description: data.description,
          status: data.status,
          createdAt: data.createdAt.toDate(),
          assignedTo: data.assignedTo,
          familyId: data.familyId,
        });
      });

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
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
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
            <View style={styles.reminderItem}>
              <View style={styles.reminderContent}>
                <Text style={styles.reminderTitle}>{item.title}</Text>
                {item.description && (
                  <Text style={styles.reminderDescription}>{item.description}</Text>
                )}
                <Text style={styles.reminderStatus}>Status: {item.status}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteReminder(item.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
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
  reminderDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  reminderStatus: {
    fontSize: 12,
    color: '#999',
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
}); 