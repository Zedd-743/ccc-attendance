// Function to load sections based on selected subject
function loadSections() {
    const subject = document.getElementById('subject-select').value;

    // Now fiscalYear is directly accessible from the script block injected above
    console.log('Fiscal Year in JS:', fiscalYear);  // Check if the fiscal year is correctly passed here

    if (subject) {
        fetch(`/sections?subject=${subject}&fiscalYear=${fiscalYear}`)
            .then(response => response.json())
            .then(data => {
                console.log('Sections Data:', data);  // Log the response to inspect the structure

                const sectionSelect = document.getElementById('section-select');
                sectionSelect.innerHTML = '<option value="">Select Section</option>'; // Clear current options

                data.forEach(section => {
                    const option = document.createElement('option');
                    option.value = section.section_name;
                    option.textContent = section.section_name;
                    sectionSelect.appendChild(option);
                });

                sectionSelect.disabled = false; // Enable section dropdown
            })
            .catch(error => console.error('Error loading sections:', error));
    }
}



// Function to load sessions based on selected section
function loadSessions() {
    const section = document.getElementById('section-select').value;
    
    if (section) {
        fetch(`/sessions?section=${section}&fiscalYear=${fiscalYear}`)
            .then(response => response.json())
            .then(data => {
                const sessionSelect = document.getElementById('session-select');
                sessionSelect.innerHTML = '<option value="">Select Session</option>'; // Clear current options

                data.forEach(session => {
                    const option = document.createElement('option');
                    option.value = session.time_slot;
                    option.textContent = session.time_slot;
                    sessionSelect.appendChild(option);
                });

                sessionSelect.disabled = false; // Enable session dropdown
            })
            .catch(error => console.error('Error loading sessions:', error));
    }
}

// This function filters the student list based on the search input
function searchStudent() {
    const searchQuery = document.getElementById('search-bar').value.toLowerCase();  // Get search query
    const rows = document.querySelectorAll('#student-list-body tr');  // Get all rows in the student table

    rows.forEach(row => {
        const studentNumber = row.cells[0].innerText.toLowerCase();  // Get student number
        const studentName = row.cells[1].innerText.toLowerCase();  // Get student name
        const barcode = row.cells[5].innerText.toLowerCase();  // Get barcode

        // If the student number, name, or barcode includes the search query, display the row
        if (studentNumber.includes(searchQuery) || studentName.includes(searchQuery) || barcode.includes(searchQuery)) {
            row.style.display = '';  // Show row
        } else {
            row.style.display = 'none';  // Hide row
        }
    });
}

function loadStudentList() {
    const subject = document.getElementById('subject-select').value;
    const section = document.getElementById('section-select').value;
    const session = document.getElementById('session-select').value;

    if (subject && section && session) {
        fetch(`/students?subject=${encodeURIComponent(subject)}&section=${encodeURIComponent(section)}&session=${encodeURIComponent(session)}&fiscalYear=${encodeURIComponent(fiscalYear)}`)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(error => { throw new Error(error.error); });
                }
                return response.json();
            })
            .then(data => {
                const studentListBody = document.getElementById('student-list-body');
                studentListBody.innerHTML = '';  // Clear current student list

                data.forEach(student => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${student.student_number}</td>
                        <td>${student.student_name}</td>
                        <td>${student.attendance_date}</td>
                        <td>${student.time_in === 'N/A' ? 'N/A' : student.time_in}</td>
                        <td>${student.time_out === 'N/A' ? 'N/A' : student.time_out}</td>
                        <td>${student.barcode}</td>
                    `;
                    studentListBody.appendChild(row);
                });
            })
            .catch(error => {
                console.error('Error loading students:', error);
                alert('Failed to load student data: ' + error.message);  // Alert user with error message
            });
    }
}
