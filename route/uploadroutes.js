const express = require('express');
const multer = require('multer');
const path = require('path');
const csv = require('csv-parser');
const fs = require('fs');
const db = require('../server'); // Import the database connection from server.js

const router = express.Router();

// Configure storage settings for multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads'); // Directory to save the uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Use timestamp to avoid filename conflicts
    }
});

// Initialize multer with storage settings
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Only allow CSV files
        if (file.mimetype !== 'text/csv') {
            return cb(new Error('Only CSV files are allowed'));
        }
        cb(null, true);
    }
});

// Upload route for CSV files
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    const results = [];

    // Parse the CSV file
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
            // Validate each row if necessary
            if (!row.student_name || !row.student_number || !row.unique_code) {
                console.error('Missing required fields in row:', row);
                return;
            }
            results.push(row); // Store each valid row of data
        })
        .on('end', () => {
            console.log('CSV file successfully processed:', results);

            // Begin transaction to insert data
            db.beginTransaction((err) => {
                if (err) {
                    return res.status(500).send('Error starting transaction');
                }

                // Insert data into the database
                results.forEach((row, index) => {
                    const query = 'INSERT INTO students (student_name, student_number, unique_code) VALUES (?, ?, ?)';
                    db.query(query, [row.student_name, row.student_number, row.unique_code], (err, result) => {
                        if (err) {
                            console.error('Error inserting data:', err);
                            return db.rollback(() => {
                                res.status(500).send('Error inserting data');
                            });
                        }

                        if (index === results.length - 1) {
                            // Commit transaction after all inserts are done
                            db.commit((err) => {
                                if (err) {
                                    return db.rollback(() => {
                                        res.status(500).send('Error committing transaction');
                                    });
                                }
                                console.log('Transaction committed successfully');
                                res.json(results); // Send parsed results as a response (optional)
                            });
                        }
                    });
                });
            });
        })
        .on('error', (err) => {
            console.error('Error reading CSV file:', err);
            res.status(500).send('Error processing file');
        })
        .on('close', () => {
            // Delete the uploaded file after processing
            fs.unlink(req.file.path, (err) => {
                if (err) {
                    console.error('Error deleting uploaded file:', err);
                } else {
                    console.log('Uploaded file deleted');
                }
            });
        });
});

module.exports = router; // Export the router for use in the server
