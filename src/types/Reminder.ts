export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface RecurrenceConfig {
  selectedDays: string[];
  weekFrequency: number;
  startDate: Date;
  lastGenerated: Date;
}

export interface Reminder {
  id: string;
  title: string;
  checklist: ChecklistItem[];
  assignedTo: string;
  familyId: string;
  createdBy: string;
  createdAt: Date;
  dueDate: Date;
  status: 'pending' | 'completed';
  isRecurring: boolean;
  recurrenceConfig: RecurrenceConfig | null;
  updatedAt?: Date;
  snoozeCount?: number;
  lastSnoozedAt?: Date;
  completedAt?: Date;
  blocked?: boolean;
  reminderLocation?: {
    latitude: number;
    longitude: number;
    timestamp: Date;
  };
  notifyParentOnGeofenceBreach?: boolean;
} 