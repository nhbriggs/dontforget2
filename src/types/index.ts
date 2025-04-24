export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'parent' | 'child';
  familyId?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'completed' | 'verified';
  createdAt: Date;
  completedAt?: Date;
  verifiedAt?: Date;
  createdBy: string; // parent's user ID
  assignedTo: string; // child's user ID
  familyId: string;
  proof?: {
    type: 'photo' | 'text';
    content: string;
  };
}

export interface Family {
  id: string;
  name: string;
  parentIds: string[];
  childrenIds: string[];
  createdAt: Date;
} 