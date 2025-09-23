import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtPSCkhqwUYwLtjRnB8WciqZKvPz8TakE",
  authDomain: "baby-shower-game-a2858.firebaseapp.com",
  databaseURL: "https://baby-shower-game-a2858-default-rtdb.firebaseio.com",
  projectId: "baby-shower-game-a2858",
  storageBucket: "baby-shower-game-a2858.firebasestorage.app",
  messagingSenderId: "323912064205",
  appId: "1:323912064205:web:d9ae8e7b7f3e5545c35d84",
};

let app: any = null;
let db: any = null;

export function ensureFirebase() {
  if (db) return db;
  try {
    app = initializeApp(FIREBASE_CONFIG);
    db = getDatabase(app);
    return db;
  } catch {
    return null;
  }
}

export { db };