const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");
require("dotenv").config();

// ========================
// CLOUDINARY IMPORT (ADDED)
// ========================
const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// ========================
// HEALTH
// ========================
app.get("/", (req, res) => {
    res.json({ status: "Biometric API Running 🚀" });
});

// ========================
// CLOUDINARY UPLOAD FUNCTION (NEW BUT SAFE)
// ========================
async function uploadToCloudinary(base64Image) {
    if (!base64Image) return null;

    const result = await cloudinary.uploader.upload(
        `data:image/jpeg;base64,${base64Image}`,
        {
            folder: "biometric_users"
        }
    );

    return result.secure_url; // IMPORTANT: store URL not base64
}

// ========================
// GET USERS
// ========================
app.get("/users", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM users");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// login
// ========================
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const [rows] = await db.query(
        "SELECT * FROM users WHERE username=?",
        [username]
    );

    if (!rows.length) {
        return res.json({ success: false, message: "User not found" });
    }

    const user = rows[0];

    if (user.password !== password) {
        return res.json({ success: false, message: "Invalid password" });
    }

    res.json({ success: true, user });
});

// ========================
// biometrics login
// ========================
app.post("/login-biometric", async (req, res) => {
    const { finger_id } = req.body;

    const [rows] = await db.query(
        "SELECT * FROM users WHERE biometric_id=? OR id=?",
        [finger_id, finger_id]
    );

    if (!rows.length) {
        return res.json({ success: false, message: "Fingerprint not found" });
    }

    res.json({ success: true, user: rows[0] });
});

// ========================
// signup
// ========================
app.post("/signup", async (req, res) => {
    const { username, password, role } = req.body;

    const [existing] = await db.query(
        "SELECT * FROM users WHERE username=?",
        [username]
    );

    if (existing.length > 0) {
        return res.json({ success: false, message: "Username exists" });
    }

    await db.query(
        "INSERT INTO users (username,password,role,approvals) VALUES (?,?,?, 'pending')",
        [username, password, role || "student"]
    );

    res.json({ success: true });
});

// ========================
// UPDATE USER (UPDATED WITH CLOUDINARY)
// ========================
app.post("/update-user", async (req, res) => {
    try {
        const {
            id,
            username,
            password,
            role,
            biometric_id,
            subjects,
            course,
            year_level,
            profile_photo
        } = req.body;

        // 🔥 UPLOAD IMAGE TO CLOUDINARY
        let imageUrl = null;
        if (profile_photo) {
            imageUrl = await uploadToCloudinary(profile_photo);
        }

        let sql = "";
        let params = [];

        if (!id) {
            sql = `
                INSERT INTO users 
                (username, password, role, biometric_id, subjects, course, year_level, profile_photo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            params = [username, password, role, biometric_id, subjects, course, year_level, imageUrl];
        } else {
            sql = `
                UPDATE users SET
                username=?,
                password=?,
                role=?,
                biometric_id=?,
                subjects=?,
                course=?,
                year_level=?,
                profile_photo=?
                WHERE id=?
            `;
            params = [username, password, role, biometric_id, subjects, course, year_level, imageUrl, id];
        }

        await db.query(sql, params);

        res.json({ success: true });

    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ========================
// DELETE USER
// ========================
app.get("/delete-user", async (req, res) => {
    try {
        await db.query("DELETE FROM users WHERE id=?", [req.query.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// TOGGLE APPROVAL
// ========================
app.get("/toggle-approval", async (req, res) => {
    try {
        const { id } = req.query;

        const [rows] = await db.query(
            "SELECT approvals FROM users WHERE id=?",
            [id]
        );

        let current = rows[0].approvals;

        let next =
            current === "pending" ? "approved" :
            current === "approved" ? "disapproved" :
            "approved";

        await db.query(
            "UPDATE users SET approvals=? WHERE id=?",
            [next, id]
        );

        res.json({ success: true, status: next });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("🚀 Server running on port " + PORT);
});
