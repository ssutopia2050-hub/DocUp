import mongoose from "mongoose";
import fetch from "node-fetch";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import Docs from "./models/Docs.js";

dotenv.config();

// 🔗 Connect MongoDB
await mongoose.connect(process.env.MONGO_URI);
console.log("✅ MongoDB connected");

// ☁️ R2 client
const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

async function migrate() {
    const docs = await Docs.find({
        file_url: { $exists: true, $ne: "" }
    });

    console.log(`📦 Found ${docs.length} documents`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const doc of docs) {
        try {
            // ⏭️ Skip already migrated files
            if (doc.file_url.includes("cdn.docup.in")) {
                console.log(`⏭️ Skipped: ${doc._id}`);
                skipped++;
                continue;
            }

            console.log(`\n⬇️ Downloading: ${doc._id}`);

            // 1. Download from Supabase
            const res = await fetch(doc.file_url);
            if (!res.ok) throw new Error("Download failed");

            const buffer = await res.buffer();

            // 2. Upload to R2
            const key = `docs/${doc._id}.pdf`;

            console.log(`⬆️ Uploading to R2: ${key}`);

            await s3.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: "application/pdf",
            }));

            // 3. Update DB URL
            const newUrl = `https://cdn.docup.in/${key}`;

            doc.file_url = newUrl;
            await doc.save();

            console.log(`✅ Migrated: ${doc._id}`);

            success++;

        } catch (err) {
            console.error(`❌ Failed: ${doc._id}`, err.message);
            failed++;
        }
    }

    console.log("\n🎉 Migration complete!");
    console.log(`✅ Success: ${success}`);
    console.log(`⏭️ Skipped: ${skipped}`);
    console.log(`❌ Failed: ${failed}`);

    process.exit();
}

migrate();