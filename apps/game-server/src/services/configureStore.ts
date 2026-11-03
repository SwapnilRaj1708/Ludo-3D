import { env } from '../config/env.js';
import { logger } from './logger.js';
import { setMatchStore } from './matchStore.js';

/** Uses Firestore when Firebase is configured; otherwise summaries are only logged. */
export async function configureMatchStore() {
  if (!env().FIREBASE_PROJECT_ID) {
    logger.info({}, 'FIREBASE_PROJECT_ID not set: match summaries will be logged, not stored');
    return;
  }
  const { FirestoreMatchStore } = await import('./firestoreMatchStore.js');
  setMatchStore(await FirestoreMatchStore.create());
  logger.info({}, 'match summaries persisted to Firestore');
}
