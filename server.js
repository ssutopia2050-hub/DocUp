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
import Coupon      from "./models/Coupon.js";
import SaleConfig  from "./models/SaleConfig.js";
import CollegeExam from "./models/CollegeExam.js";
import Collection from "./models/Collection.js";
import emailjs from "@emailjs/nodejs";
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";
import MongoStore from "connect-mongo";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
import mongoose from "mongoose";
dotenv.config();
const resend = new Resend(process.env.RESEND_API_KEY);

/******************************
 Redis Client Setup
 ******************************/
import { createClient as createRedisClient } from "redis";

const redisClient = createRedisClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: {
        // Retry with exponential back-off capped at 10 s — survives Redis blips.
        reconnectStrategy: (retries) => Math.min(retries * 100, 10_000)
    }
});

redisClient.on("error",        (err) => console.error("Redis error:", err));
redisClient.on("connect",      ()    => console.log("Redis connected ✅"));
redisClient.on("reconnecting", ()    => console.warn("Redis reconnecting…"));

// .catch() so a Redis blip at startup does NOT crash the whole server.
// All cache helpers (getOrSet/invalidate) already fall back to the DB on error.
await redisClient.connect().catch((err) => {
    console.error("Redis initial connect failed — continuing without cache:", err.message);
});

// TTL constants (seconds)
const TTL = {
    COLLEGE_LIST:       60 * 60 * 6,   // 6 hours  — rarely changes
    COLLEGE_DOCS:       60 * 10,        // 10 min   — docs get uploaded occasionally
    DOC_VIEW_COUNT:     60 * 2,         // 2 min    — view counts, near-real-time is fine
    TRENDING_COLLEGES:  60 * 15,        // 15 min   — heavy aggregation, cache aggressively
    MOST_VIEWED:        60 * 15,        // 15 min
    SITEMAP:            60 * 60 * 2,    // 2 hours  — SEO sitemap, rarely needs live data
    SEARCH_DOCS:        60 * 5,         // 5 min    — search index (all docs lean)
    SEO_PAGE:           60 * 10,        // 10 min   — college SEO pages
    DOC_META:           60 * 5,         // 5 min    — individual doc metadata
    COLLEGE_DATA:       60 * 60 * 2,    // 2 hours  — college images/info
    CHAT_HISTORY:       60 * 2,         // 2 min    — chat messages
    USER_DOCSCORE:      30,             // 30 sec   — docscore polling endpoint
};

// Helper: get or set cache
async function getOrSet(key, ttl, fn) {
    try {
        const cached = await redisClient.get(key);
        if (cached !== null) return JSON.parse(cached);
        const fresh = await fn();
        await redisClient.setEx(key, ttl, JSON.stringify(fresh));
        return fresh;
    } catch (err) {
        console.error(`Redis getOrSet error [${key}]:`, err.message);
        return fn(); // fallback to DB on Redis failure
    }
}

// Helper: invalidate a key or pattern
async function invalidate(key) {
    try {
        await redisClient.del(key);
    } catch (err) {
        console.error(`Redis invalidate error [${key}]:`, err.message);
    }
}

// Helper: invalidate multiple keys by prefix pattern
async function invalidatePattern(pattern) {
    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length) await redisClient.del(keys);
    } catch (err) {
        console.error(`Redis invalidatePattern error [${pattern}]:`, err.message);
    }
}
// ✅ FIX: enforce 50 MB limit and PDF/image-only uploads
//    Without a limit, large files silently fail or get rejected by Render's reverse proxy.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB hard cap
    fileFilter: (_req, file, cb) => {
        const allowed = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only PDF, image, or Word documents are allowed"));
        }
    }
});import { execFile } from "child_process";
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
            return renderError(res, 400, "Invalid signature");
        }

        const event = JSON.parse(req.body.toString());
        console.log("Razorpay webhook event:", event.event);

        if (event.event === "invoice.paid") {
            const invoice = event.payload?.invoice?.entity;
            if (!invoice || !invoice.subscription_id) {
                return renderError(res, 200, "OK");
            }

            const user = await user_profile.findOne({
                subscription_id: invoice.subscription_id
            });

            if (!user) {
                console.log("No user found for subscription:", invoice.subscription_id);
                return renderError(res, 200, "OK");
            }

            const planKey = user.subscription_plan_key;
            const selectedPlan = SUBSCRIPTION_PLANS[planKey];

            if (!selectedPlan) {
                console.log("No matching plan found for user:", user.email);
                return renderError(res, 200, "OK");
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
                                email:    user.email,
                                content:  `Subscription renewed 🎉 +${selectedPlan.docscore} DocScore added for ${selectedPlan.label}`,
                                category: "payment"   // BUG FIX: was missing, defaulted to "system"
                            }
                        }
                    }
                );
                // Invalidate docscore cache for this user
                await invalidate(`docscore:${user.email}`);
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

        return renderError(res, 200, "OK");
    } catch (err) {
        console.error("Webhook error:", err);
        return renderError(res, 500, "Server error");
    }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

/* ============================================================
 *  CENTRALISED ERROR RENDERER
 *  Usage:  return renderError(res, 500, "Something went wrong", "Optional detail");
 * ============================================================ */
const ERROR_META = {
    400: { title: "Bad Request",           icon: "⚠️",  hint: "The request was malformed or missing required fields." },
    401: { title: "Unauthorised",          icon: "🔒",  hint: "You need to sign in to access this page." },
    403: { title: "Forbidden",             icon: "🚫",  hint: "You don't have permission to view this resource." },
    404: { title: "Page Not Found",        icon: "🔍",  hint: "The page you\'re looking for has moved or doesn\'t exist." },
    413: { title: "File Too Large",        icon: "📦",  hint: "The file you tried to upload exceeds the size limit." },
    429: { title: "Too Many Requests",     icon: "⏱️",  hint: "You\'ve made too many requests. Please slow down." },
    500: { title: "Internal Server Error", icon: "💥",  hint: "Something broke on our end. We\'re looking into it." },
    503: { title: "Service Unavailable",   icon: "🔧",  hint: "The server is temporarily offline. Try again shortly." },
};

function renderError(res, code, message, detail) {
    code = code || 500;
    const meta = ERROR_META[code] || { title: "Error", icon: "❌", hint: "" };
    const displayMessage = message || meta.hint;
    try {
        return res.status(code).render("error", {
            code,
            title:   meta.title,
            icon:    meta.icon,
            message: displayMessage,
            detail:  detail || meta.hint
        });
    } catch (_) {
        return res.status(code).send("<h1>" + code + " — " + meta.title + "</h1><p>" + displayMessage + "</p>");
    }
}



const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
    app.set("trust proxy", 1);
}

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,

    resave: false,
    saveUninitialized: false,

    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: "sessions",

        ttl: 24 * 60 * 60,

        touchAfter: 24 * 3600,

        autoRemove: "native"
    }),

    cookie: {
        httpOnly: true,

        maxAge: 24 * 60 * 60 * 1000,

        secure: isProduction,

        sameSite: isProduction ? "none" : "lax"
    }
});
app.use(sessionMiddleware);
// app.use((req, res, next) => {
//     if (req.headers.host === "docup.in") {
//         return res.redirect(301, "https://www.docup.in" + req.url);
//     }
//     next();
// });
app.get("/health", (req, res) => {
    renderError(res, 200, "OK");
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
    model: "gemini-2.0-flash"
});

// Embedding model — text-embedding-004, 768-dim
const geminiEmbeddingModel = geminiClient.getGenerativeModel({
    model: "text-embedding-004"
});

// Flash model for Q&A (fast, cheap, great for RAG)
const geminiFlashModel = geminiClient.getGenerativeModel({
    model: "gemini-2.0-flash"
});

// Promisify the already-imported execFile for PDF→image conversion
const execFileAsync = promisify(execFile);
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Cloudflare R2 (S3-compatible) ────────────────────────────────────────────
const r2 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});
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
// ✅ FIX: lock CORS to your actual origin in production.
//    `origin: true` (mirror any origin) + credentials: true is a security hole on prod.
const allowedOrigins = [
    "http://localhost:5000",
    "http://localhost:3000",
    "https://www.docup.in",
    "https://docup.in"
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin '${origin}' not allowed`));
        }
    },
    credentials: true  // required for session cookies across origins
}));

// Redirect www → apex domain (keeps a single canonical URL for SEO)
app.use((req, res, next) => {
    if (req.hostname === "www.docup.in") {
        return res.redirect(301, `https://docup.in${req.originalUrl}`);
    }
    next();
});

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
    console.log("[DEBUG][getAuthorizedDoc] session.email:", req.session?.email, "| docId received:", docId);
    if (!req.session?.email) throw new Error("Unauthorized");
    const doc = await Docs.findById(docId);
    console.log("[DEBUG][getAuthorizedDoc] doc found:", !!doc);
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
        console.log(`[DEBUG][Pipeline] START for docId: ${docId}`);

        // Step A: Download PDF
        console.log(`[DEBUG][Pipeline] Step A: fetching PDF from URL:`, doc.file_url);
        const pdfBuffer = await getPdfBufferFromExistingUrl(doc);
        console.log(`[DEBUG][Pipeline] Step A: PDF downloaded, bytes:`, pdfBuffer.length);

        // Step B: PDF → images
        console.log(`[DEBUG][Pipeline] Step B: converting PDF to images via pdftoppm...`);
        const images = await convertPdfToImages(pdfBuffer);
        console.log(`[DEBUG][Pipeline] Step B: ${images.length} pages converted to images`);

        // Step C: Gemini Vision on every page
        console.log(`[DEBUG][Pipeline] Step C: calling Gemini Vision on ${images.length} pages...`);
        const extractedPages = await processAllPagesWithGemini(images);
        console.log(`[DEBUG][Pipeline] Step C: extracted ${extractedPages.length} pages`);

        // Step D: Chunking
        console.log(`[DEBUG][Pipeline] Step D: chunking ${extractedPages.length} pages...`);
        let   allChunks    = [];
        let   globalIndex  = 0;

        for (const page of extractedPages) {
            const { chunks, nextIndex } = chunkPageContent(page, globalIndex);
            allChunks.push(...chunks);
            globalIndex = nextIndex;
        }
        console.log(`[DEBUG][Pipeline] Step D: ${allChunks.length} chunks created`);

        // Step E: Embed all chunks
        console.log(`[DEBUG][Pipeline] Step E: embedding ${allChunks.length} chunks via Gemini...`);
        const embeddedChunks = await embedAllChunks(allChunks);
        console.log(`[DEBUG][Pipeline] Step E: embeddings generated, count:`, embeddedChunks.length);

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
        console.log(`[DEBUG][Pipeline] COMPLETE for docId: ${docId}, chunks stored: ${embeddedChunks.length}`);
        return aiRecord;

    } catch (err) {
        console.error(`[DEBUG][Pipeline] FAILED for docId: ${docId}`);
        console.error(`[DEBUG][Pipeline] Error message:`, err.message);
        console.error(`[DEBUG][Pipeline] Stack:`, err.stack);
        throw err;
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
        console.log("[DEBUG][/ai/process-doc] body:", req.body, "| session.email:", req.session?.email);
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
        console.error("[DEBUG][/ai/process-doc] CAUGHT ERROR:", err.message);
        console.error("[DEBUG][/ai/process-doc] Stack:", err.stack);
        return res.status(err.message === "Unauthorized" ? 401 : 500).json({
            success: false, message: err.message
        });
    }
});

// ── 16. /ai/ask-doc — semantic Q&A ───────────────────────────────────────────
app.post("/ai/ask-doc", async (req, res) => {
    try {
        const { docId, question } = req.body;
        console.log("[DEBUG][/ai/ask-doc] body:", { docId, question: question?.slice(0, 80) }, "| session.email:", req.session?.email);

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
        console.log("[DEBUG][/ai/ask-doc] embedding question...");
        const queryEmbedding = await embedQuery(String(question).trim());
        console.log("[DEBUG][/ai/ask-doc] embedding done, retrieving top chunks...");

        // Retrieve top-5 relevant chunks
        const topChunks = await retrieveTopChunks(doc._id, queryEmbedding, 5);
        console.log("[DEBUG][/ai/ask-doc] topChunks count:", topChunks.length);

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
        console.error("[DEBUG][/ai/ask-doc] CAUGHT ERROR:", err.message);
        console.error("[DEBUG][/ai/ask-doc] Stack:", err.stack);
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
// ── 19. GET /api/capsule/:id — fetch cached capsule from DB ──────────────────
app.get("/api/capsule/:id", async (req, res) => {
    try {
        if (!req.session?.email) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const doc = await Docs.findById(req.params.id).select("capsule").lean();
        if (!doc) {
            return res.status(404).json({ success: false, message: "Document not found" });
        }

        if (!doc.capsule) {
            return res.json({ success: false, message: "No capsule found for this document" });
        }

        return res.json({ success: true, capsule: doc.capsule });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message || "Failed to fetch capsule" });
    }
});

// ── 20. POST /api/capsule/:id — build capsule from metadata, zero API cost ────
// Constructs the context string entirely from DB fields — no Gemini call,
// no PDF download, no quota usage. Cached in Docs.capsule after first build
// so every subsequent "Discuss with AI" click is served straight from DB.
app.post("/api/capsule/:id", async (req, res) => {
    try {
        if (!req.session?.email) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const doc = await Docs.findById(req.params.id)
            .select("capsule college year semester branch subject chapter doc_type special_tag uploaded_by")
            .lean();

        if (!doc) {
            return res.status(404).json({ success: false, message: "Document not found" });
        }

        // Serve from cache instantly — no work needed
        if (doc.capsule) {
            return res.json({ success: true, capsule: doc.capsule });
        }

        // ── Build capsule deterministically from metadata ──────────────────
        // No AI call. We construct a structured context string that any AI
        // agent can read and immediately understand what this document is.

        const DOC_TYPE_LABEL = {
            college_doc:  "a college academic document",
            ed_doc:       "an educational resource",
            research_doc: "a research document",
            random_doc:   "a general document",
        };

        const typeLabel = DOC_TYPE_LABEL[doc.doc_type] || "an academic document";

        // Opening sentence — always present
        const parts = [];

        let opening = `This is ${typeLabel}`;
        if (doc.subject) opening += ` covering the subject "${doc.subject}"`;
        if (doc.chapter) opening += `, specifically the chapter or topic "${doc.chapter}"`;
        opening += ".";
        parts.push(opening);

        // Academic context sentence
        const ctx = [];
        if (doc.college)  ctx.push(`institution: ${doc.college}`);
        if (doc.branch)   ctx.push(`stream/branch: ${doc.branch}`);
        if (doc.year)     ctx.push(`year: ${doc.year}`);
        if (doc.semester) ctx.push(`semester: ${doc.semester}`);
        if (ctx.length)   parts.push(`Academic context — ${ctx.join(", ")}.`);

        // Quality / uploader note
        if (doc.special_tag) {
            parts.push(`This document is tagged "${doc.special_tag}", indicating high academic quality.`);
        }

        // Instruction line for the receiving AI agent
        parts.push(
            `The student may ask questions about concepts, definitions, formulas, ` +
            `or explanations related to ${doc.subject || "this subject"}` +
            (doc.chapter ? ` and the topic "${doc.chapter}"` : "") +
            `. Answer based on standard academic knowledge for this subject area.`
        );

        const capsule = parts.join(" ");

        // Persist — next click returns instantly from cache
        await Docs.findByIdAndUpdate(req.params.id, { $set: { capsule } });

        return res.json({ success: true, capsule });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message || "Failed to generate capsule" });
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

            // ── AWS ALB keep-alive fix ───────────────────────────────────────
            // ALB default idle timeout is 60 s. Node's default keepAliveTimeout
            // is 5 s — ALB sends requests on connections Node already closed → 502.
            // These two values MUST be: keepAlive > ALB idle, headers > keepAlive.
            server.keepAliveTimeout = 65_000;  // 65 s  (> ALB's 60 s)
            server.headersTimeout   = 66_000;  // 66 s  (> keepAliveTimeout)
        });

        server.on("error", (err) => {
            console.error("server.listen error:", err);
            process.exit(1);
        });

    } catch (err) {
        console.error("MongoDB connection failed ❌", err);
        process.exit(1);
    }
}

// ── Process-level crash guards ───────────────────────────────────────────────
// Without these, any unhandled async throw kills the process → 502 until AWS restarts it.
process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
    // Don't exit — keep serving. Log it so you can fix the underlying bug.
});

process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
});

// ── Graceful shutdown on SIGTERM (AWS sends this before recycling the container) ──
// Without this, in-flight requests are dropped instantly → 502 on every deploy.
process.on("SIGTERM", () => {
    console.log("SIGTERM received — draining connections…");
    server.close(() => {
        console.log("HTTP server closed. Exiting.");
        process.exit(0);
    });
    // Force-exit after 30 s if something is stuck
    setTimeout(() => process.exit(0), 30_000).unref();
});

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
 About Us
 ******************************/
app.get("/about_us", async (req, res) => {
    res.render("about");
})
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
        // Use req.login() so Passport serializes the user and populates
        // req.user on all subsequent requests (fixes coupon/API auth checks)
        return req.login(user, (err) => {
            if (err) {
                console.error("req.login error:", err);
                return res.render('signin', { err: { message: "Login failed. Please try again." } });
            }

            // Keep legacy session.email for any routes that still rely on it
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
        });
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

        // Cache the college list (images + names) — rarely changes
        const clg = await getOrSet("college:list", TTL.COLLEGE_LIST, () =>
            college.find({}).lean()
        );

        const msg = { err: null };
        const collegeImageMap = {};
        clg.forEach(c => {
            collegeImageMap[c.college_name.toLowerCase()] = c.image;
        });

        // Cache trending colleges aggregation
        const trendingColleges = await getOrSet("stats:trending_colleges", TTL.TRENDING_COLLEGES, async () => {
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return docs_view_data.aggregate([
                { $match: { DocViewedAt: { $gte: oneWeekAgo } } },
                { $lookup: { from: "docs", localField: "doc_id", foreignField: "_id", as: "doc" } },
                { $unwind: "$doc" },
                { $group: { _id: "$doc.college", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 6 },
                { $project: { _id: 0, college: "$_id", count: 1 } }
            ]);
        });

        // Cache most-viewed colleges aggregation
        const mostViewedColleges = await getOrSet("stats:most_viewed_colleges", TTL.MOST_VIEWED, async () => {
            return docs_view_data.aggregate([
                { $lookup: { from: "docs", localField: "doc_id", foreignField: "_id", as: "doc" } },
                { $unwind: "$doc" },
                { $group: { _id: "$doc.college", views: { $sum: 1 } } },
                { $sort: { views: -1 } },
                { $limit: 6 },
                { $project: { _id: 0, college: "$_id", views: 1 } }
            ]);
        });

        // Fetch user's collections (pinned first, then most-recently updated, cap at 6 for preview)
        const rawCollections = await Collection.find({ owner: data._id })
            .sort({ pinned: -1, updatedAt: -1 })
            .limit(6)
            .lean();

        const dashboardCollections = await Promise.all(
            rawCollections.map(async (col) => {
                const previewIds = (col.docs || []).slice(0, 3);
                const previewDocs = previewIds.length
                    ? await Docs.find({ _id: { $in: previewIds } })
                        .select("subject college")
                        .lean()
                    : [];
                return {
                    ...col,
                    docCount: (col.docs || []).length,
                    previewDocs
                };
            })
        );

        res.render("dashboard", {
            data,
            colleges: collegesList,
            results: [],
            college_specific_data: clg,
            collegeImageMap,
            msg,
            trendingColleges,
            mostViewedColleges,
            dashboardCollections,
        });

    } catch (err) {
        console.log(err);
        renderError(res, 500, "Server error");
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

        // Cache the full docs list used for search — massive win since this loads ALL docs
        const cacheKey = `search:docs:${year || "all"}:${branch || "all"}`;
        const docs = await getOrSet(cacheKey, TTL.SEARCH_DOCS, () =>
            Docs.find(mongoFilter).lean()
        );

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

        // Cache docs for this college
        const docs = await getOrSet(
            `college:docs:${collegeName.toLowerCase()}`,
            TTL.COLLEGE_DOCS,
            () => Docs.find({ college: collegeName }).lean()
        );

        // Cache all college rows (images, names)
        const allCollegeRows = await getOrSet("college:list", TTL.COLLEGE_LIST, () =>
            college.find({}).lean()
        );

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
        renderError(res, 500, "Something went wrong");
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
                colleges: uniqueColleges,
                // Temporary restriction: only DocUp Developers can upload
                canUpload: data?.user_type === "DocUp Developer"
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
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        // 🔒 TEMPORARY RESTRICTION — Developer uploads only
        if (user.user_type !== "DocUp Developer") {
            return res.status(403).json({
                success: false,
                message: "uploads_restricted"
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

        const fileBuffer = req.file.buffer;

        // ☁️ UPLOAD TO CLOUDFLARE R2
        // Pre-create a doc _id so the R2 key and DB id match (mirrors cdn.docup.in/docs/<id>.pdf pattern)
        const docId = new mongoose.Types.ObjectId();
        const r2Key = `docs/${docId}.${extension}`;

        try {
            await r2.send(new PutObjectCommand({
                Bucket:      process.env.R2_BUCKET_NAME,
                Key:         r2Key,
                Body:        fileBuffer,
                ContentType: req.file.mimetype,
            }));
        } catch (r2Err) {
            console.error("R2 upload error:", r2Err.message, r2Err);
            return res.status(500).json({
                success: false,
                message: r2Err.message || "Upload to R2 failed"
            });
        }

        // 🌍 PUBLIC URL via CDN
        const fileUrl = `${process.env.R2_CDN_URL}/${r2Key}`;

        // 🧠 SAVE TO DB (WITH PROTECTED FIELD)
        const doc = await Docs.create({
            _id: docId,                // ✅ matches R2 key
            college,
            year,
            semester,
            branch,
            subject,
            chapter,
            file_url: fileUrl,
            uploaded_by: user.email,
            reviewed: false,
            protected: protectedValue,
            doc_type: docType
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

        // 🔄 INVALIDATE CACHES affected by new upload
        await Promise.all([
            invalidate(`college:docs:${(college || "").toLowerCase()}`),
            invalidatePattern("search:docs:*"),
            invalidate("sitemap:xml"),
            invalidate("stats:trending_colleges"),
        ]);

        return res.json({
            success: true,
            docId: doc._id,
            file_url: fileUrl
        });

    } catch (err) {
        console.error("Upload failed:", err);

        return res.status(500).json({
            success: false,
            message: "Upload failed"
        });
    }
});

// ✅ FIX: catch multer errors (file too large, wrong type) and return clean JSON
//    Without this, multer throws and Express sends an ugly HTML 500 to the client.
app.use((err, req, res, next) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
            success: false,
            message: "File is too large. Maximum allowed size is 50 MB."
        });
    }
    if (err instanceof multer.MulterError || (err && err.message && err.message.startsWith("Only PDF"))) {
        return res.status(400).json({
            success: false,
            message: err.message || "Invalid file type."
        });
    }
    next(err);
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
        renderError(res, 500, "Internal Server Error");
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

        const docPrice = document.price ?? 1;

        if (document.protected) {
            chargedUser = await user_profile.findOneAndUpdate(
                {
                    email: req.session.email,
                    Doc_score: { $gte: docPrice },
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
                            Doc_score: { $subtract: ["$Doc_score", docPrice] },
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

            if (chargedUser) {
                await invalidate(`docscore:${req.session.email}`);
            }
        }

        let renderUser = chargedUser;

        if (!chargedUser) {
            const freshUser = await user_profile
                .findOne({ email: req.session.email })
                .populate("saved_documents", "college subject chapter reviewed");

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
            if (document.protected && !stillInCooldown && freshUser.Doc_score < docPrice) {
                const msg = { err: "Insufficient DocScore", requiredScore: docPrice };
                const clg = await college.find({});

                const collegeImageMap = {};
                clg.forEach(c => {
                    collegeImageMap[c.college_name.toLowerCase()] = c.image;
                });

                const trendingColleges = await getOrSet("stats:trending_colleges", TTL.TRENDING_COLLEGES, async () => {
                    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    return docs_view_data.aggregate([
                        { $match: { DocViewedAt: { $gte: oneWeekAgo } } },
                        { $lookup: { from: "docs", localField: "doc_id", foreignField: "_id", as: "doc" } },
                        { $unwind: "$doc" },
                        { $group: { _id: "$doc.college", count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: 6 },
                        { $project: { _id: 0, college: "$_id", count: 1 } }
                    ]);
                });

                const mostViewedColleges = await getOrSet("stats:most_viewed_colleges", TTL.MOST_VIEWED, async () => {
                    return docs_view_data.aggregate([
                        { $lookup: { from: "docs", localField: "doc_id", foreignField: "_id", as: "doc" } },
                        { $unwind: "$doc" },
                        { $group: { _id: "$doc.college", views: { $sum: 1 } } },
                        { $sort: { views: -1 } },
                        { $limit: 6 },
                        { $project: { _id: 0, college: "$_id", views: 1 } }
                    ]);
                });

                return res.render("dashboard", {
                    data: freshUser,
                    colleges: collegesList,
                    results: [],
                    college_specific_data: clg,
                    collegeImageMap,
                    msg,
                    trendingColleges,
                    mostViewedColleges,
                    dashboardCollections: [],
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

        let collegeData = await getOrSet(
            `college:data:${collegeName.toLowerCase()}`,
            TTL.COLLEGE_DATA,
            async () => {
                let data = await college.findOne({
                    college_name: { $regex: `^${safeCollegeName}$`, $options: "i" }
                }).lean();
                if (!data) {
                    data = await college.findOne({
                        college_name: { $regex: safeCollegeName, $options: "i" }
                    }).lean();
                }
                return data;
            }
        );

        if (!document.comment_section) {
            document.comment_section = [];
        }

        await docs_view_data.create({
            email: req.session.email,
            doc_id: docId,
        });

        // Invalidate cached view count so next load picks up the new view
        await invalidate(`doc:views:${docId}`);

        let uploaderProfile = null;

        if (document.uploaded_by) {
            uploaderProfile = await user_profile.findOne({
                $or: [
                    { email: document.uploaded_by },
                    { name: document.uploaded_by }
                ]
            }).select("_id name avatar_img_path user_type");
        }
        // Count directly (fast) — cache for 2 min since it's displayed on page load
        const total_views = await getOrSet(
            `doc:views:${docId}`,
            TTL.DOC_VIEW_COUNT,
            () => docs_view_data.countDocuments({ doc_id: docId })
        );

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
        return renderError(res, 500, "Server Error");
    }
});

/******************************
 PDF Proxy — streams R2 PDF through server to avoid CORS
 ******************************/
app.get("/pdf-proxy/:id", async (req, res) => {
    try {
        if (!req.session.email) {
            return renderError(res, 401, "Unauthorized");
        }

        const doc = await Docs.findById(req.params.id).select("file_url protected uploaded_by").lean();

        if (!doc || !doc.file_url) {
            return renderError(res, 404, "Document not found");
        }

        const response = await fetch(doc.file_url, {
            headers: { "Accept": "application/pdf" }
        });

        if (!response.ok) {
            console.error("R2 fetch failed:", response.status, doc.file_url);
            return renderError(res, 502, "Failed to fetch PDF from storage");
        }

        const contentLength = response.headers.get("content-length");
        const contentType   = response.headers.get("content-type") || "application/pdf";

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.setHeader("X-Content-Type-Options", "nosniff");
        // Block direct download / external embedding
        res.setHeader("Content-Disposition", "inline");

        if (contentLength) res.setHeader("Content-Length", contentLength);

        // Stream the body straight to client — no buffering
        const { Readable } = await import("stream");
        Readable.fromWeb(response.body).pipe(res);

    } catch (err) {
        console.error("PDF proxy error:", err);
        return renderError(res, 500, "Server error");
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
        renderError(res, 500, "Server Error");
    }
});
app.get("/api/docscore", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({ success: false, message: "Not logged in" });
        }

        const cacheKey = `docscore:${req.session.email}`;
        const Doc_score = await getOrSet(cacheKey, TTL.USER_DOCSCORE, async () => {
            const user = await user_profile.findOne(
                { email: req.session.email },
                { Doc_score: 1, _id: 0 }
            );
            return user ? user.Doc_score : 0;
        });

        return res.json({ success: true, Doc_score });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
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

        // Invalidate docscore cache for this user
        await invalidate(`docscore:${userEmail}`);

        return res.redirect("/view/" + req.params.id);
    } catch (err) {
        console.error(err);
        return renderError(res, 500, "Server Error");
    }
});
app.get("/update_dislikes/:id", async (req, res) => {
    try {
        const userEmail = req.session.email;

        if (!userEmail) {
            return res.redirect("/signin");
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
        return renderError(res, 500, "Server Error");
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
/**
 * ============================================================
 *  DISCOUNT SYSTEM — ROUTES
 *  Paste this block into server.js after your existing imports.
 *  Requires two new model imports at the top of server.js:
 *
 *    import Coupon     from "./models/Coupon.js";
 *    import SaleConfig from "./models/SaleConfig.js";
 * ============================================================
 */


/* ──────────────────────────────────────────────────────────────
   SECTION 1 — ADMIN ROUTES
   Protect these with your existing admin middleware.
   All routes here are prefixed /admin/discount/...
   so they slot cleanly next to your existing /admin/cache routes.
   ────────────────────────────────────────────────────────────── */

/**
 * POST /admin/discount/coupon/create
 *
 * Body (JSON):
 * {
 *   code:           "DOCUP50",          // required, auto-uppercased
 *   type:           "flat"|"docscore",  // required
 *   flat_discount:  50,                 // required when type === "flat"
 *   docscore_bonus: 100,                // required when type === "docscore"
 *   max_uses:       200,                // required
 *   applicable_to:  "all"|"specific_users",
 *   allowed_users:  ["a@b.com"],        // required when applicable_to === "specific_users"
 *   applies_to:     "recharge"|"subscription"|"both",
 *   expires_at:     "2025-12-31",       // optional ISO date string
 *   description:    "Launch promo"      // optional
 * }
 */
app.post("/admin/discount/coupon/create", async (req, res) => {
    // ── guard: reuse your existing admin secret check
    const adminSecret = req.headers["x-admin-secret"];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: "Forbidden" });
    }

    try {
        const {
            code,
            type,
            flat_discount   = 0,
            docscore_bonus  = 0,
            max_uses,
            applicable_to   = "all",
            allowed_users   = [],
            applies_to      = "both",
            expires_at      = null,
            description     = ""
        } = req.body;

        if (!code || !type || !max_uses) {
            return res.status(400).json({ success: false, message: "code, type, and max_uses are required." });
        }
        if (type === "flat" && flat_discount <= 0) {
            return res.status(400).json({ success: false, message: "flat_discount must be > 0 for type 'flat'." });
        }
        if (type === "docscore" && docscore_bonus <= 0) {
            return res.status(400).json({ success: false, message: "docscore_bonus must be > 0 for type 'docscore'." });
        }

        const coupon = await Coupon.create({
            code:          code.toUpperCase().trim(),
            type,
            flat_discount,
            docscore_bonus,
            max_uses,
            applicable_to,
            allowed_users: allowed_users.map(e => ({ email: e.toLowerCase().trim() })),
            applies_to,
            expires_at:    expires_at ? new Date(expires_at) : null,
            description
        });

        return res.json({ success: true, coupon });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: "A coupon with that code already exists." });
        }
        console.error("Create coupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});


/**
 * PATCH /admin/discount/coupon/:code/toggle
 * Flip the active flag on a coupon.
 */
app.patch("/admin/discount/coupon/:code/toggle", async (req, res) => {
    const adminSecret = req.headers["x-admin-secret"];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: "Forbidden" });
    }

    try {
        const coupon = await Coupon.findOne({ code: req.params.code.toUpperCase() });
        if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found." });

        coupon.active = !coupon.active;
        await coupon.save();

        return res.json({ success: true, code: coupon.code, active: coupon.active });
    } catch (err) {
        console.error("Toggle coupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});
/* ─────────────────────────────────────────────────────
   FIX 2 — Add DELETE coupon route (paste after the toggle PATCH route ~line 3332)
───────────────────────────────────────────────────────── */

/**
 * DELETE /admin/discount/coupon/:code
 * Permanently delete a coupon by code.
 */
app.delete("/admin/discount/coupon/:code", async (req, res) => {
    const adminSecret = req.headers["x-admin-secret"];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: "Forbidden" });
    }

    try {
        const deleted = await Coupon.findOneAndDelete({ code: req.params.code.toUpperCase() });
        if (!deleted) return res.status(404).json({ success: false, message: "Coupon not found." });
        return res.json({ success: true, message: `Coupon ${deleted.code} deleted.` });
    } catch (err) {
        console.error("Delete coupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});


/* ─────────────────────────────────────────────────────
   FIX 3 — Add GET /dev/coupons route (paste near your other /dev/* routes)
───────────────────────────────────────────────────────── */

app.get("/dev/coupons", async (req, res) => {
    if (!req.session.dev_email) {
        return res.redirect("/dev/signin");
    }
    return res.render("dev_coupons", {
        adminSecret: process.env.ADMIN_SECRET
    });
});


/**
 * GET /admin/discount/coupons
 * List all coupons (newest first).
 */
app.get("/admin/discount/coupons", async (req, res) => {
    const adminSecret = req.headers["x-admin-secret"];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: "Forbidden" });
    }

    try {
        const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean();
        return res.json({ success: true, coupons });
    } catch (err) {
        console.error("List coupons error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});


/**
 * POST /admin/discount/sale/set
 * Create or replace the active sitewide sale.
 *
 * Body (JSON):
 * {
 *   sale_label:       "Weekend Sale 🎉",
 *   discount_percent: 20,
 *   applies_to:       "both",
 *   starts_at:        "2025-08-01T00:00:00Z",  // ISO string, optional (defaults to now)
 *   ends_at:          "2025-08-03T23:59:59Z"   // required
 * }
 */
app.post("/admin/discount/sale/set", async (req, res) => {
    const adminSecret = req.headers["x-admin-secret"];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: "Forbidden" });
    }

    try {
        const {
            sale_label       = "Limited Time Offer",
            discount_percent,
            applies_to       = "both",
            starts_at        = new Date(),
            ends_at
        } = req.body;

        if (!discount_percent || !ends_at) {
            return res.status(400).json({ success: false, message: "discount_percent and ends_at are required." });
        }

        // Deactivate any previous sale, then upsert a fresh one
        await SaleConfig.updateMany({}, { $set: { active: false } });

        const sale = await SaleConfig.create({
            sale_label,
            discount_percent,
            applies_to,
            starts_at: new Date(starts_at),
            ends_at:   new Date(ends_at),
            active:    true
        });

        // Bust the cached pricing pages so users see the banner immediately
        await invalidate("sale:active");

        return res.json({ success: true, sale });
    } catch (err) {
        console.error("Set sale error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});


/**
 * GET /admin/discount/sale/get
 * Return the currently active sale (or null). Used by the dev dashboard.
 */
app.get("/admin/discount/sale/get", async (req, res) => {
    const adminSecret = req.headers["x-admin-secret"];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: "Forbidden" });
    }
    try {
        const sale = await SaleConfig.getActiveSale();
        return res.json({ success: true, sale: sale || null });
    } catch (err) {
        console.error("Get sale error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

/**
 * DELETE /admin/discount/sale/clear
 * End the active sale immediately.
 */
app.delete("/admin/discount/sale/clear", async (req, res) => {
    const adminSecret = req.headers["x-admin-secret"];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: "Forbidden" });
    }

    try {
        await SaleConfig.updateMany({ active: true }, { $set: { active: false } });
        await invalidate("sale:active");
        return res.json({ success: true, message: "Sale cleared." });
    } catch (err) {
        console.error("Clear sale error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});


/* ──────────────────────────────────────────────────────────────
   SECTION 2 — USER-FACING ROUTE
   Called by the frontend before payment to preview the discount.
   ────────────────────────────────────────────────────────────── */

/**
 * POST /coupon/validate
 *
 * Body: { code: "DOCUP50", context: "recharge"|"subscription", baseAmount: 99 }
 * Response (success):
 * {
 *   valid: true,
 *   type: "flat"|"docscore",
 *   flat_discount:  30,       // only when type === "flat"
 *   docscore_bonus: 50,       // only when type === "docscore"
 *   discounted_amount: 69,    // final ₹ amount user pays (baseAmount - flat_discount)
 *   message: "₹30 off applied!"
 * }
 */
app.post("/coupon/validate", async (req, res) => {
    if (!req.user) return res.status(401).json({ valid: false, reason: "Not logged in." });

    const { code, context, baseAmount } = req.body;

    if (!code || !context) {
        return res.status(400).json({ valid: false, reason: "code and context are required." });
    }

    try {
        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });

        if (!coupon) {
            return res.json({ valid: false, reason: "Invalid coupon code." });
        }

        const result = coupon.validate(req.user.email, context);

        if (!result.valid) {
            return res.json({ valid: false, reason: result.reason });
        }

        const base = Number(baseAmount) || 0;

        if (coupon.type === "flat") {
            const discounted = Math.max(1, base - coupon.flat_discount);
            return res.json({
                valid:              true,
                type:               "flat",
                flat_discount:      coupon.flat_discount,
                discounted_amount:  discounted,
                message:            `₹${coupon.flat_discount} off applied!`
            });
        }

        // type === "docscore"
        return res.json({
            valid:          true,
            type:           "docscore",
            docscore_bonus: coupon.docscore_bonus,
            discounted_amount: base,  // price unchanged
            message:        `+${coupon.docscore_bonus} bonus DocScore will be added!`
        });

    } catch (err) {
        console.error("Coupon validate error:", err);
        return res.status(500).json({ valid: false, reason: "Server error." });
    }
});


/* ──────────────────────────────────────────────────────────────
   SECTION 3 — UPDATED PAYMENT ROUTES
   Replace your existing /buy-recharge and /buy-subscription
   handlers with these updated versions.

   Key changes from your originals:
   - Accept optional `couponCode` in request body
   - For "flat" coupons: reduce Razorpay order amount
   - For "docscore" coupons: pass bonusDocscore back to frontend
     so /payment/verify (or /subscription/verify) can credit it
   - After payment: mark coupon as used
   ────────────────────────────────────────────────────────────── */

// ── Helper: resolve and validate a coupon during checkout
// Returns { coupon, bonusDocscore, flatDiscount } or throws with a message
async function resolveCouponAtCheckout(couponCode, userEmail, context, baseAmount) {
    if (!couponCode) return { coupon: null, bonusDocscore: 0, flatDiscount: 0 };

    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase().trim() });
    if (!coupon) throw new Error("Invalid coupon code.");

    const result = coupon.validate(userEmail, context);
    if (!result.valid) throw new Error(result.reason);

    const flatDiscount   = coupon.type === "flat"     ? coupon.flat_discount  : 0;
    const bonusDocscore  = coupon.type === "docscore"  ? coupon.docscore_bonus : 0;

    // Ensure flat discount does not exceed base amount (min ₹1 charged)
    if (flatDiscount >= baseAmount) {
        throw new Error(`Coupon discount (₹${flatDiscount}) cannot exceed the plan amount.`);
    }

    return { coupon, bonusDocscore, flatDiscount };
}

// ── Helper: mark a coupon as used after successful payment
async function markCouponUsed(coupon, userEmail) {
    if (!coupon) return;
    try {
        await Coupon.findOneAndUpdate(
            { _id: coupon._id },
            {
                $inc: { used_count: 1 },
                $push: { used_by: { email: userEmail.toLowerCase().trim(), redeemedAt: new Date() } }
            }
        );
    } catch (err) {
        // Non-fatal — log and continue so payment success is not blocked
        console.error("markCouponUsed error:", err.message);
    }
}


/**
 * POST /buy-recharge  (updated)
 *
 * Body: { plan, customAmount?, couponCode? }
 *
 * The frontend sends couponCode if the user applied one.
 * Response includes bonusDocscore so /payment/verify can credit it.
 */
app.post("/buy-recharge", async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Not logged in." });

    const RECHARGE_PLANS = {
        starter:  { label: "Prep",   amount: 29,  docscore: 20  },
        standard: { label: "Crack",  amount: 79,  docscore: 60  },
        pro:      { label: "Topper", amount: 199, docscore: 180 }
    };

    try {
        const { plan, customAmount, couponCode } = req.body;

        let baseAmount, docscoreToAdd, planLabel;

        if (plan === "custom") {
            const amt = Math.max(20, Math.min(500, Math.round(Number(customAmount) / 2) * 2));
            baseAmount    = amt;
            docscoreToAdd = Math.floor(amt);   // 1:1 rate — adjust to your RATE constant
            planLabel     = `Custom ₹${amt}`;
        } else {
            const selectedPlan = RECHARGE_PLANS[plan];
            if (!selectedPlan) return res.status(400).json({ success: false, message: "Invalid plan." });
            baseAmount    = selectedPlan.amount;
            docscoreToAdd = selectedPlan.docscore;
            planLabel     = selectedPlan.label;
        }

        // ── Resolve coupon (if provided)
        let coupon = null, bonusDocscore = 0, flatDiscount = 0;
        try {
            ({ coupon, bonusDocscore, flatDiscount } = await resolveCouponAtCheckout(
                couponCode, req.user.email, "recharge", baseAmount
            ));
        } catch (couponErr) {
            return res.status(400).json({ success: false, message: couponErr.message });
        }

        // ── Also apply any active sitewide sale
        const activeSale = await SaleConfig.getActiveSale();
        let finalAmount = baseAmount - flatDiscount;
        if (activeSale && (activeSale.applies_to === "recharge" || activeSale.applies_to === "both")) {
            finalAmount = SaleConfig.applyDiscount(finalAmount, activeSale);
        }
        finalAmount = Math.max(1, finalAmount);

        // ── Create Razorpay order
        const razorpay = new Razorpay({
            key_id:     process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        const order = await razorpay.orders.create({
            amount:   finalAmount * 100,   // paise
            currency: "INR",
            receipt:  `recharge_${Date.now()}`
        });

        // ── Persist the order with coupon metadata so /payment/verify can access it
        await paymentOrder.create({
            order_id:       order.id,
            email:          req.user.email,
            plan:           planLabel,
            amount:         finalAmount,
            docscore:       docscoreToAdd,
            bonus_docscore: bonusDocscore,          // NEW: credited at verify time
            coupon_code:    coupon ? coupon.code : null,
            status:         "PENDING"
        });

        return res.json({
            success:       true,
            key:           process.env.RAZORPAY_KEY_ID,
            orderId:       order.id,
            amount:        order.amount,
            currency:      order.currency,
            userEmail:     req.user.email,
            docscoreToAdd,
            bonusDocscore,            // frontend can show "you'll also get +X DocScore"
            finalAmount
        });

    } catch (err) {
        console.error("buy-recharge error:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
});


/**
 * POST /payment/verify  (updated)
 *
 * No changes to your existing signature verification logic.
 * Only addition: credit bonus_docscore from paymentOrder if a docscore coupon was used,
 * and mark the coupon as used.
 */
app.post("/payment/verify", async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Not logged in." });

    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // ── Signature verification (unchanged from your existing code)
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Invalid payment signature." });
        }

        // ── Atomically claim the order (PENDING → SUCCESS) to prevent double-credit
        //    on duplicate verify requests or network retries.
        const order = await paymentOrder.findOneAndUpdate(
            { order_id: razorpay_order_id, status: "PENDING" },
            { $set: { status: "SUCCESS", payment_id: razorpay_payment_id } },
            { new: true }
        );

        if (!order) {
            // Order wasn't PENDING — check if it was already processed (idempotent OK)
            const existing = await paymentOrder.findOne({ order_id: razorpay_order_id });
            if (existing?.status === "SUCCESS") {
                return res.json({ success: true, redirectUrl: "/payment-success" });
            }
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        const totalDocscore = (order.docscore || 0) + (order.bonus_docscore || 0);

        // ── Credit DocScore + upgrade subscription + push payment history
        //    BUG FIX: added $set { subscription: "Paid Tier" } — was missing, so the user's
        //    subscription never changed from "Free Tier" after a successful recharge.
        const updatedUser = await user_profile.findOneAndUpdate(
            { email: order.email },
            {
                $inc: { Doc_score: totalDocscore },
                $set: { subscription: "Paid Tier" },
                $push: {
                    payment_history: {
                        order_id:       razorpay_order_id,
                        payment_id:     razorpay_payment_id,
                        amount:         order.amount,
                        plan:           order.plan,
                        docscore_added: totalDocscore,
                        status:         "SUCCESS",
                        date:           new Date()
                    },
                    notifications: {
                        email:    order.email,
                        content:  `Recharge successful 🎉 +${totalDocscore} DocScore added${order.bonus_docscore ? ` (incl. ${order.bonus_docscore} bonus)` : ""}`,
                        category: "payment"
                    }
                }
            },
            { new: true }
        );

        // ── Mark coupon as used (if one was applied)
        if (order.coupon_code) {
            const coupon = await Coupon.findOne({ code: order.coupon_code });
            await markCouponUsed(coupon, order.email);
        }

        // ── Bust docscore cache
        await invalidate(`docscore:${order.email}`);

        // ── Send recharge confirmation email
        //    BUG FIX: sendRechargeSuccessEmail was defined but never called here.
        if (updatedUser) {
            sendRechargeSuccessEmail(order.email, updatedUser.name, {
                planLabel:     order.plan,
                amount:        order.amount,
                docscoreAdded: totalDocscore,
                orderId:       razorpay_order_id,
                paymentId:     razorpay_payment_id,
                date:          new Date()
            }).catch(err => console.error("Recharge email send failed:", err.message));
        }

        return res.json({ success: true, redirectUrl: "/payment-success" });

    } catch (err) {
        console.error("payment/verify error:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
});


/**
 * POST /buy-subscription  (updated)
 *
 * Body: { plan, couponCode? }
 *
 * For subscriptions, Razorpay does not let you directly reduce the
 * subscription amount via the API in a simple way for existing plans.
 * Strategy used here:
 *   - "flat" coupons on subscriptions → deduct from the FIRST payment
 *     by creating a one-time Razorpay order for (amount - discount)
 *     instead of a subscription. Subsequent months bill the full amount.
 *     NOTE: If you want recurring discounts you'll need Razorpay Offers API.
 *   - "docscore" coupons → no price change, bonus DocScore credited at
 *     /subscription/verify time.
 */
app.post("/buy-subscription", async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Not logged in." });

    try {
        const { plan, couponCode } = req.body;

        const selectedPlan = SUBSCRIPTION_PLANS[plan];
        if (!selectedPlan) return res.status(400).json({ success: false, message: "Invalid plan." });

        // ── Resolve coupon
        let coupon = null, bonusDocscore = 0, flatDiscount = 0;
        try {
            ({ coupon, bonusDocscore, flatDiscount } = await resolveCouponAtCheckout(
                couponCode, req.user.email, "subscription", selectedPlan.amount
            ));
        } catch (couponErr) {
            return res.status(400).json({ success: false, message: couponErr.message });
        }

        // ── Apply sitewide sale (display only — actual Razorpay sub price unchanged)
        const activeSale = await SaleConfig.getActiveSale();

        const razorpay = new Razorpay({
            key_id:     process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        // ── Map plan key → Razorpay plan_id
        const RAZORPAY_PLAN_IDS = {
            essential_monthly: process.env.RAZORPAY_PLAN_ESSENTIAL_MONTHLY,
            standard_monthly:  process.env.RAZORPAY_PLAN_STANDARD_MONTHLY,
            power_monthly:     process.env.RAZORPAY_PLAN_POWER_MONTHLY,
        };

        const razorpayPlanId = RAZORPAY_PLAN_IDS[plan];
        if (!razorpayPlanId) {
            return res.status(400).json({ success: false, message: `Razorpay plan not configured for: ${plan}` });
        }

        // ── ROOT CAUSE FIX: Guard against creating duplicate subscriptions.
        //
        // Previously every button click called razorpay.subscriptions.create()
        // unconditionally. Razorpay/UPI then sees multiple autopay mandates for
        // the same customer and blocks subsequent ones with "autopay already created".
        //
        // Fix logic:
        //   ACTIVE  → reject, user is already subscribed
        //   PENDING + same plan + sub still open on Razorpay → reuse it (user just
        //             dismissed the modal last time, reopen with the same sub_id)
        //   PENDING + different plan OR sub expired on Razorpay → cancel stale sub,
        //             then fall through to create a fresh one
        const existingUser      = await user_profile.findOne({ email: req.user.email }).lean();
        const existingSubId     = existingUser?.subscription_id;
        const existingSubStatus = existingUser?.subscription_status;
        const existingPlanKey   = existingUser?.subscription_plan_key;

        if (existingSubId && existingSubStatus === "ACTIVE") {
            return res.status(400).json({
                success: false,
                message: "You already have an active subscription. Cancel it before switching plans."
            });
        }

        let subscription = null;

        if (existingSubId && existingSubStatus === "PENDING") {
            try {
                const existingSub = await razorpay.subscriptions.fetch(existingSubId);
                // Razorpay statuses still usable: "created" or "authenticated"
                const reusable = ["created", "authenticated"].includes(existingSub.status);
                if (reusable && existingPlanKey === plan) {
                    // Same plan, still open on Razorpay → reuse, skip creating a new one
                    subscription = existingSub;
                    console.log(`[buy-subscription] Reusing PENDING sub ${existingSubId} for ${req.user.email}`);
                } else {
                    // Wrong plan or already expired/halted on Razorpay → cancel & recreate
                    if (reusable) {
                        try { await razorpay.subscriptions.cancel(existingSubId); } catch (_) {}
                    }
                }
            } catch (fetchErr) {
                // Sub not found on Razorpay (deleted etc.) — just create a fresh one
                console.warn(`[buy-subscription] Could not fetch sub ${existingSubId}:`, fetchErr.message);
            }
        }

        if (!subscription) {
            subscription = await razorpay.subscriptions.create({
                plan_id:         razorpayPlanId,
                customer_notify: 1,
                quantity:        1,
                total_count:     12
            });

            // Persist the new sub so we can reuse it on the next attempt
            await user_profile.findOneAndUpdate(
                { email: req.user.email },
                {
                    $set: {
                        subscription_id:       subscription.id,
                        subscription_plan_key: plan,
                        subscription_status:   "PENDING"
                    }
                }
            );
        }

        // ── Store coupon intent so /subscription/verify can mark it used
        if (coupon) {
            await Coupon.findOneAndUpdate(
                { _id: coupon._id },
                { $set: { [`_pending_${req.user.email.replace(/[@.]/g, "_")}`]: subscription.id } }
            );
            // Simpler alternative: store in user session
            req.session.pendingCoupon = { code: coupon.code, subscriptionId: subscription.id };
        }

        return res.json({
            success:        true,
            key:            process.env.RAZORPAY_KEY_ID,
            subscriptionId: subscription.id,
            planLabel:      selectedPlan.label,
            userEmail:      req.user.email,
            bonusDocscore,  // frontend shows "+X bonus DocScore" message if > 0
            flatDiscount    // frontend shows "₹X off first month" if > 0
        });

    } catch (err) {
        console.error("buy-subscription error:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
});


/**
 * POST /subscription/verify  (updated)
 *
 * Additions vs your original:
 *   - Credit bonus_docscore from session if a docscore coupon was applied
 *   - Mark coupon as used
 */
app.post("/subscription/verify", async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Not logged in." });

    try {
        const {
            razorpay_payment_id,
            razorpay_subscription_id,
            razorpay_signature,
            plan
        } = req.body;

        // ── Signature verification
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Invalid signature." });
        }

        const selectedPlan = SUBSCRIPTION_PLANS[plan];
        if (!selectedPlan) return res.status(400).json({ success: false, message: "Invalid plan." });

        // ── Retrieve bonus DocScore from session coupon (if any)
        let bonusDocscore = 0;
        const pendingCoupon = req.session?.pendingCoupon;
        if (pendingCoupon && pendingCoupon.subscriptionId === razorpay_subscription_id) {
            const coupon = await Coupon.findOne({ code: pendingCoupon.code });
            if (coupon) {
                bonusDocscore = coupon.docscore_bonus || 0;
                await markCouponUsed(coupon, req.user.email);
            }
            delete req.session.pendingCoupon;
        }

        const totalDocscore = selectedPlan.docscore + bonusDocscore;

        await user_profile.findOneAndUpdate(
            { email: req.user.email },
            {
                $inc: { Doc_score: totalDocscore },
                $set: {
                    subscription:        selectedPlan.label,
                    subscription_status: "ACTIVE",
                    subscription_id:     razorpay_subscription_id
                },
                $push: {
                    payment_history: {
                        order_id:       razorpay_subscription_id,
                        payment_id:     razorpay_payment_id,
                        amount:         selectedPlan.amount,
                        plan:           selectedPlan.label,
                        docscore_added: totalDocscore,
                        status:         "SUCCESS",
                        date:           new Date()
                    },
                    notifications: {
                        email:    req.user.email,
                        content:  `Subscription activated 🎉 +${totalDocscore} DocScore added${bonusDocscore ? ` (incl. ${bonusDocscore} bonus)` : ""}`,
                        category: "payment"
                    }
                }
            }
        );

        await invalidate(`docscore:${req.user.email}`);

        return res.json({ success: true, redirectUrl: "/payment-success" });

    } catch (err) {
        console.error("subscription/verify error:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
});


/* ──────────────────────────────────────────────────────────────
   SECTION 4 — UPDATED PAGE RENDER ROUTES
   Replace your existing GET /pricing and GET /upgrade-plans
   handlers with these, which pass saleConfig to the EJS template.
   ────────────────────────────────────────────────────────────── */

/**
 * GET /pricing  (updated)
 */
app.get("/pricing", async (req, res) => {
    if (!req.session.email) return res.redirect("/signin");

    try {
        const user       = await user_profile.findOne({ email: req.session.email }).lean();
        const activeSale = await SaleConfig.getActiveSale();

        // Only pass the sale to this page if it applies
        const saleForPage = activeSale && (
            activeSale.applies_to === "recharge" || activeSale.applies_to === "both"
        ) ? activeSale : null;

        return res.render("pricing", {
            data:       user,
            saleConfig: saleForPage
        });
    } catch (err) {
        console.error("GET /pricing error:", err);
        return renderError(res, 500, "Server error");
    }
});


/**
 * GET /payment-success
 * Reads the most recent payment_history entry to recover docscore + bonusDocscore.
 * bonusDocscore = anything above the base plan docscore (coupon bonus etc.).
 * We store the full totalDocscore in docscore_added, so we just pass that through.
 */
app.get("/payment-success", async (req, res) => {
    if (!req.session.email) return res.redirect("/signin");
    try {
        const user = await user_profile.findOne({ email: req.session.email }).lean();

        // Pick the most recent payment entry
        const lastPayment = Array.isArray(user.payment_history) && user.payment_history.length
            ? [...user.payment_history].sort((a, b) => new Date(b.date) - new Date(a.date))[0]
            : null;

        const docscore     = lastPayment?.docscore_added ?? 0;
        const bonusDocscore = 0; // bonus is already rolled into docscore_added; pass 0 unless you track it separately

        return res.render("payment-success", { data: user, docscore, bonusDocscore });
    } catch (err) {
        console.error("GET /payment-success error:", err);
        return renderError(res, 500, "Server error");
    }
});


/**
 * GET /upgrade-plans  (updated)
 */
app.get("/upgrade-plans", async (req, res) => {
    if (!req.session.email) return res.redirect("/signin");

    try {
        const user       = await user_profile.findOne({ email: req.session.email }).lean();
        const activeSale = await SaleConfig.getActiveSale();

        const saleForPage = activeSale && (
            activeSale.applies_to === "subscription" || activeSale.applies_to === "both"
        ) ? activeSale : null;

        return res.render("upgrade_plans", {
            data:       user,
            saleConfig: saleForPage
        });
    } catch (err) {
        console.error("GET /upgrade-plans error:", err);
        return renderError(res, 500, "Server error");
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
        return renderError(res, 500, "Internal Server Error");
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
            return renderError(res, 404, "User not found");
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
        return renderError(res, 500, "Internal Server Error");
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
            return renderError(res, 404, "User not found");
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
        renderError(res, 500, "Server Error");
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
            return renderError(res, 404, "User not found");
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
        renderError(res, 500, "Server Error");
    }
});
// ── Add this route to server.js (after the /saved_docs route is a good spot) ──

app.get("/payment_history", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }

    try {
        const user_data = await user_profile.findOne({ email: req.session.email });

        if (!user_data) {
            return renderError(res, 404, "User not found");
        }

        // Sort newest first (same as profile.ejs does for payment_history)
        const payments = Array.isArray(user_data.payment_history)
            ? [...user_data.payment_history].sort((a, b) => new Date(b.date) - new Date(a.date))
            : [];

        // Attach sorted payments back so the template has them ready
        user_data.payment_history = payments;

        res.render("payment_history", {
            data: user_data
        });
    } catch (err) {
        console.error(err);
        renderError(res, 500, "Server Error");
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
        renderError(res, 500, "Server Error");
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

            // Invalidate chat history cache for this room
            await invalidate(`chat:history:${socket.data.roomId}`);

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

        const oldMessages = await getOrSet(
            `chat:history:${roomId}`,
            TTL.CHAT_HISTORY,
            () => ChatMessage.find({ room_id: roomId })
                .sort({ createdAt: 1 })
                .limit(100)
                .lean()
        );

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
        return renderError(res, 500, "Server error");
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
 Discount
 *****************/

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

        // ===== EXAM TRACKER =====
        const totalExams = await CollegeExam.countDocuments();

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

            totalExams,

            recentDocs
        });

    } catch (error) {
        console.error(error);
        renderError(res, 500, "Error loading dashboard");
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
        renderError(res, 500, "Error loading docs moderation page");
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
        renderError(res, 500, "Error marking doc as reviewed");
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
        renderError(res, 500, "Error marking doc as unreviewed");
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
            return renderError(res, 404, "Document not found");
        }

        await reports.deleteMany({ doc_id: docId });
        await Docs.findByIdAndDelete(docId);

        let message = `❌ Your document "${doc.chapter}" (${doc.subject}) was removed by the DocUp Moderation Team.`;

        // Deduct score ONLY if protected
        if (doc.protected && doc.uploaded_by) {
            const penalty = doc.price ?? 1;
            await user_profile.updateOne(
                { email: doc.uploaded_by },
                { $inc: { Doc_score: -penalty } }
            );

            message += ` ${penalty} DocScore has been deducted.`;
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
        renderError(res, 500, "Error deleting doc");
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
        renderError(res, 500, "Error loading reports page");
    }
});

app.post("/dev/reports/:id/delete-doc", async (req, res) => {
    if(!req.session.dev_email){
        return res.redirect("/dev/signin");
    }
    try {
        const reportDoc = await reports.findById(req.params.id);

        if (!reportDoc) {
            return renderError(res, 404, "Report not found");
        }

        await reports.deleteMany({ doc_id: reportDoc.doc_id });
        await Docs.findByIdAndDelete(reportDoc.doc_id);

        res.redirect("/dev/reports");
    } catch (error) {
        console.error(error);
        renderError(res, 500, "Error deleting reported doc");
    }
});
app.post("/dev/reports/:id/delete", async (req, res) => {
    if(!req.session.dev_email){
        return res.redirect("/dev/signin");
    }
    try {
        const reportDoc = await reports.findById(req.params.id);

        if (!reportDoc) {
            return renderError(res, 404, "Report not found");
        }

        await reports.deleteMany({ doc_id: reportDoc.doc_id });
        // await Docs.findByIdAndDelete(reportDoc.doc_id);

        res.redirect("/dev/reports");
    } catch (error) {
        console.error(error);
        renderError(res, 500, "Error deleting reported doc");
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
        renderError(res, 500, "Error deleting contact message");
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
        renderError(res, 500, "Error loading users page");
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
        renderError(res, 500, "Error deleting user");
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
        renderError(res, 500, "Activity error");
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
            return renderError(res, 404, "Page not found");
        }

        let resolvedCollegeName = resolveCollegeNameFromSlug(rawCollegeSlug);

        const allCollegeRows = await getOrSet("college:list", TTL.COLLEGE_LIST, () =>
            college.find({}).lean()
        );

        if (!resolvedCollegeName) {
            const matchedCollege =
                allCollegeRows.find(c => slugifyText(c.college_name) === slugifyText(rawCollegeSlug)) ||
                allCollegeRows.find(c => normalizeText(c.college_name) === normalizeText(rawCollegeSlug)) ||
                null;

            resolvedCollegeName = matchedCollege?.college_name || null;
        }

        if (!resolvedCollegeName) {
            return renderError(res, 404, "Page not found");
        }

        const requestedName = normalizeText(resolvedCollegeName);
        const requestedCompact = normalizeCompact(resolvedCollegeName);

        const collegeData =
            allCollegeRows.find(c => normalizeText(c.college_name) === requestedName) ||
            allCollegeRows.find(c => normalizeCompact(c.college_name) === requestedCompact) ||
            null;

        const allCollegeDocs = await getOrSet(
            `college:docs:${resolvedCollegeName.toLowerCase()}`,
            TTL.COLLEGE_DOCS,
            () => Docs.find({
                college: {
                    $regex: `^${escapeRegexSEO(resolvedCollegeName)}$`,
                    $options: "i"
                }
            }).lean()
        );

        if (!allCollegeDocs.length) {
            return renderError(res, 404, "Page not found");
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
                return renderError(res, 404, "Page not found");
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
        return renderError(res, 500, "Server error");
    }
}

app.get("/notes/:collegeSlug", async (req, res) => {
    return renderCollegeSeoPage(req, res);
});

app.get("/notes/:collegeSlug/:subjectSlug", async (req, res) => {
    return renderCollegeSeoPage(req, res);
});
// Mark all notifications as read
app.post("/notifications/mark-all-read", async (req, res) => {
    await UserProfile.updateOne(
        { _id: req.user._id },
        { $set: { "notifications.$[].isRead": true } }
    );
    res.sendStatus(200);
});

// Dismiss (delete) a single notification — since _id:false, match by index or use a generated id
// Simplest approach: use array index passed from client, or switch _id:false → _id:true on the subdoc
app.delete("/notifications/:id/dismiss", async (req, res) => {
    // If you enable _id on notifications subdoc, use $pull:
    await UserProfile.updateOne(
        { _id: req.user._id },
        { $pull: { notifications: { _id: req.params.id } } }
    );
    res.sendStatus(200);
});
app.get("/sitemap.xml", async (req, res) => {
    try {
        const xml = await getOrSet("sitemap:xml", TTL.SITEMAP, async () => {
            const allDocs = await Docs.find({}, "college subject updatedAt createdAt").lean();

            const urlMap = new Map();

            urlMap.set("home", {
                loc: "https://www.docup.in/",
                priority: "1.0",
                lastmod: new Date().toISOString().split("T")[0]
            });

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
                    if (docDate > existing.lastmod) existing.lastmod = docDate;
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
                        if (docDate > existing.lastmod) existing.lastmod = docDate;
                    }
                }
            }

            return `<?xml version="1.0" encoding="UTF-8"?>
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
        });

        res.header("Content-Type", "application/xml");
        return res.send(xml);
    } catch (error) {
        console.log("Sitemap error:", error);
        return renderError(res, 500, "Server error");
    }
});
/******************************
 Admin — Cache Management
 (Protect this with your own admin middleware in production)
 ******************************/
app.post("/admin/cache/clear", async (req, res) => {
    const adminSecret = req.headers["x-admin-secret"];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: "Forbidden" });
    }
    try {
        const { pattern } = req.body;
        if (pattern) {
            await invalidatePattern(pattern);
            return res.json({ success: true, message: `Cleared keys matching: ${pattern}` });
        }
        await redisClient.flushDb();
        return res.json({ success: true, message: "All cache cleared" });
    } catch (err) {
        console.error("Cache clear error:", err);
        return res.status(500).json({ success: false, message: "Failed to clear cache" });
    }
});

/* =======================================================================
 *  EXAM TRACKER ROUTES
 * ======================================================================= */

/* -------------------------------------------------------------------
 *  STUDENT-FACING
 *  GET /exam-tracker/:collegeName  →  college_exam_tracker.ejs
 * ------------------------------------------------------------------- */
app.get("/exam-tracker/:collegeName", async (req, res) => {
    if (!req.session.email) {
        const next = req.originalUrl; // preserves ?highlight=examId if present
        return res.redirect(`/signin?next=${encodeURIComponent(next)}`);
    }

    try {
        const collegeName = decodeURIComponent(req.params.collegeName);

        const user = await user_profile.findOne({ email: req.session.email }).lean();
        if (!user) return res.redirect("/signin");

        const collegeData = await college
            .findOne({ name: { $regex: new RegExp("^" + escapeRegexSEO(collegeName) + "$", "i") } })
            .lean();

        const examData = await CollegeExam
            .find({ college: { $regex: new RegExp("^" + escapeRegexSEO(collegeName) + "$", "i") } })
            .sort({ date: 1 })
            .lean();
        const college_data = await college.find({college_name: req.params.collegeName});
        return res.render("college_exam_tracker", {
            user,
            collegeInfo: {
                name:  collegeName,
                image: collegeData?.image || "/images/default.png"
            },
            examData,
            collegeNotices: [],   // reserved for future notice system
            quickResources: [] ,
            clg_data: college_data// reserved for future resource system
        });

    } catch (err) {
        console.error("Exam tracker render error:", err);
        return renderError(res, 500, "Server error");
    }
});

/* -------------------------------------------------------------------
 *  DEV — OVERVIEW
 *  GET /dev/exam-tracker  →  dev_exam_tracker.ejs
 *  Lists every college with exam count + upcoming count
 * ------------------------------------------------------------------- */
// In server.js — replace the GET /dev/exam-tracker route handler (around line 5988–6027)

app.get("/dev/exam-tracker", async (req, res) => {
    if (!req.session.dev_email) return res.redirect("/dev/signin");

    try {
        // ── 1. Get distinct college names directly from Docs ──
        const collegeNamesWithDocs = await Docs.distinct("college");

        // ── 2. For each name, try to find a matching college record (for image) ──
        //       Use case-insensitive regex so casing differences don't break the lookup
        const allColleges = await Promise.all(
            collegeNamesWithDocs
                .filter(name => name && name.trim())
                .map(async (name) => {
                    const rec = await college.findOne(
                        { name: { $regex: new RegExp("^" + name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") } },
                        "name image"
                    ).lean();
                    return {
                        name:  rec?.name || name,   // prefer DB name, fallback to Docs string
                        image: rec?.image || null
                    };
                })
        );

        // Sort alphabetically
        allColleges.sort((a, b) => a.name.localeCompare(b.name));

        // ── 3. Exam stats (unchanged) ──
        const examAgg = await CollegeExam.aggregate([
            {
                $group: {
                    _id: "$college",
                    examCount: { $sum: 1 },
                    upcomingCount: {
                        $sum: { $cond: [{ $gte: ["$date", new Date()] }, 1, 0] }
                    }
                }
            }
        ]);

        const examMap = {};
        examAgg.forEach(e => {
            if (e._id) examMap[e._id.trim().toLowerCase()] = e;
        });

        const collegesWithStats = allColleges.map(c => ({
            ...c,
            examCount:     examMap[c.name?.trim().toLowerCase()]?.examCount     || 0,
            upcomingCount: examMap[c.name?.trim().toLowerCase()]?.upcomingCount || 0
        }));

        return res.render("dev_exam_tracker", { colleges: collegesWithStats   });

    } catch (err) {
        console.error("Dev exam tracker list error:", err);
        return renderError(res, 500, "Error loading exam tracker manager");
    }
});

/* -------------------------------------------------------------------
 *  DEV — PER-COLLEGE MANAGEMENT
 *  GET /dev/exam-tracker/:collegeName  →  dev_exam_tracker_college.ejs
 * ------------------------------------------------------------------- */
app.get("/dev/exam-tracker/:collegeName", async (req, res) => {
    if (!req.session.dev_email) return res.redirect("/dev/signin");

    try {
        const collegeName = decodeURIComponent(req.params.collegeName);

        const collegeData = await college
            .findOne({ name: { $regex: new RegExp("^" + escapeRegexSEO(collegeName) + "$", "i") } })
            .lean();

        const exams = await CollegeExam
            .find({ college: { $regex: new RegExp("^" + escapeRegexSEO(collegeName) + "$", "i") } })
            .sort({ date: 1 })
            .lean();

        return res.render("dev_exam_tracker_college", {
            collegeName,
            collegeImage: collegeData?.image || "/images/default.png",
            exams
        });

    } catch (err) {
        console.error("Dev exam tracker college page error:", err);
        return renderError(res, 500, "Error loading college exam manager");
    }
});

/* -------------------------------------------------------------------
 *  DEV — ADD EXAM
 *  POST /dev/exam-tracker/:collegeName/add
 *
 *  Body (all strings from the HTML form):
 *    subject, type, date (YYYY-MM-DD), time, venue, description,
 *    branch, year, semester,
 *    notesLinks  →  JSON string  e.g. '[{"label":"Unit 3","url":"https://…"}]'
 *    pyqLinks    →  JSON string  e.g. '[{"label":"2023 PYQ","url":"https://…"}]'
 * ------------------------------------------------------------------- */
app.post("/dev/exam-tracker/:collegeName/add", async (req, res) => {
    if (!req.session.dev_email) return res.redirect("/dev/signin");

    try {
        const collegeName = decodeURIComponent(req.params.collegeName);
        const {
            subject, type, date, time, venue,
            description, branch, year, semester,
            notesLinks, pyqLinks
        } = req.body;

        let parsedNotesLinks = [];
        let parsedPyqLinks   = [];
        try { parsedNotesLinks = JSON.parse(notesLinks  || "[]"); } catch (_) {}
        try { parsedPyqLinks   = JSON.parse(pyqLinks    || "[]"); } catch (_) {}

        await CollegeExam.create({
            college:     collegeName,
            subject:     (subject     || "").trim(),
            type:        type         || "other",
            date:        new Date(date),
            time:        (time        || "").trim(),
            venue:       (venue       || "").trim(),
            description: (description || "").trim(),
            branch:      (branch      || "").trim(),
            year:        (year        || "").trim(),
            semester:    (semester    || "").trim(),
            notesLinks:  parsedNotesLinks,
            pyqLinks:    parsedPyqLinks,
            addedBy:     req.session.dev_email
        });

        return res.redirect(`/dev/exam-tracker/${encodeURIComponent(collegeName)}`);

    } catch (err) {
        console.error("Add exam error:", err);
        return renderError(res, 500, "Error adding exam");
    }
});

/* -------------------------------------------------------------------
 *  DEV — EDIT EXAM
 *  POST /dev/exam-tracker/:collegeName/:examId/edit
 *  Same body shape as /add
 * ------------------------------------------------------------------- */
app.post("/dev/exam-tracker/:collegeName/:examId/edit", async (req, res) => {
    if (!req.session.dev_email) return res.redirect("/dev/signin");

    try {
        const collegeName = decodeURIComponent(req.params.collegeName);
        const {
            subject, type, date, time, venue,
            description, branch, year, semester,
            notesLinks, pyqLinks
        } = req.body;

        let parsedNotesLinks = [];
        let parsedPyqLinks   = [];
        try { parsedNotesLinks = JSON.parse(notesLinks  || "[]"); } catch (_) {}
        try { parsedPyqLinks   = JSON.parse(pyqLinks    || "[]"); } catch (_) {}

        await CollegeExam.findByIdAndUpdate(
            req.params.examId,
            {
                subject:     (subject     || "").trim(),
                type:        type         || "other",
                date:        new Date(date),
                time:        (time        || "").trim(),
                venue:       (venue       || "").trim(),
                description: (description || "").trim(),
                branch:      (branch      || "").trim(),
                year:        (year        || "").trim(),
                semester:    (semester    || "").trim(),
                notesLinks:  parsedNotesLinks,
                pyqLinks:    parsedPyqLinks,
                updatedAt:   new Date()
            },
            { new: true }
        );

        return res.redirect(`/dev/exam-tracker/${encodeURIComponent(collegeName)}`);

    } catch (err) {
        console.error("Edit exam error:", err);
        return renderError(res, 500, "Error editing exam");
    }
});

/* -------------------------------------------------------------------
 *  DEV — DELETE EXAM
 *  POST /dev/exam-tracker/:collegeName/:examId/delete
 * ------------------------------------------------------------------- */
app.post("/dev/exam-tracker/:collegeName/:examId/delete", async (req, res) => {
    if (!req.session.dev_email) return res.redirect("/dev/signin");

    try {
        const collegeName = decodeURIComponent(req.params.collegeName);
        await CollegeExam.findByIdAndDelete(req.params.examId);
        return res.redirect(`/dev/exam-tracker/${encodeURIComponent(collegeName)}`);

    } catch (err) {
        console.error("Delete exam error:", err);
        return renderError(res, 500, "Error deleting exam");
    }
});

/* -------------------------------------------------------------------
 *  DEV — JSON API  (for optional AJAX inline editing on the dev page)
 *  GET /api/dev/exam-tracker/:collegeName        → array of exams
 *  GET /api/dev/exam-tracker/:collegeName/:id    → single exam
 * ------------------------------------------------------------------- */
app.get("/api/dev/exam-tracker/:collegeName", async (req, res) => {
    if (!req.session.dev_email) return res.status(401).json({ success: false });
    try {
        const collegeName = decodeURIComponent(req.params.collegeName);
        const exams = await CollegeExam
            .find({ college: { $regex: new RegExp("^" + escapeRegexSEO(collegeName) + "$", "i") } })
            .sort({ date: 1 })
            .lean();
        return res.json({ success: true, exams });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/dev/exam-tracker/:collegeName/:examId", async (req, res) => {
    if (!req.session.dev_email) return res.status(401).json({ success: false });
    try {
        const exam = await CollegeExam.findById(req.params.examId).lean();
        if (!exam) return res.status(404).json({ success: false });
        return res.json({ success: true, exam });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/* ============================================================
 *  DEV — DOC PRICE MANAGER
 *  GET  /dev/doc-price           → dev_doc_price_1.ejs  (list + edit)
 *  POST /dev/doc-price/:docId    → update price of a single doc
 * ============================================================ */
app.get("/dev/doc-price", async (req, res) => {
    if (!req.session.dev_email) return res.redirect("/dev/signin");

    try {
        const page       = Math.max(1, parseInt(req.query.page) || 1);
        const limit      = 20;
        const search     = (req.query.search    || "").trim();
        const docType    = (req.query.docType   || "").trim();
        const yearFilter = (req.query.year      || "").trim();
        const semFilter  = (req.query.semester  || "").trim();
        const protFilter = req.query.protected;   // "true" | "false" | undefined
        const revFilter  = req.query.reviewed;    // "true" | "false" | undefined

        // ── Build compound filter ──────────────────────────────────────
        const filter = {};

        if (search) {
            filter.$or = [
                { subject:  { $regex: search, $options: "i" } },
                { chapter:  { $regex: search, $options: "i" } },
                { college:  { $regex: search, $options: "i" } },
                { branch:   { $regex: search, $options: "i" } },
                { year:     { $regex: search, $options: "i" } },
                { semester: { $regex: search, $options: "i" } },
            ];
        }
        if (docType)              filter.doc_type   = docType;
        if (yearFilter)           filter.year       = yearFilter;
        if (semFilter)            filter.semester   = semFilter;
        if (protFilter === "true")  filter.protected = true;
        if (protFilter === "false") filter.protected = false;
        if (revFilter  === "true")  filter.reviewed  = true;
        if (revFilter  === "false") filter.reviewed  = false;

        // ── Fetch distinct years & semesters for dropdowns ─────────────
        const [docs, total, allYears, allSemesters] = await Promise.all([
            Docs.find(filter)
                .select("subject chapter college branch year semester doc_type price protected reviewed")
                .sort({ _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Docs.countDocuments(filter),
            Docs.distinct("year"),
            Docs.distinct("semester"),
        ]);

        const totalPages = Math.ceil(total / limit);

        // Sort year/semester lists sensibly
        const sortedYears = allYears.filter(Boolean).sort();
        const sortedSems  = allSemesters.filter(Boolean).sort();

        return res.render("dev_doc_price", {
            docs,
            total,
            page,
            totalPages,
            search,
            limit,
            docType,
            yearFilter,
            semFilter,
            protFilter: protFilter || "",
            revFilter:  revFilter  || "",
            allYears:   sortedYears,
            allSemesters: sortedSems,
            successMsg: req.query.success || null,
            errorMsg:   req.query.error   || null
        });

    } catch (err) {
        console.error("Dev doc-price GET error:", err);
        return renderError(res, 500, "Error loading doc price manager");
    }
});

app.post("/dev/doc-price/:docId", async (req, res) => {
    if (!req.session.dev_email) return res.redirect("/dev/signin");

    try {
        const { docId } = req.params;
        const newPrice  = parseInt(req.body.price);

        if (!newPrice || newPrice < 1) {
            return res.redirect("/dev/doc-price?error=Price+must+be+at+least+1");
        }

        const updated = await Docs.findByIdAndUpdate(
            docId,
            { $set: { price: newPrice } },
            { new: true }
        );

        if (!updated) {
            return res.redirect("/dev/doc-price?error=Doc+not+found");
        }

        // Invalidate any cached doc meta so viewers see the new price immediately
        await invalidate(`doc:meta:${docId}`);

        const page       = req.body.page      || 1;
        const search     = req.body.search    || "";
        const docType    = req.body.docType   || "";
        const yearFilter = req.body.year      || "";
        const semFilter  = req.body.semester  || "";
        const protFilter = req.body.protected || "";
        const revFilter  = req.body.reviewed  || "";

        const params = new URLSearchParams({ page, search, success: "Price updated" });
        if (docType)    params.set("docType",    docType);
        if (yearFilter) params.set("year",       yearFilter);
        if (semFilter)  params.set("semester",   semFilter);
        if (protFilter) params.set("protected",  protFilter);
        if (revFilter)  params.set("reviewed",   revFilter);

        return res.redirect(`/dev/doc-price?${params.toString()}`);

    } catch (err) {
        console.error("Dev doc-price POST error:", err);
        return renderError(res, 500, "Error updating doc price");
    }
});

// ─── helper ──────────────────────────────────────────────────────────────────
async function getUserBySession(req) {
    if (!req.session?.email) return null;
    return user_profile.findOne({ email: req.session.email }).lean();
}

// ─── GET /collections  ───────────────────────────────────────────────────────
app.get("/collections", async (req, res) => {
    if (!req.session.email) return res.redirect("/signin");

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        if (!user) return res.redirect("/signin");

        // Fetch all collections owned by this user, newest first
        const rawCols = await Collection.find({ owner: user._id })
            .sort({ pinned: -1, updatedAt: -1 })
            .lean();

        // Attach preview docs (max 4) for each collection mosaic
        const collections = await Promise.all(
            rawCols.map(async (col) => {
                const previewIds = (col.docs || []).slice(0, 4);
                const previewDocs = previewIds.length
                    ? await Docs.find({ _id: { $in: previewIds } })
                        .select("subject college doc_type")
                        .lean()
                    : [];

                return {
                    ...col,
                    docCount: (col.docs || []).length,
                    previewDocs
                };
            })
        );

        return res.render("collections", { user, collections });
    } catch (err) {
        console.error("[Collections GET /collections]", err);
        return res.status(500).send("Server error");
    }
});

// ─── GET /collections/:id  ───────────────────────────────────────────────────
app.get("/collections/:id", async (req, res) => {
    if (!req.session.email) {
        const next = encodeURIComponent(`/collections/${req.params.id}`);
        return res.redirect(`/signin?next=${next}`);
    }

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        if (!user) return res.redirect("/signin");

        const col = await Collection.findById(req.params.id).lean();
        if (!col) return res.status(404).render("404", { message: "Collection not found" });

        // Access control: owner, or public
        const isOwner = String(col.owner) === String(user._id);
        if (!isOwner && !col.isPublic) {
            return res.status(403).render("404", { message: "This collection is private" });
        }

        // Populate docs in order
        const docs = col.docs?.length
            ? await Docs.find({ _id: { $in: col.docs } })
                .select("subject college chapter branch year semester doc_type reviewed view_count createdAt")
                .lean()
                .then(fetched => {
                    // Preserve insertion order
                    const map = {};
                    fetched.forEach(d => { map[String(d._id)] = d; });
                    return col.docs.map(id => map[String(id)]).filter(Boolean);
                })
            : [];

        return res.render("collection_view", {
            user,
            col: { ...col, docCount: docs.length },
            docs,
            isOwner
        });
    } catch (err) {
        console.error("[Collections GET /collections/:id]", err);
        return res.status(500).send("Server error");
    }
});

// ─── POST /api/collections/create  ──────────────────────────────────────────
app.post("/api/collections/create", async (req, res) => {
    if (!req.session.email) return res.status(401).json({ success: false, message: "Not authenticated" });

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        if (!user) return res.status(401).json({ success: false, message: "User not found" });

        const { name, description, emoji, color, isPublic } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, message: "Collection name is required" });
        }

        const col = await Collection.create({
            owner: user._id,
            name:  String(name).trim().slice(0, 80),
            description: String(description || "").trim().slice(0, 300),
            emoji: emoji || "📁",
            color: color || "#ff6a00",
            isPublic: Boolean(isPublic)
        });

        return res.json({ success: true, collection: col });
    } catch (err) {
        console.error("[Collections POST create]", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// ─── PUT /api/collections/:id  ──────────────────────────────────────────────
app.put("/api/collections/:id", async (req, res) => {
    if (!req.session.email) return res.status(401).json({ success: false, message: "Not authenticated" });

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        const col  = await Collection.findById(req.params.id);

        if (!col) return res.status(404).json({ success: false, message: "Collection not found" });
        if (String(col.owner) !== String(user._id)) return res.status(403).json({ success: false, message: "Forbidden" });

        const { name, description, emoji, color, isPublic } = req.body;

        if (name !== undefined)        col.name        = String(name).trim().slice(0, 80);
        if (description !== undefined) col.description = String(description).trim().slice(0, 300);
        if (emoji !== undefined)       col.emoji       = emoji;
        if (color !== undefined)       col.color       = color;
        if (isPublic !== undefined)    col.isPublic    = Boolean(isPublic);

        await col.save();
        return res.json({ success: true, collection: col });
    } catch (err) {
        console.error("[Collections PUT /:id]", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// ─── DELETE /api/collections/:id  ───────────────────────────────────────────
app.delete("/api/collections/:id", async (req, res) => {
    if (!req.session.email) return res.status(401).json({ success: false, message: "Not authenticated" });

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        const col  = await Collection.findById(req.params.id);

        if (!col) return res.status(404).json({ success: false, message: "Not found" });
        if (String(col.owner) !== String(user._id)) return res.status(403).json({ success: false, message: "Forbidden" });

        await col.deleteOne();
        return res.json({ success: true });
    } catch (err) {
        console.error("[Collections DELETE /:id]", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// ─── POST /api/collections/:id/toggle-pin  ──────────────────────────────────
app.post("/api/collections/:id/toggle-pin", async (req, res) => {
    if (!req.session.email) return res.status(401).json({ success: false });

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        const col  = await Collection.findById(req.params.id);

        if (!col || String(col.owner) !== String(user._id)) return res.status(403).json({ success: false });

        col.pinned = !col.pinned;
        await col.save();
        return res.json({ success: true, pinned: col.pinned });
    } catch (err) {
        return res.status(500).json({ success: false });
    }
});

// ─── POST /api/collections/:id/add-doc  ─────────────────────────────────────
app.post("/api/collections/:id/add-doc", async (req, res) => {
    if (!req.session.email) return res.status(401).json({ success: false, message: "Not authenticated" });

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        const col  = await Collection.findById(req.params.id);

        if (!col) return res.status(404).json({ success: false, message: "Collection not found" });
        if (String(col.owner) !== String(user._id)) return res.status(403).json({ success: false, message: "Forbidden" });

        const { docId } = req.body;
        if (!docId) return res.status(400).json({ success: false, message: "docId required" });

        const docObjectId = new mongoose.Types.ObjectId(docId);
        const alreadyIn   = col.docs.some(id => String(id) === String(docObjectId));

        if (!alreadyIn) {
            col.docs.push(docObjectId);
            col.updatedAt = new Date();
            await col.save();
        }

        return res.json({ success: true, alreadyIn, docCount: col.docs.length });
    } catch (err) {
        console.error("[Collections add-doc]", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// ─── POST /api/collections/:id/remove-doc  ──────────────────────────────────
app.post("/api/collections/:id/remove-doc", async (req, res) => {
    if (!req.session.email) return res.status(401).json({ success: false, message: "Not authenticated" });

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        const col  = await Collection.findById(req.params.id);

        if (!col) return res.status(404).json({ success: false, message: "Not found" });
        if (String(col.owner) !== String(user._id)) return res.status(403).json({ success: false, message: "Forbidden" });

        const { docId } = req.body;
        col.docs = col.docs.filter(id => String(id) !== String(docId));
        await col.save();

        return res.json({ success: true, docCount: col.docs.length });
    } catch (err) {
        console.error("[Collections remove-doc]", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// ─── POST /api/collections/:id/reorder  ─────────────────────────────────────
app.post("/api/collections/:id/reorder", async (req, res) => {
    if (!req.session.email) return res.status(401).json({ success: false });

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        const col  = await Collection.findById(req.params.id);

        if (!col || String(col.owner) !== String(user._id)) return res.status(403).json({ success: false });

        const { orderedIds } = req.body; // array of doc id strings in new order
        if (!Array.isArray(orderedIds)) return res.status(400).json({ success: false });

        // Validate that all ids belong to this collection
        const existing = new Set(col.docs.map(String));
        const valid    = orderedIds.filter(id => existing.has(String(id)));

        col.docs = valid.map(id => new mongoose.Types.ObjectId(id));
        await col.save();

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false });
    }
});

// ─── GET /api/collections/check/:docId  ─────────────────────────────────────
// Returns all collections of this user + whether each contains the given doc
app.get("/api/collections/check/:docId", async (req, res) => {
    if (!req.session.email) return res.status(401).json({ success: false });

    try {
        const user = await user_profile.findOne({ email: req.session.email });
        const cols = await Collection.find({ owner: user._id })
            .select("name emoji color docs")
            .lean();

        const docIdStr = String(req.params.docId);
        const result   = cols.map(c => ({
            _id:      c._id,
            name:     c.name,
            emoji:    c.emoji,
            color:    c.color,
            contains: c.docs.some(id => String(id) === docIdStr)
        }));

        return res.json({ success: true, collections: result });
    } catch (err) {
        return res.status(500).json({ success: false });
    }
});

// ─── POST /api/docs/:id/notebook-link ───────────────────────────────────────
// Generates a 5-minute pre-signed R2 URL for NotebookLM ingestion.
// Only accessible to authenticated users who have already unlocked the doc.
app.post("/api/docs/:id/notebook-link", async (req, res) => {
    if (!req.session.email) {
        return res.status(401).json({ success: false, message: "Sign in to use this feature." });
    }
    try {
        const docId = req.params.id;
        const doc = await Docs.findById(docId).select("file_url protected price").lean();

        if (!doc || !doc.file_url) {
            return res.status(404).json({ success: false, message: "Document not found." });
        }

        if (doc.protected) {
            const user = await user_profile
                .findOne({ email: req.session.email })
                .select("last_doc_views")
                .lean();

            if (!user) {
                return res.status(401).json({ success: false, message: "User not found." });
            }

            const hasAccess = Array.isArray(user.last_doc_views) &&
                user.last_doc_views.some(entry => String(entry.doc_id) === String(docId));

            if (!hasAccess) {
                return res.status(403).json({ success: false, message: "You need to unlock this document first." });
            }
        }

        const cdnBase  = process.env.R2_CDN_URL.replace(/\/$/, "");
        const r2Key    = doc.file_url.replace(cdnBase + "/", "");

        if (!r2Key || r2Key === doc.file_url) {
            console.error("[notebook-link] Could not derive R2 key from file_url:", doc.file_url);
            return res.status(500).json({ success: false, message: "Could not generate link." });
        }

        const command   = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: r2Key });
        const signedUrl = await getSignedUrl(r2, command, { expiresIn: 60 });

        console.log(`[notebook-link] user=${req.session.email} doc=${docId} ts=${new Date().toISOString()}`);
        return res.json({ success: true, url: signedUrl, expiresIn: 60 });

    } catch (err) {
        console.error("[notebook-link] Error:", err);
        return res.status(500).json({ success: false, message: "Failed to generate link." });
    }
});

/* ============================================================
 *  404 CATCH-ALL  — must be AFTER all app.get / app.post routes
 * ============================================================ */
app.use((req, res) => {
    renderError(res, 404, "The page you requested doesn't exist.", `Path: ${req.originalUrl}`);
});

/* ============================================================
 *  GLOBAL ERROR MIDDLEWARE  — catches any uncaught next(err)
 * ============================================================ */
app.use((err, req, res, next) => {
    console.error("[Unhandled Error]", err);
    const code = err.status || err.statusCode || 500;
    renderError(res, code, err.message || "An unexpected error occurred.", "");
});