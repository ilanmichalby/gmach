import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";

const adminApp = initializeApp({
  credential: cert("./service-account.json"),
  projectId: firebaseConfig.projectId,
});
const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

async function checkCount() {
  const snapshot = await adminDb.collection("items").get();
  console.log(`Current items count in Firestore: ${snapshot.size}`);
  process.exit(0);
}

checkCount();
