const express = require("express");
const db = require("../server"); // Ensure the database connection is correctly imported
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const PDFDocument = require("pdfkit");
const { Parser } = require('json2csv'); // Import json2csv to generate CSV files

// Helper function to handle database errors
const handleDbError = (res, error) => {
    console.error("Database Query Error:", error);
    res.status(500).send("Database error");
};

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const upload = multer({ storage });

router.get('/api/getStudentNumber', async (req, res) => {
    const { barcode } = req.query;
    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }
  
    try {
        const student = await new Promise((resolve, reject) => {
            db.query('SELECT student_number FROM students WHERE unique_code = ?', [barcode], (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
        
      if (student.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }
      res.json({ studentNumber: student[0].student_number });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Database query failed' });
    }
  });
  


router.post("/upload-attendance", upload.single("csvFile"), async (req, res) => {
    try {
        const results = [];
        const filePath = req.file.path;
        const invalidRows = [];

        // Parse CSV file
        fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (data) => {
                // Validate data
                if (!data.student_id || !data.schedule_id) {
                    invalidRows.push({
                        row: data,
                        error: `Missing required fields: student_id=${data.student_id}, schedule_id=${data.schedule_id}`,
                    });
                } else {
                    // Insert data into the database
                    const query = `
                        INSERT INTO studentattendance (student_id, schedule_id, student_number, attendance_date, time_in, time_out)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            time_in = VALUES(time_in),
                            time_out = VALUES(time_out)
                    `;
                    // Wrap query in a Promise
                    const insertData = new Promise((resolve, reject) => {
                        db.query(
                            query,
                            [
                                data.student_id,
                                data.schedule_id,
                                data.student_number,
                                data.attendance_date,
                                data.time_in,
                                data.time_out,
                            ],
                            (err) => {
                                if (err) return reject(err);
                                resolve();
                            }
                        );
                    });

                    insertData
                        .then(() => results.push(data))
                        .catch((err) => {
                            invalidRows.push({
                                row: data,
                                error: `Database error: ${err.message}`,
                            });
                        });
                }
            })
            .on("end", async () => {
                try {
                    // Query to fetch complete data for the table
                    const tableData = await new Promise((resolve, reject) => {
                        db.query(
                            `
                            SELECT 
                                sa.student_id, 
                                sa.schedule_id, 
                                sa.student_number, 
                                sa.attendance_date, 
                                sa.time_in, 
                                sa.time_out, 
                                s.student_name,
                                ast.status,
                                ast.remarks
                            FROM studentattendance sa
                            LEFT JOIN students s ON sa.student_id = s.id
                            LEFT JOIN attendance_status ast ON sa.id = ast.studentattendance_id
                            `,
                            (err, results) => {
                                if (err) return reject(err);
                                resolve(results);
                            }
                        );
                    });

                    // Respond with both inserted and fetched data
                    res.json({
                        success: true,
                        message: "File processed successfully!",
                        insertedRows: results,
                        tableData: tableData, // Include full data for frontend
                        invalidRows: invalidRows,
                    });
                } catch (fetchError) {
                    console.error("Error fetching uploaded data:", fetchError);
                    res.status(500).json({
                        success: false,
                        message: "Error fetching uploaded data.",
                    });
                }
            });
    } catch (error) {
        console.error("Error processing file:", error);
        res.status(500).json({ success: false, message: "File processing failed." });
    }
});


router.get("/download-attendance", async (req, res) => {
    const { format, range, date } = req.query;

    try {
        let dateFilter = "";
        const today = new Date();
        let dateStart = null;
        let dateEnd = null;

        // Date filtering logic
        if (range === "day") {
            dateStart = date;
            dateEnd = date;  // For the day range, start and end are the same
            dateFilter = `DATE(sa.attendance_date) = ?`;
        } else if (range === "week") {
            const startOfWeek = new Date(date);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);  // Set to end of the week
            dateStart = startOfWeek.toISOString().split('T')[0]; // Start of the week
            dateEnd = endOfWeek.toISOString().split('T')[0];  // End of the week
            dateFilter = `DATE(sa.attendance_date) BETWEEN ? AND ?`;
        } else if (range === "month") {
            const monthStart = new Date(date);
            const monthEnd = new Date(date);
            monthEnd.setMonth(monthStart.getMonth() + 1);
            monthEnd.setDate(0);  // Set to the last day of the selected month
            dateStart = monthStart.toISOString().split('T')[0];  // First day of the month
            dateEnd = monthEnd.toISOString().split('T')[0];  // Last day of the month
            dateFilter = `DATE(sa.attendance_date) BETWEEN ? AND ?`;
        } else if (range === "year") {
            const yearStart = new Date(date);
            const yearEnd = new Date(date);
            yearEnd.setFullYear(yearStart.getFullYear() + 1);  // Start of next year
            yearEnd.setMonth(0);  // January 1st of next year
            yearEnd.setDate(0);  // Last day of the current year
            dateStart = yearStart.toISOString().split('T')[0];  // First day of the year
            dateEnd = yearEnd.toISOString().split('T')[0];  // Last day of the year
            dateFilter = `DATE(sa.attendance_date) BETWEEN ? AND ?`;
        }

        // Log start and end dates to verify they're correct
        console.log(`Date Range: ${range}`);
        console.log(`Start Date: ${dateStart}`);
        console.log(`End Date: ${dateEnd}`);

        // Query to get attendance data wrapped in a Promise
        const attendanceData = await new Promise((resolve, reject) => {
            db.query(
                `SELECT 
                    sa.student_id, 
                    sa.schedule_id, 
                    sa.student_number, 
                    DATE_FORMAT(sa.attendance_date, '%Y-%m-%d') AS attendance_date,
                    sa.time_in, 
                    sa.time_out, 
                    s.student_name,
                    IFNULL(ast.status, 'N/A') AS status,
                    IFNULL(ast.remarks, 'N/A') AS remarks
                FROM studentattendance sa
                LEFT JOIN students s ON sa.student_id = s.id
                LEFT JOIN attendance_status ast ON sa.id = ast.studentattendance_id
                WHERE ${dateFilter}`,
                [dateStart, dateEnd],  // Pass dateStart and dateEnd for filtering
                (err, results) => {
                    if (err) return reject(err);
                    resolve(results);
                }
            );
        });
        
        // Log the result to see what is being returned from the query
        console.log('Attendance Data:', attendanceData);

        // Ensure attendanceData is always treated as an array
        const data = Array.isArray(attendanceData) ? attendanceData : [attendanceData];

        // Handle CSV download
        if (format === "csv") {
            const parser = new Parser();
            const csv = parser.parse(data);

            res.header("Content-Type", "text/csv");
            res.attachment(`attendance-${range}-${date}.csv`);
            res.send(csv);
        }
        // Handle PDF download
        else if (format === "pdf") {
            const doc = new PDFDocument();
            const filename = `attendance-${range}-${date}.pdf`;

            res.header("Content-Type", "application/pdf");
            res.attachment(filename);  // Ensure the filename is properly set

            // Create a pipe to stream the PDF to the client
            doc.pipe(res);

            // Set the title and some formatting for the PDF
            doc.fontSize(16).text("Attendance Report", { align: 'center' });
            doc.moveDown();

            // Add table headers
            doc.fontSize(12).text("Student Number  |  Name  |  Time In  |  Time Out  |  Status  |  Remarks", { align: 'left' });

            // Add each entry to the PDF
            data.forEach(entry => {
                doc.text(`${entry.student_number}  |  ${entry.student_name}  |  ${entry.time_in}  |  ${entry.time_out}  |  ${entry.status}  |  ${entry.remarks}`, { align: 'left' });
            });

            // Finalize the document and close the stream
            doc.end();
        }
        else {
            res.status(400).json({ success: false, message: "Invalid format." });
        }
    } catch (error) {
        console.error("Error downloading attendance data:", error);
        res.status(500).json({ success: false, message: "Error downloading data." });
    }
});




// Route to render the login page
router.get('/', (req, res) => {
    res.render('login'); // Render the login page
});

// Route for manual login
router.post('/manual-login', (req, res) => {
    const accessCode = req.body.code;
    console.log("Manual login route accessed");
    console.log("Access Code:", accessCode);

    // Query the database for the professor's code
    db.query("SELECT * FROM Professors WHERE uniqueCode = ?", [accessCode], (error, results) => {
        if (error) {
            return handleDbError(res, error);
        }

        if (results && results.length > 0) {
            console.log("Access code found, login successful.");
            req.session.professorCode = accessCode; // Store professor code in session
            res.json({ success: true });
        } else {
            console.log("Access code not found, login failed.");
            res.json({ success: false });
        }
    });
});

// Route for barcode login
router.post('/barcode-login', (req, res) => {
    const barcode = req.body.barcode;
    console.log("Barcode Login Route Accessed");
    console.log("Barcode Input:", barcode);

    if (!barcode || barcode.trim() === "") {
        return res.json({
            success: false,
            message: "No barcode scanned. Please scan a barcode."
        });
    }

    db.query("SELECT * FROM Professors WHERE uniqueCode = ?", [barcode], (error, results) => {
        if (error) {
            console.error("Database error:", error);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        if (results && results.length > 0) {
            const professor = results[0]; // Assuming the first result is the correct one
            req.session.professorCode = professor.uniqueCode;
            req.session.professorId = professor.id;

            // Automatically redirect to the dashboard
            res.json({
                success: true,
                redirectTo: '/dashboard' // Redirect to the professor's dashboard or another page
            });
        } else {
            res.json({
                success: false,
                message: "Invalid barcode! Please try again."
            });
        }
    });
});



// Route to render the dashboard
router.get('/dashboard', (req, res) => {
    const professorCode = req.session.professorCode;

    if (!professorCode) {
        return res.redirect('/'); // Redirect to login if no professor code is in session
    }

    db.query("SELECT name FROM Professors WHERE uniqueCode = ?", [professorCode], (error, results) => {
        if (error) {
            return handleDbError(res, error);
        }

        if (results && results.length > 0) {
            const professorName = results[0].name;
            res.render('dashboard', { professorName });
        } else {
            res.redirect('/'); // If no professor found, redirect to login
        }
    });
});


// Route to render the dashboard
router.get('/scanner', (req, res) => {
    const professorCode = req.session.professorCode;

    if (!professorCode) {
        return res.redirect('/'); // Redirect to login if no professor code is in session
    }

    db.query("SELECT name FROM Professors WHERE uniqueCode = ?", [professorCode], (error, results) => {
        if (error) {
            return handleDbError(res, error);
        }

        if (results && results.length > 0) {
            const professorName = results[0].name;
            res.render('scanner', { professorName });
        } else {
            res.redirect('/'); // If no professor found, redirect to login
        }
    });
});

// Route to render the attendance dashboard
router.get('/dashboard-attendance', (req, res) => {
    const professorCode = req.session.professorCode;
    const fiscalYear = req.session.fiscalYear;

    // Check if professor code or fiscal year is missing
    if (!professorCode) {
        console.log("No professor code or fiscal year in session. Redirecting to login.");
        return res.redirect('/'); // Redirect to login if no professor code or fiscal year in session
    }

    // Convert fiscal year to fiscal year ID (1 or 2)
    const fiscalYearId = fiscalYear === '2024' ? 1 : (fiscalYear === '2025' ? 2 : fiscalYear);

    console.log("Fiscal Year from session:", fiscalYear, "Using fiscal year ID:", fiscalYearId); // Debug log for fiscal year

    db.query("SELECT id, name FROM Professors WHERE uniqueCode = ?", [professorCode], (error, professorResults) => {
        if (error) {
            console.error("Error fetching professor data:", error);
            return handleDbError(res, error);
        }

        if (professorResults && professorResults.length > 0) {
            const { id: professorId } = professorResults[0];
            console.log("Professor ID:", professorId); // Debug log for professor ID

            // Get subjects based on the professor and fiscal year
            db.query(`
                SELECT DISTINCT s.id AS subject_id, s.subject_name
                FROM Subjects s
                JOIN Schedules sch ON sch.subject_id = s.id
                WHERE sch.professor_id = ? AND sch.fiscal_year_id = ?`, [professorId, fiscalYearId], (subjectError, subjectResults) => {
                    if (subjectError) {
                        console.error("Error fetching subjects:", subjectError);
                        return handleDbError(res, subjectError);
                    }

                    const subjects = subjectResults;
                    console.log("Subjects fetched:", subjects); // Debug log for subjects

                    // Fetch sections based on fiscal year and subject
                    db.query(`
                        SELECT DISTINCT sec.id AS section_id, sec.section_name
                        FROM Sections sec
                        JOIN Schedules sch ON sch.section_id = sec.id
                        WHERE sch.fiscal_year_id = ? AND sch.subject_id = ?`, [fiscalYearId, professorId], (sectionError, sectionResults) => {
                            if (sectionError) {
                                console.error("Error fetching sections:", sectionError);
                                return handleDbError(res, sectionError);
                            }

                            const sections = sectionResults;
                            console.log("Sections fetched:", sections); // Debug log for sections

                            // Render the page with the fetched data
                            res.render('dashboard-attendance', {
                                professorName: professorResults[0].name,
                                subjects,      // Pass subjects to the template
                                sections,      // Pass sections to the template
                                fiscalYear,    // Pass fiscal year to the template for JS usage
                            });
                    });
            });
        } else {
            console.log("No professor found, redirecting to login.");
            return res.redirect('/'); // Redirect if no professor found
        }
    });
});

/// Route to fetch subjects based on fiscal year and professor's code
router.get('/api/subjects', (req, res) => {
    const fiscalYear = req.session.fiscalYear; // Get fiscal year from session
    const professorCode = req.session.professorCode; // Get professor's code from session

    if (!fiscalYear || !professorCode) {
        return res.status(400).json({ error: 'Fiscal year or professor code not selected.' });
    }

    const fiscalYearId = fiscalYear === '2024' ? 1 : (fiscalYear === '2025' ? 2 : fiscalYear);

    db.query(`
        SELECT DISTINCT s.id AS subject_id, s.subject_name
        FROM Subjects s
        JOIN Schedules sch ON sch.subject_id = s.id
        JOIN Professors p ON sch.professor_id = p.id
        WHERE sch.fiscal_year_id = ? AND p.uniqueCode = ?
    `, [fiscalYearId, professorCode], (error, results) => {
        if (error) {
            console.error("Error fetching subjects:", error);
            return res.status(500).json({ error: 'Error fetching subjects' });
        }
        res.json(results); // Return subjects based on fiscal year and professor's code
    });
});


/// Route to fetch sections based on subject, fiscal year, and professor's code
router.get('/api/sections', (req, res) => {
    const subjectId = req.query.subject;
    const fiscalYear = req.session.fiscalYear; // Get fiscal year from session
    const professorCode = req.session.professorCode; // Get professor's code from session

    if (!subjectId || !fiscalYear || !professorCode) {
        return res.status(400).json({ error: 'Subject, fiscal year, or professor code not selected.' });
    }

    const fiscalYearId = fiscalYear === '2024' ? 1 : (fiscalYear === '2025' ? 2 : fiscalYear);

    db.query(`
        SELECT DISTINCT sec.id AS section_id, sec.section_name
        FROM Sections sec
        JOIN Schedules sch ON sch.section_id = sec.id
        JOIN Professors p ON sch.professor_id = p.id
        WHERE sch.subject_id = ? AND sch.fiscal_year_id = ? AND p.uniqueCode = ?
    `, [subjectId, fiscalYearId, professorCode], (error, results) => {
        if (error) {
            console.error('Error fetching sections:', error);
            return res.status(500).json({ error: 'Error fetching sections' });
        }
        res.json(results); // Return sections based on subject, fiscal year, and professor's code
    });
});



// Route to fetch attendance data based on subject, section, fiscal year, and professor's code
router.get('/api/attendance', (req, res) => {
    const { subject, section } = req.query;
    const fiscalYear = req.session.fiscalYear; // Get fiscal year from session
    const professorCode = req.session.professorCode; // Get professor's code from session

    if (!subject || !section || !fiscalYear || !professorCode) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    const fiscalYearId = fiscalYear === '2024' ? 1 : (fiscalYear === '2025' ? 2 : fiscalYear);

    db.query(`
        SELECT DISTINCT 
            sa.student_number, 
            st.student_name, 
            sa.time_in, 
            sa.time_out, 
            ats.status, 
            ats.remarks
        FROM studentattendance sa
        JOIN Students st ON sa.student_id = st.id
        JOIN Schedules sch ON sa.schedule_id = sch.id
        JOIN Professors p ON sch.professor_id = p.id
        LEFT JOIN attendance_status ats ON sa.id = ats.studentattendance_id
        WHERE sch.subject_id = ? 
            AND sch.section_id = ? 
            AND sch.fiscal_year_id = ? 
            AND p.uniqueCode = ?
        ORDER BY sa.attendance_date, sa.student_number
    `, [subject, section, fiscalYearId, professorCode], (error, results) => {
        if (error) {
            console.error('Error fetching attendance:', error);
            return res.status(500).json({ error: 'Error fetching attendance' });
        }

        // Check if results contain the expected columns and handle missing data
        if (results.length === 0) {
            console.log('No attendance records found.');
            return res.status(404).json({ error: 'No attendance records found' });
        }

        // Log and check for missing fields in the results
        results.forEach((attendance) => {
            if (!attendance.student_number) {
                console.log('Missing student number:', attendance); // Log missing data
            }
            if (!attendance.time_in || !attendance.time_out) {
                console.log('Missing time data:', attendance); // Log missing time
            }
        });

        // Log the fetched data for debugging purposes
        console.log('Fetched attendance data:', results);

        // Send the attendance data to the frontend
        res.json(results);
    });
});


// Route to handle student list page with selected filters (subject, section, fiscal year)
router.get('/student-list', (req, res) => {
    const professorCode = req.session.professorCode;
    const fiscalYear = req.session.fiscalYear;

    // Check if professor code or fiscal year is missing
    if (!professorCode) {
        console.log("No professor code or fiscal year in session. Redirecting to login.");
        return res.redirect('/'); // Redirect to login if no professor code or fiscal year in session
    }

    // Convert fiscal year (e.g., '2024') to fiscal year ID (1 or 2)
    const fiscalYearId = fiscalYear === '2024' ? 1 : (fiscalYear === '2025' ? 2 : fiscalYear);

    console.log("Fiscal Year from session:", fiscalYear, "Using fiscal year ID:", fiscalYearId); // Debug log for fiscal year

    db.query("SELECT id, name FROM Professors WHERE uniqueCode = ?", [professorCode], (error, professorResults) => {
        if (error) {
            console.error("Error fetching professor data:", error);
            return handleDbError(res, error);
        }

        if (professorResults && professorResults.length > 0) {
            const { id: professorId } = professorResults[0];
            console.log("Professor ID:", professorId); // Debug log for professor ID

            // Get data for subjects based on professor and fiscal year (DISTINCT)
            db.query(`
                SELECT DISTINCT s.id AS subject_id, s.subject_name
                FROM Subjects s
                JOIN Schedules sch ON sch.subject_id = s.id
                WHERE sch.professor_id = ? AND sch.fiscal_year_id = ?
            `, [professorId, fiscalYearId], (subjectError, subjectResults) => {
                if (subjectError) {
                    console.error("Error fetching subjects:", subjectError);
                    return handleDbError(res, subjectError);
                }

                const subjects = subjectResults;
                console.log("Subjects fetched:", subjects); // Debug log for subjects

                // Now fetch the list of students for the selected subject, section, and fiscal year
                const { subject, section } = req.query;  // Get filters from the request query parameters

                console.log("Selected filters - Subject:", subject, "Section:", section); // Debug log for selected filters

                if (subject && section) {
                    // Fetch students based on subject, section, and fiscal year
                    db.query(`
                        SELECT st.id AS student_id, st.student_name, st.student_number, 
                               att.login_time, att.logout_time, st.barcode
                        FROM Students st
                        JOIN Attendance att ON att.student_id = st.id
                        JOIN Schedules sch ON sch.id = att.schedule_id
                        JOIN Sections sec ON sch.section_id = sec.id
                        JOIN Subjects sub ON sch.subject_id = sub.id
                        WHERE sub.subject_name = ? AND sec.section_name = ? AND sch.fiscal_year_id = ?
                    `, [subject, section, fiscalYearId], (studentError, studentResults) => {
                        if (studentError) {
                            console.error("Error fetching students:", studentError);
                            return handleDbError(res, studentError);
                        }

                        console.log("Students fetched:", studentResults); // Debug log for student results

                        // Render the page with the fetched student data
                        res.render('student-list', {
                            professorName: professorResults[0].name,
                            subjects,
                            students: studentResults,  // Pass students to the Handlebars template
                            selectedSubject: subject,  // Pass the selected subject
                            selectedSection: section,  // Pass the selected section
                            fiscalYear: fiscalYear,    // Pass fiscalYear to the template for JS usage
                        });
                    });
                } else {
                    console.log("No subject or section selected. Rendering page with only subjects.");
                    // If no subject or section selected, just render with subjects
                    res.render('student-list', {
                        professorName: professorResults[0].name,
                        subjects,
                        students: [],  // Empty student list if no filters are applied
                        fiscalYear: fiscalYear,  // Pass fiscalYear to the template for JS usage
                    });
                }
            }); // End of db.query for fetching subjects
        } else {
            console.log("No professor found, redirecting to login.");
            return res.redirect('/'); // Redirect if no professor found
        }
    }); // End of db.query for fetching professor data
});



router.get('/sections', (req, res) => {
    const { subject, fiscalYear } = req.query;

    if (!subject || !fiscalYear) {
        return res.status(400).json({ error: 'Subject and fiscal year are required' });
    }

    // Convert fiscalYear to an integer (assuming it's passed as a string like '2024')
    const fiscalYearId = fiscalYear === '2024' ? 1 : (fiscalYear === '2025' ? 2 : null);

    if (!fiscalYearId) {
        return res.status(400).json({ error: 'Invalid fiscal year' });
    }

    const query = `
        SELECT DISTINCT sec.section_name
        FROM Sections sec
        JOIN Schedules sch ON sch.section_id = sec.id
        JOIN Subjects sub ON sch.subject_id = sub.id
        WHERE sub.subject_name = ? AND sch.fiscal_year_id = ?
    `;

    db.query(query, [subject, fiscalYearId], (error, results) => {
        if (error) {
            return handleDbError(res, error);
        }
        
        console.log('Sections fetched:', results);  // Ensure the results are returned correctly
        res.json(results); // Return sections as JSON
    });
});

router.get('/sessions', (req, res) => {
    const { section, fiscalYear } = req.query;

    if (!section || !fiscalYear) {
        return res.status(400).json({ error: 'Section and fiscal year are required' });
    }

    // Convert fiscalYear to an integer (assuming it's passed as a string like '2024')
    const fiscalYearId = fiscalYear === '2024' ? 1 : (fiscalYear === '2025' ? 2 : null);

    if (!fiscalYearId) {
        return res.status(400).json({ error: 'Invalid fiscal year' });
    }

    const query = `
        SELECT DISTINCT ts.time_slot
        FROM TimeSlots ts
        JOIN Schedules sch ON sch.time_slot_id = ts.id
        JOIN Sections sec ON sch.section_id = sec.id
        WHERE sec.section_name = ? AND sch.fiscal_year_id = ?
    `;

    db.query(query, [section, fiscalYearId], (error, results) => {
        if (error) {
            return handleDbError(res, error);
        }

        console.log('Sessions fetched:', results);  // Ensure the results are returned correctly
        res.json(results); // Return sessions as JSON
    });
});

router.get('/students', (req, res) => {
    const { subject, section, session, fiscalYear } = req.query;

    if (!subject || !section || !session || !fiscalYear) {
        return res.status(400).json({ error: 'Subject, Section, Session, and Fiscal Year are required' });
    }

    // Map fiscalYear to fiscalYearId
    const fiscalYearId = fiscalYear === '2024' ? 1 : (fiscalYear === '2025' ? 2 : null);
    if (!fiscalYearId) {
        return res.status(400).json({ error: 'Invalid fiscal year' });
    }

    const query = `
SELECT 
    sa.student_number AS student_number,  
    st.student_name, 
    DATE_FORMAT(sa.attendance_date, '%Y-%m-%d') AS attendance_date, 
    CASE 
        WHEN sa.time_in IS NULL OR sa.time_in = '0000-00-00 00:00:00' THEN 'N/A' 
        ELSE DATE_FORMAT(sa.time_in, '%h:%i %p')  -- 12-hour format without date, showing only time
    END AS time_in,  
    CASE 
        WHEN sa.time_out IS NULL OR sa.time_out = '0000-00-00 00:00:00' THEN 'N/A' 
        ELSE DATE_FORMAT(sa.time_out, '%h:%i %p')  -- 12-hour format without date, showing only time
    END AS time_out,  
    st.unique_code AS barcode  
FROM Students st
JOIN StudentAttendance sa ON st.id = sa.student_id
JOIN Schedules sch ON sa.schedule_id = sch.id
JOIN Sections sec ON sch.section_id = sec.id
JOIN Subjects sub ON sch.subject_id = sub.id
JOIN TimeSlots ts ON sch.time_slot_id = ts.id
WHERE sub.subject_name = ? AND sec.section_name = ? AND ts.time_slot = ? AND sch.fiscal_year_id = ?
`;


    

    db.query(query, [subject, section, session, fiscalYearId], (error, studentResults) => {
        if (error) {
            console.error("Error fetching students:", error);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!studentResults || studentResults.length === 0) {
            return res.status(404).json({ error: 'No students found' });
        }

        res.json(studentResults);
    });
});



router.get('/schedule', (req, res) => {
    const professorCode = req.session.professorCode;
    const selectedDate = req.query.date || null; // Use selected date from query or null if none
    const fiscalYear = req.session.fiscalYear; // Get fiscal year from session

    // Check if professor code or fiscal year is missing
    if (!professorCode) {
        return res.redirect('/'); // Redirect to login if no professor code or fiscal year in session
    }

    // Map fiscal year to fiscal_year_id from the database (ensure this matches the structure)
    const fiscalYearId = fiscalYear === '2024' ? 1 : (fiscalYear === '2025' ? 2 : fiscalYear);
    console.log("Fiscal Year from session:", fiscalYear); // Debug log for fiscal year

    db.query("SELECT id, name FROM Professors WHERE uniqueCode = ?", [professorCode], (error, professorResults) => {
        if (error) {
            return handleDbError(res, error);
        }

        if (professorResults && professorResults.length > 0) {
            const { id: professorId, name: professorName } = professorResults[0];

            console.log("Professor ID:", professorId);
            console.log("Professor Name:", professorName);

            // Fetch the subjects the professor is teaching
            const subjectsQuery = `
                SELECT DISTINCT sub.subject_name
                FROM Schedules sch
                JOIN Subjects sub ON sch.subject_id = sub.id
                WHERE sch.professor_id = ? 
                AND sch.fiscal_year_id = ?;
            `;

            db.query(subjectsQuery, [professorId, fiscalYearId], (subjectsError, subjectsResults) => {
                if (subjectsError) {
                    return handleDbError(res, subjectsError);
                }

                // Format the list of subjects the professor is teaching
                const subjects = subjectsResults.map(result => result.subject_name);

                // Fetch the schedule for the selected date or the full weekly schedule
                if (selectedDate) {
                    const [year, month, day] = selectedDate.split('-');
                    const startDate = new Date(year, month - 1, day); // Start date
                    const endDate = new Date(startDate); // End date (7 days after the start date)
                    endDate.setDate(startDate.getDate() + 7); // Adjust for a week range

                    const formattedStartDate = startDate.toISOString().split('T')[0];
                    const formattedEndDate = endDate.toISOString().split('T')[0];

                    const dayName = startDate.toLocaleString('default', { weekday: 'long' });

                    const dailyQuery = `
                        SELECT ts.time_slot, sch.schedule_date, sub.subject_name, sec.section_name
                        FROM Schedules sch
                        JOIN Days d ON sch.day_id = d.id
                        JOIN Subjects sub ON sch.subject_id = sub.id
                        JOIN Sections sec ON sch.section_id = sec.id
                        JOIN TimeSlots ts ON sch.time_slot_id = ts.id
                        JOIN FiscalYears fy ON sch.fiscal_year_id = fy.id
                        WHERE d.day_name = ? 
                        AND sch.professor_id = ? 
                        AND sch.schedule_date BETWEEN fy.year_start AND fy.year_end
                        ORDER BY sch.schedule_date;
                    `;

                    db.query(dailyQuery, [dayName, professorId], (dailyError, dailyResults) => {
                        if (dailyError) {
                            return handleDbError(res, dailyError);
                        }

                        const weeklyQuery = `
                            SELECT d.day_name, ts.time_slot, sub.subject_name, sec.section_name
                            FROM Schedules sch
                            JOIN Days d ON sch.day_id = d.id
                            JOIN Subjects sub ON sch.subject_id = sub.id
                            JOIN Sections sec ON sch.section_id = sec.id
                            JOIN TimeSlots ts ON sch.time_slot_id = ts.id
                            JOIN FiscalYears fy ON sch.fiscal_year_id = fy.id
                            WHERE sch.professor_id = ? 
                            AND fy.id = ?
                            ORDER BY ts.time_slot, d.day_name;
                        `;

                        db.query(weeklyQuery, [professorId, fiscalYearId], (weeklyError, weeklyResults) => {
                            if (weeklyError) {
                                return handleDbError(res, weeklyError);
                            }

                            const formattedWeeklySchedule = formatWeeklySchedule(weeklyResults);

                            res.render('schedule', {
                                professorName,
                                selectedDate,
                                dailySchedule: dailyResults,  // Daily schedule for the selected date
                                weeklySchedule: formattedWeeklySchedule,  // Full weekly schedule
                                subjects: subjects,  // Dynamic list of subjects
                            });
                        });
                    });
                } else {
                    // Case 2: No specific date selected, render full weekly schedule
                    const weeklyQuery = `
                        SELECT d.day_name, ts.time_slot, sub.subject_name, sec.section_name
                        FROM Schedules sch
                        JOIN Days d ON sch.day_id = d.id
                        JOIN Subjects sub ON sch.subject_id = sub.id
                        JOIN Sections sec ON sch.section_id = sec.id
                        JOIN TimeSlots ts ON sch.time_slot_id = ts.id
                        JOIN FiscalYears fy ON sch.fiscal_year_id = fy.id
                        WHERE sch.professor_id = ? 
                        AND fy.id = ?
                        ORDER BY ts.time_slot, d.day_name;
                    `;

                    db.query(weeklyQuery, [professorId, fiscalYearId], (weeklyError, weeklyResults) => {
                        if (weeklyError) {
                            return handleDbError(res, weeklyError);
                        }

                        const formattedWeeklySchedule = formatWeeklySchedule(weeklyResults);

                        res.render('schedule', {
                            professorName,
                            selectedDate: null,  // No date selected, render full schedule
                            dailySchedule: [],  // No daily schedule if no date is selected
                            weeklySchedule: formattedWeeklySchedule,  // Full weekly schedule
                            subjects: subjects,  // Dynamic list of subjects
                        });
                    });
                }
            });
        } else {
            return res.redirect('/'); // Redirect if no professor found
        }
    });
});

// Route to save changes
router.post('/save-schedule-changes', (req, res) => {
    const changes = req.body;

    // Validate input
    if (!changes || Object.keys(changes).length === 0) {
        return res.json({ success: false, message: 'No changes received' });
    }

    // Iterate through each changed row
    const updatePromises = Object.keys(changes).map(id => {
        const rowChanges = changes[id];
        const updateQueries = [];

        // Loop through each column changed in this row
        Object.keys(rowChanges).forEach(column => {
            const newValue = rowChanges[column];
            let query;

            // Determine the correct column and build the query
            if (column === 'subject_name') {
                query = `
                    UPDATE Attendance
                    JOIN Subjects sub ON Schedules.subject_id = sub.id
                    SET sub.subject_name = ?
                    WHERE Schedules.id = ?;
                `;
            } else if (column === 'section_name') {
                query = `
                    UPDATE Attendance
                    JOIN Sections sec ON Schedules.section_id = sec.id
                    SET sec.section_name = ?
                    WHERE Schedules.id = ?;
                `;
            } else if (column === 'time_slot') {
                query = `
                    UPDATE Attendance
                    JOIN TimeSlots ts ON Schedules.time_slot_id = ts.id
                    SET ts.time_slot = ?
                    WHERE Schedules.id = ?;
                `;
            } else {
                // If column is not recognized, skip
                return;
            }

            // Add the query to the updateQueries array
            updateQueries.push(new Promise((resolve, reject) => {
                db.query(query, [newValue, id], (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(result);
                });
            }));
        });

        // Execute all update queries for this row
        return Promise.all(updateQueries);
    });

    // After all updates are done, respond
    Promise.all(updatePromises)
        .then(() => {
            res.json({ success: true });
        })
        .catch(error => {
            console.error(error);
            res.json({ success: false, message: 'Error updating database' });
        });
});


function formatWeeklySchedule(weeklyResults) {
    const schedule = [];
    const timeSlots = ['', '', '', '','', '', '', '', '']; // Example time slots

    timeSlots.forEach((timeSlot) => {
        const daySchedule = {
            time_slot: timeSlot,
            monday: '',
            tuesday: '',
            wednesday: '',
            thursday: '',
            friday: '',
            saturday: '',
            mondaySection: '',
            tuesdaySection: '',
            wednesdaySection: '',
            thursdaySection: '',
            fridaySection: '',
            saturdaySection: ''
        };

        weeklyResults.forEach((entry) => {
            if (entry.time_slot === timeSlot) {
                daySchedule[entry.day_name.toLowerCase()] = entry.subject_name; // Assign subject to the day
                daySchedule[`${entry.day_name.toLowerCase()}Section`] = entry.section_name; // Assign section to the day
            }
        });

        schedule.push(daySchedule);
    });

    return schedule;
}







// Route to log out the professor
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).send("Error logging out");
        }
        res.redirect('/');
    });
});

router.get('/api/set-fiscal-year', (req, res) => {
    const fiscalYear = req.query.fiscalYear; // Fiscal year from frontend
    console.log("Received fiscal year from frontend:", fiscalYear);

    if (!fiscalYear) {
        return res.status(400).json({ success: false, message: "No fiscal year provided." });
    }

    let fiscalYearId;
    if (fiscalYear === '2024') {
        fiscalYearId = 1;
    } else if (fiscalYear === '2025') {
        fiscalYearId = 2;
    } else {
        return res.status(400).json({ success: false, message: "Invalid fiscal year provided." });
    }

    // Save the fiscal year to session
    req.session.fiscalYear = fiscalYearId;
    console.log("Fiscal year set in session:", req.session.fiscalYear); // Log session fiscal year

    res.json({ success: true, fiscalYearId });
});


// Route to fetch fiscal years from the database
router.get('/api/fiscal-years', (req, res) => {
    db.query("SELECT id, YEAR(year_start) AS year_start, year_name FROM FiscalYears", (error, results) => {
        if (error) {
            console.error("Error fetching fiscal years:", error);
            return res.status(500).json({ success: false, message: "Database error." });
        }

        console.log("Fetched fiscal years:", results);

        if (results.length > 0) {
            res.json({ success: true, fiscalYears: results });
        } else {
            res.status(404).json({ success: false, message: "No fiscal years found." });
        }
    });
});

router.get('/api/semesters', (req, res) => {
    const fiscalYear = req.query.fiscalYearId; // Fiscal year from frontend
    console.log("Received fiscal year from frontend:", fiscalYear); // Log fiscal year from frontend

    let fiscalYearId;
    if (fiscalYear === '2024') {
        fiscalYearId = 1;
    } else if (fiscalYear === '2025') {
        fiscalYearId = 2;
    } else {
        return res.status(400).json({ success: false, message: "Invalid fiscal year provided." });
    }

    console.log("Fetching semesters for fiscal year ID:", fiscalYearId);

    db.query(
        "SELECT id, semester_name, start_date FROM Semesters WHERE fiscal_year_id = ?",
        [fiscalYearId],
        (error, results) => {
            if (error) {
                console.error("Error fetching semesters:", error);
                return res.status(500).json({ success: false, message: "Database error." });
            }

            console.log("Fetched semesters:", results); // Log fetched semesters

            if (results.length > 0) {
                res.json({ success: true, semesters: results });
            } else {
                res.status(404).json({ success: false, message: "No semesters found for this fiscal year." });
            }
        }
    );
});


// Route to set semester in the session
router.post('/setSemester', (req, res) => {
    const { semesterId } = req.body;
    console.log("Received semester ID from frontend:", semesterId);

    if (!semesterId) {
        return res.status(400).json({ success: false, message: "Semester ID is required." });
    }

    req.session.semester = semesterId; // Save semester ID in the session
    console.log("Semester set in session:", semesterId);

    res.json({ success: true, message: "Semester saved in session." });
});


router.get('/api/manage-subject', (req, res) => {
    const fiscalYear = req.session.fiscalYear;
    const semester = req.session.semester;
    const professorCode = req.session.professorCode;  // Get professor code from session

    console.log("Fiscal Year in session:", fiscalYear);  // Log fiscal year session value
    console.log("Semester in session:", semester);  // Log semester session value
    console.log("Professor Code in session:", professorCode);  // Log professor code session value

    if (!fiscalYear || !semester || !professorCode) {
        return res.status(400).json({ success: false, message: "Fiscal year, semester, or professor code not set in session." });
    }

    db.query(
        `SELECT s.id AS subject_id, s.subject_name
        FROM subjects s
        JOIN fiscal_year_subjects fys ON s.id = fys.subject_id
        JOIN professors prof ON s.professor_id = prof.id
        WHERE fys.fiscal_year_id = ? 
          AND fys.semester_id = ? 
          AND prof.uniqueCode = ?`,  // Use professorCode to filter by professor
        [fiscalYear, semester, professorCode], 
        (err, rows) => {
            if (err) {
                console.error("Error fetching subjects:", err);
                return res.status(500).json({ success: false, message: "Error fetching subjects." });
            }

            console.log("Fetched subjects:", rows);  // Log subjects fetched from the database

            if (rows.length > 0) {
                res.json({ success: true, subjects: rows });
            } else {
                res.status(404).json({ success: false, message: "No subjects found." });
            }
        }
    );
});


router.get('/api/manage-section', (req, res) => {
    const fiscalYear = req.session.fiscalYear;
    const semester = req.session.semester;
    

    console.log("Fiscal Year in session:", fiscalYear); // Log fiscal year session value
    console.log("Semester in session:", semester); // Log semester session value

    if (!fiscalYear || !semester) {
        return res.status(400).json({ success: false, message: "Fiscal year or semester not set in session." });
    }

    db.query(
        `SELECT sec.id AS section_id, sec.section_name
        FROM sections sec
        JOIN fiscal_year_sections fys ON sec.id = fys.section_id
        WHERE fys.fiscal_year_id = ? AND fys.semester_id = ?`, 
        [fiscalYear, semester], 
        (err, rows) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: "Error fetching sections." });
            }
            res.json({ success: true, sections: rows });
        }
    );
});

// POST route to add a new subject
router.post('/api/manage-subject', (req, res) => {
    const { name } = req.body;
    const fiscalYear = req.session.fiscalYear;
    const semester = req.session.semester;
    const professorCode = req.session.professorCode;  // Retrieve professor's code from session

    if (!name) {
        return res.status(400).json({ success: false, message: "Subject name is required." });
    }

    if (!fiscalYear || !semester) {
        return res.status(400).json({ success: false, message: "Fiscal year or semester not set in session." });
    }

    if (!professorCode) {
        return res.status(400).json({ success: false, message: "Professor not logged in." });
    }

    // Query to get the professor's ID based on the stored professorCode
    db.query(
        'SELECT id FROM professors WHERE uniqueCode = ?',
        [professorCode],
        (err, result) => {
            if (err) {
                console.error('Error fetching professor ID:', err);
                return res.status(500).json({ success: false, message: "Error fetching professor ID." });
            }

            if (result.length === 0) {
                return res.status(404).json({ success: false, message: "Professor not found." });
            }

            const professorId = result[0].id;  // Get the professor's ID from the query result

            // Insert the new subject into the database along with professorId
            db.query(
                `INSERT INTO subjects (subject_name, professor_id) VALUES (?, ?)`,
                [name, professorId],
                (err, result) => {
                    if (err) {
                        console.error("Error inserting subject:", err);
                        return res.status(500).json({ success: false, message: "Error adding subject." });
                    }

                    // After adding the subject, link it with the fiscal year and semester
                    const subjectId = result.insertId;
                    db.query(
                        `INSERT INTO fiscal_year_subjects (fiscal_year_id, semester_id, subject_id) VALUES (?, ?, ?)`,
                        [fiscalYear, semester, subjectId],
                        (err) => {
                            if (err) {
                                console.error("Error linking subject to fiscal year and semester:", err);
                                return res.status(500).json({ success: false, message: "Error linking subject." });
                            }

                            res.json({ success: true, message: "Subject added successfully." });
                        }
                    );
                }
            );
        }
    );
});
// POST route to add a new section
router.post('/api/manage-section', (req, res) => {
    const { name, subject_id } = req.body;
    const fiscalYear = req.session.fiscalYear;
    const semester = req.session.semester;
    const professorCode = req.session.professorCode;  // Retrieve professor's code from session

    if (!name) {
        return res.status(400).json({ success: false, message: "Section name is required." });
    }

    if (!fiscalYear || !semester) {
        return res.status(400).json({ success: false, message: "Fiscal year or semester not set in session." });
    }

    if (!professorCode) {
        return res.status(400).json({ success: false, message: "Professor not logged in." });
    }

    // Query to get the professor's ID based on the stored professorCode
    db.query(
        'SELECT id FROM professors WHERE uniqueCode = ?',
        [professorCode],
        (err, result) => {
            if (err) {
                console.error('Error fetching professor ID:', err);
                return res.status(500).json({ success: false, message: "Error fetching professor ID." });
            }

            if (result.length === 0) {
                return res.status(404).json({ success: false, message: "Professor not found." });
            }

            const professorId = result[0].id;  // Get the professor's ID from the query result

            // Insert the new section into the database along with professorId and subject_id
            db.query(
                `INSERT INTO sections (section_name) VALUES (?)`,
                [name, subject_id, professorId],
                (err, result) => {
                    if (err) {
                        console.error("Error inserting section:", err);
                        return res.status(500).json({ success: false, message: "Error adding section." });
                    }

                    // After adding the section, link it with the fiscal year and semester
                    const sectionId = result.insertId;
                    db.query(
                        `INSERT INTO fiscal_year_sections (fiscal_year_id, semester_id, section_id) VALUES (?, ?, ?)`,
                        [fiscalYear, semester, sectionId],
                        (err) => {
                            if (err) {
                                console.error("Error linking section to fiscal year and semester:", err);
                                return res.status(500).json({ success: false, message: "Error linking section." });
                            }

                            res.json({ success: true, message: "Section added successfully." });
                        }
                    );
                }
            );
        }
    );
});



router.delete('/api/manage-subject/:id', (req, res) => {
    const { id } = req.params; // Extract subject id from the URL
    const fiscalYear = req.session.fiscalYear;
    const semester = req.session.semester;

    if (!fiscalYear || !semester) {
        return res.status(400).json({ success: false, message: "Fiscal year and semester must be set in session." });
    }

    // Start by deleting the subject from fiscal_year_subjects table
    db.query(
        `DELETE FROM fiscal_year_subjects WHERE subject_id = ? AND fiscal_year_id = ? AND semester_id = ?`,
        [id, fiscalYear, semester],
        (err, result) => {
            if (err) {
                console.error("Error deleting subject relationship:", err);
                return res.status(500).json({ success: false, message: "Error deleting subject relationship." });
            }

            // Now delete the subject from the subjects table
            db.query(
                `DELETE FROM subjects WHERE id = ?`,
                [id],
                (err, result) => {
                    if (err) {
                        console.error("Error deleting subject:", err);
                        return res.status(500).json({ success: false, message: "Error deleting subject." });
                    }

                    res.json({ success: true, message: "Subject and its relationships deleted." });
                }
            );
        }
    );
});

router.delete('/api/manage-section/:id', (req, res) => {
    const sectionId = req.params.id;  // Get the section ID from the route parameters
    const fiscalYearId = req.session.fiscalYear;  // Get fiscal year ID from session
    const semesterId = req.session.semester;  // Get semester ID from session

    // Check if fiscal year and semester are set in the session
    if (!fiscalYearId || !semesterId) {
        return res.status(400).json({ success: false, message: "Fiscal year or semester not set in session." });
    }

    // Start by deleting the section from fiscal_year_sections table
    db.query(
        `DELETE FROM fiscal_year_sections WHERE section_id = ? AND fiscal_year_id = ? AND semester_id = ?`,
        [sectionId, fiscalYearId, semesterId],
        (err, result) => {
            if (err) {
                console.error("Error deleting section relationship:", err);
                return res.status(500).json({ success: false, message: "Error deleting section relationship." });
            }

            // Now delete the section from the sections table
            db.query(
                `DELETE FROM sections WHERE id = ?`,
                [sectionId],
                (err, result) => {
                    if (err) {
                        console.error("Error deleting section:", err);
                        return res.status(500).json({ success: false, message: "Error deleting section." });
                    }

                    res.json({ success: true, message: "Section and its relationships deleted." });
                }
            );
        }
    );
});

router.post('/insert-time-slot', (req, res) => {
    // Log the request body to inspect the incoming data
    console.log('Received request body:', req.body);

    const { startTime, endTime } = req.body;

    // Step 1: Validate time range
    if (!isValidTimeRange(startTime, endTime)) {
        console.log('Invalid time range: Start time must be earlier than End time.');
        return res.status(400).json({ error: "Invalid time range: Start time must be earlier than End time." });
    }

    // Step 2: Ensure time slots are in sequential order (optional)
    if (!isSequentialOrder(startTime, endTime)) {
        console.log('Time slots must be in sequential order.');
        return res.status(400).json({ error: "Time slots must be in sequential order." });
    }

    // Log received data for debugging
    console.log(`Received request to insert a time slot with start time: ${startTime}, end time: ${endTime}`);

    // Step 3: Insert the new time slot into the time_slots table (no ID is required)
    const insertTimeSlotQuery = `
        INSERT INTO time_slots (time_start, time_end)
        VALUES (?, ?);
    `;
    db.query(insertTimeSlotQuery, [startTime, endTime], (err, result) => {
        if (err) {
            console.error("Error inserting time slot into time_slots table: ", err);
            return res.status(500).json({ error: "Error inserting time slot." });
        }

        // Step 4: Return success response with inserted time data
        res.status(200).json({ message: "Time slot inserted successfully", startTime, endTime });
    });
});

// Helper function to validate the time range (start time < end time)
function isValidTimeRange(startTime, endTime) {
    const start = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);
    return start < end;
}

// Helper function to convert time (HH:MM AM/PM) to minutes
function timeToMinutes(time) {
    const [hour, minute] = time.split(':');
    const [minutePart, period] = minute.split(' ');
    let hour24 = parseInt(hour, 10);
    if (period === 'PM' && hour24 !== 12) hour24 += 12;
    if (period === 'AM' && hour24 === 12) hour24 = 0;
    return hour24 * 60 + parseInt(minutePart, 10);
}

// Helper function to validate the sequential order of time slots (accepts fractional time)
function isSequentialOrder(startTime, endTime) {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    return startMinutes < endMinutes;
}




// Export the router to be used in other parts of the application
module.exports = router;