import mongoose from "mongoose";

const extractedPageSchema = new mongoose.Schema({
    page: { type: Number, required: true },
    text: { type: String, default: "" }
}, { _id: false });

const pageSummarySchema = new mongoose.Schema({
    page: { type: Number, required: true },
    short_summary: { type: String, default: "" },
    detailed_explanation: { type: String, default: "" },
    key_points: { type: [String], default: [] },
    difficult_terms: { type: [String], default: [] }
}, { _id: false });

const docAiSchema = new mongoose.Schema({
    doc_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Docs",
        required: true,
        unique: true
    },
    extracted_pages: {
        type: [extractedPageSchema],
        default: []
    },
    page_summaries: {
        type: [pageSummarySchema],
        default: []
    },
    full_summary: {
        type: String,
        default: ""
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model("DocAI", docAiSchema);