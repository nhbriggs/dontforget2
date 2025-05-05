import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { FamilyService } from '../services/FamilyService';

export default function CreateParentAccountScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigation = useNavigation();

  // Add a useEffect to show password mismatch error as soon as they differ
  useEffect(() => {
    if (password && repeatPassword) {
      if (password !== repeatPassword) {
        setError('Passwords do not match.');
      } else {
        setError('');
      }
    } else {
      setError('');
    }
  }, [password, repeatPassword]);

  const handleCreate = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !repeatPassword.trim() || !familyName.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      // 1. Create user in Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
      const user = userCredential.user;
      await updateProfile(user, { displayName: name.trim() });
      // 2. Write user profile to Firestore (without familyId yet)
      await setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        displayName: name.trim(),
        email: email.trim(),
        role: 'parent',
        createdAt: new Date(),
      });
      // 3. Create family in Firestore with this user as parent
      const family = await FamilyService.createFamily(familyName.trim(), user.uid);
      // 4. Update user profile with familyId
      await setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        displayName: name.trim(),
        email: email.trim(),
        role: 'parent',
        familyId: family.id,
        createdAt: new Date(),
      });
      // 5. After successful registration, show a success message and redirect to Sign In
      Alert.alert(
        "Account Created",
        "Your family and parent account have been created. Please sign in.",
        [
          {
            text: "OK",
            onPress: () => {
              setIsLoading(false);
              navigation.reset({
                index: 0,
                routes: [{ name: 'SignIn' as never }],
              });
            }
          }
        ]
      );
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Family & Parent Account</Text>
      <Text style={styles.helpText}>
        Complete the form below to create your family and set up your own parent account.{"\n"}
        Once your family is created, you'll be able to add children, assign reminders, and manage everything from your dashboard.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="First Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="Family Name"
        value={familyName}
        onChangeText={setFamilyName}
        autoCapitalize="words"
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!isLoading}
      />
      <TextInput
        style={[styles.input, error === 'Passwords do not match.' ? styles.inputError : null]}
        placeholder="Create a Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!isLoading}
      />
      <TextInput
        style={[styles.input, error === 'Passwords do not match.' ? styles.inputError : null]}
        placeholder="Confirm Password"
        value={repeatPassword}
        onChangeText={setRepeatPassword}
        secureTextEntry
        editable={!isLoading}
      />
      {error === 'Passwords do not match.' && (
        <Text style={styles.error}>{error}</Text>
      )}
      <TouchableOpacity
        style={[styles.button, (isLoading || error === 'Passwords do not match.') && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={isLoading || error === 'Passwords do not match.'}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Family & Continue</Text>}
      </TouchableOpacity>
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
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 18,
    color: '#333',
  },
  helpText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 18,
    marginTop: -8,
    lineHeight: 22,
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
  inputError: {
    borderColor: '#ffb3b3', // light red
    backgroundColor: '#fff0f0',
  },
}); 