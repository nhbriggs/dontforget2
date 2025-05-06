import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  
  const { signIn } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await signIn(email, password);
    } catch (err: any) {
      console.error('Sign in error:', err);
      let errorMessage = 'An error occurred during sign in';
      
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later';
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please use a different email or sign in.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      Alert.alert('Sign In Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setResetMessage('Please enter your email address above.');
      return;
    }
    setResetMessage('');
    try {
      await sendPasswordResetEmail(auth, email);
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
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.form}>
        <Text style={styles.title}>Welcome Back</Text>
        
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          editable={!isLoading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!isLoading}
        />

        <Text style={styles.forgotPasswordLink} onPress={handleForgotPassword}>
          Forgot my password?
        </Text>
        {resetMessage ? <Text style={styles.resetMessage}>{resetMessage}</Text> : null}

        <TouchableOpacity
          style={styles.signInButton}
          onPress={handleSignIn}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signInButtonText}>Sign In</Text>}
        </TouchableOpacity>
        <Text style={styles.orText}>or get started by ...</Text>
        <TouchableOpacity
          style={styles.joinFamilyButton}
          onPress={() => navigation.navigate('JoinFamily')}
        >
          <Text style={styles.joinFamilyButtonText}>Join Family</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.joinFamilyButton, { backgroundColor: '#FFA500', marginTop: 12 }]}
          onPress={() => navigation.navigate('CreateParentAccount')}
        >
          <Text style={styles.joinFamilyButtonText}>Create Family</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  form: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#ff3b30',
    marginBottom: 15,
    textAlign: 'center',
  },
  joinFamilyButton: {
    marginTop: 24,
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  joinFamilyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  signInButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  orText: {
    textAlign: 'center',
    color: '#888',
    fontSize: 15,
    marginVertical: 16,
    fontWeight: '500',
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