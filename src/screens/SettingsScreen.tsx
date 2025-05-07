import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, ActivityIndicator, Appearance, Modal, Platform, ScrollView } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, updateDoc, collection, query, where, getDocs, writeBatch, getDoc } from 'firebase/firestore';
import { Family } from '../types/Family';
import { Reminder } from '../types/Reminder';

export default function SettingsScreen() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState('');

  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [currentPasswordError, setCurrentPasswordError] = useState(false);

  const [darkMode, setDarkMode] = useState(Appearance.getColorScheme() === 'dark');

  const [isEditingName, setIsEditingName] = useState(false);
  const [originalDisplayName, setOriginalDisplayName] = useState(displayName);

  const [resetMessage, setResetMessage] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState(user?.email || '');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [family, setFamily] = useState<Family | null>(null);
  const [isLoadingFamily, setIsLoadingFamily] = useState(false);

  useEffect(() => {
    const fetchFamily = async () => {
      if (!user?.familyId) return;
      setIsLoadingFamily(true);
      try {
        const familyDoc = await getDoc(doc(db, 'families', user.familyId));
        if (familyDoc.exists()) {
          setFamily(familyDoc.data() as Family);
        }
      } catch (e) {
        setFamily(null);
      } finally {
        setIsLoadingFamily(false);
      }
    };
    fetchFamily();
  }, [user?.familyId]);

  // Save display name
  const handleToggleNameEdit = () => {
    if (isEditingName) {
      setDisplayName(originalDisplayName); // revert changes
      setIsEditingName(false);
      setNameMessage('');
    } else {
      setOriginalDisplayName(displayName);
      setIsEditingName(true);
      setNameMessage('');
    }
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) {
      setNameMessage('Display name cannot be empty.');
      return;
    }
    setIsSavingName(true);
    setNameMessage('');
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName });
        await updateDoc(doc(db, 'users', user!.id), { displayName });
        setNameMessage('Display name updated!');
        setIsEditingName(false);
        setOriginalDisplayName(displayName);
      }
    } catch (err) {
      setNameMessage('Failed to update display name.');
    } finally {
      setIsSavingName(false);
    }
  };

  // Save password
  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage('Please fill in all fields.');
      setCurrentPasswordError(!currentPassword);
      return;
    }
    if (passwordError) {
      setPasswordMessage('Please fix errors before saving.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match.');
      return;
    }
    setIsSavingPassword(true);
    setPasswordMessage('');
    setCurrentPasswordError(false);
    try {
      if (auth.currentUser && auth.currentUser.email) {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPassword);
        setPasswordMessage('Password updated!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordFields(false);
      }
    } catch (err: any) {
      console.log('Password change error:', err, err.code, err.message);
      if (
        err.code === 'auth/wrong-password' ||
        (typeof err.message === 'string' && err.message.includes('auth/wrong-password'))
      ) {
        setPasswordMessage('The current password you entered is incorrect.');
        setCurrentPasswordError(true);
      } else if (
        err.code === 'auth/requires-recent-login' ||
        (typeof err.message === 'string' && err.message.includes('auth/requires-recent-login'))
      ) {
        setPasswordMessage('For security, please sign out and sign in again before changing your password.');
        setCurrentPasswordError(true);
      } else {
        setPasswordMessage('Failed to update password. Please try again.');
        setCurrentPasswordError(false);
      }
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleNewPasswordChange = (text: string) => {
    setNewPassword(text);
    if (confirmPassword && text !== confirmPassword) {
      setPasswordError('Passwords do not match');
    } else {
      setPasswordError('');
    }
  };

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    if (newPassword && text !== newPassword) {
      setPasswordError('Passwords do not match');
    } else {
      setPasswordError('');
    }
  };

  // Toggle dark mode (demo: just toggles state, real app should use context/provider)
  const handleToggleDarkMode = () => {
    setDarkMode((prev) => !prev);
    // In a real app, update theme context/provider here
  };

  const handleForgotPassword = async () => {
    if (!user?.email) {
      setResetMessage('No email found for your account.');
      return;
    }
    setResetMessage('');
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetMessage('Password reset email sent! Please check your inbox.');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setResetMessage('No account found with this email.');
      } else if (err.code === 'auth/invalid-email') {
        setResetMessage('Invalid email address.');
      } else {
        setResetMessage('Failed to send reset email. Please try again.');
      }
    }
  };

  const handleUpgradeSubscription = async () => {
    if (!family) return;
    try {
      await updateDoc(doc(db, 'families', family.id), {
        'subscription.type': 'paid',
        'subscription.startDate': new Date()
      });
      // Unblock all reminders for this family
      const remindersQuery = query(collection(db, 'reminders'), where('familyId', '==', family.id));
      const remindersSnap = await getDocs(remindersQuery);
      const batch = writeBatch(db);
      remindersSnap.forEach(docSnap => {
        batch.update(docSnap.ref, { blocked: false });
      });
      await batch.commit();
      // Refetch family
      const familyDoc = await getDoc(doc(db, 'families', family.id));
      if (familyDoc.exists()) setFamily(familyDoc.data() as Family);
      if (Platform.OS === 'web') {
        window.alert('Your family has been upgraded to the paid plan!');
      } else {
        Alert.alert('Success', 'Your family has been upgraded to the paid plan!');
      }
    } catch (error) {
      if (Platform.OS === 'web') {
        window.alert('Failed to upgrade subscription. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to upgrade subscription. Please try again.');
      }
    }
  };

  const handleDowngradeSubscription = async () => {
    if (!family) return;
    try {
      await updateDoc(doc(db, 'families', family.id), {
        'subscription.type': 'free',
        'subscription.startDate': new Date()
      });
      // Block all but the most recent reminder
      const remindersQuery = query(collection(db, 'reminders'), where('familyId', '==', family.id));
      const remindersSnap = await getDocs(remindersQuery);
      const reminders = remindersSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Reminder));
      reminders.sort((a, b) => {
        const getTime = (val: any) => (val && typeof val.toMillis === 'function') ? val.toMillis() : (val instanceof Date ? val.getTime() : 0);
        return getTime(a.createdAt) - getTime(b.createdAt);
      });
      const batch = writeBatch(db);
      reminders.forEach((reminder, idx) => {
        batch.update(doc(db, 'reminders', reminder.id), { blocked: idx > 0 });
      });
      await batch.commit();
      // Refetch family
      const familyDoc = await getDoc(doc(db, 'families', family.id));
      if (familyDoc.exists()) setFamily(familyDoc.data() as Family);
      if (Platform.OS === 'web') {
        window.alert('Your family has been downgraded to the free plan. Only your most recent reminder is active.');
      } else {
        Alert.alert('Success', 'Your family has been downgraded to the free plan. Only your most recent reminder is active.');
      }
    } catch (error) {
      if (Platform.OS === 'web') {
        window.alert('Failed to downgrade subscription. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to downgrade subscription. Please try again.');
      }
    }
  };

  return (
    <ScrollView style={[styles.container, darkMode && styles.containerDark]} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.sectionTitle}>Account Settings</Text>
      <View style={styles.section}>
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={[styles.input, (!isEditingName || isSavingName) && styles.inputReadonly]}
          value={displayName}
          onChangeText={setDisplayName}
          editable={isEditingName && !isSavingName}
        />
        {nameMessage ? <Text style={styles.message}>{nameMessage}</Text> : null}
        {!isEditingName ? (
          <TouchableOpacity
            style={[styles.button, isSavingName && styles.buttonDisabled]}
            onPress={handleToggleNameEdit}
            disabled={isSavingName}
          >
            <Text style={styles.buttonText}>Change Name</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.button, isSavingName && styles.buttonDisabled]}
              onPress={handleSaveName}
              disabled={isSavingName}
            >
              {isSavingName ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Name</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleToggleNameEdit}
              disabled={isSavingName}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Password</Text>
      <View style={styles.section}>
        {!showPasswordFields ? (
          <>
            <TouchableOpacity style={styles.button} onPress={() => setShowPasswordFields(true)}>
              <Text style={styles.buttonText}>Change Password</Text>
            </TouchableOpacity>
            {passwordMessage ? <Text style={styles.errorText}>{passwordMessage}</Text> : null}
          </>
        ) : (
          <>
            <Text style={styles.label}>Current Password</Text>
            <TextInput
              style={[
                styles.input,
                currentPasswordError && styles.inputError
              ]}
              value={currentPassword}
              onChangeText={text => {
                setCurrentPassword(text);
                setCurrentPasswordError(false);
              }}
              secureTextEntry
              editable={!isSavingPassword}
            />
            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={handleNewPasswordChange}
              secureTextEntry
              editable={!isSavingPassword}
            />
            <Text style={styles.label}>Confirm New Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={handleConfirmPasswordChange}
              secureTextEntry
              editable={!isSavingPassword}
            />
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            {passwordMessage ? <Text style={styles.errorText}>{passwordMessage}</Text> : null}
            <Text style={styles.forgotPasswordLink} onPress={handleForgotPassword}>
              Forgot my password?
            </Text>
            {resetMessage ? <Text style={styles.resetMessage}>{resetMessage}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.button, isSavingPassword && styles.buttonDisabled]}
                onPress={handleSavePassword}
                disabled={isSavingPassword}
              >
                {isSavingPassword ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Password</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowPasswordFields(false)}
                disabled={isSavingPassword}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Appearance</Text>
      <View style={styles.sectionRow}>
        <Text style={styles.label}>Dark Mode</Text>
        <Switch value={darkMode} onValueChange={handleToggleDarkMode} />
      </View>

      {user?.role === 'parent' && (
        <>
          <Text style={styles.sectionTitle}>Subscription Plan</Text>
          <View style={styles.section}>
            {isLoadingFamily ? (
              <Text>Loading subscription info...</Text>
            ) : family ? (
              <>
                <Text style={styles.label}>
                  Subscription: <Text style={{fontWeight: 'bold'}}>{family.subscription?.type === 'paid' ? 'Paid' : 'Free'}</Text>
                </Text>
                <Text style={styles.label}>
                  {family.subscription?.type === 'free'
                    ? <><Text>Free plan: </Text><Text style={{fontWeight: 'bold'}}>1 reminder limit</Text></>
                    : <><Text>Paid plan: </Text><Text style={{fontWeight: 'bold'}}>Unlimited reminders</Text></>}
                </Text>
                {family.subscription?.type === 'free' ? (
                  <TouchableOpacity style={styles.button} onPress={handleUpgradeSubscription}>
                    <Text style={styles.buttonText}>Upgrade to Paid Plan</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.button, { backgroundColor: '#888' }]} onPress={handleDowngradeSubscription}>
                    <Text style={styles.buttonText}>Downgrade to Free Plan</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text>No family subscription info found.</Text>
            )}
          </View>
        </>
      )}

      {user?.role === 'parent' && (
        <>
          <Text style={styles.sectionTitle}>Leave Dont Forget 2</Text>
          <View style={styles.section}>
            <Text style={styles.leaveDescription}>
              If you would like to leave the app, you can delete your entire family, all accounts, reminders, and all data associated with your family. This action is permanent and cannot be undone.
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#ff3b30', marginTop: 12 }]}
              onPress={() => setShowDeleteModal(true)}
            >
              <Text style={[styles.buttonText, { color: '#fff' }]}>Delete Family & All Data</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.deleteTitle}>Delete Family & All Data</Text>
            <Text style={styles.deleteWarning}>
              WARNING: This will permanently delete your entire family, all members, and all reminders from Dont Forget 2. This action cannot be undone. All accounts in this family will be deleted from the app and from Firebase. To confirm, please enter your credentials below.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={deleteEmail}
              onChangeText={setDeleteEmail}
              editable={false}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
            />
            {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: '#ff3b30' }, isDeleting && styles.buttonDisabled]}
                onPress={async () => {
                  setDeleteError('');
                  setIsDeleting(true);
                  if (!user || !auth.currentUser) {
                    setDeleteError('User not found. Please sign in again.');
                    setIsDeleting(false);
                    return;
                  }
                  try {
                    const credential = EmailAuthProvider.credential(user.email, deletePassword);
                    await reauthenticateWithCredential(auth.currentUser, credential);

                    // 1. Delete all reminders for the family
                    const remindersQuery = query(collection(db, 'reminders'), where('familyId', '==', user.familyId));
                    const remindersSnap = await getDocs(remindersQuery);

                    // 2. Delete all users in the family
                    const usersQuery = query(collection(db, 'users'), where('familyId', '==', user.familyId));
                    const usersSnap = await getDocs(usersQuery);

                    // 3. Batch delete reminders and users
                    const batch = writeBatch(db);
                    remindersSnap.forEach(doc => batch.delete(doc.ref));
                    usersSnap.forEach(doc => batch.delete(doc.ref));

                    // 4. Delete the family document
                    if (user.familyId) {
                      batch.delete(doc(db, 'families', user.familyId));
                    }
                    await batch.commit();

                    // 5. Delete the current user's Firebase Auth account
                    await auth.currentUser.delete();

                    setIsDeleting(false);
                    setShowDeleteModal(false);
                    Alert.alert('Deleted', 'Your family and all data have been deleted.');
                    return;
                  } catch (error: any) {
                    console.error('Error during deletion:', error, error.code, error.message);
                    if (
                      (error.code && (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential')) ||
                      (typeof error.message === 'string' && (
                        error.message.includes('auth/wrong-password') ||
                        error.message.includes('auth/invalid-credential')
                      ))
                    ) {
                      setDeleteError('The password you entered is incorrect. Please try again.');
                    } else {
                      setDeleteError('Failed to delete family and data. Please try again.');
                    }
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
              >
                {isDeleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Delete Everything</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
  },
  containerDark: {
    backgroundColor: '#222',
  },
  section: {
    marginBottom: 28,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 16,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 16,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  label: {
    fontSize: 15,
    color: '#555',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  inputReadonly: {
    backgroundColor: '#f0f0f0',
    color: '#888',
  },
  inputError: {
    borderColor: '#ff3b30',
    borderWidth: 2,
    backgroundColor: '#fff0f0',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    minWidth: 120,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButton: {
    backgroundColor: '#888',
    marginLeft: 10,
  },
  message: {
    color: '#007AFF',
    marginBottom: 6,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff3b30',
    marginBottom: 6,
    fontSize: 14,
    textAlign: 'center',
  },
  forgotPasswordLink: {
    color: '#007AFF',
    textAlign: 'right',
    marginBottom: 10,
    textDecorationLine: 'underline',
    fontSize: 15,
  },
  resetMessage: {
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignItems: 'stretch',
  },
  deleteTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff3b30',
    marginBottom: 12,
    textAlign: 'center',
  },
  deleteWarning: {
    color: '#ff3b30',
    fontSize: 16,
    marginBottom: 18,
    textAlign: 'center',
  },
  leaveDescription: {
    color: '#333',
    fontSize: 15,
    marginBottom: 8,
    textAlign: 'center',
  },
}); 