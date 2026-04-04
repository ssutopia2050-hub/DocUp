import mongoose from "mongoose";

const reports = new mongoose.Schema({
 reported_by_email: {
    type: String,
    required: true,
    trim: true,
 },
 report: {
    type: String,
    required: true,
    trim: true,
 },
 createdAt: {
    type: Date,
    default: Date.now
 },
 doc_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Docs",
    required: true,
 },
   
});

export default mongoose.model("reports", reports);