const fs = require("fs");
const path = require("path");

// ========================
// TEMP MIGRATION ENDPOINT
// ========================
app.get("/run-migration", async (req, res) => {
    try {
        const [items] = await db.query("SELECT id, photo FROM inventory");

        let success = 0;
        let failed = 0;

        for (const item of items) {

            if (!item.photo || item.photo.startsWith("http")) continue;

            let filePath = path.join(__dirname, "uploads", item.photo);

            if (!fs.existsSync(filePath)) {
                console.log("Missing file:", filePath);
                failed++;
                continue;
            }

            const result = await cloudinary.uploader.upload(filePath, {
                folder: "inventory_items"
            });

            await db.query(
                "UPDATE inventory SET photo=? WHERE id=?",
                [result.secure_url, item.id]
            );

            success++;
        }

        res.json({
            success: true,
            message: "Migration done",
            success_count: success,
            failed_count: failed
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
