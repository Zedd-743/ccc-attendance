


document.getElementById("uploadForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append("csvFile", document.getElementById("csvFile").files[0]);

    try {
        // Show loader while uploading
        document.getElementById("loader").style.display = "inline"; 
        document.getElementById("uploadMessage").innerHTML = ""; // Clear previous messages

        // Make the fetch request to upload the file
        const response = await fetch("/upload-attendance", {
            method: "POST",
            body: formData,
        });

        const result = await response.json();

        // Hide loader after receiving the response
        document.getElementById("loader").style.display = "none"; 

        const uploadMessage = document.getElementById("uploadMessage");

        if (result.success) {
            // Show success message and set color to green
            uploadMessage.style.color = "green";
            uploadMessage.innerHTML = "<p>File processed successfully!</p>";

            // Populate the uploaded records in the new table using `tableData`
            updateUploadedTable(result.tableData);
        } else {
            // Show failure message and set color to red
            uploadMessage.style.color = "red";
            uploadMessage.innerHTML = "<p>Error processing file. Please try again.</p>";
        }
    } catch (error) {
        console.error("Error:", error);

        // Show failure message and set color to red
        const uploadMessage = document.getElementById("uploadMessage");
        uploadMessage.style.color = "red";
        uploadMessage.innerHTML = "<p>An error occurred. Please try again.</p>";

        // Hide loader
        document.getElementById("loader").style.display = "none";
    }
});

function updateUploadedTable(data) {
    console.log("Data received by frontend:", data); // Log the data

    const tableBody = document.getElementById("uploadedAttendanceRecords");
    tableBody.innerHTML = ""; // Clear existing rows

    // Populate new rows based on the uploaded data
    data.forEach(row => {
        console.log("Row being added:", row); // Log each row being added to the table

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${row.student_number || "N/A"}</td>
            <td>${row.student_name || "N/A"}</td>
            <td>${row.time_in || "N/A"}</td>
            <td>${row.time_out || "N/A"}</td>
            <td>${row.status || "N/A"}</td>
            <td>${row.remarks || "N/A"}</td>
        `;
        tableBody.appendChild(tr);
    });
}




document.addEventListener("DOMContentLoaded", function () {
    const recordsTable = document.getElementById('attendanceRecords');
    const subjectDropdown = document.getElementById("subject-dropdown");
    const sectionDropdown = document.getElementById("section-dropdown");

   
    const fiscalYear = localStorage.getItem('selectedFiscalYear'); // or use a server-rendered variable

    console.log("Loaded fiscal year:", fiscalYear); // Debug fiscal year

    
    // Fetch subjects dynamically from the backend based on fiscal year
    fetch(`/api/subjects?fiscalYear=${fiscalYear}`)
        .then(response => {
            console.log("Subjects API response status:", response.status); // Debug API response status
            return response.json();
        })
        .then(data => {
            console.log("Subjects fetched:", data); // Debug subjects data

            // Clear previous dropdown options
            subjectDropdown.innerHTML = "<option value=''>Select Subject</option>";
            sectionDropdown.innerHTML = "<option value=''>Select Section</option>";

            // Populate the subject dropdown
            if (data.length === 0) {
                console.log("No subjects found for the given fiscal year.");
            } else {
                data.forEach(item => {
                    const option = document.createElement("option");
                    option.value = item.subject_id;  // Assuming subject_id is used for fetching sections
                    option.textContent = item.subject_name;
                    subjectDropdown.appendChild(option);
                });
            }

            // Update section dropdown when a subject is selected
            subjectDropdown.addEventListener("change", function () {
                const selectedSubjectId = this.value;
                console.log("Selected subject ID:", selectedSubjectId); // Debug selected subject ID

                sectionDropdown.innerHTML = "<option value=''>Select Section</option>"; // Reset section dropdown
                sectionDropdown.disabled = !selectedSubjectId;  // Disable section dropdown if no subject is selected

                if (selectedSubjectId) {
                    // Fetch sections for the selected subject
                    fetch(`/api/sections?subject=${selectedSubjectId}&fiscalYear=${fiscalYear}`)
                        .then(response => {
                            console.log(`Sections API response status for subject ${selectedSubjectId}:`, response.status);
                            return response.json();
                        })
                        .then(sections => {
                            console.log(`Sections for subject ${selectedSubjectId}:`, sections); // Debug sections data

                            if (sections.length === 0) {
                                console.log(`No sections found for subject ${selectedSubjectId}.`);
                            } else {
                                sections.forEach(section => {
                                    const option = document.createElement("option");
                                    option.value = section.section_id;
                                    option.textContent = section.section_name;
                                    sectionDropdown.appendChild(option);
                                });
                            }
                        })
                        .catch(error => console.error('Error fetching sections:', error));
                }
            });
        })
        .catch(error => console.error('Error fetching subjects:', error));

    // Fetch and display attendance records based on selected subject, section, and fiscal year
    function fetchAttendance() {
        const subject = document.getElementById('subject-dropdown').value;
        const section = document.getElementById('section-dropdown').value;

        console.log("Fetching attendance for Subject:", subject, "Section:", section); // Debug selected filters

        if (subject && section) {
            // Fetch the attendance data via the API route
            fetch(`/api/attendance?subject=${subject}&section=${section}&fiscalYear=${fiscalYear}`)
                .then(response => {
                    console.log("Attendance API response status:", response.status); // Debug API response status
                    return response.json();
                })
                .then(data => {
                    console.log("Attendance data fetched:", data); // Debug attendance data

                    recordsTable.innerHTML = ''; // Clear existing table rows

                    data.forEach(record => {
                        const row = document.createElement('tr');
                        row.innerHTML = ` 
                            <td>${record.student_number}</td>
                            <td>${record.student_name}</td>
                            <td>${record.time_in}</td>
                            <td>${record.time_out}</td>
                            <td>${record.status}</td>
                            <td>${record.remarks}</td>
                        `;
                        recordsTable.appendChild(row);
                    });
                })
                .catch(error => console.error('Error fetching attendance data:', error));
        }
    }

    // Event listeners for subject and section dropdown changes
    subjectDropdown.addEventListener('change', fetchAttendance);
    sectionDropdown.addEventListener('change', fetchAttendance);

    // Chart and toggle logic
    let barChart, pieChart;
    const barChartCanvas = document.getElementById('attendanceChart').getContext('2d');
    const pieChartCanvas = document.getElementById('attendancePieChart').getContext('2d');
    const toggleButton = document.getElementById('toggleChartButton');
    const barChartContainer = document.getElementById('barChartContainer');
    const pieChartContainer = document.getElementById('pieChartContainer');

    // Initialize Bar Chart
    barChart = new Chart(barChartCanvas, {
        type: 'bar',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Attendance Count',
                data: [20, 15, 18, 22],
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    pieChartContainer.style.display = 'none'; // Initially hide pie chart

    toggleButton.addEventListener("click", function () {
        if (barChart) barChart.destroy();
        if (pieChart) pieChart.destroy();

        if (pieChartContainer.style.display === 'none') {
            pieChart = new Chart(pieChartCanvas, {
                type: 'pie',
                data: {
                    labels: ['Present', 'Absent', 'Late'],
                    datasets: [{
                        data: [60, 25, 15],
                        backgroundColor: ['#27ae60', '#e74c3c', '#f1c40f'],
                        borderColor: ['#2ecc71', '#c0392b', '#f39c12'],
                        borderWidth: 1
                    }]
                }
            });

            barChartContainer.style.display = 'none';
            pieChartContainer.style.display = 'block';
            toggleButton.textContent = 'View Bar Chart';
        } else {
            barChart = new Chart(barChartCanvas, {
                type: 'bar',
                data: {
                    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                    datasets: [{
                        label: 'Attendance Count',
                        data: [20, 15, 18, 22],
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });

            pieChartContainer.style.display = 'none';
            barChartContainer.style.display = 'block';
            toggleButton.textContent = 'View Pie Chart';
        }
    });
});
document.getElementById("rangeSelect").addEventListener("change", function() {
    // Hide all date selectors initially
    const dateSelectors = document.getElementById("dateSelectors");
    const dayPicker = document.getElementById("dayPicker");
    const weekPicker = document.getElementById("weekPicker");
    const monthPicker = document.getElementById("monthPicker");
    const yearPicker = document.getElementById("yearPicker");

    // Show dateSelectors div when range is selected
    dateSelectors.style.display = this.value ? "block" : "none";

    // Hide all picker inputs
    dayPicker.style.display = "none";
    weekPicker.style.display = "none";
    monthPicker.style.display = "none";
    yearPicker.style.display = "none";

    // Show the appropriate picker based on the selection
    if (this.value === "day") {
        dayPicker.style.display = "block";
    } else if (this.value === "week") {
        weekPicker.style.display = "block";
    } else if (this.value === "month") {
        monthPicker.style.display = "block";
    } else if (this.value === "year") {
        yearPicker.style.display = "block";
    }
});

document.getElementById("downloadCSV").addEventListener("click", async () => {
    const range = document.getElementById("rangeSelect").value;
    let dateValue = null;

    // Get the appropriate date or range
    if (range === "day") {
        dateValue = document.getElementById("day").value;
    } else if (range === "week") {
        dateValue = document.getElementById("week").value;
    } else if (range === "month") {
        dateValue = document.getElementById("month").value;
    } else if (range === "year") {
        dateValue = document.getElementById("year").value;
    }

    if (!dateValue) {
        alert("Please select a date or range!");
        return;
    }

    try {
        const response = await fetch(`/download-attendance?format=csv&range=${range}&date=${dateValue}`);
        const result = await response.blob(); // Get the file as a Blob

        // Create a download link for the CSV file
        const link = document.createElement("a");
        link.href = URL.createObjectURL(result);
        link.download = `attendance-${range}-${dateValue}.csv`;
        link.click();
    } catch (error) {
        console.error("Error downloading CSV:", error);
    }
});

document.getElementById("downloadPDF").addEventListener("click", async () => {
    const range = document.getElementById("rangeSelect").value;
    let dateValue = null;

    // Get the appropriate date or range
    if (range === "day") {
        dateValue = document.getElementById("day").value;
    } else if (range === "week") {
        dateValue = document.getElementById("week").value;
    } else if (range === "month") {
        dateValue = document.getElementById("month").value;
    } else if (range === "year") {
        dateValue = document.getElementById("year").value;
    }

    if (!dateValue) {
        alert("Please select a date or range!");
        return;
    }

    try {
        const response = await fetch(`/download-attendance?format=pdf&range=${range}&date=${dateValue}`);
        const result = await response.blob(); // Get the file as a Blob

        // Create a download link for the PDF file
        const link = document.createElement("a");
        link.href = URL.createObjectURL(result);
        link.download = `attendance-${range}-${dateValue}.pdf`;
        link.click();
    } catch (error) {
        console.error("Error downloading PDF:", error);
    }
});
