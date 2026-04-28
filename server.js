import express from 'express';
import dotenv from "dotenv";
import user_profile from "./models/users.js";
import college from "./models/college.js";
import Docs from "./models/Docs.js";
import LoginData from "./models/login_data.js";
import docs_view_data from "./models/docs_view_data.js";
import ChatMessage from "./models/chatMessage.js";
import DocAI from "./models/DocAI.js";
import DocChunk from "./models/DocChunk.js";
import reports from "./models/Reports.js"
import Contact from "./models/contacts.js";
import emailjs from "@emailjs/nodejs";
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";
import MongoStore from "connect-mongo";
import { createClient } from "@supabase/supabase-js";
import path from "path";
const app = express();
const port = process.env.PORT || 5000;
import connectDB from "./config/db.js";
import session from "express-session";
import crypto from "crypto";
import Razorpay from "razorpay";
import paymentOrder from "./models/paymentOrder.js";
import passport from "passport";
import cors from "cors";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Resend } from "resend";
import http from "http";
import { Server } from "socket.io";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { promisify } from "util";
import { UAParser } from "ua-parser-js";
import Fuse from "fuse.js";
dotenv.config();
const resend = new Resend(process.env.RESEND_API_KEY);
const upload = multer({dest:"uploads/"});import { execFile } from "child_process";
import os from "os";
/******************************
 Middleware
 ******************************/
app.set("view engine", "ejs");
app.set("views", "./views");
const SUBSCRIPTION_PLANS = {
    essential_monthly: {
        label: "Prep",
        amount: 99,
        docscore: 100,
        period: "monthly",
        interval: 1
    },
    standard_monthly: {
        label: "Crack",
        amount: 149,
        docscore:200,
        period: "monthly",
        interval: 1
    },
    power_monthly: {
        label: "Topper",
        amount: 250,
        docscore: 300,
        period: "monthly",
        interval: 1
    }
};
app.post("/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
        const signature = req.headers["x-razorpay-signature"];
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(req.body)
            .digest("hex");

        if (signature !== expectedSignature) {
            return res.status(400).send("Invalid signature");
        }

        const event = JSON.parse(req.body.toString());
        console.log("Razorpay webhook event:", event.event);

        if (event.event === "invoice.paid") {
            const invoice = event.payload?.invoice?.entity;
            if (!invoice || !invoice.subscription_id) {
                return res.status(200).send("OK");
            }

            const user = await user_profile.findOne({
                subscription_id: invoice.subscription_id
            });

            if (!user) {
                console.log("No user found for subscription:", invoice.subscription_id);
                return res.status(200).send("OK");
            }

            const planKey = user.subscription_plan_key;
            const selectedPlan = SUBSCRIPTION_PLANS[planKey];

            if (!selectedPlan) {
                console.log("No matching plan found for user:", user.email);
                return res.status(200).send("OK");
            }

            const alreadyCredited = Array.isArray(user.payment_history)
                ? user.payment_history.some(entry => entry.order_id === invoice.id)
                : false;

            if (!alreadyCredited) {
                await user_profile.findOneAndUpdate(
                    { email: user.email },
                    {
                        $inc: { Doc_score: selectedPlan.docscore },
                        $set: {
                            subscription: selectedPlan.label,
                            subscription_status: "ACTIVE",
                            subscription_id: invoice.subscription_id
                        },
                        $push: {
                            payment_history: {
                                order_id: invoice.id,
                                payment_id: invoice.payment_id || "",
                                amount: selectedPlan.amount,
                                plan: selectedPlan.label,
                                docscore_added: selectedPlan.docscore,
                                status: "SUCCESS",
                                date: new Date()
                            },
                            notifications: {
                                email: user.email,
                                content: `Subscription renewed 🎉 +${selectedPlan.docscore} DocScore added for ${selectedPlan.label}`
                            }
                        }
                    }
                );
            }
        }

        if (event.event === "payment.failed") {
            const payment = event.payload?.payment?.entity;
            const subscriptionId = payment?.subscription_id;

            if (subscriptionId) {
                const user = await user_profile.findOne({
                    subscription_id: subscriptionId
                });

                if (user) {
                    await user_profile.findOneAndUpdate(
                        { email: user.email },
                        {
                            $set: { subscription_status: "PAST_DUE" },
                            $push: {
                                notifications: {
                                    email: user.email,
                                    content: "Subscription payment failed ❌ Please update your payment method."
                                }
                            }
                        }
                    );
                }
            }
        }

        if (event.event === "subscription.cancelled") {
            const subscription = event.payload?.subscription?.entity;

            if (subscription?.id) {
                const user = await user_profile.findOne({
                    subscription_id: subscription.id
                });

                if (user) {
                    await user_profile.findOneAndUpdate(
                        { email: user.email },
                        {
                            $set: {
                                subscription_status: "CANCELLED",
                                subscription_id: subscription.id
                            },
                            $push: {
                                notifications: {
                                    email: user.email,
                                    content: "Your subscription has been cancelled."
                                }
                            }
                        }
                    );
                }
            }
        }

        if (event.event === "subscription.charged") {
            console.log("subscription.charged:", event.payload?.subscription?.entity?.id);
        }

        return res.status(200).send("OK");
    } catch (err) {
        console.error("Webhook error:", err);
        return res.status(500).send("Server error");
    }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: "sessions",
        ttl: 24 * 60 * 60
    }),
    cookie: {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
});

app.use(sessionMiddleware);
app.use((req, res, next) => {
    if (req.headers.host === "docup.in") {
        return res.redirect(301, "https://www.docup.in" + req.url);
    }
    next();
});
app.get("/health", (req, res) => {
    res.status(200).send("OK");
});
app.use(express.static("public", {
    maxAge: "7d"
}));
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ── Gemini (vision + embeddings + Q&A) ──────────────────────────────────────
const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Vision model — processes page images, extracts structured academic text
const geminiVisionModel = geminiClient.getGenerativeModel({
    model: "gemini-1.5-flash-8b"
});

// Embedding model — text-embedding-004, 768-dim
const geminiEmbeddingModel = geminiClient.getGenerativeModel({
    model: "text-embedding-004"
});

// Flash model for Q&A (fast, cheap, great for RAG)
const geminiFlashModel = geminiClient.getGenerativeModel({
    model: "gemini-1.5-flash-8b"
});

// Promisify the already-imported execFile for PDF→image conversion
const execFileAsync = promisify(execFile);
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
app.use(passport.initialize());
app.use(passport.session());


passport.serializeUser((user, done) => {
    done(null, user.email);
});

passport.deserializeUser(async (email, done) => {
    try {
        const user = await user_profile.findOne({ email });
        done(null, user || null);
    } catch (err) {
        done(err, null);
    }
});
passport.use(new GoogleStrategy(
    {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value?.trim().toLowerCase();
            const name = profile.displayName?.trim() || "DocUp User";
            const avatar = profile.photos?.[0]?.value || "/images/default-avatar.png";

            if (!email) {
                return done(new Error("Google email not found"), null);
            }

            const existingUser = await user_profile.findOne({ email });

            if (existingUser) {
                return done(null, existingUser);
            }

            return done(null, {
                email,
                name,
                avatar,
                googleAuthTemp: true
            });
        } catch (err) {
            console.log("Google Strategy Error:", err);
            return done(err, null);
        }
    }
));
function getWelcomeTemplate(name = "there") {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Welcome to DocUp</title>
    </head>
    <body style="margin:0; padding:0; background-color:#0b0f14; font-family:Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0; background-color:#0b0f14;">
        <tr>
          <td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background:#121821; border-radius:16px; padding:32px; box-shadow:0 10px 40px rgba(0,0,0,0.4);">
              
              <tr>
                <td style="color:#ff6a00; font-size:22px; font-weight:bold; letter-spacing:1px;">
                  DocUp
                </td>
              </tr>

              <tr><td height="20"></td></tr>

              <tr>
                <td style="color:#ffffff; font-size:22px; font-weight:700; line-height:1.4;">
                  Welcome to DocUp, ${name} 👋
                </td>
              </tr>

              <tr>
                <td>
                  <div style="height:1px; background:rgba(255,255,255,0.06); margin:16px 0;"></div>
                </td>
              </tr>

              <tr>
                <td style="color:#9fb0c3; font-size:14px; line-height:1.8;">
                  You’re now inside <span style="color:#ff6a00; font-weight:600;">DocUp</span> — a space built for students to access, share, and grow through quality academic resources.
                  <br><br>
                  Start exploring documents, upload your own, and build your <span style="color:#ff6a00; font-weight:600;">DocScore</span>.
                  <br><br>
                  <span style="color:#ff6a00; font-weight:600;">+5 DocScore</span> added to your account to get started.
                  <br><br>
                  <span style="color:#5f6b7a; font-size:12px;">
                    Built for students who actually want better notes.
                  </span>
                </td>
              </tr>

              <tr><td height="24"></td></tr>

              <tr>
                <td align="center">
                  <a
                    href="https://www.docup.in/dashboard"
                    style="background:linear-gradient(90deg,#ff6a00,#ff9a00); box-shadow:0 6px 20px rgba(255,106,0,0.25); color:#ffffff; text-decoration:none; padding:12px 26px; border-radius:999px; font-size:14px; font-weight:700; display:inline-block;"
                  >
                    Go to Dashboard →
                  </a>
                </td>
              </tr>

              <tr><td height="28"></td></tr>

              <tr>
                <td style="color:#5f6b7a; font-size:12px; text-align:center; line-height:1.7;">
                  If this wasn’t you, you can safely ignore this email.
                  <br><br>
                  © 2026 DocUp • Built for students
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

async function sendWelcomeEmail(userEmail, userName) {
    const { data, error } = await resend.emails.send({
        from: "DocUp <hello@mail.docup.in>",
        to: [userEmail],
        subject: "Welcome to DocUp 👋",
        html: getWelcomeTemplate(userName),
        replyTo: "docup.ltd@gmail.com"
    });

    if (error) {
        console.error("Resend welcome email error:", error);
        throw new Error(error.message || "Failed to send welcome email");
    }

    return data;
}
function getRechargeSuccessTemplate({
                                        name = "there",
                                        planLabel = "DocScore Recharge",
                                        amount = 0,
                                        docscoreAdded = 0,
                                        orderId = "",
                                        paymentId = "",
                                        date = new Date()
                                    }) {
    const formattedDate = new Date(date).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
    });

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>DocUp Recharge Successful</title>
    </head>
    <body style="margin:0; padding:0; background-color:#0b0f14; font-family:Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0; background-color:#0b0f14;">
        <tr>
          <td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background:#121821; border-radius:16px; padding:32px; box-shadow:0 10px 40px rgba(0,0,0,0.4);">
              
              <tr>
                <td style="color:#ff6a00; font-size:22px; font-weight:bold; letter-spacing:1px;">
                  DocUp
                </td>
              </tr>

              <tr><td height="20"></td></tr>

              <tr>
                <td style="color:#ffffff; font-size:22px; font-weight:700; line-height:1.4;">
                  Recharge Successful, ${name} 🎉
                </td>
              </tr>

              <tr>
                <td>
                  <div style="height:1px; background:rgba(255,255,255,0.06); margin:16px 0;"></div>
                </td>
              </tr>

              <tr>
                <td style="color:#9fb0c3; font-size:14px; line-height:1.8;">
                  Your DocScore recharge was successful and has been added to your account.
                  <br><br>
                  You can now continue exploring documents on <span style="color:#ff6a00; font-weight:600;">DocUp</span>.
                </td>
              </tr>

              <tr><td height="22"></td></tr>

              <tr>
                <td>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f141c; border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:18px;">
                    <tr>
                      <td style="color:#5f6b7a; font-size:12px; padding:8px 0;">Plan</td>
                      <td align="right" style="color:#ffffff; font-size:13px; padding:8px 0; font-weight:600;">${planLabel}</td>
                    </tr>
                    <tr>
                      <td style="color:#5f6b7a; font-size:12px; padding:8px 0;">Amount Paid</td>
                      <td align="right" style="color:#ffffff; font-size:13px; padding:8px 0; font-weight:600;">₹${amount}</td>
                    </tr>
                    <tr>
                      <td style="color:#5f6b7a; font-size:12px; padding:8px 0;">DocScore Added</td>
                      <td align="right" style="color:#ff6a00; font-size:13px; padding:8px 0; font-weight:700;">+${docscoreAdded}</td>
                    </tr>
                    <tr>
                      <td style="color:#5f6b7a; font-size:12px; padding:8px 0;">Order ID</td>
                      <td align="right" style="color:#ffffff; font-size:13px; padding:8px 0;">${orderId}</td>
                    </tr>
                    <tr>
                      <td style="color:#5f6b7a; font-size:12px; padding:8px 0;">Payment ID</td>
                      <td align="right" style="color:#ffffff; font-size:13px; padding:8px 0;">${paymentId}</td>
                    </tr>
                    <tr>
                      <td style="color:#5f6b7a; font-size:12px; padding:8px 0;">Date</td>
                      <td align="right" style="color:#ffffff; font-size:13px; padding:8px 0;">${formattedDate}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr><td height="24"></td></tr>

              <tr>
                <td align="center">
                  <a
                    href="https://www.docup.in/profile"
                    style="background:linear-gradient(90deg,#ff6a00,#ff9a00); box-shadow:0 6px 20px rgba(255,106,0,0.25); color:#ffffff; text-decoration:none; padding:12px 26px; border-radius:999px; font-size:14px; font-weight:700; display:inline-block;"
                  >
                    View Profile →
                  </a>
                </td>
              </tr>

              <tr><td height="28"></td></tr>

              <tr>
                <td style="color:#5f6b7a; font-size:12px; text-align:center; line-height:1.7;">
                  If you did not make this payment, please reply to this email immediately.
                  <br><br>
                  © 2026 DocUp • Built for students
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

async function sendRechargeSuccessEmail(userEmail, userName, rechargeData) {
    const { data, error } = await resend.emails.send({
        from: "DocUp <hello@mail.docup.in>",
        to: [userEmail],
        subject: "DocUp Recharge Successful 🎉",
        html: getRechargeSuccessTemplate({
            name: userName,
            ...rechargeData
        }),
        replyTo: "docup.ltd@gmail.com"
    });

    if (error) {
        console.error("Resend recharge email error:", error);
        throw new Error(error.message || "Failed to send recharge email");
    }

    return data;
}
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});
let collegesList = [];
function sanitizeFilePart(value = "") {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "");
}
fs.createReadStream("College_data.csv")
    .pipe(csv())
    .on("data", (row)=>{
        if(row.College_Name){
            collegesList.push(row.College_Name.trim());
        }
    })
    .on("end", ()=>{
        collegesList = [...new Set(collegesList)].sort();
        console.log("Colleges Loaded :", collegesList.length);
    });
app.use(cors({
    origin: true,
    credentials: true
}));
const server = http.createServer(app);
/*
 * ═══════════════════════════════════════════════════════════════════
 *  GEMINI AI PIPELINE  —  Production RAG for DocUp
 *  Steps: PDF→Images → Gemini Vision OCR → Chunking → Embeddings
 *         → MongoDB storage → Cosine-similarity retrieval → Q&A
 * ═══════════════════════════════════════════════════════════════════
 */

// ── In-memory processing cache (doc_id → true) ──────────────────────────────
const processingCache = new Map();   // currently being processed
const processedCache  = new Set();   // already has embeddings this server lifetime

// ── 1. Auth guard helper (unchanged contract) ────────────────────────────────
async function getAuthorizedDoc(req, docId) {
    if (!req.session?.email) throw new Error("Unauthorized");
    const doc = await Docs.findById(docId);
    if (!doc) throw new Error("Document not found");
    return doc;
}

// ── 2. Download PDF buffer from Supabase/CDN URL ────────────────────────────
async function getPdfBufferFromExistingUrl(doc) {
    if (!doc?.file_url) throw new Error("PDF URL missing");
    const response = await fetch(doc.file_url);
    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

// ── 3. PDF → PNG images via pdf-poppler (one image per page) ─────────────────

async function convertPdfToImages(pdfBuffer) {
    const tmpDir   = await fs.promises.mkdtemp(path.join(os.tmpdir(), "docup-"));
    const pdfPath  = path.join(tmpDir, "doc.pdf");
    const outPrefix = path.join(tmpDir, "page");

    await fs.promises.writeFile(pdfPath, pdfBuffer);

    try {
        // pdftoppm ships with poppler-utils (apt install poppler-utils)
        // -r 200  → 200 DPI — good balance between OCR quality and payload size
        // -png    → lossless
        await execFileAsync("pdftoppm", [
            "-r", "200",
            "-png",
            pdfPath,
            outPrefix
        ]);
    } catch (err) {
        throw new Error(`pdf→image conversion failed: ${err.message}`);
    }

    const files = (await fs.promises.readdir(tmpDir))
        .filter(f => f.startsWith("page") && f.endsWith(".png"))
        .sort(); // pdftoppm numbers pages: page-1.png, page-2.png, …

    const images = await Promise.all(
        files.map(async (fname, idx) => {
            const imgPath = path.join(tmpDir, fname);
            const data    = await fs.promises.readFile(imgPath);
            return { pageNumber: idx + 1, base64: data.toString("base64"), mimeType: "image/png" };
        })
    );

    // Clean up tmp dir (non-blocking)
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    return images;
}

// ── 4. Gemini Vision — extract structured text from one page image ────────────
const VISION_PROMPT = `You are an expert academic note processor.
Extract clean, structured study notes from this handwritten or scanned page.

Rules:
- Convert to clear readable text
- Preserve headings and subheadings
- Convert content into bullet points where possible
- Keep formulas exactly as written
- Do NOT summarize
- Do NOT skip content
- Maintain logical structure

Return ONLY valid JSON, no markdown fences:
{
  "title": "string",
  "content": "string",
  "key_points": ["string"],
  "formulas": ["string"]
}`;

async function extractPageWithGemini(imageBase64, mimeType) {
    const result = await geminiVisionModel.generateContent([
        {
            inlineData: { data: imageBase64, mimeType }
        },
        VISION_PROMPT
    ]);

    let raw = result.response.text().trim();

    // Strip markdown code fences if model ignores the "no fences" instruction
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    try {
        return JSON.parse(raw);
    } catch {
        // Fallback: treat entire response as content so we never lose data
        return { title: "", content: raw, key_points: [], formulas: [] };
    }
}

// ── 5. Process all pages in parallel (bounded concurrency = 5) ───────────────
async function processAllPagesWithGemini(images) {
    const CONCURRENCY = 5;
    const results = [];

    for (let i = 0; i < images.length; i += CONCURRENCY) {
        const batch = images.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(
            batch.map(img => extractPageWithGemini(img.base64, img.mimeType)
                .then(parsed => ({ pageNumber: img.pageNumber, ...parsed }))
            )
        );
        for (const r of settled) {
            if (r.status === "fulfilled") results.push(r.value);
            else console.error("Page extraction failed:", r.reason?.message);
        }
    }

    return results.sort((a, b) => a.pageNumber - b.pageNumber);
}

// ── 6. Text cleaning ─────────────────────────────────────────────────────────
function cleanExtractedText(text = "") {
    return text
        .replace(/[ \t]{2,}/g, " ")          // collapse horizontal whitespace
        .replace(/\n{3,}/g, "\n\n")           // collapse excessive newlines
        .replace(/[^\S\n]+$/gm, "")           // trailing spaces per line
        .trim();
}

// ── 7. Chunking (500–800 tokens, sentence-aware, 50-token overlap) ───────────
const AVG_CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_TOKENS = 650;
const OVERLAP_TOKENS       = 50;
const TARGET_CHARS         = TARGET_CHUNK_TOKENS * AVG_CHARS_PER_TOKEN;
const OVERLAP_CHARS        = OVERLAP_TOKENS       * AVG_CHARS_PER_TOKEN;

function splitIntoSentences(text) {
    // Split on sentence-ending punctuation followed by whitespace or end-of-string
    return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

function chunkPageContent(pageData, globalChunkIndex) {
    const fullText = [
        pageData.title ? `# ${pageData.title}` : "",
        cleanExtractedText(pageData.content),
        pageData.key_points?.length
            ? "Key Points:\n" + pageData.key_points.map(p => `• ${p}`).join("\n")
            : "",
        pageData.formulas?.length
            ? "Formulas:\n" + pageData.formulas.map(f => `  ${f}`).join("\n")
            : ""
    ].filter(Boolean).join("\n\n");

    const sentences = splitIntoSentences(fullText);
    const chunks    = [];
    let   buffer    = [];
    let   bufLen    = 0;
    let   chunkIdx  = globalChunkIndex;

    function flush(overlap = []) {
        const content = buffer.join(" ").trim();
        if (!content) return;

        chunks.push({
            chunk_index:   chunkIdx++,
            page_number:   pageData.pageNumber,
            section_title: pageData.title || "",
            content,
            token_estimate: Math.ceil(content.length / AVG_CHARS_PER_TOKEN)
        });

        // Build next buffer from overlap sentences
        buffer = [...overlap];
        bufLen  = overlap.reduce((acc, s) => acc + s.length, 0);
    }

    for (const sentence of sentences) {
        if (bufLen + sentence.length > TARGET_CHARS && buffer.length > 0) {
            // Compute overlap: walk backwards collecting ~OVERLAP_CHARS
            let overlapLen = 0;
            const overlapSentences = [];
            for (let i = buffer.length - 1; i >= 0; i--) {
                overlapLen += buffer[i].length;
                overlapSentences.unshift(buffer[i]);
                if (overlapLen >= OVERLAP_CHARS) break;
            }
            flush(overlapSentences);
        }
        buffer.push(sentence);
        bufLen += sentence.length;
    }

    if (buffer.length) flush();

    return { chunks, nextIndex: chunkIdx };
}

// ── 8. Embed a single text string via Gemini text-embedding-004 ───────────────
async function embedText(text) {
    const result = await geminiEmbeddingModel.embedContent({
        content:  { parts: [{ text }], role: "user" },
        taskType: "RETRIEVAL_DOCUMENT"
    });
    return result.embedding.values; // Float32Array → number[]
}

// ── 9. Embed a query string (different taskType for retrieval) ────────────────
async function embedQuery(text) {
    const result = await geminiEmbeddingModel.embedContent({
        content:  { parts: [{ text }], role: "user" },
        taskType: "RETRIEVAL_QUERY"
    });
    return result.embedding.values;
}

// ── 10. Batch embed all chunks (bounded concurrency = 10) ────────────────────
async function embedAllChunks(chunks) {
    const CONCURRENCY = 10;
    const results = [];

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(
            batch.map(chunk => embedText(chunk.content))
        );
        for (let j = 0; j < batch.length; j++) {
            const r = settled[j];
            results.push({
                ...batch[j],
                embedding: r.status === "fulfilled" ? r.value : []
            });
        }
    }

    return results;
}

// ── 11. Cosine similarity ─────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
    if (!a?.length || !b?.length || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot   += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

// ── 12. Retrieve top-k chunks by embedding similarity ────────────────────────
async function retrieveTopChunks(docId, queryEmbedding, topK = 5) {
    // Fetch all chunks for this doc (embeddings included)
    const allChunks = await DocChunk.find({ doc_id: docId }).lean();

    if (!allChunks.length) return [];

    return allChunks
        .map(chunk => ({
            ...chunk,
            score: cosineSimilarity(queryEmbedding, chunk.embedding)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}

// ── 13. Master pipeline — extract → chunk → embed → store ────────────────────
async function runFullPipeline(doc) {
    const docId = String(doc._id);

    // Already being processed — skip to avoid duplicate work
    if (processingCache.has(docId)) {
        return DocAI.findOne({ doc_id: doc._id });
    }

    processingCache.set(docId, true);

    try {
        console.log(`[DocAI] Pipeline start: ${docId}`);

        // Step A: Download PDF
        const pdfBuffer = await getPdfBufferFromExistingUrl(doc);

        // Step B: PDF → images
        const images = await convertPdfToImages(pdfBuffer);
        console.log(`[DocAI] ${images.length} pages converted to images`);

        // Step C: Gemini Vision on every page
        const extractedPages = await processAllPagesWithGemini(images);
        console.log(`[DocAI] Vision extraction done for ${extractedPages.length} pages`);

        // Step D: Chunking
        let   allChunks    = [];
        let   globalIndex  = 0;

        for (const page of extractedPages) {
            const { chunks, nextIndex } = chunkPageContent(page, globalIndex);
            allChunks.push(...chunks);
            globalIndex = nextIndex;
        }
        console.log(`[DocAI] ${allChunks.length} chunks created`);

        // Step E: Embed all chunks
        const embeddedChunks = await embedAllChunks(allChunks);
        console.log(`[DocAI] Embeddings generated`);

        // Step F: Persist — atomic replace (delete old → insert new)
        await DocChunk.deleteMany({ doc_id: doc._id });
        await DocChunk.insertMany(
            embeddedChunks.map(c => ({ doc_id: doc._id, ...c }))
        );

        // Step G: Update DocAI summary record (keep extracted_pages for explain-page)
        const aiRecord = await DocAI.findOneAndUpdate(
            { doc_id: doc._id },
            {
                $set: {
                    extracted_pages: extractedPages.map(p => ({
                        page:       p.pageNumber,
                        text:       [p.content, ...(p.key_points || []), ...(p.formulas || [])].join("\n"),
                        title:      p.title || "",
                        key_points: p.key_points || [],
                        formulas:   p.formulas  || []
                    })),
                    chunk_count:  embeddedChunks.length,
                    pipeline_version: "gemini-v1",
                    updated_at:   new Date()
                },
                $setOnInsert: { created_at: new Date() }
            },
            { upsert: true, new: true }
        );

        processedCache.add(docId);
        console.log(`[DocAI] Pipeline complete: ${docId}`);
        return aiRecord;

    } finally {
        processingCache.delete(docId);
    }
}

// ── 14. Ensure AI data exists — hit cache first, run pipeline if needed ───────
async function ensureDocAiData(doc) {
    const docId = String(doc._id);

    // Fast path: in-memory flag
    if (processedCache.has(docId)) {
        return DocAI.findOne({ doc_id: doc._id });
    }

    // Check DB: chunks present = already processed
    const chunkCount = await DocChunk.countDocuments({ doc_id: doc._id });
    if (chunkCount > 0) {
        processedCache.add(docId);
        return DocAI.findOne({ doc_id: doc._id });
    }

    // Full pipeline
    return runFullPipeline(doc);
}

// ── 15. /ai/process-doc — trigger processing (called from docview on load) ───
app.post("/ai/process-doc", async (req, res) => {
    try {
        const { docId } = req.body;
        const doc = await getAuthorizedDoc(req, docId);

        // Fire-and-forget so the request returns immediately
        const docIdStr = String(doc._id);
        if (!processedCache.has(docIdStr) && !processingCache.has(docIdStr)) {
            ensureDocAiData(doc).catch(err =>
                console.error("[DocAI] background pipeline error:", err.message)
            );
        }

        const chunkCount = await DocChunk.countDocuments({ doc_id: doc._id });
        return res.json({
            success:  true,
            ready:    chunkCount > 0,
            processing: processingCache.has(docIdStr)
        });
    } catch (err) {
        console.error("process-doc error:", err);
        return res.status(err.message === "Unauthorized" ? 401 : 500).json({
            success: false, message: err.message
        });
    }
});

// ── 16. /ai/ask-doc — semantic Q&A ───────────────────────────────────────────
app.post("/ai/ask-doc", async (req, res) => {
    try {
        const { docId, question } = req.body;

        if (!question || !String(question).trim()) {
            return res.status(400).json({ success: false, message: "Question is required" });
        }

        const doc    = await getAuthorizedDoc(req, docId);
        const aiData = await ensureDocAiData(doc);

        if (!aiData) {
            return res.status(503).json({
                success: false,
                message: "Document is still being processed. Please try again in a moment."
            });
        }

        // Embed the question
        const queryEmbedding = await embedQuery(String(question).trim());

        // Retrieve top-5 relevant chunks
        const topChunks = await retrieveTopChunks(doc._id, queryEmbedding, 5);

        if (!topChunks.length) {
            return res.json({
                success: true,
                result: {
                    answer:       "I could not find this in the document.",
                    cited_pages:  [],
                    chunks_used:  0
                }
            });
        }

        // Build context string
        const context = topChunks
            .map(c => `[Page ${c.page_number}${c.section_title ? ` — ${c.section_title}` : ""}]\n${c.content}`)
            .join("\n\n---\n\n");

        const prompt = `You are a helpful academic assistant for students.
Answer the question using ONLY the provided context from the document.
If the answer is not clearly in the context, say exactly: "I could not find this in the document."
Be clear, structured, and student-friendly.

QUESTION:
${question}

DOCUMENT CONTEXT:
${context}

Return ONLY valid JSON, no markdown fences:
{
  "answer": "string",
  "cited_pages": [1, 2]
}`;

        const result = await geminiFlashModel.generateContent(prompt);
        let raw = result.response.text().trim()
            .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = { answer: raw, cited_pages: topChunks.map(c => c.page_number) };
        }

        return res.json({
            success:     true,
            result:      parsed,
            chunks_used: topChunks.length
        });

    } catch (err) {
        console.error("Ask-doc error:", err);
        return res.status(err.message === "Unauthorized" ? 401 : 500).json({
            success: false, message: err.message || "Failed to answer question"
        });
    }
});

// ── 17. /ai/explain-page — explain a single page using stored extracted text ──
app.post("/ai/explain-page", async (req, res) => {
    try {
        const { docId, page } = req.body;

        const doc    = await getAuthorizedDoc(req, docId);
        const aiData = await ensureDocAiData(doc);

        if (!aiData) {
            return res.status(503).json({
                success: false,
                message: "Document is still being processed. Please try again shortly."
            });
        }

        const pageNumber = Number(page);
        const pageData   = (aiData.extracted_pages || []).find(p => p.page === pageNumber);

        if (!pageData) {
            return res.status(404).json({ success: false, message: "Page not found" });
        }

        const prompt = `You are an academic PDF explainer helping a student understand one page.
Answer ONLY using the provided page text below.

Return ONLY valid JSON, no markdown fences:
{
  "short_summary": "string",
  "detailed_explanation": "string",
  "key_points": ["string"],
  "difficult_terms": ["string"]
}

Page number: ${pageNumber}
${pageData.title ? `Section: ${pageData.title}` : ""}

Page text:
${pageData.text}`;

        const result = await geminiFlashModel.generateContent(prompt);
        let raw = result.response.text().trim()
            .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = {
                short_summary:        raw,
                detailed_explanation: raw,
                key_points:           pageData.key_points || [],
                difficult_terms:      []
            };
        }

        // Persist explanation into the aiData record
        const existingIdx = (aiData.page_summaries || []).findIndex(p => p.page === pageNumber);
        if (existingIdx >= 0) {
            aiData.page_summaries[existingIdx] = { page: pageNumber, ...parsed };
        } else {
            if (!aiData.page_summaries) aiData.page_summaries = [];
            aiData.page_summaries.push({ page: pageNumber, ...parsed });
        }
        aiData.updated_at = new Date();
        await aiData.save();

        return res.json({ success: true, page: pageNumber, result: parsed });

    } catch (err) {
        console.error("Explain-page error:", err);
        return res.status(err.message === "Unauthorized" ? 401 : 500).json({
            success: false, message: err.message || "Failed to explain page"
        });
    }
});

// ── 18. /ai/summarize-doc — full document summary ────────────────────────────
app.post("/ai/summarize-doc", async (req, res) => {
    try {
        const { docId } = req.body;

        const doc    = await getAuthorizedDoc(req, docId);
        const aiData = await ensureDocAiData(doc);

        if (!aiData) {
            return res.status(503).json({
                success: false,
                message: "Document is still being processed. Please try again shortly."
            });
        }

        // If we already have a cached full summary, return it
        if (aiData.full_summary) {
            return res.json({
                success:      true,
                full_summary: aiData.full_summary,
                page_summaries: aiData.page_summaries || [],
                cached:       true
            });
        }

        // Generate per-page short summaries (parallel, bounded concurrency = 5)
        const CONCURRENCY = 5;
        const pageSummaries = [];
        const pages = aiData.extracted_pages || [];

        for (let i = 0; i < pages.length; i += CONCURRENCY) {
            const batch = pages.slice(i, i + CONCURRENCY);
            const settled = await Promise.allSettled(
                batch.map(async pageData => {
                    const prompt = `Summarize this single PDF page for a student in 2-3 concise sentences.
Return ONLY valid JSON:
{
  "short_summary": "string",
  "key_points": ["string"],
  "difficult_terms": ["string"]
}

Page ${pageData.page} text:
${pageData.text}`;
                    const result = await geminiFlashModel.generateContent(prompt);
                    let raw = result.response.text().trim()
                        .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
                    const p = JSON.parse(raw);
                    return { page: pageData.page, ...p };
                })
            );

            for (const r of settled) {
                if (r.status === "fulfilled") pageSummaries.push(r.value);
                else console.error("Page summary failed:", r.reason?.message);
            }
        }

        pageSummaries.sort((a, b) => a.page - b.page);

        // Full document summary from page summaries
        const combinedText = pageSummaries
            .map(p => `Page ${p.page}: ${p.short_summary}`)
            .join("\n");

        const fullPrompt = `Create one clear, student-friendly document summary from these page summaries.
Return ONLY valid JSON:
{ "full_summary": "string" }

Page summaries:
${combinedText}`;

        const fullResult = await geminiFlashModel.generateContent(fullPrompt);
        let fullRaw = fullResult.response.text().trim()
            .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const fullParsed = JSON.parse(fullRaw);

        // Persist
        aiData.page_summaries = pageSummaries;
        aiData.full_summary   = fullParsed.full_summary || "";
        aiData.updated_at     = new Date();
        await aiData.save();

        return res.json({
            success:       true,
            full_summary:  aiData.full_summary,
            page_summaries: pageSummaries,
            cached:        false
        });

    } catch (err) {
        console.error("Summarize-doc error:", err);
        return res.status(err.message === "Unauthorized" ? 401 : 500).json({
            success: false, message: err.message || "Failed to summarize document"
        });
    }
});
function normalizeSearchText(text = "") {
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function expandAliases(text = "") {
    const COLLEGE_SLUG_ALIASES = {
        // India
        upes: "University of Petroleum and Energy Studies,UPES",
        "iit-delhi": "Indian Institute of Technology Delhi",
        "iit-bombay": "Indian Institute of Technology Bombay",
        "iit-madras": "Indian Institute of Technology Madras",
        "iit-kanpur": "Indian Institute of Technology Kanpur",
        "iit-kharagpur": "Indian Institute of Technology Kharagpur",
        "iit-roorkee": "Indian Institute of Technology Roorkee",
        "iit-guwahati": "Indian Institute of Technology Guwahati",
        "iit-hyderabad": "Indian Institute of Technology Hyderabad",
        "iit-indore": "Indian Institute of Technology Indore",
        "iit-bhu": "Indian Institute of Technology (BHU) Varanasi",
        "iit-bhubaneswar": "Indian Institute of Technology Bhubaneswar",
        "iit-gandhinagar": "Indian Institute of Technology Gandhinagar",
        "iit-jodhpur": "Indian Institute of Technology Jodhpur",
        "iit-patna": "Indian Institute of Technology Patna",
        "iit-ropar": "Indian Institute of Technology Ropar",
        "iit-mandi": "Indian Institute of Technology Mandi",
        "iit-palakad": "Indian Institute of Technology Palakkad",
        "iit-tirupati": "Indian Institute of Technology Tirupati",
        "iit-jammu": "Indian Institute of Technology Jammu",
        "iit-dhanbad": "Indian Institute of Technology (ISM) Dhanbad",
        "iit-ism-dhanbad": "Indian Institute of Technology (ISM) Dhanbad",

        "nit-trichy": "National Institute of Technology Tiruchirappalli",
        "nit-surathkal": "National Institute of Technology Karnataka Surathkal",
        "nit-warangal": "National Institute of Technology Warangal",
        "nit-calicut": "National Institute of Technology Calicut",
        "nit-rourkela": "National Institute of Technology Rourkela",
        "nit-allahabad": "Motilal Nehru National Institute of Technology Allahabad",
        "nit-kurukshetra": "National Institute of Technology Kurukshetra",
        "nit-jaipur": "Malaviya National Institute of Technology Jaipur",
        "nit-bhopal": "Maulana Azad National Institute of Technology Bhopal",
        "nit-jalandhar": "Dr B R Ambedkar National Institute of Technology Jalandhar",
        "nit-durgapur": "National Institute of Technology Durgapur",
        "nit-silchar": "National Institute of Technology Silchar",
        "nit-hamirpur": "National Institute of Technology Hamirpur",
        "nit-patna": "National Institute of Technology Patna",
        "nit-raipur": "National Institute of Technology Raipur",

        bits: "Birla Institute of Technology and Science Pilani",
        "bits-pilani": "Birla Institute of Technology and Science Pilani",
        "bits-goa": "Birla Institute of Technology and Science, Goa",
        "bits-hyderabad": "Birla Institute of Technology and Science, Hyderabad",

        "iiit-hyderabad": "International Institute of Information Technology Hyderabad",
        "iiit-bangalore": "International Institute of Information Technology Bangalore",
        "iiit-delhi": "Indraprastha Institute of Information Technology Delhi",
        "iiit-allahabad": "Indian Institute of Information Technology Allahabad",
        "iiit-lucknow": "Indian Institute of Information Technology Lucknow",
        "iiit-gwalior": "ABV-Indian Institute of Information Technology and Management Gwalior",

        vit: "Vellore Institute of Technology",
        "vit-vellore": "Vellore Institute of Technology",
        "vit-chennai": "Vellore Institute of Technology Chennai",
        srm: "SRM Institute of Science and Technology",
        "srm-ktr": "SRM Institute of Science and Technology",
        manipal: "Manipal Institute of Technology",
        "manipal-university": "Manipal University Jaipur",
        thapar: "Thapar Institute of Engineering and Technology",
        amity: "Amity University",
        lpu: "Lovely Professional University",
        kiit: "Kalinga Institute of Industrial Technology",
        jadavpur: "Jadavpur University",
        "jadavpur-university": "Jadavpur University",
        "anna-university": "Anna University",
        "delhi-university": "University of Delhi",
        du: "University of Delhi",
        nsut: "Netaji Subhas University of Technology",
        dtu: "Delhi Technological University",
        "jamia-millia-islamia": "Jamia Millia Islamia",
        "banaras-hindu-university": "Banaras Hindu University",
        bhu: "Banaras Hindu University",
        "aligarh-muslim-university": "Aligarh Muslim University",
        amu: "Aligarh Muslim University",
        "calcutta-university": "University of Calcutta",
        "osmania-university": "Osmania University",
        "punjab-university": "Panjab University",
        "christ-university": "Christ University",
        "shiv-nadar-university": "Shiv Nadar University",
        "flame-university": "FLAME University",
        ashoka: "Ashoka University",
        "shivaji-college": "Shivaji College",
        "st-stephens": "St. Stephen's College",
        "miranda-house": "Miranda House",
        "hindu-college": "Hindu College",

        // Global
        mit: "Massachusetts Institute of Technology",
        harvard: "Harvard University",
        stanford: "Stanford University",
        oxford: "University of Oxford",
        cambridge: "University of Cambridge",
        caltech: "California Institute of Technology",
        princeton: "Princeton University",
        yale: "Yale University",
        columbia: "Columbia University",
        cornell: "Cornell University",
        upenn: "University of Pennsylvania",
        penn: "University of Pennsylvania",
        berkeley: "University of California, Berkeley",
        "uc-berkeley": "University of California, Berkeley",
        ucla: "University of California, Los Angeles",
        "carnegie-mellon": "Carnegie Mellon University",
        cmu: "Carnegie Mellon University",
        imperial: "Imperial College London",
        "imperial-college-london": "Imperial College London",
        nus: "National University of Singapore",
        ntu: "Nanyang Technological University",
        eth: "ETH Zurich",
        "eth-zurich": "ETH Zurich",
        toronto: "University of Toronto",
        "university-of-toronto": "University of Toronto"
    };

    const words = normalizeSearchText(text).split(" ");
    return words.map(word => COLLEGE_SLUG_ALIASES[word] || word).join(" ");
}

function buildSearchDoc(doc) {
    return {
        ...doc,
        college_normalized: normalizeSearchText(doc.college),
        subject_normalized: normalizeSearchText(doc.subject),
        chapter_normalized: normalizeSearchText(doc.chapter),
        branch_normalized: normalizeSearchText(doc.branch),
        uploaded_by_normalized: normalizeSearchText(doc.uploaded_by),
        search_blob: normalizeSearchText([
            doc.college,
            doc.subject,
            doc.chapter,
            doc.branch,
            doc.uploaded_by,
            doc.year,
            doc.semester
        ].filter(Boolean).join(" "))
    };
}

function getFuseKeys(searchType = "") {
    if (searchType === "college") {
        return [
            { name: "college_normalized", weight: 0.85 },
            { name: "search_blob", weight: 0.15 }
        ];
    }

    if (searchType === "subject") {
        return [
            { name: "subject_normalized", weight: 0.8 },
            { name: "chapter_normalized", weight: 0.15 },
            { name: "search_blob", weight: 0.05 }
        ];
    }

    if (searchType === "chapter") {
        return [
            { name: "chapter_normalized", weight: 0.8 },
            { name: "subject_normalized", weight: 0.15 },
            { name: "search_blob", weight: 0.05 }
        ];
    }

    return [
        { name: "chapter_normalized", weight: 0.34 },
        { name: "subject_normalized", weight: 0.28 },
        { name: "college_normalized", weight: 0.2 },
        { name: "branch_normalized", weight: 0.1 },
        { name: "uploaded_by_normalized", weight: 0.08 }
    ];
}

function getSuggestion(searchValue, docs, searchType = "") {
    const pool = new Set();

    for (const doc of docs) {
        if (searchType === "college") {
            if (doc.college) pool.add(doc.college);
        } else if (searchType === "subject") {
            if (doc.subject) pool.add(doc.subject);
        } else if (searchType === "chapter") {
            if (doc.chapter) pool.add(doc.chapter);
        } else {
            if (doc.college) pool.add(doc.college);
            if (doc.subject) pool.add(doc.subject);
            if (doc.chapter) pool.add(doc.chapter);
        }
    }

    const values = Array.from(pool).map(value => ({
        original: value,
        normalized: normalizeSearchText(value)
    }));

    const fuse = new Fuse(values, {
        includeScore: true,
        threshold: 0.32,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: ["normalized"]
    });

    const result = fuse.search(normalizeSearchText(searchValue))[0];

    if (!result) return null;
    if (typeof result.score !== "number") return null;

    // only return suggestion if match is reasonably close
    if (result.score > 0.32) return null;

    return result.item.original || null;
}
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    }
});

io.engine.use(sessionMiddleware);
// /******************************
//            Server Start
//  ******************************/
// server.listen(port, () => {
//     console.log(`Server running on url: http://localhost:${port}/`);
// });

/******************************
 Database + Server Start
 ******************************/
async function startServer() {
    try {
        await connectDB();
        console.log("Mongo Ready");

        server.listen(port, () => {
            console.log(`Server running on url: http://localhost:${port}/`);
        });
    } catch (err) {
        console.error("MongoDB connection failed ❌", err);
        process.exit(1);
    }
}

startServer();
/******************************
 Routes
 ******************************/
app.get("/", async (req, res) => {
    if (req.session.email) {
        await LoginData.create({
            email: req.session.email,
        })
        return res.redirect("/profile");
    }
    return res.render("seo", { err: null });
});
/******************************
 Signup
 ******************************/
app.get("/signup", (req, res) => {
    res.render('signup',{err:null});
})
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;

    const normalizedEmail = (email || "").trim().toLowerCase();

    const allowedDomains = new Set([
        "gmail.com",
        "outlook.com",
        "hotmail.com",
        "live.com",
        "yahoo.com",
        "icloud.com",
        "me.com",
        "mac.com",
        "proton.me",
        "protonmail.com",
        "aol.com"
    ]);

    const emailParts = normalizedEmail.split("@");

    if (emailParts.length !== 2) {
        return res.render("signup", {
            err: { message: "Please enter a valid email address." }
        });
    }

    const domain = emailParts[1];

    if (!allowedDomains.has(domain)) {
        return res.render("signup", {
            err: { message: "Please sign up using a supported email provider like Gmail, Outlook, Yahoo, or iCloud." }
        });
    }

    const exists = await user_profile.findOne({ email: normalizedEmail });

    if (exists) {
        return res.render("signup", {
            err: { message: "An account with your email already exists !!" }
        });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    req.session.pendingUser = {
        name,
        email: normalizedEmail,
        password,
        otp,
        expires: Date.now() + 10 * 60 * 1000,
        resendAllowedAt: Date.now() + 5 * 60 * 1000
    };

    try {
        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_VERIF_TEMPLATE_ID,
            {
                email: normalizedEmail,
                otp,
                name
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        console.log(`OTP sent to ${normalizedEmail}: ${otp}`);
    } catch (err) {
        console.error("Email sending failed:", err);
        return res.render("signup", {
            err: { message: "Failed to send OTP. Try again." }
        });
    }

    res.redirect('/email_verify');
});
/******************************
 SignIn
 ******************************/
app.get('/signin', (req, res) => {
    res.render('signin', {
        err: null
    });
});

app.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    const next = req.query.next || "";

    const normalizedEmail = (email || "").trim().toLowerCase();
    const user = await user_profile.findOne({ email: normalizedEmail });

    if (!user) {
        return res.render('signin', {
            err: { message: "You dont have an account with DocUp" }
        });
    }

    if (password === user.password) {
        req.session.email = normalizedEmail;

        let redirectTo = "/profile";

        if (
            next &&
            typeof next === "string" &&
            next.startsWith("/") &&
            !next.startsWith("//")
        ) {
            redirectTo = next;
        }

        return res.redirect(redirectTo);
    }

    return res.render('signin', {
        err: { message: "Invalid Credentials !!" }
    });
});
/******************************
 Email Verification
 ******************************/
app.get("/email_verify", (req, res) => {

    const data = req.session.pendingUser;

    if (!data) {
        return res.redirect("/signup");
    }

    res.render("email_verify", {
        email: data.email,
        expires: data.expires,
        resendAllowedAt: data.resendAllowedAt,
        err:null
    });
});
app.post("/email_verify", async (req, res) => {

    const { otp } = req.body;
    const data = req.session.pendingUser;

    if (!data) {
        return res.redirect("/signup");
    }

    if (Date.now() > data.expires) {
        delete req.session.pendingUser;

        return res.render("signup", {
            err: { message: "OTP expired. Please signup again." }
        });
    }

    if (String(otp) !== String(data.otp)) {
        return res.render("email_verify", {
            email: data.email,
            expires: data.expires,
            resendAllowedAt: data.resendAllowedAt,
            err: { message: "Invalid OTP" }
        });
    }

    // OTP correct → create user
    const newUser = await user_profile.create({
        name: data.name,
        email: data.email,
        password: data.password,
        google_auth: false
    });

    try {
        await sendWelcomeEmail(newUser.email, newUser.name);
    } catch (mailErr) {
        console.error("Welcome email failed:", mailErr.message);
    }

    delete req.session.pendingUser;
    res.redirect("/signin");
});
/******************************
 OTP Resend
 ******************************/
app.post("/resend_otp", async (req, res) => {

    const data = req.session.pendingUser;

    if (!data) {
        return res.redirect("/signup");
    }

    if (Date.now() < data.resendAllowedAt) {
        return res.redirect("/email_verify");
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000);

    data.otp = newOtp;
    data.expires = Date.now() + 10 * 60 * 1000;
    data.resendAllowedAt = Date.now() + 5*60 * 1000;

    console.log("Resent OTP:", newOtp);

    await emailjs.send(
        process.env.EMAILJS_SERVICE_ID,
        process.env.EMAILJS_VERIF_TEMPLATE_ID,
        {
            email: data.email,
            otp: newOtp,
            name: data.name
        },
        {
            publicKey: process.env.EMAILJS_PUBLIC_KEY,
            privateKey: process.env.EMAILJS_PRIVATE_KEY
        }
    );

    res.redirect("/email_verify");
});
/******************************
 Forgot Password
 ******************************/
app.get("/forgot_password", async (req, res) => {
    res.render('forgot_password', {err:null});
})
app.post("/forgot_password", async (req, res) => {

    const { email } = req.body;
    const exists = await user_profile.findOne({ email });

    if (!exists) {
        return res.render("forgot_password", {
            err: { message: "You have not signed up." }
        });
    }

    req.session.forgotData = {
        email: exists.email,
        name: exists.name,
        password: exists.password,
        resendAllowedAt: Date.now() + 5 * 60 * 1000
    };
    // if (exists.google_auth) {
    //     return res.render("forgot_password", {
    //         err: { message: "This account uses Google Sign-In. Please continue with Google." }
    //     });
    // }
    try {
        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            {
                email: exists.email,
                password: exists.password,
                name: exists.name
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        console.log("Password email sent");

    } catch (err) {
        console.error("Email sending failed:", err);
        return res.render("forgot_password", {
            err: { message: "Password sent to your email." },
            resendAllowedAt: req.session.forgotData.resendAllowedAt
        });
    }

    res.render("forgot_password", {
        err: { message: "Password sent to your email." },
        resendAllowedAt: req.session.forgotData.resendAllowedAt
    });

});
app.post("/resend_forgot_password", async (req, res) => {
    try {
        const data = req.session.forgotData;

        if (!data) {
            return res.redirect("/forgot_password");
        }

        const exists = await user_profile.findOne({ email: data.email });

        if (!exists) {
            delete req.session.forgotData;
            return res.render("forgot_password", {
                err: { message: "You have not signed up." }
            });
        }

        if (exists.google_auth) {
            return res.render("forgot_password", {
                err: { message: "This account uses Google Sign-In. Please continue with Google." }
            });
        }

        if (Date.now() < data.resendAllowedAt) {
            return res.render("forgot_password", {
                err: { message: "Password sent to your email." },
                resendAllowedAt: data.resendAllowedAt
            });
        }

        data.resendAllowedAt = Date.now() + 5 * 60 * 1000;

        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            {
                email: data.email,
                password: data.password,
                name: data.name
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        return res.render("forgot_password", {
            err: { message: "Password sent to your email." },
            resendAllowedAt: data.resendAllowedAt
        });
    } catch (err) {
        console.error("Resend forgot password error:", err);
        return res.render("forgot_password", {
            err: { message: "Failed to send password email. Try again." }
        });
    }
});
/******************************
 Dashboard
 ******************************/
app.get("/dashboard", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }

    try {
        const data = await user_profile
            .findOne({ email: req.session.email })
            .populate("saved_documents", "college subject chapter reviewed");

        const clg = await college.find({});
        const msg = { err: null };
// 🔥 create map: { "IIT Delhi": "image-url", ... }
        const collegeImageMap = {};
        clg.forEach(c => {
            collegeImageMap[c.college_name.toLowerCase()] = c.image;
        });

        // Trending colleges: most-viewed docs in last 7 days
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const trendingColleges = await docs_view_data.aggregate([
            { $match: { DocViewedAt: { $gte: oneWeekAgo } } },
            { $lookup: { from: "docs", localField: "doc_id", foreignField: "_id", as: "doc" } },
            { $unwind: "$doc" },
            { $group: { _id: "$doc.college", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 6 },
            { $project: { _id: 0, college: "$_id", count: 1 } }
        ]);

        // Most viewed colleges: all-time doc views
        const mostViewedColleges = await docs_view_data.aggregate([
            { $lookup: { from: "docs", localField: "doc_id", foreignField: "_id", as: "doc" } },
            { $unwind: "$doc" },
            { $group: { _id: "$doc.college", views: { $sum: 1 } } },
            { $sort: { views: -1 } },
            { $limit: 6 },
            { $project: { _id: 0, college: "$_id", views: 1 } }
        ]);


        res.render("dashboard", {
            data,
            colleges: collegesList,
            results: [],
            college_specific_data: clg,
            collegeImageMap, // ✅ send this
            msg,
            trendingColleges,
            mostViewedColleges,
        });

    } catch (err) {
        console.log(err);
        res.status(500).send("Server error");
    }
});
app.post("/api/dashboard-search", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

        const { search_parameter_text, year, branch } = req.body;

        if (!search_parameter_text || !search_parameter_text.trim()) {
            return res.status(400).json({
                success: false,
                message: "Search text is required"
            });
        }

        const rawSearch = String(search_parameter_text).trim();
        const normalizedRaw = normalizeSearchText(rawSearch);

        let searchType = "";
        let searchValue = normalizedRaw;

        if (normalizedRaw.startsWith("/ch")) {
            searchType = "chapter";
            searchValue = normalizeSearchText(normalizedRaw.slice(3));
        } else if (normalizedRaw.startsWith("/c")) {
            searchType = "college";
            searchValue = normalizeSearchText(normalizedRaw.slice(2));
        } else if (normalizedRaw.startsWith("/s")) {
            searchType = "subject";
            searchValue = normalizeSearchText(normalizedRaw.slice(2));
        }

        searchValue = expandAliases(searchValue);

        if (!searchValue) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid search value"
            });
        }

        const mongoFilter = {
            ...(year && year !== "all" ? { year } : {}),
            ...(branch && branch !== "all" ? { branch } : {})
        };

        const docs = await Docs.find(mongoFilter).lean();

        if (!docs.length) {
            return res.json({
                success: true,
                results: [],
                suggestion: null
            });
        }

        const searchableDocs = docs.map(buildSearchDoc);

        const fuse = new Fuse(searchableDocs, {
            includeScore: true,
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
            keys: getFuseKeys(searchType)
        });

        let results = fuse.search(searchValue).map(({ item, score }) => {
            let finalScore = Math.round((1 - (score ?? 1)) * 1000);

            if (item.reviewed) finalScore += 80;
            if (typeof item.likes === "number") finalScore += item.likes * 4;
            if (typeof item.dislikes === "number") finalScore -= item.dislikes * 2;

            if (searchType === "college" && item.college_normalized.includes(searchValue)) {
                finalScore += 120;
            }

            if (searchType === "subject" && item.subject_normalized.includes(searchValue)) {
                finalScore += 120;
            }

            if (searchType === "chapter" && item.chapter_normalized.includes(searchValue)) {
                finalScore += 140;
            }

            if (!searchType) {
                if (item.chapter_normalized.includes(searchValue)) finalScore += 90;
                if (item.subject_normalized.includes(searchValue)) finalScore += 70;
                if (item.college_normalized.includes(searchValue)) finalScore += 50;
            }

            return {
                ...item,
                _score: finalScore
            };
        });

        results.sort((a, b) => b._score - a._score);

        const cleanedResults = results.map(doc => {
            const {
                college_normalized,
                subject_normalized,
                chapter_normalized,
                branch_normalized,
                uploaded_by_normalized,
                search_blob,
                ...rest
            } = doc;
            return rest;
        });

        let suggestion = null;

        const rawTypedValue = searchType
            ? normalizeSearchText(rawSearch.replace(/^\/(c|s|ch)\s*/i, ""))
            : normalizeSearchText(rawSearch);

        const bestSuggestion = getSuggestion(searchValue, docs, searchType);

        if (
            bestSuggestion &&
            normalizeSearchText(bestSuggestion) !== rawTypedValue
        ) {
            if (searchType === "college") {
                suggestion = `/c ${bestSuggestion}`;
            } else if (searchType === "subject") {
                suggestion = `/s ${bestSuggestion}`;
            } else if (searchType === "chapter") {
                suggestion = `/ch ${bestSuggestion}`;
            } else {
                suggestion = bestSuggestion;
            }
        }

        return res.json({
            success: true,
            results: cleanedResults,
            suggestion
        });
    } catch (err) {
        console.log("dashboard search error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});
app.get("/college/:collegeName", async (req, res) => {
    try {
        const collegeName = decodeURIComponent(req.params.collegeName).trim();

        const docs = await Docs.find({
            college: collegeName
        }).lean();

        const allCollegeRows = await college.find({}).lean();

        function normalizeText(str) {
            return String(str || "")
                .toLowerCase()
                .trim()
                .replace(/,/g, "")
                .replace(/\s+/g, " ");
        }

        function normalizeCompact(str) {
            return normalizeText(str).replace(/\s/g, "");
        }

        const requestedName = normalizeText(collegeName);
        const requestedCompact = normalizeCompact(collegeName);

        // 🟢 THIS WAS MISSING: We find the specific college data for the image
        const collegeData =
            allCollegeRows.find(c => normalizeText(c.college_name) === requestedName) ||
            allCollegeRows.find(c => normalizeCompact(c.college_name) === requestedCompact) ||
            null;

        function normalize(value) {
            return String(value || "").trim().toLowerCase();
        }

        // 🟢 1. Determine if this is an Exam page
        const examNames = ["JEE Main", "JEE Advanced", "NEET", "BITSAT", "VITEEE", "MHT CET", "CUET", "COMEDK", "WBJEE", "KCET"];
        const isExam = examNames.includes(collegeName) || docs.some(d => d.doc_type === "ed_doc");

        let groupedDocs = {};

        // 🟢 2. Dynamic Grouping
        if (isExam) {
            // Group by Class (Year) -> Subject (Branch)
            docs.forEach(doc => {
                const className = doc.year || "Other";
                const subjectName = doc.branch || "General";

                if (!groupedDocs[className]) groupedDocs[className] = {};
                if (!groupedDocs[className][subjectName]) groupedDocs[className][subjectName] = [];

                groupedDocs[className][subjectName].push(doc);
            });
        } else {
            // Original College Grouping (Year -> Semester)
            function matchYear(value, yearNumber) {
                const v = normalize(value);
                return v === `year${yearNumber}` || v === `year ${yearNumber}` || v === String(yearNumber);
            }

            function matchSemester(value, semNumber) {
                const v = normalize(value);
                return v === `sem ${semNumber}` ||
                    v === `sem${semNumber}` ||
                    v === `semester ${semNumber}` ||
                    v === String(semNumber);
            }

            groupedDocs = {
                "1": {
                    "1": docs.filter(d => matchYear(d.year, 1) && matchSemester(d.semester, 1)),
                    "2": docs.filter(d => matchYear(d.year, 1) && matchSemester(d.semester, 2))
                },
                "2": {
                    "3": docs.filter(d => matchYear(d.year, 2) && matchSemester(d.semester, 3)),
                    "4": docs.filter(d => matchYear(d.year, 2) && matchSemester(d.semester, 4))
                },
                "3": {
                    "5": docs.filter(d => matchYear(d.year, 3) && matchSemester(d.semester, 5)),
                    "6": docs.filter(d => matchYear(d.year, 3) && matchSemester(d.semester, 6))
                },
                "4": {
                    "7": docs.filter(d => matchYear(d.year, 4) && matchSemester(d.semester, 7)),
                    "8": docs.filter(d => matchYear(d.year, 4) && matchSemester(d.semester, 8))
                }
            };
        }

        const user_data = await user_profile.findOne({email:req.session.email});
        const allBranches = [...new Set(
            docs
                .map(doc => (doc.branch || "").trim())
                .filter(Boolean)
        )].sort();

        res.render("college", {
            collegeInfo: {
                name: collegeName,
                image: collegeData?.image || "/images/default.png"
            },
            totalDocs: docs.length,
            groupedDocs,
            allBranches,
            isExam, // 🟢 Passed to EJS to trigger the UI switch
            user: user_data
        });

    } catch (error) {
        console.log(error);
        res.status(500).send("Something went wrong");
    }
});
/******************************
 Uploads
 ******************************/
app.get("/uploads", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }
    const data = await user_profile.findOne({ email: req.session.email });

    const colleges = [];

    fs.createReadStream("College_data.csv")
        .pipe(csv())
        .on("data", (row) => {

            // change column name if different
            if (row["College_Name"]) {
                colleges.push(row["College_Name"].trim());
            }

        })
        .on("end", () => {

            const uniqueColleges = [...new Set(colleges)].sort();

            res.render("uploads", {
                data: data,
                colleges: uniqueColleges
            });

        });

});
app.post("/upload_docs", upload.single("file"), async (req, res) => {
    try {
        // 🔐 AUTH CHECK
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

        // 📄 FILE CHECK
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const user = await user_profile.findOne({ email: req.session.email });

        if (!user) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        // 📦 EXTRACT DATA
        const {
            college,
            year,
            semester,
            branch,
            subject,
            chapter,
            doc_type,
            protected: isProtected
        } = req.body;

        // 🔥 CONVERT STRING → BOOLEAN (CRITICAL FIX)
        const protectedValue = isProtected === "true";

        // ❌ VALIDATION
        if (!college || !year || !semester || !branch || !subject || !chapter) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({
                success: false,
                message: "Please fill all metadata fields"
            });
        }

        const validDocTypes = ["college_doc", "ed_doc", "research_doc", "random_doc"];
        const docType = validDocTypes.includes(doc_type) ? doc_type : "college_doc";

        // 📁 FILE PROCESSING
        const originalName = req.file.originalname || "file";
        const extension = path.extname(originalName).replace(".", "").toLowerCase();
        const baseName = path.basename(originalName, path.extname(originalName));

        const safeBaseName = sanitizeFilePart(baseName);
        const safeCollege = sanitizeFilePart(college);
        const safeBranch = sanitizeFilePart(branch);
        const safeSubject = sanitizeFilePart(subject);
        const safeChapter = sanitizeFilePart(chapter);
        const timestamp = Date.now();

        const fileName = `${safeBaseName || "doc"}_${timestamp}.${extension}`;
        const storagePath = `docs/${safeCollege}/${safeBranch}/${safeSubject}/${safeChapter}/${fileName}`;

        const fileBuffer = fs.readFileSync(req.file.path);

        // ☁️ UPLOAD TO SUPABASE
        const { error: uploadError } = await supabase.storage
            .from(process.env.SUPABASE_BUCKET)
            .upload(storagePath, fileBuffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (uploadError) {
            console.error("Supabase upload error:", uploadError);

            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.status(500).json({
                success: false,
                message: "Upload failed"
            });
        }

        // 🌍 GET PUBLIC URL
        const { data: publicUrlData } = supabase.storage
            .from(process.env.SUPABASE_BUCKET)
            .getPublicUrl(storagePath);

        const fileUrl = publicUrlData?.publicUrl;

        // 🧠 SAVE TO DB (WITH PROTECTED FIELD)
        const doc = await Docs.create({
            college,
            year,
            semester,
            branch,
            subject,
            chapter,
            file_url: fileUrl,
            uploaded_by: user.email,
            reviewed: false,
            protected: protectedValue, // ✅ FIXED
            doc_type: docType          // ✅ NEW
        });

        // 🔥 UPDATE USER
        await user_profile.updateOne(
            { email: req.session.email },
            {
                $inc: { Doc_score: 1 },
                $push: {
                    uploads: {
                        doc_id: doc._id,
                        url: fileUrl,
                        subject,
                        college,
                        uploadedAt: new Date()
                    }
                }
            }
        );

        // 🧹 CLEAN TEMP FILE
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return res.json({
            success: true,
            docId: doc._id,
            file_url: fileUrl
        });

    } catch (err) {
        console.error("Upload failed:", err);

        if (req.file?.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch {}
        }

        return res.status(500).json({
            success: false,
            message: "Upload failed"
        });
    }
});
/******************************
 Profile
 ******************************/

// app.get("/profile", async (req, res) => {
//     const data = await user_profile.findOne({email:req.session.email});
//     res.render("profile",{data})
// });
app.get("/profile", async (req, res) => {
    try {
        const email = req.session.email;

        if (!email) return res.redirect("/signin");

        const user = await user_profile.findOne({ email })
            .populate("saved_documents", "college subject chapter reviewed")
            .populate("doc_view_history", "college subject chapter reviewed")
            .populate("uploads.doc_id", "college subject chapter reviewed");

        if (!user) return res.redirect("/signin");

        if (user.payment_history?.length) {
            user.payment_history.sort(
                (a, b) => new Date(b.date) - new Date(a.date)
            );
        }

        const savedProfileEmails = Array.isArray(user.saved_profiles)
            ? user.saved_profiles
                .map(item => item?.email?.trim().toLowerCase())
                .filter(Boolean)
            : [];

        const savedProfilesData = savedProfileEmails.length
            ? await user_profile.find(
                { email: { $in: savedProfileEmails } },
                "name email avatar_img_path subscription user_type uploads _id"
            ).lean()
            : [];

        const savedProfilesOrdered = savedProfileEmails
            .map(email => savedProfilesData.find(profile => profile.email === email))
            .filter(Boolean);

        res.render("profile", {
            user,
            savedProfilesData: savedProfilesOrdered
        });

    } catch (error) {
        console.log("Profile Page Error:", error);
        res.status(500).send("Internal Server Error");
    }
});
app.post("/update-avatar", async (req, res) => {

    try {

        if (!req.session.email) {
            return res.json({ success: false });
        }

        const { avatarPath } = req.body;

        await user_profile.updateOne(
            { email: req.session.email },
            { avatar_img_path: avatarPath }
        );

        res.json({ success: true });

    } catch (err) {
        console.log(err);
        res.json({ success: false });
    }

});
app.post("/set_avatar", async (req, res) => {
    try {
        const email = req.session.email;
        const { avatarPath } = req.body;

        if (!email) {
            return res.status(401).json({ success: false });
        }

        await user_profile.updateOne(
            { email },
            { avatar_img_path: avatarPath }
        );

        return res.json({ success: true });
    } catch (err) {
        console.log("Avatar Update Error:", err);
        return res.status(500).json({ success: false });
    }
});
/******************************
 Privacy Policy
 ******************************/
app.get("/privacy_policy", async (req, res) => {
    if(!req.session.email){
        res.redirect("/signin");
    }
    const user_details = await user_profile.findOne({email:req.session.email});
    res.render("privacy_policy",{user:user_details});
});
/******************************
 Logout
 ******************************/
app.get("/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            console.log("Logout Error:", err);
            return res.redirect("/dashboard");
        }
        res.clearCookie("connect.sid");   // VERY IMPORTANT
        res.redirect("/");           // or homepage

    });

});
/******************************
 Pdf_viewer
 ******a************************/
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

app.get("/view/:id", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.redirect(`/signin?next=${encodeURIComponent(`/view/${req.params.id}`)}`);
        }

        res.set({
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Surrogate-Control": "no-store"
        });

        const docId = req.params.id;

        const document = await Docs.findById(docId).populate({
            path: "comment_section.user_id",
            select: "name avatar_img_path email"
        });

        if (!document) {
            return res.status(404).render("404");
        }

        // Filter out comments where the user has been deleted (user_id populated as null)
        document.comment_section = document.comment_section.filter(c => c.user_id != null);

        const cooldownMs = 2 * 60 * 1000; // 2 minutes
        const cooldownDate = new Date(Date.now() - cooldownMs);
        const now = new Date();

        // Only deduct DocScore if the document is protected
        let chargedUser = null;

        if (document.protected) {
            chargedUser = await user_profile.findOneAndUpdate(
                {
                    email: req.session.email,
                    Doc_score: { $gt: 0 },
                    $or: [
                        { last_doc_views: { $not: { $elemMatch: { doc_id: docId } } } },
                        {
                            last_doc_views: {
                                $elemMatch: {
                                    doc_id: docId,
                                    viewed_at: { $lte: cooldownDate }
                                }
                            }
                        }
                    ]
                },
                [
                    {
                        $set: {
                            Doc_score: { $subtract: ["$Doc_score", 1] },
                            last_doc_views: {
                                $concatArrays: [
                                    [
                                        {
                                            doc_id: docId,
                                            viewed_at: now
                                        }
                                    ],
                                    {
                                        $slice: [
                                            {
                                                $filter: {
                                                    input: { $ifNull: ["$last_doc_views", []] },
                                                    as: "item",
                                                    cond: {
                                                        $ne: [
                                                            { $toString: "$$item.doc_id" },
                                                            String(docId)
                                                        ]
                                                    }
                                                }
                                            },
                                            99
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                ],
                {
                    returnDocument: "after",
                    updatePipeline: true
                }
            );
        }

        let renderUser = chargedUser;

        if (!chargedUser) {
            const freshUser = await user_profile.findOne({ email: req.session.email });

            if (!freshUser) {
                return res.redirect(`/signin?next=${encodeURIComponent(`/view/${req.params.id}`)}`);
            }

            const existingViewEntry = Array.isArray(freshUser.last_doc_views)
                ? freshUser.last_doc_views.find(entry => String(entry.doc_id) === String(docId))
                : null;

            const lastViewedAt = existingViewEntry?.viewed_at
                ? new Date(existingViewEntry.viewed_at).getTime()
                : 0;

            const stillInCooldown = lastViewedAt && (Date.now() - lastViewedAt < cooldownMs);

            // Only block access due to low DocScore if the doc is protected
            if (document.protected && !stillInCooldown && freshUser.Doc_score <= 0) {
                const msg = { err: "Insufficient DocScore" };
                const clg = await college.find({});

                return res.render("dashboard", {
                    data: freshUser,
                    colleges: collegesList,
                    results: [],
                    college_specific_data: clg,
                    msg
                });
            }

            renderUser = freshUser;
        }

        await user_profile.findOneAndUpdate(
            { email: req.session.email },
            { $pull: { doc_view_history: docId } }
        );

        await user_profile.findOneAndUpdate(
            { email: req.session.email },
            {
                $push: {
                    doc_view_history: {
                        $each: [docId],
                        $position: 0,
                        $slice: 10
                    }
                }
            }
        );

        const collegeName = (document.college || "").trim();
        const safeCollegeName = escapeRegex(collegeName);

        let collegeData = await college.findOne({
            college_name: { $regex: `^${safeCollegeName}$`, $options: "i" }
        }).lean();

        if (!collegeData) {
            collegeData = await college.findOne({
                college_name: { $regex: safeCollegeName, $options: "i" }
            }).lean();
        }

        if (!document.comment_section) {
            document.comment_section = [];
        }

        await docs_view_data.create({
            email: req.session.email,
            doc_id: docId,
        });

        let uploaderProfile = null;

        if (document.uploaded_by) {
            uploaderProfile = await user_profile.findOne({
                $or: [
                    { email: document.uploaded_by },
                    { name: document.uploaded_by }
                ]
            }).select("_id name avatar_img_path user_type");
        }
        // Count directly (fast)
        const total_views = await docs_view_data.countDocuments({ doc_id: docId });

        return res.render("docview", {
            doc: document,
            college_data: collegeData || {},
            user: renderUser,
            uploaderProfile,
            shareDocLink: `${req.protocol}://${req.get("host")}/view/${docId}`,
            views: total_views,
        });

    } catch (err) {
        console.error(err);
        return res.status(500).send("Server Error");
    }
});
app.get("/save/:id", async (req, res) => {
    try {
        const userMail = req.session.email;
        const docId = req.params.id;

        if (!userMail) {
            return res.redirect("/signin");
        }

        await user_profile.findOneAndUpdate(
            { email: userMail },
            {
                $addToSet: {
                    saved_documents: docId
                }
            }
        );
        await user_profile.updateOne(
            { email: req.session.email },
            {
                $inc: {Doc_score: 1},
            }
        );
        res.redirect("/view/" + docId);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
app.get("/api/docscore", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({ success: false, message: "Not logged in" });
        }

        const user = await user_profile.findOne(
            { email: req.session.email },
            { Doc_score: 1, _id: 0 }
        );

        return res.json({
            success: true,
            Doc_score: user ? user.Doc_score : 0
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});
app.get("/update_likes/:id", async (req, res) => {
    try {
        const userEmail = req.session.email;

        if (!userEmail) {
            return res.redirect("/login");
        }

        const doc = await Docs.findById(req.params.id);

        if (!doc) {
            return res.status(404).render("404");
        }

        if (!doc.liked_by) doc.liked_by = [];
        if (!doc.disliked_by) doc.disliked_by = [];
        if (typeof doc.likes !== "number") doc.likes = 0;
        if (typeof doc.dislikes !== "number") doc.dislikes = 0;

        const alreadyLiked = doc.liked_by.some(entry => entry.email === userEmail);
        const alreadyDisliked = doc.disliked_by.some(entry => entry.email === userEmail);

        if (alreadyLiked) {
            return res.redirect("/view/" + req.params.id);
        }

        if (alreadyDisliked) {
            doc.disliked_by = doc.disliked_by.filter(entry => entry.email !== userEmail);
            doc.dislikes = Math.max(0, doc.dislikes - 1);
        }

        doc.likes += 1;
        doc.liked_by.push({ email: userEmail });

        await doc.save();

        await user_profile.updateOne(
            { email: userEmail },
            { $inc: { Doc_score: 1 } }
        );

        return res.redirect("/view/" + req.params.id);
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server Error");
    }
});
app.get("/update_dislikes/:id", async (req, res) => {
    try {
        const userEmail = req.session.email;

        if (!userEmail) {
            return res.redirect("/login");
        }

        const doc = await Docs.findById(req.params.id);

        if (!doc) {
            return res.status(404).render("404");
        }

        if (!doc.liked_by) doc.liked_by = [];
        if (!doc.disliked_by) doc.disliked_by = [];
        if (typeof doc.likes !== "number") doc.likes = 0;
        if (typeof doc.dislikes !== "number") doc.dislikes = 0;

        const alreadyLiked = doc.liked_by.some(entry => entry.email === userEmail);
        const alreadyDisliked = doc.disliked_by.some(entry => entry.email === userEmail);

        if (alreadyDisliked) {
            return res.redirect("/view/" + req.params.id);
        }

        if (alreadyLiked) {
            doc.liked_by = doc.liked_by.filter(entry => entry.email !== userEmail);
            doc.likes = Math.max(0, doc.likes - 1);
        }

        doc.dislikes += 1;
        doc.disliked_by.push({ email: userEmail });

        await doc.save();

        await user_profile.updateOne(
            { email: userEmail },
            { $inc: { Doc_score: 1 } }
        );

        return res.redirect("/view/" + req.params.id);
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server Error");
    }
});
// ── AJAX: like (no page reload) ──────────────────────────────
app.post("/api/like/:id", async (req, res) => {
    try {
        const userEmail = req.session.email;
        if (!userEmail) return res.status(401).json({ success: false, message: "Not signed in" });

        const doc = await Docs.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: "Doc not found" });

        if (!doc.liked_by)  doc.liked_by  = [];
        if (!doc.disliked_by) doc.disliked_by = [];
        if (typeof doc.likes    !== "number") doc.likes    = 0;
        if (typeof doc.dislikes !== "number") doc.dislikes = 0;

        const alreadyLiked    = doc.liked_by.some(e => e.email === userEmail);
        const alreadyDisliked = doc.disliked_by.some(e => e.email === userEmail);

        if (alreadyLiked) {
            return res.json({ success: true, likes: doc.likes, dislikes: doc.dislikes, alreadyLiked: true });
        }

        if (alreadyDisliked) {
            doc.disliked_by = doc.disliked_by.filter(e => e.email !== userEmail);
            doc.dislikes    = Math.max(0, doc.dislikes - 1);
        }

        doc.likes += 1;
        doc.liked_by.push({ email: userEmail });
        await doc.save();
        // await user_profile.updateOne({ email: userEmail }, { $inc: { Doc_score: 1 } });

        return res.json({ success: true, likes: doc.likes, dislikes: doc.dislikes });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// ── AJAX: dislike (no page reload) ───────────────────────────
app.post("/api/dislike/:id", async (req, res) => {
    try {
        const userEmail = req.session.email;
        if (!userEmail) return res.status(401).json({ success: false, message: "Not signed in" });

        const doc = await Docs.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: "Doc not found" });

        if (!doc.liked_by)    doc.liked_by    = [];
        if (!doc.disliked_by) doc.disliked_by = [];
        if (typeof doc.likes    !== "number") doc.likes    = 0;
        if (typeof doc.dislikes !== "number") doc.dislikes = 0;

        const alreadyLiked    = doc.liked_by.some(e => e.email === userEmail);
        const alreadyDisliked = doc.disliked_by.some(e => e.email === userEmail);

        if (alreadyDisliked) {
            return res.json({ success: true, likes: doc.likes, dislikes: doc.dislikes, alreadyDisliked: true });
        }

        if (alreadyLiked) {
            doc.liked_by = doc.liked_by.filter(e => e.email !== userEmail);
            doc.likes    = Math.max(0, doc.likes - 1);
        }

        doc.dislikes += 1;
        doc.disliked_by.push({ email: userEmail });
        await doc.save();
        // await user_profile.updateOne({ email: userEmail }, { $inc: { Doc_score: 1 } });

        return res.json({ success: true, likes: doc.likes, dislikes: doc.dislikes });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// ── AJAX: save (no page reload) ───────────────────────────────
app.post("/api/save/:id", async (req, res) => {
    try {
        const userEmail = req.session.email;
        if (!userEmail) return res.status(401).json({ success: false, message: "Not signed in" });

        const user = await user_profile.findOne({ email: userEmail });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const docId       = req.params.id;
        const alreadySaved = user.saved_documents.some(id => id.toString() === docId);

        if (!alreadySaved) {
            await user_profile.findOneAndUpdate(
                { email: userEmail },
                { $addToSet: { saved_documents: docId } }
            );
        }

        return res.json({ success: true, alreadySaved });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/add_comment/:id", async (req, res) => {
    try {
        const docId = req.params.id;
        const userEmail = req.session.email;
        const { comment } = req.body;

        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

        if (!comment || !comment.trim()) {
            return res.status(400).json({
                success: false,
                message: "Comment cannot be empty"
            });
        }

        const cleanComment = comment.trim();

        const currentUser = await user_profile.findOne({ email: userEmail }).select("_id name email");

        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        const docData = await Docs.findById(docId)
        const docData_college = await Docs.findById(docId).select("college");
        const docData_subject = await Docs.findById(docId).select("branch");
        const docData_chapter = await Docs.findById(docId).select("chapter");

        if (!docData) {
            return res.status(404).json({
                success: false,
                message: "Document not found"
            });
        }

        // Reply format expected:
        // @$someone@email.com# : actual reply text
        if (cleanComment.startsWith("@$")) {
            const hashIndex = cleanComment.indexOf("#");
            const colonIndex = cleanComment.indexOf(":");

            if (hashIndex !== -1 && colonIndex !== -1 && hashIndex < colonIndex) {
                const replyToEmail = cleanComment.slice(2, hashIndex).trim();
                const replyMessage = cleanComment.slice(colonIndex + 1).trim();

                if (replyToEmail && replyToEmail !== currentUser.email) {
                    const replyToData = await user_profile.findOne({ email: replyToEmail }).select("email name");

                    if (replyToData) {
                        await user_profile.updateOne(
                            { email: replyToEmail },
                            {
                                $push: {
                                    notifications: {
                                        email: currentUser.email,
                                        content: `${currentUser.name} replied to your comment on "${docData.chapter}" (${docData.subject}) — "${replyMessage}"`
                                    }
                                }
                            }
                        );
                    }
                }
            }
        }

        const updatedDoc = await Docs.findByIdAndUpdate(
            docId,
            {
                $push: {
                    comment_section: {
                        user_id: currentUser._id,
                        comment: cleanComment
                    }
                }
            },
            { new: true }
        );

        return res.json({
            success: true,
            message: "Comment added successfully"
        });

    } catch (err) {
        console.error("Add comment error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});
/****************************
 Helper routes
 ****************************/
const RECHARGE_PLANS = {
    starter: {
        label: "Prep",
        amount: 29,
        docscore: 20
    },
    standard: {
        label: "Crack",
        amount: 79,
        docscore: 60,
    },
    pro: {
        label: "Topper",
        amount: 199,
        docscore: 180
    }
};

/****************************
 Pricing
 ****************************/
app.get("/pricing", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }
    const user_data = await user_profile.findOne({email:req.session.email});
    res.render("pricing",{data:user_data});
});
app.post("/buy-recharge", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

        const { plan, customAmount } = req.body;

        let selectedPlan;

        if (plan === "custom") {
            const DOCSCORE_RATE = 1; // ₹1 per DocScore
            const amount = Math.round(Number(customAmount) / 2) * 2; // keep even

            if (!amount || amount < 10 || amount > 500) {
                return res.status(400).json({
                    success: false,
                    message: "Custom amount must be between ₹10 and ₹500"
                });
            }

            const docscore = Math.floor(amount / DOCSCORE_RATE);

            selectedPlan = {
                label: `Custom Recharge (${docscore} pts)`,
                amount,
                docscore
            };
        } else {
            selectedPlan = RECHARGE_PLANS[plan];
        }

        if (!selectedPlan) {
            return res.status(400).json({
                success: false,
                message: "Invalid recharge plan"
            });
        }

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        // For custom amounts, always create a fresh order (amount may differ)
        const existingPendingOrder = plan !== "custom" ? await paymentOrder.findOne({
            user_email: req.session.email,
            plan_key: plan,
            status: "PENDING",
            createdAt: { $gte: fiveMinutesAgo }
        }).sort({ createdAt: -1 }) : null;

        if (existingPendingOrder) {
            return res.json({
                success: true,
                orderId: existingPendingOrder.order_id,
                amount: existingPendingOrder.amount * 100,
                currency: "INR",
                key: process.env.RAZORPAY_KEY_ID,
                userEmail: req.session.email,
                docscoreToAdd: existingPendingOrder.docscore_to_add
            });
        }

        const receipt = `docup_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

        const razorpayOrder = await razorpay.orders.create({
            amount: selectedPlan.amount * 100,
            currency: "INR",
            receipt,
            notes: {
                user_email: req.session.email,
                plan_key: plan
            }
        });

        await paymentOrder.create({
            user_email: req.session.email,
            order_id: razorpayOrder.id,
            plan_key: plan,
            plan_label: selectedPlan.label,
            amount: selectedPlan.amount,
            docscore_to_add: selectedPlan.docscore,
            status: "PENDING"
        });

        return res.json({
            success: true,
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID,
            userEmail: req.session.email,
            docscoreToAdd: selectedPlan.docscore
        });
    } catch (err) {
        console.error("Razorpay order creation error:", err);
        return res.status(500).json({
            success: false,
            message: "Could not start payment"
        });
    }
});
app.post("/payment/verify", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Missing payment details"
            });
        }

        const existingOrder = await paymentOrder.findOne({
            order_id: razorpay_order_id
        });

        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (existingOrder.user_email !== req.session.email) {
            return res.status(403).json({
                success: false,
                message: "Order does not belong to this user"
            });
        }

        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            await paymentOrder.findOneAndUpdate(
                { order_id: razorpay_order_id },
                {
                    status: "FAILED",
                    gateway_response: req.body,
                    txn_id: razorpay_payment_id,
                    payment_mode: "RAZORPAY"
                }
            );
            await user_profile.updateOne(
                { email: req.session.email },
                {
                    $push: {
                        notifications: {
                            email: req.session.email,
                            content: `Payment Failed for the payment id ${razorpay_payment_id} `
                        }
                    }
                }
            );
            return res.status(400).json({
                success: false,
                message: "Payment verification failed"
            });
        }

        if (existingOrder.status !== "SUCCESS") {
            await user_profile.findOneAndUpdate(
                { email: existingOrder.user_email },
                {
                    $inc: { Doc_score: existingOrder.docscore_to_add },
                    $set: { subscription: "Paid Tier" },
                    $push: {
                        payment_history: {
                            order_id: existingOrder.order_id,
                            payment_id: razorpay_payment_id,
                            amount: existingOrder.amount,
                            plan: existingOrder.plan_label,
                            docscore_added: existingOrder.docscore_to_add,
                            status: "SUCCESS",
                            date: new Date()
                        }
                    }
                }
            );

            await paymentOrder.findOneAndUpdate(
                { order_id: razorpay_order_id },
                {
                    status: "SUCCESS",
                    txn_id: razorpay_payment_id,
                    payment_mode: "RAZORPAY",
                    gateway_response: req.body
                }
            );

            try {
                const user = await user_profile.findOne({ email: existingOrder.user_email });

                if (user) {
                    await sendRechargeSuccessEmail(user.email, user.name, {
                        planLabel: existingOrder.plan_label,
                        amount: existingOrder.amount,
                        docscoreAdded: existingOrder.docscore_to_add,
                        orderId: existingOrder.order_id,
                        paymentId: razorpay_payment_id,
                        date: new Date()
                    });
                    await user_profile.updateOne(
                        { email: req.session.email },
                        {
                            $push: {
                                notifications: {
                                    email: req.session.email,
                                    content: `Payment successful 🎉

                     +${existingOrder.docscore_to_add} DocScore added.
                     Plan: ${existingOrder.plan_label}
                     Amount: ₹${existingOrder.amount}`
                                }
                            }
                        }
                    );
                }
            } catch (mailErr) {
                console.error("Recharge success email failed:", mailErr.message);
            }
        }

        return res.json({
            success: true,
            redirectUrl: "/profile?payment=success"
        });

    } catch (err) {
        console.error("Razorpay verify error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error during payment verification"
        });
    }
});
/****************************
 contact us
 ****************************/
app.get("/contact",(req,res)=>{
    res.render("contact");
});
/****************************
 Version Report
 ****************************/
app.get("/version_report",async (req,res)=>{
    if(!req.session.email){
        res.redirect("/signin");
    }
    const user_details = await user_profile.findOne({email:req.session.email});
    res.render("version_report",{user:user_details});
})
app.get("/auth/google", (req, res, next) => {
    const nextPath = req.query.next || "/dashboard";

    let safeNext = "/dashboard";
    if (
        nextPath &&
        typeof nextPath === "string" &&
        nextPath.startsWith("/") &&
        !nextPath.startsWith("//")
    ) {
        safeNext = nextPath;
    }

    const state = Buffer.from(
        JSON.stringify({ next: safeNext }),
        "utf8"
    ).toString("base64url");

    passport.authenticate("google", {
        scope: ["profile", "email"],
        state
    })(req, res, next);
});

app.get(
    "/auth/google/callback",
    passport.authenticate("google", {
        failureRedirect: "/signin"
    }),
    async (req, res) => {
        try {
            const googleUser = req.user;

            if (!googleUser) {
                return res.redirect("/signin");
            }

            let redirectTo = "/dashboard";

            try {
                if (req.query.state) {
                    const parsed = JSON.parse(
                        Buffer.from(req.query.state, "base64url").toString("utf8")
                    );

                    if (
                        parsed.next &&
                        typeof parsed.next === "string" &&
                        parsed.next.startsWith("/") &&
                        !parsed.next.startsWith("//")
                    ) {
                        redirectTo = parsed.next;
                    }
                }
            } catch (err) {
                console.log("Failed to parse Google state:", err);
            }

            // Existing user → login directly
            if (googleUser._id) {
                req.session.email = googleUser.email;

                return req.session.save((err) => {
                    if (err) {
                        console.error("Failed to save login session:", err);
                        return res.redirect("/dashboard");
                    }
                    return res.redirect(redirectTo);
                });
            }

            // New Google user → ask for password
            if (googleUser.googleAuthTemp) {
                req.session.googleSignup = {
                    email: googleUser.email,
                    name: googleUser.name,
                    avatar: googleUser.avatar,
                    next: redirectTo
                };

                return req.session.save((err) => {
                    if (err) {
                        console.error("Failed to save googleSignup session:", err);
                        return res.redirect("/signin");
                    }
                    return res.redirect("/google_create_password");
                });
            }

            return res.redirect("/signin");
        } catch (err) {
            console.log("Google callback error:", err);
            return res.redirect("/signin");
        }
    }
);

app.get("/google_create_password", (req, res) => {
    const data = req.session.googleSignup;

    if (!data) {
        return res.redirect("/signup");
    }

    res.render("google_create_password", {
        email: data.email,
        name: data.name,
        err: null
    });
});

app.post("/google_create_password", async (req, res) => {
    try {
        const data = req.session.googleSignup;

        if (!data) {
            return res.redirect("/signup");
        }

        const { password, confirm_password } = req.body;

        if (!password || !confirm_password) {
            return res.render("google_create_password", {
                email: data.email,
                name: data.name,
                err: { message: "Please fill both password fields." }
            });
        }

        if (password.length < 6 || password.length > 10) {
            return res.render("google_create_password", {
                email: data.email,
                name: data.name,
                err: { message: "Password must be between 6 and 10 characters." }
            });
        }

        if (password !== confirm_password) {
            return res.render("google_create_password", {
                email: data.email,
                name: data.name,
                err: { message: "Passwords do not match." }
            });
        }

        const alreadyExists = await user_profile.findOne({ email: data.email });

        if (alreadyExists) {
            req.session.email = alreadyExists.email;
            const redirectTo = data.next || "/dashboard";
            delete req.session.googleSignup;

            return req.session.save((err) => {
                if (err) {
                    console.error("Failed to save existing Google user session:", err);
                    return res.redirect("/dashboard");
                }
                return res.redirect(redirectTo);
            });
        }

        const newUser = await user_profile.create({
            name: data.name,
            email: data.email,
            password,
            google_auth: true,
            avatar_img_path: data.avatar
        });

        try {
            await sendWelcomeEmail(newUser.email, newUser.name);
        } catch (mailErr) {
            console.error("Welcome email failed:", mailErr.message);
        }

        req.session.email = data.email;
        const redirectTo = data.next || "/dashboard";
        delete req.session.googleSignup;

        return req.session.save((err) => {
            if (err) {
                console.error("Failed to save new Google user session:", err);
                return res.redirect("/dashboard");
            }
            return res.redirect(redirectTo);
        });
    } catch (err) {
        console.log("Google create password error:", err);
        return res.status(500).send("Internal Server Error");
    }
});
/* ***************************
   Profile View by Second person
 ****************************/
app.get("/show_other_user_profile/:email", async (req, res) => {
    try {
        const targetEmail = String(req.params.email).trim().toLowerCase();

        const user_data = await user_profile.findOne({
            email: targetEmail
        }).populate("uploads.doc_id", "college subject chapter reviewed");

        if (!user_data) {
            return res.status(404).send("User not found");
        }

        const personal_data = await user_profile.findOne({
            email: req.session.email
        });

        let s_status = false;

        if (personal_data && Array.isArray(personal_data.saved_profiles)) {
            s_status = personal_data.saved_profiles.some(
                item => item.email === targetEmail
            );
        }

        return res.render("profile_view_second_person", {
            data: user_data,
            p_data: personal_data,
            saved_status: s_status
        });

    } catch (err) {
        console.log("Public profile error:", err);
        return res.status(500).send("Internal Server Error");
    }
});
app.get("/save_profile/:email", async (req, res) => {
    await user_profile.findOneAndUpdate(
        { email: req.session.email },
        {
            $addToSet: {
                saved_profiles: {
                    email: String(req.params.email).trim().toLowerCase()
                }
            }
        }
    );
    const saved_profile_user_data = await user_profile.findOne({email:req.params.email})
    const user_data = await user_profile.findOne({email:req.session.email})
    // await user_profile.updateOne(
    //     { email: req.session.email },
    //     {
    //         $push: {
    //             notifications: {
    //                 email: req.session.email,
    //                 content: `${saved_profile_user_data.name}'s profile saved successfully for your account`
    //             }
    //         }
    //     }
    // );
    res.redirect(`/show_other_user_profile/${encodeURIComponent(req.params.email)}`);
});

app.get("/all_uploads_view_second_pov_profile/:_id", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }

    try {
        const user_data = await user_profile.findById(req.params._id)
            .populate("uploads.doc_id");

        if (!user_data) {
            return res.status(404).send("User not found");
        }

        const verifiedUploads = (user_data.uploads || [])
            .filter(upload => upload?.doc_id?.reviewed)
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        res.render("all_upload_view_second_pov_profile", {
            data: user_data,
            uploads: verifiedUploads
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get("/saved_docs", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }

    try {
        // Fetch the user and populate the saved_documents array
        const user_data = await user_profile.findOne({ email: req.session.email })
            .populate("saved_documents");

        if (!user_data) {
            return res.status(404).send("User not found");
        }

        // Filter out any null documents (in case a saved doc was deleted from the database)
        const validSavedDocs = (user_data.saved_documents || [])
            .filter(doc => doc != null)
            .reverse(); // Reverse so newest saves appear first

        res.render("saved_docs", {
            data: user_data,
            savedDocs: validSavedDocs
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
/* ***************************
   notification
 ****************************/
app.get("/notifications", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.redirect("/signin");
        }

        const user = await user_profile.findOne({ email: req.session.email });

        if (!user) {
            return res.redirect("/signin");
        }

        if (Array.isArray(user.notifications) && user.notifications.length > 0) {
            user.notifications.forEach((notification) => {
                notification.isRead = true;
            });

            await user.save();
        }

        const notifications = Array.isArray(user.notifications)
            ? user.notifications.slice().sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            })
            : [];

        res.render("notifications", {
            user,
            notifications
        });
    } catch (err) {
        console.log("Notifications page error:", err);
        res.status(500).send("Server Error");
    }
});

/*
Chat Rooms
 */
/******************************
 Chat Rooms
 ******************************/
io.on("connection", (socket) => {
    console.log("socket connected:", socket.id);
    const MESSAGE_COOLDOWN_MS = 10000;
    const req = socket.request;
    const session = req.session;

    socket.on("join_college_room", async ({ roomId, collegeName }) => {
        try {
            console.log("join room request:", roomId, collegeName, session?.email);

            if (!session?.email) {
                return socket.emit("chat_error", "Please sign in first.");
            }

            const user = await user_profile.findOne({ email: session.email });

            if (!user) {
                return socket.emit("chat_error", "User not found.");
            }

            socket.join(roomId);
            console.log("joined room:", roomId);

            socket.data.roomId = roomId;
            socket.data.userEmail = user.email;
            socket.data.userName = user.name;
            socket.data.userProfilePic = user.avatar_img_path || "";
            socket.data.collegeName = collegeName;

        } catch (err) {
            console.log("join room error:", err);
            socket.emit("chat_error", "Could not join room.");
        }
    });

    socket.on("send_message", async (payload) => {
        try {
            console.log("send_message payload:", payload);
            console.log("socket room/user:", socket.data.roomId, socket.data.userEmail);

            if (!socket.data.roomId || !socket.data.userEmail) {
                return socket.emit("chat_error", "Join a room first.");
            }

            const now = Date.now();
            const lastMessageAt = socket.data.lastMessageAt || 0;

            if (now - lastMessageAt < MESSAGE_COOLDOWN_MS) {
                const remaining = Math.ceil((MESSAGE_COOLDOWN_MS - (now - lastMessageAt)) / 1000);
                return socket.emit("chat_error", `You're sending too fast. Wait ${remaining}s.`);
            }

            const message = payload?.message?.trim();
            if (!message) return;

            if (message.length > 1000) {
                return socket.emit("chat_error", "Message too long.");
            }

            socket.data.lastMessageAt = now;

            const savedMessage = await ChatMessage.create({
                room_id: socket.data.roomId,
                college: socket.data.collegeName,
                sender_email: socket.data.userEmail,
                sender_name: socket.data.userName,
                sender_profile_pic: socket.data.userProfilePic,
                message
            });

            console.log("emitting receive_message to room:", socket.data.roomId);

            io.to(socket.data.roomId).emit("receive_message", {
                _id: savedMessage._id,
                room_id: savedMessage.room_id,
                college: savedMessage.college,
                sender_email: savedMessage.sender_email,
                sender_name: savedMessage.sender_name,
                sender_profile_pic: savedMessage.sender_profile_pic,
                message: savedMessage.message,
                createdAt: savedMessage.createdAt
            });
        } catch (err) {
            console.log("send_message error:", err);
            socket.emit("chat_error", "Failed to send message.");
        }
    });
    socket.on("share_document", async (payload) => {
        try {
            if (!socket.data.roomId || !socket.data.userEmail) {
                return socket.emit("chat_error", "Join a room first.");
            }

            const docId = String(payload?.doc_id || "").trim();
            const text = String(payload?.text || "").trim();

            if (!docId) {
                return socket.emit("chat_error", "Document not found.");
            }

            const doc = await Docs.findById(docId).lean();

            if (!doc) {
                return socket.emit("chat_error", "Document does not exist.");
            }

            const expectedRoomId = `college_${String(doc.college || "")
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")}`;

            if (expectedRoomId !== socket.data.roomId) {
                return socket.emit("chat_error", "This document belongs to a different college room.");
            }

            const savedMessage = await ChatMessage.create({
                room_id: socket.data.roomId,
                college: socket.data.collegeName,
                sender_email: socket.data.userEmail,
                sender_name: socket.data.userName,
                sender_profile_pic: socket.data.userProfilePic,
                message: text,
                message_type: "doc_share",
                shared_doc: {
                    doc_id: doc._id,
                    subject: doc.subject || "",
                    chapter: doc.chapter || "",
                    college: doc.college || "",
                    reviewed: !!doc.reviewed,
                    likes: typeof doc.likes === "number" ? doc.likes : 0,
                    uploaded_by: doc.uploaded_by || ""
                }
            });

            io.to(socket.data.roomId).emit("receive_message", {
                _id: savedMessage._id,
                room_id: savedMessage.room_id,
                college: savedMessage.college,
                sender_email: savedMessage.sender_email,
                sender_name: savedMessage.sender_name,
                sender_profile_pic: savedMessage.sender_profile_pic,
                message: savedMessage.message,
                message_type: savedMessage.message_type,
                shared_doc: savedMessage.shared_doc,
                createdAt: savedMessage.createdAt
            });
        } catch (err) {
            console.log("share_document error:", err);
            socket.emit("chat_error", "Failed to share document.");
        }
    });
    socket.on("disconnect", () => {
        console.log("socket disconnected:", socket.id);

        if (socket.data?.roomId && socket.data?.userName) {
            socket.to(socket.data.roomId).emit("user_left", {
                name: socket.data.userName
            });
        }
    });
});

app.get("/college_chat/:collegeName", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.redirect("/signin");
        }

        const collegeName = decodeURIComponent(req.params.collegeName).trim();
        const roomId = `college_${collegeName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

        const user = await user_profile.findOne({ email: req.session.email });

        if (!user) {
            return res.redirect("/signin");
        }

        const oldMessages = await ChatMessage.find({ room_id: roomId })
            .sort({ createdAt: 1 })
            .limit(100)
            .lean();

        return res.render("college_chat", {
            collegeName,
            roomId,
            currentUser: {
                email: user.email,
                name: user.name,
                profile_pic: user.avatar_img_path || ""
            },
            oldMessages
        });
    } catch (err) {
        console.log("college chat route error:", err);
        return res.status(500).send("Server error");
    }
});

app.post("/share_doc_to_chat", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first."
            });
        }

        const { roomId, doc_id, text } = req.body;

        if (!roomId || !doc_id) {
            return res.status(400).json({
                success: false,
                message: "Missing document data."
            });
        }

        const user = await user_profile.findOne({ email: req.session.email });
        const doc = await Docs.findById(doc_id).lean();

        if (!user || !doc) {
            return res.status(404).json({
                success: false,
                message: "User or document not found."
            });
        }

        const expectedRoomId = `college_${String(doc.college || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")}`;

        if (roomId !== expectedRoomId) {
            return res.status(400).json({
                success: false,
                message: "This document belongs to a different college room."
            });
        }

        const savedMessage = await ChatMessage.create({
            room_id: roomId,
            college: doc.college,
            sender_email: user.email,
            sender_name: user.name,
            sender_profile_pic: user.avatar_img_path || "",
            message: String(text || "").trim(),
            message_type: "doc_share",
            shared_doc: {
                doc_id: doc._id,
                subject: doc.subject || "",
                chapter: doc.chapter || "",
                college: doc.college || "",
                reviewed: !!doc.reviewed,
                likes: typeof doc.likes === "number" ? doc.likes : 0,
                uploaded_by: doc.uploaded_by || ""
            }
        });

        io.to(roomId).emit("receive_message", {
            _id: savedMessage._id,
            room_id: savedMessage.room_id,
            college: savedMessage.college,
            sender_email: savedMessage.sender_email,
            sender_name: savedMessage.sender_name,
            sender_profile_pic: savedMessage.sender_profile_pic,
            message: savedMessage.message,
            message_type: savedMessage.message_type,
            shared_doc: savedMessage.shared_doc,
            createdAt: savedMessage.createdAt
        });

        return res.json({
            success: true
        });
    } catch (err) {
        console.log("share_doc_to_chat route error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error."
        });
    }
});
/*
 * ══════════════════════════════
 *  END OF GEMINI AI PIPELINE
 * ══════════════════════════════
 */

app.post("/report_doc", async (req, res) => {
    if (!req.session.email) {
        return res.status(401).json({
            success: false,
            message: "Please sign in first."
        });
    }

    try {
        const { email, report_text, doc_new_id } = req.body;


        await reports.create({
            reported_by_email: email,
            report: report_text,
            doc_id: doc_new_id
        });

        return res.status(200).json({
            success: true,
            message: "Report submitted successfully."
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
});

app.post("/contact", async (req, res) => {
    if (!req.session.email) {
        return res.status(401).json({ success: false });
    }

    try {
        const { name, topic, message } = req.body;

        await Contact.create({
            email: req.session.email,
            name,
            topic,
            message
        });

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/*******************
 Subscription Plans
 *****************/

app.get("/upgrade-plans", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }

    const user_data = await user_profile.findOne({ email: req.session.email });
    res.render("upgrade_plans", { data: user_data });
});

app.post("/buy-subscription", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

        const { plan } = req.body;
        const selectedPlan = SUBSCRIPTION_PLANS[plan];

        if (!selectedPlan) {
            return res.status(400).json({
                success: false,
                message: "Invalid subscription plan"
            });
        }

        const razorpayPlan = await razorpay.plans.create({
            period: selectedPlan.period,
            interval: selectedPlan.interval,
            item: {
                name: selectedPlan.label,
                amount: selectedPlan.amount * 100,
                currency: "INR",
                description: `${selectedPlan.docscore} DocScore per month`
            }
        });

        const subscription = await razorpay.subscriptions.create({
            plan_id: razorpayPlan.id,
            customer_notify: 1,
            total_count: 12,
            notes: {
                user_email: req.session.email,
                plan_key: plan,
                plan_label: selectedPlan.label,
                docscore_per_month: String(selectedPlan.docscore)
            }
        });

        return res.json({
            success: true,
            key: process.env.RAZORPAY_KEY_ID,
            subscriptionId: subscription.id,
            userEmail: req.session.email,
            planLabel: selectedPlan.label
        });
    } catch (err) {
        console.error("Subscription creation error:", err);
        return res.status(500).json({
            success: false,
            message: "Could not start subscription"
        });
    }
});
app.post("/subscription/verify", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

        const {
            razorpay_payment_id,
            razorpay_subscription_id,
            razorpay_signature,
            plan
        } = req.body;

        if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature || !plan) {
            return res.status(400).json({
                success: false,
                message: "Missing subscription details"
            });
        }

        const selectedPlan = SUBSCRIPTION_PLANS[plan];

        if (!selectedPlan) {
            return res.status(400).json({
                success: false,
                message: "Invalid subscription plan"
            });
        }

        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Subscription verification failed"
            });
        }

        const user = await user_profile.findOne({ email: req.session.email });

        const alreadyCredited = Array.isArray(user?.payment_history)
            ? user.payment_history.some(entry => entry.payment_id === razorpay_payment_id)
            : false;

        const updateOps = {
            $set: {
                subscription: selectedPlan.label,
                subscription_status: "ACTIVE",
                subscription_id: razorpay_subscription_id,
                subscription_plan_key: plan
            },
            $push: {
                notifications: {
                    email: req.session.email,
                    content: `${selectedPlan.label} subscription activated successfully.`
                }
            }
        };

        if (!alreadyCredited) {
            updateOps.$inc = {
                Doc_score: selectedPlan.docscore
            };

            updateOps.$push.payment_history = {
                order_id: razorpay_subscription_id,
                payment_id: razorpay_payment_id,
                amount: selectedPlan.amount,
                plan: selectedPlan.label,
                docscore_added: selectedPlan.docscore,
                status: "SUCCESS",
                date: new Date()
            };
        }

        await user_profile.findOneAndUpdate(
            { email: req.session.email },
            updateOps
        );

        return res.json({
            success: true,
            redirectUrl: "/profile"
        });
    } catch (err) {
        console.error("Subscription verification error:", err);
        return res.status(500).json({
            success: false,
            message: "Could not verify subscription"
        });
    }
});




/*************************
 DOC UP DEV Routes
 ***************************/
/****************
 Sign In
 *****************/
app.get('/dev', (req, res) => {
    // if(req.session.email){
    //     return res.redirect("/dashboard");
    // }
    return res.redirect('/dev/signin');
});
app.get("/dev/signin", (req, res) => {
    res.render("dev_signin",{err:null});
})
app.post('/dev/signin', async (req, res) => {
    const{email, password} = req.body;
    const user_data = await user_profile.findOne({email:email});
    if (!user_data) {
        return  res.render('/dev/signin',{err:"You dont have an account with this email"});
    }
    if(!(user_data.password === password)){
        return  res.render('/dev/signin',{err:"Wrong Password !"});
    }
    if((user_data.user_type ==="DocUp Developer") || (user_data.user_type ==="DocUp Admin")){
        req.session.dev_email = email;
        res.redirect("/dev/dashboard");
    }
    else{
        return res.render('dev_signin',{err: "You are not allowed access to DocUp Dev."});
    }
});
/****************
 Dashboard
 *****************/
app.get("/dev/dashboard", async (req, res) => {
    if(!req.session.dev_email){
        return res.redirect("/dev/signin");
    }
    try {

        // ===== USERS =====
        const totalUsers = await user_profile.countDocuments();
        const totalAdmins = await user_profile.countDocuments({ user_type: "DocUp Admin" });
        const totalDevelopers = await user_profile.countDocuments({ user_type: "DocUp Developer" });
        const totalVerifiedUploaders = await user_profile.countDocuments({ user_type: "Verified Uploader" });

        // ===== DOCS =====
        const totalDocs = await Docs.countDocuments();
        const reviewedDocs = await Docs.countDocuments({ reviewed: true });
        const unreviewedDocs = await Docs.countDocuments({ reviewed: false });

        // ===== REPORTS =====
        const totalReports = await reports.countDocuments();

        // ===== COMMENTS (from Docs) =====
        const docs = await Docs.find({}, "comment_section");

        let totalComments = 0;
        docs.forEach(doc => {
            totalComments += doc.comment_section.length;
        });

        // ===== CHAT MESSAGES =====
        const totalMessages = await ChatMessage.countDocuments();

        // ===== RECENT ACTIVITY (simple version) =====
        const recentDocs = await Docs.find()
            .sort({ _id: -1 })
            .limit(5)
            .select("subject uploaded_by reviewed");

        res.render("dev_dashboard", {
            totalUsers,
            totalAdmins,
            totalDevelopers,
            totalVerifiedUploaders,

            totalDocs,
            reviewedDocs,
            unreviewedDocs,

            totalReports,
            totalComments,
            totalMessages,

            recentDocs
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Error loading dashboard");
    }
});
/****************
 Docs Moderation
 *****************/
app.get("/dev/docs", async (req, res) => {
    if(!req.session.dev_email){
        return res.redirect("/dev/signin");
    }
    try {
        const allDocs = await Docs.find().sort({ _id: -1 });

        const reportedDocIds = await reports.distinct("doc_id");

        const docsWithReportInfo = allDocs.map((doc) => {
            const docObj = doc.toObject();

            docObj.commentCount = Array.isArray(doc.comment_section)
                ? doc.comment_section.length
                : 0;

            docObj.isReported = reportedDocIds.some(
                (id) => id.toString() === doc._id.toString()
            );

            return docObj;
        });

        res.render("dev_docs", {
            docs: docsWithReportInfo
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error loading docs moderation page");
    }
});

app.post("/dev/docs/:id/review", async (req, res) => {
    if (!req.session.dev_email) {
        return res.redirect("/dev/signin");
    }

    try {
        const doc = await Docs.findByIdAndUpdate(
            req.params.id,
            { reviewed: true },
            { new: true }
        );

        if (doc?.uploaded_by) {
            await user_profile.updateOne(
                { email: doc.uploaded_by },
                {
                    $push: {
                        notifications: {
                            content: `✅ Your document "${doc.chapter}" (${doc.subject}) has been verified by DocUp Moderation Team.`,
                            createdAt: new Date(),
                            isRead: false
                        }
                    }
                }
            );
        }

        const redirectTo = req.body.redirectTo || req.get("Referrer") || "/dev/docs";
        res.redirect(redirectTo);

    } catch (error) {
        console.error(error);
        res.status(500).send("Error marking doc as reviewed");
    }
});

app.post("/dev/docs/:id/unreview", async (req, res) => {
    if (!req.session.dev_email) {
        return res.redirect("/dev/signin");
    }

    try {
        const doc = await Docs.findByIdAndUpdate(
            req.params.id,
            { reviewed: false },
            { new: true }
        );

        if (doc?.uploaded_by) {
            await user_profile.updateOne(
                { email: doc.uploaded_by },
                {
                    $push: {
                        notifications: {
                            content: `⚠️ Your document "${doc.chapter}" (${doc.subject}) has been set to unreviewed by DocUp Moderation Team.`,
                            createdAt: new Date(),
                            isRead: false
                        }
                    }
                }
            );
        }

        const redirectTo = req.body.redirectTo || req.get("Referrer") || "/dev/docs";
        res.redirect(redirectTo);

    } catch (error) {
        console.error(error);
        res.status(500).send("Error marking doc as unreviewed");
    }
});

app.post("/dev/docs/:id/delete", async (req, res) => {
    if (!req.session.dev_email) {
        return res.redirect("/dev/signin");
    }

    try {
        const docId = req.params.id;

        const doc = await Docs.findById(docId);

        if (!doc) {
            return res.status(404).send("Document not found");
        }

        await reports.deleteMany({ doc_id: docId });
        await Docs.findByIdAndDelete(docId);

        let message = `❌ Your document "${doc.chapter}" (${doc.subject}) was removed by the DocUp Moderation Team.`;

        // Deduct score ONLY if protected
        if (doc.protected && doc.uploaded_by) {
            await user_profile.updateOne(
                { email: doc.uploaded_by },
                { $inc: { Doc_score: -1 } }
            );

            message += ` 1 DocScore has been deducted.`;
        }

        // Remove from uploads
        await user_profile.updateOne(
            { email: doc.uploaded_by },
            {
                $pull: {
                    uploads: { doc_id: docId }
                }
            }
        );

        // Send notification
        if (doc.uploaded_by) {
            await user_profile.updateOne(
                { email: doc.uploaded_by },
                {
                    $push: {
                        notifications: {
                            content: message,
                            createdAt: new Date(),
                            isRead: false
                        }
                    }
                }
            );
        }

        const redirectTo = req.body.redirectTo || req.get("Referrer") || "/dev/docs";
        res.redirect(redirectTo);

    } catch (error) {
        console.error(error);
        res.status(500).send("Error deleting doc");
    }
});
/****************
 Reports
 *****************/
app.get("/dev/reports", async (req, res) => {
    if (!req.session.dev_email) {
        return res.redirect("/dev/signin");
    }

    try {
        // 🔹 Fetch both collections
        const allReports = await reports.find().sort({ createdAt: -1 });
        const allContacts = await Contact.find().sort({ createdAt: -1 });

        // 🔹 Get valid doc IDs only
        const reportedDocIds = allReports
            .map(r => r.doc_id)
            .filter(id => id); // remove null/undefined

        const relatedDocs = await Docs.find({
            _id: { $in: reportedDocIds }
        });

        // 🔹 Build doc map
        const docMap = new Map();
        relatedDocs.forEach(doc => {
            docMap.set(doc._id.toString(), doc);
        });

        // 🔹 Map report cards
        const reportCards = allReports.map(report => {
            const linkedDoc = report.doc_id
                ? docMap.get(report.doc_id.toString())
                : null;

            return {
                type: "report",
                _id: report._id,
                reported_by_email: report.reported_by_email,
                report: report.report,
                createdAt: report.createdAt || new Date(),
                doc_id: report.doc_id,
                doc: linkedDoc || null
            };
        });

        // 🔹 Map contact cards (FIXED)
        const contactCards = allContacts.map(contact => ({
            type: "contact",
            _id: contact._id,
            reported_by_email: contact.email || "Unknown",
            report: `[${contact.topic || "General"}] ${contact.message || ""}`,
            createdAt: contact.createdAt || new Date(), // ✅ FIXED
            doc: null
        }));

        // 🔹 Merge + SAFE sort
        const combined = [...reportCards, ...contactCards].sort(
            (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );

        res.render("dev_reports", {
            reportsData: combined
        });

    } catch (error) {
        console.error("DEV REPORTS ERROR:", error);
        res.status(500).send("Error loading reports page");
    }
});

app.post("/dev/reports/:id/delete-doc", async (req, res) => {
    if(!req.session.dev_email){
        return res.redirect("/dev/signin");
    }
    try {
        const reportDoc = await reports.findById(req.params.id);

        if (!reportDoc) {
            return res.status(404).send("Report not found");
        }

        await reports.deleteMany({ doc_id: reportDoc.doc_id });
        await Docs.findByIdAndDelete(reportDoc.doc_id);

        res.redirect("/dev/reports");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error deleting reported doc");
    }
});
app.post("/dev/reports/:id/delete", async (req, res) => {
    if(!req.session.dev_email){
        return res.redirect("/dev/signin");
    }
    try {
        const reportDoc = await reports.findById(req.params.id);

        if (!reportDoc) {
            return res.status(404).send("Report not found");
        }

        await reports.deleteMany({ doc_id: reportDoc.doc_id });
        // await Docs.findByIdAndDelete(reportDoc.doc_id);

        res.redirect("/dev/reports");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error deleting reported doc");
    }
});
app.post("/dev/contact/:id/delete", async (req, res) => {
    if (!req.session.dev_email) {
        return res.redirect("/dev/signin");
    }

    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.redirect("/dev/reports");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting contact message");
    }
});
/****************
 Users
 *****************/
app.get("/dev/users", async (req, res) => {
    if(!req.session.dev_email){
        return res.redirect("/dev/signin");
    }
    try {
        const allUsers = await user_profile.find().sort({ _id: -1 });

        const usersData = allUsers.map(user => {
            const userObj = user.toObject();

            userObj.uploadCount = Array.isArray(user.uploads) ? user.uploads.length : 0;
            userObj.savedDocsCount = Array.isArray(user.saved_documents) ? user.saved_documents.length : 0;
            userObj.savedProfilesCount = Array.isArray(user.saved_profiles) ? user.saved_profiles.length : 0;
            userObj.notificationCount = Array.isArray(user.notifications) ? user.notifications.length : 0;
            userObj.unreadNotificationCount = Array.isArray(user.notifications)
                ? user.notifications.filter(n => !n.isRead).length
                : 0;
            userObj.paymentCount = Array.isArray(user.payment_history) ? user.payment_history.length : 0;
            userObj.viewHistoryCount = Array.isArray(user.doc_view_history) ? user.doc_view_history.length : 0;

            return userObj;
        });

        res.render("dev_users", {
            usersData
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error loading users page");
    }
});
app.post("/dev/users/:id/delete", async (req, res) => {
    if(!req.session.dev_email){
        return res.redirect("/dev/signin");
    }
    try {
        await user_profile.findByIdAndDelete(req.params.id);
        res.redirect("/dev/users");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error deleting user");
    }
});
/****************
 Activity Page
 *****************/
app.get("/dev/activity", async (req, res) => {
    if(!req.session.dev_email){
        return res.redirect("/dev/signin");
    }
    try {
        const allUsers = await user_profile.find().sort({ _id: -1 });

        const usersAnalytics = allUsers.map(user => {
            const uploads = Array.isArray(user.uploads) ? user.uploads : [];
            const notifications = Array.isArray(user.notifications) ? user.notifications : [];
            const payments = Array.isArray(user.payment_history) ? user.payment_history : [];
            const savedDocs = Array.isArray(user.saved_documents) ? user.saved_documents : [];
            const savedProfiles = Array.isArray(user.saved_profiles) ? user.saved_profiles : [];
            const viewedDocs = Array.isArray(user.doc_view_history) ? user.doc_view_history : [];

            const groupByDay = (items, dateGetter) => {
                const map = {};

                items.forEach(item => {
                    const raw = dateGetter(item);
                    if (!raw) return;

                    const d = new Date(raw);
                    if (isNaN(d.getTime())) return;

                    const key = d.toISOString().slice(0, 10);
                    map[key] = (map[key] || 0) + 1;
                });

                return Object.entries(map)
                    .sort(([a], [b]) => new Date(a) - new Date(b))
                    .map(([date, count]) => ({ date, count }));
            };

            const uploadsTimeline = groupByDay(uploads, item => item.uploadedAt);
            const notificationsTimeline = groupByDay(notifications, item => item.createdAt);
            const paymentsTimeline = groupByDay(payments, item => item.date);

            return {
                ...user.toObject(),
                uploadCount: uploads.length,
                notificationCount: notifications.length,
                unreadNotificationCount: notifications.filter(n => !n.isRead).length,
                paymentCount: payments.length,
                savedDocsCount: savedDocs.length,
                savedProfilesCount: savedProfiles.length,
                viewedDocsCount: viewedDocs.length,
                latestPayment: payments.length > 0 ? payments[payments.length - 1] : null,
                uploadsTimeline,
                notificationsTimeline,
                paymentsTimeline
            };
        });

        res.render("dev_activity", { usersAnalytics });
    } catch (err) {
        console.error(err);
        res.status(500).send("Activity error");
    }
});
function escapeRegexSEO(str = "") {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(str) {
    return String(str || "")
        .toLowerCase()
        .trim()
        .replace(/,/g, "")
        .replace(/\s+/g, " ");
}

function normalizeCompact(str) {
    return normalizeText(str).replace(/\s/g, "");
}

function slugifyText(str = "") {
    return String(str || "")
        .toLowerCase()
        .trim()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

const COLLEGE_SLUG_ALIASES = {
    // India
    upes: "University of Petroleum and Energy Studies,UPES",
    "iit-delhi": "Indian Institute of Technology Delhi",
    "iit-bombay": "Indian Institute of Technology Bombay",
    "iit-madras": "Indian Institute of Technology Madras",
    "iit-kanpur": "Indian Institute of Technology Kanpur",
    "iit-kharagpur": "Indian Institute of Technology Kharagpur",
    "iit-roorkee": "Indian Institute of Technology Roorkee",
    "iit-guwahati": "Indian Institute of Technology Guwahati",
    "iit-hyderabad": "Indian Institute of Technology Hyderabad",
    "iit-indore": "Indian Institute of Technology Indore",
    "iit-bhu": "Indian Institute of Technology (BHU) Varanasi",
    "iit-bhubaneswar": "Indian Institute of Technology Bhubaneswar",
    "iit-gandhinagar": "Indian Institute of Technology Gandhinagar",
    "iit-jodhpur": "Indian Institute of Technology Jodhpur",
    "iit-patna": "Indian Institute of Technology Patna",
    "iit-ropar": "Indian Institute of Technology Ropar",
    "iit-mandi": "Indian Institute of Technology Mandi",
    "iit-palakad": "Indian Institute of Technology Palakkad",
    "iit-tirupati": "Indian Institute of Technology Tirupati",
    "iit-jammu": "Indian Institute of Technology Jammu",
    "iit-dhanbad": "Indian Institute of Technology (ISM) Dhanbad",
    "iit-ism-dhanbad": "Indian Institute of Technology (ISM) Dhanbad",

    "nit-trichy": "National Institute of Technology Tiruchirappalli",
    "nit-surathkal": "National Institute of Technology Karnataka Surathkal",
    "nit-warangal": "National Institute of Technology Warangal",
    "nit-calicut": "National Institute of Technology Calicut",
    "nit-rourkela": "National Institute of Technology Rourkela",
    "nit-allahabad": "Motilal Nehru National Institute of Technology Allahabad",
    "nit-kurukshetra": "National Institute of Technology Kurukshetra",
    "nit-jaipur": "Malaviya National Institute of Technology Jaipur",
    "nit-bhopal": "Maulana Azad National Institute of Technology Bhopal",
    "nit-jalandhar": "Dr B R Ambedkar National Institute of Technology Jalandhar",
    "nit-durgapur": "National Institute of Technology Durgapur",
    "nit-silchar": "National Institute of Technology Silchar",
    "nit-hamirpur": "National Institute of Technology Hamirpur",
    "nit-patna": "National Institute of Technology Patna",
    "nit-raipur": "National Institute of Technology Raipur",

    bits: "Birla Institute of Technology and Science Pilani",
    "bits-pilani": "Birla Institute of Technology and Science Pilani",
    "bits-goa": "Birla Institute of Technology and Science, Goa",
    "bits-hyderabad": "Birla Institute of Technology and Science, Hyderabad",

    "iiit-hyderabad": "International Institute of Information Technology Hyderabad",
    "iiit-bangalore": "International Institute of Information Technology Bangalore",
    "iiit-delhi": "Indraprastha Institute of Information Technology Delhi",
    "iiit-allahabad": "Indian Institute of Information Technology Allahabad",
    "iiit-lucknow": "Indian Institute of Information Technology Lucknow",
    "iiit-gwalior": "ABV-Indian Institute of Information Technology and Management Gwalior",

    vit: "Vellore Institute of Technology",
    "vit-vellore": "Vellore Institute of Technology",
    "vit-chennai": "Vellore Institute of Technology Chennai",
    srm: "SRM Institute of Science and Technology",
    "srm-ktr": "SRM Institute of Science and Technology",
    manipal: "Manipal Institute of Technology",
    "manipal-university": "Manipal University Jaipur",
    thapar: "Thapar Institute of Engineering and Technology",
    amity: "Amity University",
    lpu: "Lovely Professional University",
    kiit: "Kalinga Institute of Industrial Technology",
    jadavpur: "Jadavpur University",
    "jadavpur-university": "Jadavpur University",
    "anna-university": "Anna University",
    "delhi-university": "University of Delhi",
    du: "University of Delhi",
    nsut: "Netaji Subhas University of Technology",
    dtu: "Delhi Technological University",
    "jamia-millia-islamia": "Jamia Millia Islamia",
    "banaras-hindu-university": "Banaras Hindu University",
    bhu: "Banaras Hindu University",
    "aligarh-muslim-university": "Aligarh Muslim University",
    amu: "Aligarh Muslim University",
    "calcutta-university": "University of Calcutta",
    "osmania-university": "Osmania University",
    "punjab-university": "Panjab University",
    "christ-university": "Christ University",
    "shiv-nadar-university": "Shiv Nadar University",
    "flame-university": "FLAME University",
    ashoka: "Ashoka University",
    "shivaji-college": "Shivaji College",
    "st-stephens": "St. Stephen's College",
    "miranda-house": "Miranda House",
    "hindu-college": "Hindu College",

    // Global
    mit: "Massachusetts Institute of Technology",
    harvard: "Harvard University",
    stanford: "Stanford University",
    oxford: "University of Oxford",
    cambridge: "University of Cambridge",
    caltech: "California Institute of Technology",
    princeton: "Princeton University",
    yale: "Yale University",
    columbia: "Columbia University",
    cornell: "Cornell University",
    upenn: "University of Pennsylvania",
    penn: "University of Pennsylvania",
    berkeley: "University of California, Berkeley",
    "uc-berkeley": "University of California, Berkeley",
    ucla: "University of California, Los Angeles",
    "carnegie-mellon": "Carnegie Mellon University",
    cmu: "Carnegie Mellon University",
    imperial: "Imperial College London",
    "imperial-college-london": "Imperial College London",
    nus: "National University of Singapore",
    ntu: "Nanyang Technological University",
    eth: "ETH Zurich",
    "eth-zurich": "ETH Zurich",
    toronto: "University of Toronto",
    "university-of-toronto": "University of Toronto"
};

function getCollegeSlug(realCollegeName = "") {
    const aliasEntry = Object.entries(COLLEGE_SLUG_ALIASES).find(
        ([, realName]) => normalizeText(realName) === normalizeText(realCollegeName)
    );

    if (aliasEntry) return aliasEntry[0];
    return slugifyText(realCollegeName);
}

function resolveCollegeNameFromSlug(slug = "") {
    const loweredSlug = String(slug || "").trim().toLowerCase();
    if (!loweredSlug) return null;
    return COLLEGE_SLUG_ALIASES[loweredSlug] || null;
}

async function renderCollegeSeoPage(req, res) {
    try {
        const rawCollegeSlug = decodeURIComponent(req.params.collegeSlug || "").trim();
        const rawSubjectSlug = decodeURIComponent(req.params.subjectSlug || "").trim();

        if (!rawCollegeSlug) {
            return res.status(404).send("Page not found");
        }

        let resolvedCollegeName = resolveCollegeNameFromSlug(rawCollegeSlug);

        const allCollegeRows = await college.find({}).lean();

        if (!resolvedCollegeName) {
            const matchedCollege =
                allCollegeRows.find(c => slugifyText(c.college_name) === slugifyText(rawCollegeSlug)) ||
                allCollegeRows.find(c => normalizeText(c.college_name) === normalizeText(rawCollegeSlug)) ||
                null;

            resolvedCollegeName = matchedCollege?.college_name || null;
        }

        if (!resolvedCollegeName) {
            return res.status(404).send("Page not found");
        }

        const requestedName = normalizeText(resolvedCollegeName);
        const requestedCompact = normalizeCompact(resolvedCollegeName);

        const collegeData =
            allCollegeRows.find(c => normalizeText(c.college_name) === requestedName) ||
            allCollegeRows.find(c => normalizeCompact(c.college_name) === requestedCompact) ||
            null;

        const allCollegeDocs = await Docs.find({
            college: {
                $regex: `^${escapeRegexSEO(resolvedCollegeName)}$`,
                $options: "i"
            }
        }).lean();

        if (!allCollegeDocs.length) {
            return res.status(404).send("Page not found");
        }

        const subjectMap = new Map();

        for (const doc of allCollegeDocs) {
            const rawSubject = (doc.subject || "Other").trim() || "Other";
            const subjectSlug = slugifyText(rawSubject);

            if (!subjectMap.has(subjectSlug)) {
                subjectMap.set(subjectSlug, {
                    subject: rawSubject,
                    subjectSlug,
                    items: []
                });
            }

            subjectMap.get(subjectSlug).items.push({
                ...doc,
                shareHref: `/view/${doc._id}`
            });
        }

        let filteredDocs = allCollegeDocs;
        let selectedSubjectGroup = null;

        if (rawSubjectSlug) {
            selectedSubjectGroup = subjectMap.get(slugifyText(rawSubjectSlug)) || null;

            if (!selectedSubjectGroup) {
                return res.status(404).send("Page not found");
            }

            filteredDocs = selectedSubjectGroup.items;
        }

        const groupedBySubject = {};
        const branchesSet = new Set();
        const yearsSet = new Set();

        for (const doc of filteredDocs) {
            const subjectKey = (doc.subject || "Other").trim() || "Other";

            if (!groupedBySubject[subjectKey]) {
                groupedBySubject[subjectKey] = [];
            }

            groupedBySubject[subjectKey].push({
                ...doc,
                shareHref: `/view/${doc._id}`
            });

            if (doc.branch) branchesSet.add(doc.branch);
            if (doc.year) yearsSet.add(doc.year);
        }

        const groupedSubjects = Object.entries(groupedBySubject)
            .map(([subject, items]) => ({
                subject,
                subjectSlug: slugifyText(subject),
                items: items.sort((a, b) => {
                    const aScore = (typeof a.likes === "number" ? a.likes : 0) + (a.reviewed ? 10 : 0);
                    const bScore = (typeof b.likes === "number" ? b.likes : 0) + (b.reviewed ? 10 : 0);
                    return bScore - aScore;
                })
            }))
            .sort((a, b) => b.items.length - a.items.length);

        const allSubjectsForChips = Array.from(subjectMap.values())
            .map(group => ({
                subject: group.subject,
                subjectSlug: group.subjectSlug,
                count: group.items.length
            }))
            .sort((a, b) => b.count - a.count);

        const canonicalCollegeSlug = getCollegeSlug(resolvedCollegeName);
        const canonicalPath = rawSubjectSlug
            ? `/notes/${canonicalCollegeSlug}/${slugifyText(rawSubjectSlug)}`
            : `/notes/${canonicalCollegeSlug}`;

        const canonicalUrl = `${req.protocol}://${req.get("host")}${canonicalPath}`;

        const seoTitle = rawSubjectSlug
            ? `${selectedSubjectGroup?.subject || rawSubjectSlug} Notes for ${resolvedCollegeName} | DocUp`
            : `${resolvedCollegeName} Notes, Study Material & PDFs | DocUp`;

        const seoDescription = rawSubjectSlug
            ? `Explore ${selectedSubjectGroup?.subject || rawSubjectSlug} notes, PDFs, chapter resources and study material for ${resolvedCollegeName} on DocUp.`
            : `Explore ${resolvedCollegeName} notes, study material, PDFs and semester-wise resources on DocUp.`;

        return res.render("college_notes_seo", {
            seoData: {
                pageTitle: seoTitle,
                metaDescription: seoDescription,
                canonicalUrl,
                ogImage: collegeData?.image || "/images/default.png",
                selectedSubject: selectedSubjectGroup?.subject || null
            },
            collegeInfo: {
                name: resolvedCollegeName,
                slug: canonicalCollegeSlug,
                image: collegeData?.image || "/images/default.png"
            },
            stats: {
                totalDocs: filteredDocs.length,
                totalSubjects: rawSubjectSlug ? 1 : groupedSubjects.length,
                totalBranches: branchesSet.size,
                totalYears: yearsSet.size
            },
            groupedSubjects,
            allSubjectsForChips,
            selectedSubjectSlug: rawSubjectSlug ? slugifyText(rawSubjectSlug) : null
        });

    } catch (error) {
        console.log("SEO college notes page error:", error);
        return res.status(500).send("Server error");
    }
}

app.get("/notes/:collegeSlug", async (req, res) => {
    return renderCollegeSeoPage(req, res);
});

app.get("/notes/:collegeSlug/:subjectSlug", async (req, res) => {
    return renderCollegeSeoPage(req, res);
});
app.get("/sitemap.xml", async (req, res) => {
    try {
        const allDocs = await Docs.find({}, "college subject updatedAt createdAt").lean();

        const urlMap = new Map();

        urlMap.set("home", {
            loc: "https://www.docup.in/",
            priority: "1.0",
            lastmod: new Date().toISOString().split("T")[0]
        });

        const grouped = new Map();

        for (const doc of allDocs) {
            const collegeName = (doc.college || "").trim();
            const subjectName = (doc.subject || "").trim();
            const docDate = new Date(doc.updatedAt || doc.createdAt || Date.now())
                .toISOString()
                .split("T")[0];

            if (!collegeName) continue;

            const collegeSlug = getCollegeSlug(collegeName);
            const collegeKey = `college:${collegeSlug}`;

            if (!urlMap.has(collegeKey)) {
                urlMap.set(collegeKey, {
                    loc: `https://www.docup.in/notes/${collegeSlug}`,
                    priority: "0.9",
                    lastmod: docDate
                });
            } else {
                const existing = urlMap.get(collegeKey);
                if (docDate > existing.lastmod) {
                    existing.lastmod = docDate;
                }
            }

            if (subjectName) {
                const subjectSlug = slugifyText(subjectName);
                const subjectKey = `subject:${collegeSlug}:${subjectSlug}`;

                if (!urlMap.has(subjectKey)) {
                    urlMap.set(subjectKey, {
                        loc: `https://www.docup.in/notes/${collegeSlug}/${subjectSlug}`,
                        priority: "0.8",
                        lastmod: docDate
                    });
                } else {
                    const existing = urlMap.get(subjectKey);
                    if (docDate > existing.lastmod) {
                        existing.lastmod = docDate;
                    }
                }
            }
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(urlMap.values())
            .map(url => `    <url>
        <loc>${url.loc}</loc>
        <lastmod>${url.lastmod}</lastmod>
        <changefreq>daily</changefreq>
        <priority>${url.priority}</priority>
    </url>`)
            .join("\n")}
</urlset>`;

        res.header("Content-Type", "application/xml");
        return res.send(xml);
    } catch (error) {
        console.log("Sitemap error:", error);
        return res.status(500).send("Server error");
    }
});