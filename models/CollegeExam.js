/**
 * ============================================================
 *  models/CollegeExam.js
 *  Schema for the College Exam Tracker feature.
 *
 *  Drop this file in your ./models/ directory and import it
 *  at the top of server.js:
 *
 *    import CollegeExam from "./models/CollegeExam.js";
 * ============================================================
 */

import mongoose from "mongoose";

/* ── tiny sub-schemas ─────────────────────────────────────── */

const LinkSchema = new mongoose.Schema(
    {
        label: { type: String, default: "" },   // e.g. "Unit-3 Notes", "2023 PYQ"
        url:   { type: String, required: true }
    },
    { _id: false }
);

/* ── main schema ──────────────────────────────────────────── */

const CollegeExamSchema = new mongoose.Schema(
    {
        /* ---- identity ---- */
        college:  { type: String, required: true, index: true, trim: true },
        // Store exactly as it appears in the Docs / college collections
        // (e.g. "University of Petroleum and Energy Studies,UPES")

        /* ---- exam details ---- */
        subject:     { type: String, required: true, trim: true },
        type:        {
            type:    String,
            enum:    ["midterm", "endterm", "practical", "quiz", "internal", "other"],
            default: "other"
        },
        date:        { type: Date, required: true },   // exam date (use midnight UTC)
        time:        { type: String, default: "" },    // human-readable, e.g. "10:00 AM"
        venue:       { type: String, default: "" },    // e.g. "Block-A, Room 204"
        description: { type: String, default: "" },    // extra notes shown on card

        /* ---- academic grouping (optional but useful for filtering) ---- */
        branch:   { type: String, default: "" },   // e.g. "CSE", "ECE", "All"
        year:     { type: String, default: "" },   // e.g. "1", "2", "3", "4"
        semester: { type: String, default: "" },   // e.g. "3", "ODD", "EVEN"

        /* ---- resource links ---- */
        notesLinks: { type: [LinkSchema], default: [] },
        pyqLinks:   { type: [LinkSchema], default: [] },

        /* ---- meta ---- */
        addedBy:   { type: String, default: "" },  // dev_email of who created the entry
        updatedAt: { type: Date,   default: Date.now }
    },
    {
        timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }
        // updatedAt is also in the schema so the dev can set it manually if needed
    }
);

/* ── compound index for the two most-common queries ── */
CollegeExamSchema.index({ college: 1, date: 1 });

const CollegeExam = mongoose.model("CollegeExam", CollegeExamSchema);
export default CollegeExam;