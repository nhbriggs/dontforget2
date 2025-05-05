import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { FamilyService } from '../services/FamilyService';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function JoinFamilyScreen() {
  const [code, setCode] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'validate' | 'register'>('validate');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [joinError, setJoinError] = useState('');
  const navigation = useNavigation();

  const handleValidate = async () => {
    if (!code.trim() || !familyName.trim()) {
      setJoinError('Please enter both the invite code and family name.');
      return;
    }
    setIsLoading(true);
    setJoinError('');
    try {
      console.log('Validating code:', code, 'familyName:', familyName);
      const isValid = await FamilyService.validateJoinCode(code.trim(), familyName.trim());
      console.log('Validation result:', isValid);
      if (isValid) {
        setStep('register');
      } else {
        console.log('Invalid combination, showing error');
        setJoinError('Code and Family do not match. Please try again, or have a parent create a new code.');
      }
    } catch (error) {
      console.log('Validation error:', error);
      setJoinError('Code and Family do not match. Please try again, or have a parent create a new code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    setIsLoading(true);
    try {
      await FamilyService.registerWithFamilyInvite({
        code: code.trim(),
        familyName: familyName.trim(),
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword.trim(),
      });
      // Poll Firestore for user document
      const checkUserDoc = async (retries = 15) => {
        const user = await FamilyService.getUserByEmail(regEmail.trim());
        if (user) {
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Reminders' }],
            })
          );
        } else if (retries > 0) {
          setTimeout(() => checkUserDoc(retries - 1), 200);
        } else {
          Alert.alert('Error', 'Account created, but user profile not found. Please try signing in.');
        }
      };
      checkUserDoc();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join a Family</Text>
      {step === 'validate' ? (
        <>
          <Text style={styles.subtitle}>Enter your invite code and family name</Text>
          {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder="Invite Code (e.g. A1B2-C3D4)"
            value={code}
            onChangeText={text => { setCode(text); setJoinError(''); }}
            autoCapitalize="characters"
            maxLength={9}
            editable={!isLoading}
          />
          <TextInput
            style={styles.input}
            placeholder="Family Name"
            value={familyName}
            onChangeText={text => { setFamilyName(text); setJoinError(''); }}
            autoCapitalize="words"
            editable={!isLoading}
          />
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleValidate}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Next</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>Create your account</Text>
          <TextInput
            style={styles.input}
            placeholder="Your Name"
            value={regName}
            onChangeText={setRegName}
            autoCapitalize="words"
            editable={!isLoading}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={regEmail}
            onChangeText={setRegEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!isLoading}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={regPassword}
            onChangeText={setRegPassword}
            secureTextEntry
            editable={!isLoading}
          />
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  error: {
    color: '#ff3b30',
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: 'bold',
  },
}); 