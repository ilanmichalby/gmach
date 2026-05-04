import type { VercelRequest, VercelResponse } from '@vercel/node';
import Airtable from "airtable";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase Admin (Singleton pattern for Serverless)
function getAdminDb() {
  if (getApps().length === 0) {
    let credential;
    
    // Support for Vercel: FIREBASE_SERVICE_ACCOUNT env var
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = cert(serviceAccount);
      } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var");
      }
    } 
    
    // Fallback to local file if available
    if (!credential) {
      try {
        credential = cert("./service-account.json");
      } catch (e) {
        console.error("service-account.json not found, and FIREBASE_SERVICE_ACCOUNT env var is missing or invalid.");
      }
    }

    if (!credential) {
        throw new Error("Missing Firebase credentials. Please set FIREBASE_SERVICE_ACCOUNT env var on Vercel.");
    }

    const adminApp = initializeApp({
      credential,
      projectId: firebaseConfig.projectId,
    });
    return getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
  }
  return getFirestore(getApps()[0], firebaseConfig.firestoreDatabaseId);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;

  if (!apiKey || !baseId || !tableName) {
    return res.status(400).json({ error: "Missing Airtable environment variables." });
  }

  try {
    const adminDb = getAdminDb();
    const base = new Airtable({ apiKey }).base(baseId);
    const records = await base(tableName).select().all();

    if (!records || records.length === 0) {
      return res.status(404).json({ error: `No records found in Airtable table: ${tableName}` });
    }

    const itemsCollection = adminDb.collection("items");
    let syncedCount = 0;
    let skippedCount = 0;

    const batchSize = 400;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = adminDb.batch();
      const chunk = records.slice(i, i + batchSize);

      for (const record of chunk) {
        const fields = record.fields;
        const itemName = (fields["Name"] || fields["שם"] || fields["שם הפריט"] || fields["Product"] || fields["מוצר"] || fields["פריט"] || fields["Item"]) as string;

        if (!itemName) {
          skippedCount++;
          continue;
        }

        const data: any = {
          name: itemName,
          category: (fields["Category"] || fields["category"] || fields["קטגוריה"] || fields["סוג"] || fields["מחלקה"]) as string || "שונות",
          description: (fields["Description"] || fields["description"] || fields["תיאור"] || fields["פירוט"] || fields["תיאור מוצר"]) as string || "",
          totalQuantity: Number(fields["Total"] || fields["כמות"] || fields["Quantity"] || fields["מלאי"] || fields["סך הכל"]) || 0,
          imageUrl: (fields["Image"] as any)?.[0]?.url || (fields["image"] as any)?.[0]?.url || (fields["תמונה"] as any)?.[0]?.url || (fields["Image URL"] || fields["קישור לתמונה"] || fields["קישור"]) as string || "",
          airtableId: record.id,
          updatedAt: new Date(),
        };

        const docRef = itemsCollection.doc(record.id);
        batch.set(docRef, data, { merge: true });
        syncedCount++;
      }
      await batch.commit();
    }

    return res.json({ message: `סונכרנו בהצלחה ${syncedCount} מוצרים מאיירטייבל.`, syncedCount, skippedCount });
  } catch (error: any) {
    console.error("Airtable sync error:", error);
    return res.status(500).json({ error: error.message });
  }
}
