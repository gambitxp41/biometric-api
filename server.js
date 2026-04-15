// server.js (Render API Gateway)

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

app.use(cors());
app.use(bodyParser.json());

// ===============================
// ?? InfinityFree Backend
// ===============================
const BASE = "https://pandoratest.free.nf/api";

// ===============================
// ?? Axios instance
// ===============================
const api = axios.create({
    headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/json",
        "Accept": "application/json"
    },
    timeout: 15000
});

// ===============================
// ?? ENROLL BIOMETRIC
// ===============================
app.post("/enroll", async (req, res) => {
    try {
        const response = await api.post(`${BASE}/save_fingerprint.php`, {
            register: "1",
            username: req.body.username,
            biometric_id: req.body.biometric_id
        });

        res.json(response.data);
    } catch (err) {
        res.status(500).json({
            error: "Enroll failed",
            message: err.message
        });
    }
});

// ===============================
// ?? UPDATE BIOMETRIC
// ===============================
app.post("/update", async (req, res) => {
    try {
        const response = await api.post(`${BASE}/update_biometric.php`, {
            username: req.body.username,
            biometric_id: req.body.biometric_id
        });

        res.json(response.data);
    } catch (err) {
        res.status(500).json({
            error: "Update failed",
            message: err.message
        });
    }
});

// ===============================
// ?? GET ALL FINGERPRINTS
// ===============================
app.get("/getfingerprint", async (req, res) => {
    try {
        const response = await api.get(`${BASE}/get_fingerprints.php`);

        res.json(response.data);
    } catch (err) {
        res.status(500).json({
            error: "Fetch failed",
            message: err.message
        });
    }
});

// ===============================
// ?? LOGIN (by ID or biometric)
// ===============================
app.post("/login", async (req, res) => {
    try {
        const response = await api.post(`${BASE}/login.php`, {
            id: req.body.id,
            login: "1"
        });

        res.json(response.data);
    } catch (err) {
        res.status(500).json({
            error: "Login failed",
            message: err.message
        });
    }
});

// ===============================
// ?? GET BIOMETRIC BY ID
// ===============================
app.get("/getbiometric", async (req, res) => {
    try {
        const id = req.query.id;

        const response = await api.get(`${BASE}/get_fingerprints.php?id=${id}`);

        res.json(response.data);
    } catch (err) {
        res.status(500).json({
            error: "Get biometric failed",
            message: err.message
        });
    }
});

// ===============================
// ?? ROOT
// ===============================
app.get("/", (req, res) => {
    res.json({
        status: "OK",
        message: "Biometric API running on Render"
    });
});

// ===============================
// ?? START SERVER
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});