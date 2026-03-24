import mongoose from "mongoose";
import dotenv from "dotenv";
import Docs from "./models/docs.js";
import User from "./models/users.js";

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        const allDocs = await Docs.find({});
        let updatedCount = 0;

        for (const doc of allDocs) {
            let changed = false;

            const newComments = [];

            for (const item of (doc.comment_section || [])) {
                // already in new format
                if (item.user_id && item.comment) {
                    newComments.push({
                        user_id: item.user_id,
                        comment: item.comment,
                        createdAt: item.createdAt || new Date()
                    });
                    continue;
                }

                // old format: uploaded_by_email + comment
                if (item.uploaded_by_email && item.comment) {
                    const matchedUser = await User.findOne({
                        email: item.uploaded_by_email
                    }).select("_id");

                    if (matchedUser) {
                        newComments.push({
                            user_id: matchedUser._id,
                            comment: item.comment,
                            createdAt: item.createdAt || new Date()
                        });
                    } else {
                        console.log(
                            `No user found for email: ${item.uploaded_by_email} in doc ${doc._id}`
                        );
                    }

                    changed = true;
                    continue;
                }

                // invalid comment object, skip it
                changed = true;
            }

            // if comment_section missing entirely, normalize it
            if (!Array.isArray(doc.comment_section)) {
                changed = true;
            }

            if (changed) {
                doc.comment_section = newComments;
                await doc.save();
                updatedCount++;
                console.log(`Updated doc: ${doc._id}`);
            }
        }

        console.log(`Done. Updated documents: ${updatedCount}`);

        await mongoose.disconnect();
        console.log("Disconnected");
    } catch (err) {
        console.error("Migration error:", err);
    }
}

run();