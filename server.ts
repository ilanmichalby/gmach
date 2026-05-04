import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Airtable from "airtable";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";

dotenv.config();

// We'll use the client's firebase-applet-config.json for Project ID etc.
// But for server-side admin access, in this environment, we can often use default credentials
// or the environment variables if provided.
// Since we don't have a service account key file, we'll try to initialize with the project ID.
import firebaseConfig from "./firebase-applet-config.json";

const adminApp = initializeApp({
  credential: cert("./service-account.json"),
  projectId: firebaseConfig.projectId,
});
const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Sync from Airtable
  app.post("/api/sync-airtable", async (req, res) => {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;

    if (!apiKey) {
      return res.status(400).json({ error: "Airtable API Key missing. Please set AIRTABLE_API_KEY in Secrets." });
    }
    if (!baseId) {
      return res.status(400).json({ error: "Airtable Base ID missing. Please set AIRTABLE_BASE_ID in Secrets." });
    }
    if (!tableName) {
      return res.status(400).json({ error: "Airtable Table Name missing. Please set AIRTABLE_TABLE_NAME in Secrets." });
    }

    try {
      console.log(`Starting Airtable sync for base: ${baseId}, table: ${tableName}`);
      const base = new Airtable({ apiKey }).base(baseId);
      
      // Fetch all records
      const records = await base(tableName).select().all();

      if (!records || records.length === 0) {
        console.warn(`No records found in Airtable table: ${tableName}`);
        return res.status(404).json({ error: `לא נמצאו רשומות בטבלת Airtable: ${tableName}. וודאו ששם הטבלה מדויק.` });
      }

      const itemsCollection = adminDb.collection("items");
      let syncedCount = 0;
      let skippedCount = 0;
      
      console.log(`Found ${records.length} records in Airtable. Starting sync to Firestore...`);

      // Use chunks for batch operations (Firestore limit is 500)
      const batchSize = 400;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = adminDb.batch();
        const chunk = records.slice(i, i + batchSize);

        for (const record of chunk) {
          const fields = record.fields;
          
          // Debug the first record fields if needed
          if (syncedCount === 0 && skippedCount === 0) {
            console.log("Sample record fields found:", Object.keys(fields));
          }

          // Flexible field mapping with more Hebrew aliases
          const itemName = (
            fields["Name"] || 
            fields["שם"] || 
            fields["שם הפריט"] ||
            fields["Product"] || 
            fields["מוצר"] || 
            fields["פריט"] ||
            fields["Item"]
          ) as string;

          if (!itemName) {
            skippedCount++;
            continue;
          }

          const data: any = {
            name: itemName,
            category: (fields["category_name"] || fields["Category"] || fields["category"] || fields["קטגוריה"] || fields["סוג"] || fields["מחלקה"]) as string || "שונות",
            description: (fields["Description"] || fields["description"] || fields["תיאור"] || fields["פירוט"] || fields["תיאור מוצר"]) as string || "",
            totalQuantity: Number(fields["Total"] || fields["כמות"] || fields["Quantity"] || fields["מלאי"] || fields["סך הכל"]) || 0,
            imageUrl: (fields["Image"] as any)?.[0]?.url || 
                      (fields["image"] as any)?.[0]?.url || 
                      (fields["תמונה"] as any)?.[0]?.url || 
                      (fields["Image URL"] || fields["קישור לתמונה"] || fields["קישור"]) as string || "",
            airtableId: record.id,
            updatedAt: new Date(), // Firestore Admin SDK handles Date objects automatically
          };

          // Use Airtable record ID as the Firestore document ID for reliability and performance.
          // This avoids needing a separate index for airtableId queries.
          const docRef = itemsCollection.doc(record.id);
          batch.set(docRef, data, { merge: true });
          syncedCount++;
        }
        await batch.commit();
        console.log(`Committed batch of ${chunk.length} items.`);
      }

      const message = `סונכרנו בהצלחה ${syncedCount} מוצרים מאיירטייבל.`;
      console.log(message + (skippedCount > 0 ? ` (דולגו ${skippedCount} שורות ללא שם מוצר)` : ""));
      
      res.json({ 
        message, 
        syncedCount, 
        skippedCount,
        details: skippedCount > 0 ? `דולגו ${skippedCount} שורות כי לא נמצא בהן שם מוצר.` : undefined
      });
    } catch (error: any) {
      console.error("Airtable sync error details:", error);
      
      let errorMessage = error.message;
      if (error.message.includes("AUTHENTICATION_REQUIRED") || error.statusCode === 401) {
        errorMessage = "Airtable API Key (Personal Access Token) is invalid or expired.";
      } else if (error.message.includes("NOT_FOUND") || error.statusCode === 404) {
        errorMessage = "Airtable Base ID or Table Name not found. Please check your settings.";
      }

      res.status(500).json({ 
        error: errorMessage,
        details: error.stack?.split('\n')[0] 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
