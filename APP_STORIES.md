# I Won't Forget - App Stories & Functionality

## Core Features

### 1. User Management & Authentication
- [x] User registration and authentication
- [x] Family-based user organization (parents and children)
- [x] User roles (parent/child) with different permissions
- [x] Family group creation and management

#### Business Rules
- Users must have a valid email address for registration
- Each user must be assigned a role (parent or child)
- A family must have at least one parent
- Children can only be added to a family by a parent
- Users can only belong to one family at a time
- Family members can only view and interact with reminders within their family

### 2. Reminder Management
- [x] Create new reminders with title and due date
- [x] Assign reminders to family members
- [x] Add checklist items to reminders
- [x] Edit existing reminders
- [x] Delete reminders
- [x] View reminders in a list format
- [x] Filter reminders by status (pending/completed)
- [x] Recurring reminders with configurable:
  - [x] Selected days
  - [x] Week frequency
  - [x] Start date

#### Business Rules
- Reminders must have a title
- Reminders must have a due date in the future
- Reminders must be assigned to a family member
- Only parents can create reminders for children
- Children can only create reminders for themselves
- Recurring reminders:
  - Must have at least one selected day
  - Week frequency must be between 1 and 52
  - Start date must be in the future
- Checklist items are optional
- Reminders can be edited until they are completed
- Only the creator or assignee can complete a reminder
- Completed reminders cannot be edited
- Reminders are sorted by due date (ascending)
- Reminders can be filtered by:
  - Status (pending/completed)
  - Assigned to (self/others)
  - Date range

### 3. Notification System
- [x] Time-based notifications for reminder due dates
- [x] Pre-location notifications (3, 2, 1 minutes before due time)
- [x] Completion notifications for parents
- [x] Role-based notification handling:
  - [x] Parents receive completion notifications
  - [x] Children receive due notifications
- [x] Notification persistence across app restarts
- [x] Cross-device notification management via Firestore

#### Business Rules
- Notifications are role-based:
  - Parents receive notifications when:
    - A child completes a reminder they created
    - A child moves away from a reminder location (if enabled)
  - Children receive notifications when:
    - A reminder is due
    - Pre-location notifications (3, 2, 1 minutes before)
    - Movement detection alerts
- Pre-location notifications:
  - Sent 3, 2, and 1 minute before due time
  - Allow setting location before reminder is due
  - Can be cancelled if location is set early
- Due notifications:
  - Include reminder title and due time
  - Can be snoozed (configurable limit)
  - Trigger location capture if enabled
- Completion notifications:
  - Sent to all parents in the family
  - Include completer's name and reminder title
  - Delayed by 30 seconds to prevent notification spam
- Notification persistence:
  - Stored in Firestore for cross-device sync
  - Cancelled when reminder is completed
  - Updated when reminder is edited

### 4. Location Features
- [x] Location capture for reminders
- [x] Location permission handling (foreground/background)
- [x] Location tracking for reminders
- [x] Movement detection (20-meter threshold)
- [x] Location-based notifications
- [x] Location storage in Firestore

#### Business Rules
- Location permissions:
  - Required for both foreground and background
  - Must be granted before location features can be used
  - Can be requested at any time
- Location capture:
  - Optional for each reminder
  - Can be set when creating/editing reminder
  - Can be set via pre-location notification
  - Stored with timestamp in Firestore
- Location tracking:
  - Active only for reminders with location set
  - Checks every 10 seconds
  - Updates if moved more than 5 meters
- Movement detection:
  - Triggers at 20-meter threshold
  - Sends immediate notification
  - Stops tracking after movement detected
- Location data:
  - Includes latitude, longitude, and timestamp
  - Stored in Firestore with reminder
  - Accessible to all family members
  - Can be used for future geofencing

### 5. Data Management
- [x] Firestore integration for data persistence
- [x] Real-time data synchronization
- [x] Efficient data indexing for queries
- [x] Secure data access rules

#### Business Rules
- Data Structure:
  - Users collection: user profiles and roles
  - Families collection: family groups and members
  - Reminders collection: all reminder data
- Indexing:
  - Reminders indexed by:
    - assignedTo + createdAt
    - familyId + createdAt
- Security Rules:
  - Users can only read/write their own data
  - Family members can only access their family's data
  - Reminders are only accessible to family members
  - Location data is only accessible to family members
- Real-time Updates:
  - Reminder status changes
  - Family member updates
  - Notification changes
  - Location updates

## Technical Implementation Details

### Notification Service
- Handles all notification scheduling and management
- Manages notification permissions
- Implements role-based notification logic
- Handles notification responses and navigation
- Manages notification queues for due and completion notifications

### Location Service
- Manages location permissions
- Handles location tracking
- Implements movement detection
- Stores location data in Firestore
- Manages location-based notifications

### Data Models
- Reminder model with comprehensive properties
- User model with role-based permissions
- Family model for group management
- Location data model for reminder locations

## Security & Permissions
- [x] Secure Firestore rules implementation
- [x] Role-based access control
- [x] Family-based data isolation
- [x] Location permission handling
- [x] Notification permission management

## Future Enhancements (Planned)
- [ ] Video and AI functionality for reminder completion
- [ ] PIN code authentication for quick access
- [ ] Geofence breach notifications for parents
- [ ] Location map visualization in reminder list
- [ ] Enhanced location pinning interface

## Testing Considerations
1. User Authentication
   - Registration flow
   - Login flow
   - Role-based access

2. Reminder Management
   - CRUD operations
   - Recurring reminder logic
   - Assignment functionality

3. Notification System
   - Time-based notifications
   - Pre-location notifications
   - Role-based notification delivery
   - Cross-device notification handling

4. Location Features
   - Permission handling
   - Location capture
   - Movement detection
   - Location-based notifications

5. Data Management
   - Firestore operations
   - Real-time updates
   - Data consistency
   - Security rules

## Performance Considerations
- Efficient Firestore queries
- Optimized notification scheduling
- Background location tracking
- Cross-device synchronization
- Real-time updates handling 