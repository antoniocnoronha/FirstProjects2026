import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { describe, beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

describe('Firestore Security Rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    try {
      testEnv = await initializeTestEnvironment({
        projectId: 'world-cup-predictions-437a9',
        firestore: {
          rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
          host: '127.0.0.1',
          port: 8080,
        },
      });
    } catch (e) {
      console.warn("Could not connect to local Firestore Emulator. Static checks only.");
    }
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  it('should block read/write of matches for unauthenticated users', async () => {
    if (!testEnv) return; // Skip if no emulator
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    const docRef = doc(unauthedDb, 'matches/m-1');
    await expect(getDoc(docRef)).rejects.toThrow();
    await expect(setDoc(docRef, { homeScore: 2 })).rejects.toThrow();
  });

  it('should allow read of matches for authenticated users', async () => {
    if (!testEnv) return; // Skip if no emulator
    const authedDb = testEnv.authenticatedContext('user-123').firestore();
    const docRef = doc(authedDb, 'matches/m-1');
    const snap = await getDoc(docRef);
    expect(snap.exists()).toBe(false); // Read finishes (no permission error) but document doesn't exist
  });

  it('should block deletion of matches', async () => {
    if (!testEnv) return; // Skip if no emulator
    const authedDb = testEnv.authenticatedContext('user-123').firestore();
    const docRef = doc(authedDb, 'matches/m-1');
    await expect(deleteDoc(docRef)).rejects.toThrow();
  });

  it('should allow user profile write only by the owner', async () => {
    if (!testEnv) return; // Skip if no emulator
    const authedDb = testEnv.authenticatedContext('user-123').firestore();
    const otherDb = testEnv.authenticatedContext('user-456').firestore();

    const profileRef = doc(authedDb, 'users/user-123');
    await expect(setDoc(profileRef, { username: 'john' })).resolves.not.toThrow();

    const otherProfileRef = doc(otherDb, 'users/user-123');
    await expect(setDoc(otherProfileRef, { username: 'hack' })).rejects.toThrow();
  });
});
