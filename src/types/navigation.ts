import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChecklistItem } from './Reminder';

export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  Reminders: undefined;
  AddReminder: {
    cloneData?: {
      title: string;
      checklist: ChecklistItem[];
      dueDate: Date;
      assignedTo: string;
      isRecurring: boolean;
      selectedDays: string[];
      weekFrequency: number;
    };
  };
  EditReminder: {
    reminderId: string;
    canEdit?: boolean;
  };
  CompleteReminder: {
    reminderId: string;
  };
  AllCompletedReminders: undefined;
  ManageFamily: undefined;
  JoinFamily: undefined;
  CreateParentAccount: undefined;
};

export type SignInScreenProps = NativeStackScreenProps<RootStackParamList, 'SignIn'>;
export type SignUpScreenProps = NativeStackScreenProps<RootStackParamList, 'SignUp'>;
export type RemindersScreenProps = NativeStackScreenProps<RootStackParamList, 'Reminders'>;
export type AddReminderScreenProps = NativeStackScreenProps<RootStackParamList, 'AddReminder'>;
export type EditReminderScreenProps = NativeStackScreenProps<RootStackParamList, 'EditReminder'>;
export type CompleteReminderScreenProps = NativeStackScreenProps<RootStackParamList, 'CompleteReminder'>; 