export interface Family {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: string; // User ID of the admin parent
  adminIds: string[]; // Array of parent user IDs who can manage the family
  parentIds?: string[]; // Backward compatibility: some families may use parentIds
  childrenIds: string[]; // Array of child user IDs
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