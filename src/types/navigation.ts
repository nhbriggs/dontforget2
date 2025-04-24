import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  Reminders: undefined;
  AddReminder: undefined;
};

export type SignInScreenProps = NativeStackScreenProps<RootStackParamList, 'SignIn'>;
export type SignUpScreenProps = NativeStackScreenProps<RootStackParamList, 'SignUp'>;
export type RemindersScreenProps = NativeStackScreenProps<RootStackParamList, 'Reminders'>;
export type AddReminderScreenProps = NativeStackScreenProps<RootStackParamList, 'AddReminder'>; 