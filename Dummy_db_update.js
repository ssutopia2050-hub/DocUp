import mongoose from "mongoose";
import dotenv from "dotenv";
import Docs from "./models/Docs.js";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

await Docs.updateMany(
    { likes: { $exists: false } },
    { $set: { likes: 0 } }
);

await Docs.updateMany(
    { dislikes: { $exists: false } },
    { $set: { dislikes: 0 } }
);

await Docs.updateMany(
    { comment_section: { $exists: false } },
    { $set: { comment_section: [] } }
);
await Docs.updateMany(
    { liked_by: { $exists: false } },
    { $set: { liked_by: [] } }
);
await Docs.updateMany(
    { disliked_by: { $exists: false } },
    { $set: { disliked_by: [] } }
);

console.log("Old docs updated successfully");
await mongoose.disconnect();