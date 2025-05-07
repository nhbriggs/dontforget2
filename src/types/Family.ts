export interface Family {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: string; // User ID of the admin parent
  parentIds: string[]; // Array of parent user IDs
  childrenIds: string[]; // Array of child user IDs
  subscription: {
    type: 'free' | 'paid';
    startDate: Date;
    endDate?: Date;
  };
  joinCodes?: {
    code: string;
    type: 'parent' | 'child';
    createdAt: Date;
    expiresAt: Date;
    usedBy?: string; // User ID of who used the code
  }[];
}

export interface JoinCode {
  familyId: string;
  familyName: string;
  code: string;
  type: 'parent' | 'child';
  createdAt: Date;
  expiresAt: Date;
  usedBy?: string;
} 