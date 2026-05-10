import type { VercelRequest, VercelResponse } from '@vercel/node';
import Airtable from "airtable";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase Admin (Singleton pattern for Serverless)
function getAdmin() {
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
      storageBucket: firebaseConfig.storageBucket
    });
    return {
      db: getFirestore(adminApp, firebaseConfig.firestoreDatabaseId),
      storage: getStorage(adminApp)
    };
  }
  
  const app = getApps()[0];
  return {
    db: getFirestore(app, firebaseConfig.firestoreDatabaseId),
    storage: getStorage(app)
  };
}

async function uploadImageToStorage(storage: any, imageUrl: string, itemId: string, fileName: string): Promise<string> {
  try {
    const bucket = storage.bucket();
    const fileExtension = fileName.split('.').pop() || 'jpg';
    const filePath = `items/${itemId}.${fileExtension}`;
    const file = bucket.file(filePath);

    // Check if file already exists to save bandwidth/time
    const [exists] = await file.exists();
    if (exists) {
      // Return the public URL if it already exists
      return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
    }

    // Download image from Airtable
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image from Airtable: ${response.statusText}`);
    
    const buffer = Buffer.from(await response.arrayBuffer());

    // Upload to Firebase Storage
    await file.save(buffer, {
      metadata: {
        contentType: response.headers.get('content-type') || 'image/jpeg',
      },
      public: true, // Make it publicly accessible
    });

    // Construct the public download URL
    // Format: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
  } catch (error) {
    console.error(`Error uploading image for item ${itemId}:`, error);
    return "";
  }
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
    const { db, storage } = getAdmin();
    const base = new Airtable({ apiKey }).base(baseId);
    const records = await base(tableName).select().all();

    if (!records || records.length === 0) {
      return res.status(404).json({ error: `No records found in Airtable table: ${tableName}` });
    }

    const itemsCollection = db.collection("items");
    let syncedCount = 0;
    let skippedCount = 0;
    let imageUploadCount = 0;
    const MAX_ITEMS_PER_RUN = 5; // הגבלה כדי למנוע Timeout ב-Vercel

    for (const record of records) {
      if (syncedCount >= MAX_ITEMS_PER_RUN) break;

      const fields = record.fields;
      const itemName = (fields["Name"] || fields["שם"] || fields["שם הפריט"] || fields["Product"] || fields["מוצר"] || fields["פריט"] || fields["Item"]) as string;

      if (!itemName) {
        skippedCount++;
        continue;
      }

      // Check if already synced and has image
      const docRef = itemsCollection.doc(record.id);
      const docSnap = await docRef.get();
      const existingData = docSnap.exists ? docSnap.data() : null;

      // Skip if already has a firebase storage image
      if (existingData?.imageUrl?.includes('firebasestorage.googleapis.com')) {
        skippedCount++;
        continue;
      }

      // Handle Image
      const airtableImage = (fields["Image"] as any)?.[0] || (fields["image"] as any)?.[0] || (fields["תמונה"] as any)?.[0];
      let imageUrl = "";

      if (airtableImage?.url) {
        imageUrl = await uploadImageToStorage(storage, airtableImage.url, record.id, airtableImage.filename || "image.jpg");
        if (imageUrl) imageUploadCount++;
      } else {
        imageUrl = (fields["Image URL"] || fields["קישור לתמונה"] || fields["קישור"]) as string || "";
      }

      const categoryRaw = (fields["Category"] || fields["category"] || fields["קטגוריה"] || fields["סוג"] || fields["מחלקה"]) as any;
      const category = (Array.isArray(categoryRaw) ? categoryRaw[0] : categoryRaw)?.toString().trim() || "שונות";

      const data: any = {
        name: itemName,
        category,
        description: (fields["Description"] || fields["description"] || fields["תיאור"] || fields["פירוט"] || fields["תיאור מוצר"]) as string || "",
        totalQuantity: Number(fields["Total"] || fields["כמות"] || fields["Quantity"] || fields["מלאי"] || fields["סך הכל"]) || 0,
        imageUrl: imageUrl,
        airtableId: record.id,
        updatedAt: new Date(),
      };

      await docRef.set(data, { merge: true });
      syncedCount++;
    }

    const remaining = records.length - (syncedCount + skippedCount);
    let message = `סונכרנו בהצלחה ${syncedCount} מוצרים.`;
    if (remaining > 0) {
      message += ` נשארו עוד ${remaining} מוצרים לסנכרן. לחץ שוב על סנכרון כדי להמשיך.`;
    } else {
      message = `הסנכרון הושלם! כל ${records.length} המוצרים מעודכנים עם תמונות קבועות.`;
    }

    return res.json({ 
      message, 
      syncedCount, 
      skippedCount,
      imageUploadCount,
      isFinished: remaining <= 0
    });
  } catch (error: any) {
    console.error("Airtable sync error:", error);
    return res.status(500).json({ error: error.message });
  }
}
