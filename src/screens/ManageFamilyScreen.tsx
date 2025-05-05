import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Share, Clipboard } from 'react-native';
import { FamilyService } from '../services/FamilyService';
import { useAuth } from '../contexts/AuthContext';
import { Family } from '../types/Family';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useNavigation } from '@react-navigation/native';

export default function ManageFamilyScreen() {
  const [family, setFamily] = useState<Family | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parentProfiles, setParentProfiles] = useState<any[]>([]);
  const [childProfiles, setChildProfiles] = useState<any[]>([]);
  const { user } = useAuth();
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);
  const navigation = useNavigation();

  useEffect(() => {
    console.log('DEBUG user:', user);
    console.log('DEBUG user.familyId:', user?.familyId);
    if (user?.familyId) {
      loadFamily();
    }
  }, [user?.familyId]);

  useEffect(() => {
    if (family) {
      fetchMemberProfiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family]);

  useEffect(() => {
    if (family?.name) {
      navigation.setOptions({ title: `Manage ${family.name} Family` });
    }
  }, [family?.name]);

  const loadFamily = async () => {
    if (!user?.familyId) {
      console.log('DEBUG: No familyId on user');
      return;
    }
    try {
      const familyData = await FamilyService.getFamily(user.familyId);
      console.log('DEBUG loaded family:', familyData);
      setFamily(familyData);
    } catch (error) {
      console.log('DEBUG: Error loading family', error);
      Alert.alert('Error', 'Failed to load family information');
    }
  };

  const fetchMemberProfiles = async () => {
    if (!family) return;
    const parentIds = family.adminIds || family.parentIds || [];
    const childIds = family.childrenIds || [];
    try {
      // Fetch parent profiles by document ID
      let parentProfiles: any[] = [];
      if (parentIds.length > 0) {
        const parentSnapshots = await Promise.all(parentIds.map(async (uid) => {
          const docSnap = await getDocs(query(collection(db, 'users'), where('__name__', '==', uid)));
          return docSnap.docs.length > 0 ? { id: uid, ...docSnap.docs[0].data() } : { id: uid };
        }));
        parentProfiles = parentSnapshots;
      }
      setParentProfiles(parentProfiles);
      // Fetch child profiles by document ID
      let childProfiles: any[] = [];
      if (childIds.length > 0) {
        const childSnapshots = await Promise.all(childIds.map(async (uid) => {
          const docSnap = await getDocs(query(collection(db, 'users'), where('__name__', '==', uid)));
          return docSnap.docs.length > 0 ? { id: uid, ...docSnap.docs[0].data() } : { id: uid };
        }));
        childProfiles = childSnapshots;
      }
      setChildProfiles(childProfiles);
    } catch (error) {
      console.log('DEBUG: Error fetching member profiles', error);
    }
  };

  const generateJoinCode = async (type: 'parent' | 'child') => {
    if (!user?.familyId || !family) return;

    setIsLoading(true);
    try {
      const code = await FamilyService.generateJoinCode(user.familyId, type);
      setLastInviteCode(code);
      setInviteModalVisible(true);
      await loadFamily();
    } catch (error) {
      Alert.alert('Error', 'Failed to generate join code');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to convert Firestore Timestamp to JS Date
  function toDate(ts: any): Date {
    if (!ts) return new Date(0);
    if (ts instanceof Date) return ts;
    if (typeof ts === 'object' && 'seconds' in ts) return new Date(ts.seconds * 1000);
    return new Date(ts);
  }

  // Helper to format expiry time
  function formatExpiry(date: any) {
    const d = toDate(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Remove an invite code from the family
  const removeInviteCode = async (codeToRemove: string) => {
    if (!user?.familyId || !family) return;
    try {
      const updatedCodes = (family.joinCodes || []).filter(code => code.code !== codeToRemove);
      await updateDoc(doc(db, 'families', user.familyId), { joinCodes: updatedCodes });
      await loadFamily();
    } catch (error) {
      Alert.alert('Error', 'Failed to remove invite code.');
    }
  };

  if (!family) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading family information...</Text>
        <Text style={{ color: 'red', marginTop: 10 }}>Debug Info:</Text>
        <Text selectable style={{ fontSize: 12 }}>user: {JSON.stringify(user, null, 2)}</Text>
        <Text selectable style={{ fontSize: 12 }}>family: {JSON.stringify(family, null, 2)}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Only show Invite Members if user is a parent/admin */}
      {((user?.role === 'parent') || (user?.id && (family.adminIds || family.parentIds || []).includes(user.id))) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite Members</Text>
          <Text style={styles.sectionDescription}>
            Generate a code to invite new family members. Codes expire after 1 hour. To join, enter this code and your family name on the Sign In screen.
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.parentButton]}
              onPress={() => generateJoinCode('parent')}
              disabled={isLoading}
            >
              <MaterialCommunityIcons name="account-plus" size={24} color="#fff" />
              <Text style={styles.buttonText}>Invite Parent</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.childButton]}
              onPress={() => generateJoinCode('child')}
              disabled={isLoading}
            >
              <MaterialCommunityIcons name="account-child" size={24} color="#fff" />
              <Text style={styles.buttonText}>Invite Child</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Family Members</Text>
        <View style={styles.membersList}>
          <View style={styles.memberGroup}>
            <Text style={styles.memberGroupTitle}>Parents</Text>
            {(parentProfiles.length > 0 ? parentProfiles : (family.adminIds || family.parentIds || [])).map(parent => (
              <View key={typeof parent === 'string' ? parent : parent.id} style={styles.memberItem}>
                <MaterialCommunityIcons name="account" size={20} color="#666" />
                <Text style={styles.memberName}>{typeof parent === 'string' ? parent : parent.displayName || parent.email || parent.id}</Text>
              </View>
            ))}
            {/* Show active parent invite codes */}
            {(family.joinCodes || [])
              .filter(code => code.type === 'parent' && !code.usedBy && toDate(code.expiresAt) > new Date())
              .map(code => (
                <View key={code.code} style={{ marginLeft: 24, marginTop: 8, marginBottom: 8, backgroundColor: '#f0f6ff', borderRadius: 8, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name="key-variant" size={18} color="#007AFF" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: '#007AFF', fontWeight: 'bold', letterSpacing: 2 }}>{code.code}</Text>
                    <Text style={{ fontSize: 12, color: '#666' }}>Expires at {formatExpiry(code.expiresAt)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeInviteCode(code.code)}>
                    <MaterialIcons name="delete" size={20} color="#ff3b30" />
                  </TouchableOpacity>
                </View>
              ))}
          </View>

          <View style={styles.memberGroup}>
            <Text style={styles.memberGroupTitle}>Children</Text>
            {(childProfiles.length > 0 ? childProfiles : (family.childrenIds || [])).map(child => (
              <View key={typeof child === 'string' ? child : child.id} style={styles.memberItem}>
                <MaterialCommunityIcons name="account-child" size={20} color="#666" />
                <Text style={styles.memberName}>{typeof child === 'string' ? child : child.displayName || child.email || child.id}</Text>
              </View>
            ))}
            {/* Show active child invite codes */}
            {(family.joinCodes || [])
              .filter(code => code.type === 'child' && !code.usedBy && toDate(code.expiresAt) > new Date())
              .map(code => (
                <View key={code.code} style={{ marginLeft: 24, marginTop: 8, marginBottom: 8, backgroundColor: '#eafff0', borderRadius: 8, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name="key-variant" size={18} color="#34C759" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: '#34C759', fontWeight: 'bold', letterSpacing: 2 }}>{code.code}</Text>
                    <Text style={{ fontSize: 12, color: '#666' }}>Expires at {formatExpiry(code.expiresAt)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeInviteCode(code.code)}>
                    <MaterialIcons name="delete" size={20} color="#ff3b30" />
                  </TouchableOpacity>
                </View>
              ))}
          </View>
        </View>
      </View>

      {/* Invite Code Modal */}
      {inviteModalVisible && lastInviteCode && (
        <View style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          justifyContent: 'center', alignItems: 'center',
          zIndex: 1000
        }}>
          <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 12, alignItems: 'center', width: 300 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>Family Invite Code</Text>
            <Text style={{ fontSize: 28, fontWeight: 'bold', letterSpacing: 2, marginBottom: 8 }}>{lastInviteCode}</Text>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>Share this code with your family member. It will expire in 1 hour.</Text>
            <TouchableOpacity
              style={{ backgroundColor: '#007AFF', padding: 12, borderRadius: 8, marginBottom: 8, width: '100%', alignItems: 'center' }}
              onPress={() => { Clipboard.setString(lastInviteCode); Alert.alert('Copied!', 'Invite code copied to clipboard.'); setInviteModalVisible(false); }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Copy Code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ padding: 8, borderRadius: 8, width: '100%', alignItems: 'center' }}
              onPress={() => setInviteModalVisible(false)}
            >
              <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  membersList: {
    gap: 20,
  },
  memberGroup: {
    gap: 8,
  },
  memberGroupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  memberName: {
    fontSize: 14,
    color: '#666',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  parentButton: {
    backgroundColor: '#007AFF',
  },
  childButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
}); 