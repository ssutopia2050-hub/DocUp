import express from 'express';
import dotenv from "dotenv";
import user_profile from "./models/users.js";
import college from "./models/college.js";
import Docs from "./models/Docs.js";
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
dotenv.config();
const upload = multer({dest:"uploads/"});
/******************************
           Middleware
 ******************************/
app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(
    session({
        secret: process.env.SESSION_SECRET,  // keep your secret
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI,   // your MongoDB connection string
            collectionName: "sessions",        // collection to store sessions
            ttl: 24 * 60 * 60                  // session expiry in seconds (1 day)
        }),
        cookie: {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000        // 1 day in ms
        }
    })
);
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
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
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
/******************************
           Server Start
 ******************************/
app.listen(port, () => {
    console.log(`Server running on url: http://localhost:${port}/`);
});
app.get("/sitemap.xml", (req, res) => {
    res.header("Content-Type", "application/xml");
    res.send(`
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url>
                <loc>https://www.docup.in/</loc>
            </url>
            <url>
                <loc>https://www.docup.in/dashboard</loc>
            </url>
            <url>
                <loc>https://www.docup.in/search</loc>
            </url>
        </urlset>
    `);
});
/******************************
           Database
 ******************************/
(async () => {
    try {
        await connectDB();
        console.log("Mongo Ready");
    } catch (err) {
        console.warn("Mongo unavailable");
    }
})();
/******************************
           Routes
 ******************************/
app.get('/', (req, res) => {
    res.render('seo' , {err:null})
})
/******************************
          Signup
 ******************************/
app.get("/signup", (req, res) => {
    res.render('signup',{err:null});
})
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;

    const exists = await user_profile.findOne({ email });

    if (exists) {
        return res.render('signup', {
            err: { message: "An account with your email already exists !!" }
        });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    req.session.pendingUser = {
        name,
        email,
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
                email,
                otp,
                name
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        console.log(`OTP sent to ${email}: ${otp}`);

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
app.get('/signin',  (req, res) => {
    res.render('signin', {err:null});
})
app.post('/signin', async (req, res) => {
    const { email, password } = req.body;

    // console.log("typed email:", JSON.stringify(email));
    // console.log("typed password:", JSON.stringify(password));

    const exists = await user_profile.findOne({ email });
    // console.log("db user:", exists);

    if (!exists) {
        return res.render('signin', {
            err: { message: "You dont have an account with DocUp" }
        });
    }

    // console.log("db password:", JSON.stringify(exists.pin));

    if (password === exists.password) {
        req.session.email = email;
        return res.redirect('/dashboard');
    } else {
        return res.render('signin', {
            err: { message: "Invalid Credentials !!" }
        });
    }
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
    await user_profile.create({
        name: data.name,
        email: data.email,
        password: data.password
    });

    delete req.session.pendingUser;
    res.redirect("/signin",);
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

    const data = req.session.forgotData;

    if (!data) {
        return res.redirect("/forgot_password");
    }

    if (Date.now() < data.resendAllowedAt) {
        return res.render("forgot_password", {
            err: { message: "Password sent to your email." },
            resendAllowedAt: req.session.forgotData.resendAllowedAt
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

    res.render("forgot_password", {
        err: { message: "Password sent to your email." },
        resendAllowedAt: req.session.forgotData.resendAllowedAt
    });
});
/******************************
 Dashboard
 ******************************/
app.get("/dashboard", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }

    try {
        const data = await user_profile.findOne({ email: req.session.email });
        const clg = await college.find({});
        const msg ={
            err:null
        }
        res.render("dashboard", {
            data,
            colleges: collegesList,
            results: [],
            college_specific_data: clg,
            msg
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

        let searchType = "";
        let searchValue = "";

        if (!search_parameter_text || !search_parameter_text.trim()) {
            return res.status(400).json({
                success: false,
                message: "Search text is required"
            });
        }

        const trimmedSearch = search_parameter_text.trim();

        if (trimmedSearch.startsWith("/ch")) {
            searchType = "chapter";
            searchValue = trimmedSearch.slice(3).trim();
        } else if (trimmedSearch.startsWith("/c")) {
            searchType = "college";
            searchValue = trimmedSearch.slice(2).trim();
        } else if (trimmedSearch.startsWith("/s")) {
            searchType = "subject";
            searchValue = trimmedSearch.slice(2).trim();
        } else {
            searchType = "";
            searchValue = trimmedSearch;
        }

        if (!searchValue) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid search value"
            });
        }

        const resultsMap = new Map();

        function addResults(docs, scoreToAdd) {
            docs.forEach(doc => {
                const id = doc._id.toString();

                if (!resultsMap.has(id)) {
                    resultsMap.set(id, {
                        ...doc.toObject(),
                        _score: 0
                    });
                }

                resultsMap.get(id)._score += scoreToAdd;
            });
        }

        if (searchType === "college") {
            const s1 = await Docs.find({
                college: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s1, 100);

            const s2 = await Docs.find({
                college: { $regex: searchValue, $options: "i" }
            });
            addResults(s2, 70);

            if (branch !== "all") {
                const s3 = await Docs.find({ branch });
                addResults(s3, 20);
            }

            if (year !== "all") {
                const s4 = await Docs.find({ year });
                addResults(s4, 15);
            }
        }

        else if (searchType === "subject") {
            const s1 = await Docs.find({
                subject: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s1, 100);

            const s2 = await Docs.find({
                subject: { $regex: searchValue, $options: "i" }
            });
            addResults(s2, 75);

            if (branch !== "all") {
                const s3 = await Docs.find({ branch });
                addResults(s3, 20);
            }

            if (year !== "all") {
                const s4 = await Docs.find({ year });
                addResults(s4, 15);
            }
        }

        else if (searchType === "chapter") {
            const s1 = await Docs.find({
                chapter: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s1, 110);

            const s2 = await Docs.find({
                chapter: { $regex: searchValue, $options: "i" }
            });
            addResults(s2, 85);

            const s3 = await Docs.find({
                subject: { $regex: searchValue, $options: "i" }
            });
            addResults(s3, 25);

            if (branch !== "all") {
                const s4 = await Docs.find({ branch });
                addResults(s4, 20);
            }

            if (year !== "all") {
                const s5 = await Docs.find({ year });
                addResults(s5, 15);
            }
        }

        else {
            const s1 = await Docs.find({
                college: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s1, 80);

            const s2 = await Docs.find({
                subject: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s2, 80);

            const s3 = await Docs.find({
                chapter: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s3, 95);

            const s4 = await Docs.find({
                branch: { $regex: searchValue, $options: "i" }
            });
            addResults(s4, 60);

            const s5 = await Docs.find({
                uploaded_by: { $regex: searchValue, $options: "i" }
            });
            addResults(s5, 40);

            if (branch !== "all") {
                const s6 = await Docs.find({ branch });
                addResults(s6, 20);
            }

            if (year !== "all") {
                const s7 = await Docs.find({ year });
                addResults(s7, 15);
            }
        }

        let results_after_search = Array.from(resultsMap.values());
        results_after_search.sort((a, b) => b._score - a._score);

        res.json({
            success: true,
            results: results_after_search
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({
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

        const collegeData =
            allCollegeRows.find(c => normalizeText(c.college_name) === requestedName) ||
            allCollegeRows.find(c => normalizeCompact(c.college_name) === requestedCompact) ||
            null;

        function normalize(value) {
            return String(value || "").trim().toLowerCase();
        }

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

        const groupedDocs = {
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

        console.log("requested college:", collegeName);
        console.log("matched college row:", collegeData);
        console.log("docs found:", docs.length);
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
            user:user_data
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
                data,
                colleges: uniqueColleges
            });

        });

});
app.post("/upload_docs", upload.single("file"), async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

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

        const {
            college,
            year,
            semester,
            branch,
            subject,
            chapter
        } = req.body;

        if (!college || !year || !semester || !branch || !subject || !chapter) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({
                success: false,
                message: "Please fill all metadata fields"
            });
        }

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

        const { data: publicUrlData } = supabase.storage
            .from(process.env.SUPABASE_BUCKET)
            .getPublicUrl(storagePath);

        const fileUrl = publicUrlData?.publicUrl;

        const doc = await Docs.create({
            college,
            year,
            semester,
            branch,
            subject,
            chapter,
            file_url: fileUrl,
            uploaded_by: user.email
        });

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

        if (!email) {
            return res.redirect("/signin");
        }

        const user = await user_profile.findOne({ email }).populate("saved_documents");

        if (!user) {
            return res.redirect("/signin");
        }

        if (user.payment_history && user.payment_history.length > 0) {
            user.payment_history.sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        res.render("profile", { user });
    } catch (error) {
        console.log("Profile Page Error:", error);
        res.status(500).send("Internal Server Error");
    }
});
/******************************
    Privacy Policy
 ******************************/
app.get("/privacy_policy", async (req, res) => {
        res.render("privacy_policy");//TODO:make privacy_policy page
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

        const document = await Docs.findById(req.params.id).lean();

        if (!document) {
            return res.status(404).render("404");
        }

        const user_data = await user_profile.findOne({ email: req.session.email });

        if (!user_data) {
            return res.redirect("/signin");
        }

        if (user_data.Doc_score <= 0) {
            const msg = { err: "Insufficient DocScore" };
            const clg = await college.find({});

            return res.render("dashboard", {
                data: user_data,
                colleges: collegesList,
                results: [],
                college_specific_data: clg,
                msg
            });
        }

        await user_profile.findOneAndUpdate(
            { email: req.session.email },
            { $inc: { Doc_score: -1 } }
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

        res.render("docview", {
            doc: document,
            college_data: collegeData || {},
            user: user_data
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
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

        const updatedDoc = await Docs.findByIdAndUpdate(
            docId,
            {
                $push: {
                    comment_section: {
                        $each: [
                            {
                                comment: comment.trim(),
                                uploaded_by_email: userEmail
                            }
                        ],
                        $position: 0
                    }
                }
            },
            { new: true }
        );

        if (!updatedDoc) {
            return res.status(404).json({
                success: false,
                message: "Document not found"
            });
        }

        res.json({
            success: true
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
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
        label: "Starter Recharge",
        amount: 19,
        docscore: 10
    },
    standard: {
        label: "Standard Recharge",
        amount: 49,
        docscore: 30,
    },
    pro: {
        label: "Unlimited Study Pack",
        amount: 99,
        docscore: 100
    }
};

/****************************
 Pricing
 ****************************/
app.get("/pricing", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }

    res.render("pricing");
});
app.post("/buy-recharge", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

        const { plan } = req.body;
        const selectedPlan = RECHARGE_PLANS[plan];

        if (!selectedPlan) {
            return res.status(400).json({
                success: false,
                message: "Invalid recharge plan"
            });
        }

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        const existingPendingOrder = await paymentOrder.findOne({
            user_email: req.session.email,
            plan_key: plan,
            status: "PENDING",
            createdAt: { $gte: fiveMinutesAgo }
        }).sort({ createdAt: -1 });

        if (existingPendingOrder) {
            return res.json({
                success: true,
                orderId: existingPendingOrder.order_id,
                amount: existingPendingOrder.amount * 100,
                currency: "INR",
                key: process.env.RAZORPAY_KEY_ID,
                userEmail: req.session.email
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
            userEmail: req.session.email
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
app.get("/version_report",(req,res)=>{
res.render("version_report");
})