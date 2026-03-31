import mongoose from "mongoose";

const docs_view_data = new mongoose.Schema({
    email: String,
    DocViewedAt:{
        type:Date,
        default:Date.now
    }
});

export default mongoose.model("docs_view_data", docs_view_data);