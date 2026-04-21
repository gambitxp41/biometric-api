const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");
require("dotenv").config();

const app = express();

// ========================
// MIDDLEWARE
// ========================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ========================
// HEALTH CHECK
// ========================
app.get("/", (req, res) => {
    res.json({ status: "Biometric API Running 🚀" });
});

// ========================
// profile photo
// ========================
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploads folder publicly
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MULTER storage config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + ext);
    }
});

const upload = multer({ storage });

// Upload endpoint
app.post("/upload-photo", upload.single("profile_photo"), (req, res) => {
    if (!req.file) {
        return res.json({
            success: false,
            message: "No file uploaded"
        });
    }

    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

    res.json({
        success: true,
        url: fileUrl
    });
});

// Default
app.get("/", (req, res) => {
    res.send("Upload API Running");
});

// Start server
app.listen(3000, () => console.log("Server running on port 3000"));
// ========================
// GET USER
// ========================
app.get("/get-user", async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.json({ success: false, message: "Missing id" });
        }

        const [rows] = await db.query(
            "SELECT id, username, role, profile_photo FROM users WHERE id=?",
            [id]
        );

        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========================
// UPDATE BIOMETRIC USING USERNAME
// ========================
app.post("/update-biometric", async (req, res) => {
    try {
        const { username, biometric_id } = req.body;

        if (!username || !biometric_id) {
            return res.json({
                success: false,
                message: "Missing username or biometric_id"
            });
        }

        const [result] = await db.query(
            "UPDATE users SET biometric_id=? WHERE username=?",
            [biometric_id, username]
        );

        if (result.affectedRows === 0) {
            return res.json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            message: "Biometric updated successfully"
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ========================
// GET BIOMETRIC DATA
// ========================
app.get("/get-biometric", async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.json({ success: false, message: "Missing id" });
        }

        const [rows] = await db.query(
            "SELECT id, username, biometric_id FROM users WHERE id=?",
            [id]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "User not found" });
        }

        res.json({
            success: true,
            user: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========================
// STATS
// ========================
app.get("/stats/users", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT COUNT(*) AS total FROM users");
        res.json({ total: rows[0].total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/stats/inventory", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT COUNT(*) AS total FROM inventory");
        res.json({ total: rows[0].total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.json({ success: false, message: "Missing username or password" });
        }

        const [rows] = await db.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "Username not found" });
        }

        const user = rows[0];

        // If password is plain text (NOT recommended)
        if (user.password !== password) {
            return res.json({ success: false, message: "Invalid password" });
        }

        res.json({
            success: true,
            message: "Login successful",
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                biometric_id: user.biometric_id
            }
        });

    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ========================
// LOGIN BIOMETRIC (MAIN FIXED)
// ========================
app.post("/login-biometric", async (req, res) => {
    try {
        const { finger_id } = req.body;

        if (!finger_id) {
            return res.json({ success: false, message: "Missing finger_id" });
        }

        const [rows] = await db.query(
            "SELECT id, username, role, biometric_id FROM users WHERE biometric_id=? OR id=?",
            [finger_id, finger_id]
        );

        if (rows.length === 0) {
            return res.json({
                success: false,
                message: "Fingerprint not found"
            });
        }

        res.json({
            success: true,
            message: "Login successful",
            user: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========================
// SIGNUP (MAIN FIXED)
// ========================
app.post("/signup", async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password) {
            return res.json({
                success: false,
                message: "Missing username or password"
            });
        }

        const [existing] = await db.query(
            "SELECT * FROM users WHERE username=?",
            [username]
        );

        if (existing.length > 0) {
            return res.json({
                success: false,
                message: "Username already exists"
            });
        }

        // ❌ NO HASH (plain text)
        await db.query(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            [username, password, role || "student"]
        );

        res.json({
            success: true,
            message: "Account created"
        });

    } catch (err) {
        res.json({
            success: false,
            error: err.message
        });
    }
});

// ========================
// ENROLL BIOMETRIC
// ========================
app.post("/enroll-fingerprint", async (req, res) => {
    try {
        const { username, biometric_id } = req.body;

        if (!username || !biometric_id) {
            return res.json({ success: false, message: "Missing data" });
        }

        await db.query(
            "UPDATE users SET biometric_id=? WHERE username=?",
            [biometric_id, username]
        );

        res.json({
            success: true,
            message: "Fingerprint saved"
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// GLOBAL ERROR SAFETY
// ========================
process.on("unhandledRejection", (err) => {
    console.log("Unhandled Error:", err);
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("🚀 Server running on port " + PORT);
});
