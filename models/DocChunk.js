import mongoose from "mongoose";

/**
 * DocChunk — one semantic chunk of extracted text from a PDF page.
 * Each chunk carries its Gemini text-embedding vector so we can do
 * cosine-similarity retrieval at query time without a dedicated vector DB.
 */
const DocChunkSchema = new mongoose.Schema(
    {
        doc_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Docs",
            required: true,
            index: true
        },
        chunk_index: {
            type: Number,
            required: true
        },
        page_number: {
            type: Number,
            required: true
        },
        section_title: {
            type: String,
            trim: true,
            default: ""
        },
        content: {
            type: String,
            required: true,
            trim: true
        },
        // Gemini embedding-004 produces 768-dimensional vectors
        embedding: {
            type: [Number],
            required: true
        },
        token_estimate: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

// Compound index so we can efficiently delete + re-insert all chunks for a doc
DocChunkSchema.index({ doc_id: 1, chunk_index: 1 });

export default mongoose.model("DocChunk", DocChunkSchema);