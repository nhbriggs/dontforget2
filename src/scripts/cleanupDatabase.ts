import { db } from '../config/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

async function cleanupDatabase() {
  console.log('🧹 Starting database cleanup...');

  // Collections to clean up
  const collections = [
    'families',
    'reminders',
    'users',
    'locations',
    'notifications'
  ];

  for (const collectionName of collections) {
    try {
      console.log(`\n🗑️ Cleaning up ${collectionName} collection...`);
      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);
      
      console.log(`📊 Found ${snapshot.size} documents in ${collectionName}`);
      
      // Delete each document
      const deletePromises = snapshot.docs.map(async (doc) => {
        await deleteDoc(doc.ref);
        console.log(`✅ Deleted ${collectionName} document: ${doc.id}`);
      });

      await Promise.all(deletePromises);
      console.log(`✨ Successfully cleaned up ${collectionName} collection`);
    } catch (error) {
      console.error(`❌ Error cleaning up ${collectionName}:`, error);
    }
  }

  console.log('\n🎉 Database cleanup completed!');
}

// Run the cleanup
cleanupDatabase().catch(console.error); 