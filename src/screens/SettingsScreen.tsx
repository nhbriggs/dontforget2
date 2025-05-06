import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, ActivityIndicator, Appearance } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

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

  return (
    <View style={[styles.container, darkMode && styles.containerDark]}>
      <Text style={styles.sectionTitle}>Account Settings</Text>
      <View style={styles.section}>
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
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
    </View>
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
}); 