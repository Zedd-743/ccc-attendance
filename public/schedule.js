async function fetchSubjects() {
    console.log("Fetching subjects...");

    // Make a fetch request to the backend to get subjects based on session data
    const response = await fetch('/api/manage-subject');
    const data = await response.json();

    if (data.success) {
        console.log("Fetched subjects:", data.subjects);
        displaySubjects(data.subjects); // Display subjects
    } else {
        console.error("Error:", data.message);
    }
}

async function fetchSections() {
    console.log("Fetching sections...");

    // Make a fetch request to the backend to get sections based on session data
    const response = await fetch('/api/manage-section');
    const data = await response.json();

    if (data.success) {
        console.log("Fetched sections:", data.sections);
        displaySections(data.sections); // Display sections
    } else {
        console.error("Error:", data.message);
    }
}

// Function to handle adding a new subject
async function addSubject() {
    const inputField = document.querySelector("#newEntryInput");
    const newSubject = inputField.value.trim();
    
    if (newSubject) {
        console.log("Adding new subject:", newSubject);

        try {
            // Send POST request to add the new subject
            const response = await fetch('/api/manage-subject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newSubject })
            });
            const data = await response.json();

            if (data.success) {
                inputField.value = ''; // Clear input field
                fetchSubjects(); // Refresh the subject list
            } else {
                console.error("Error adding subject:", data.message);
            }
        } catch (error) {
            console.error("Error adding subject:", error);
        }
    }
}

// Function to handle adding a new section
async function addSection() {
    const inputField = document.querySelector("#newEntryInput");
    const newSection = inputField.value.trim();

    if (newSection) {
        console.log("Adding new section:", newSection);

        try {
            // Send POST request to add the new section
            const response = await fetch('/api/manage-section', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newSection })
            });
            const data = await response.json();

            if (data.success) {
                inputField.value = ''; // Clear input field
                fetchSections(); // Refresh the section list
            } else {
                console.error("Error adding section:", data.message);
            }
        } catch (error) {
            console.error("Error adding section:", error);
        }
    }
}

function displaySubjects(subjects) {
    const tableBody = document.querySelector("#manageTable-manager tbody");
    tableBody.innerHTML = ''; // Clear the table

    if (subjects && subjects.length > 0) {
        subjects.forEach(subject => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = subject.subject_name;
            const actionCell = document.createElement('td');
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', async function () {
                try {
                    // Delete the subject from the backend
                    await fetch(`/api/manage-subject/${subject.subject_id}`, { method: 'DELETE' });
                    fetchSubjects(); // Refresh the subject list
                } catch (error) {
                    console.error("Error deleting subject:", error);
                }
            });
            actionCell.appendChild(deleteButton);
            row.appendChild(nameCell);
            row.appendChild(actionCell);
            tableBody.appendChild(row);
        });
    }

    // Input row for adding new subject
    const inputRow = document.createElement('tr');
    const nameInputCell = document.createElement('td');
    const actionInputCell = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.setAttribute('placeholder', 'Enter Subject Name');
    const addButton = document.createElement('button');
    addButton.textContent = 'Add';
    addButton.addEventListener('click', async function () {
        const newSubject = nameInput.value.trim();
        if (newSubject) {
            try {
                await fetch('/api/manage-subject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newSubject })
                });
                nameInput.value = ''; // Clear the input field after adding
                fetchSubjects(); // Refresh the subject list
            } catch (error) {
                console.error("Error adding subject:", error);
            }
        }
    });

    nameInputCell.appendChild(nameInput);
    actionInputCell.appendChild(addButton);
    inputRow.appendChild(nameInputCell);
    inputRow.appendChild(actionInputCell);
    tableBody.appendChild(inputRow);
}

function displaySections(sections) {
    const tableBody = document.querySelector("#manageTable-manager tbody");
    tableBody.innerHTML = ''; // Clear the table

    if (sections && sections.length > 0) {
        sections.forEach(section => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = section.section_name;
            const actionCell = document.createElement('td');
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', async function () {
                try {
                    // Delete the section from the backend
                    await fetch(`/api/manage-section/${section.section_id}`, { method: 'DELETE' });
                    fetchSections(); // Refresh the section list
                } catch (error) {
                    console.error("Error deleting section:", error);
                }
            });
            actionCell.appendChild(deleteButton);
            row.appendChild(nameCell);
            row.appendChild(actionCell);
            tableBody.appendChild(row);
        });
    }

    // Input row for adding new section
    const inputRow = document.createElement('tr');
    const nameInputCell = document.createElement('td');
    const actionInputCell = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.setAttribute('placeholder', 'Enter Section Name');
    const addButton = document.createElement('button');
    addButton.textContent = 'Add';
    addButton.addEventListener('click', async function () {
        const newSection = nameInput.value.trim();
        if (newSection) {
            try {
                await fetch('/api/manage-section', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newSection })
                });
                nameInput.value = ''; // Clear the input field after adding
                fetchSections(); // Refresh the section list
            } catch (error) {
                console.error("Error adding section:", error);
            }
        }
    });

    nameInputCell.appendChild(nameInput);
    actionInputCell.appendChild(addButton);
    inputRow.appendChild(nameInputCell);
    inputRow.appendChild(actionInputCell);
    tableBody.appendChild(inputRow);
}



// Manage Subject button click handler
document.querySelector("#manageSubjectButton").addEventListener("click", function () {
    console.log("Manage Subject clicked");
    fetchSubjects();
    const manageTable = document.querySelector("#manageTable-manager");
    if (manageTable) {
        manageTable.style.display = 'table';
    } else {
        console.error("Error: manageTable-manager not found.");
    }
});

// Manage Section button click handler
document.querySelector("#manageSectionButton").addEventListener("click", function () {
    console.log("Manage Section clicked");
    fetchSections();
    const manageTable = document.querySelector("#manageTable-manager");
    if (manageTable) {
        manageTable.style.display = 'table';
    } else {
        console.error("Error: manageTable-manager not found.");
    }
});
// Function to convert 24-hour time format to 12-hour format with AM/PM
function convertTo12HourFormat(time) {
    const [hour, minute] = time.split(':');
    let period = 'AM';
    let newHour = parseInt(hour, 10);

    if (newHour >= 12) {
        period = 'PM';
        if (newHour > 12) {
            newHour -= 12;
        }
    } else if (newHour === 0) {
        newHour = 12;
    }

    return `${newHour.toString().padStart(2, '0')}:${minute} ${period}`;
}

/// When a time slot is clicked, open the modal and populate time inputs
document.querySelectorAll('.editable-time').forEach(cell => {
    cell.addEventListener('click', function() {
        const currentTime = this.innerText.trim();
        
        // Split the current time into start and end times
        const timeParts = currentTime.split(' - ');
        const startTime = timeParts[0];
        const endTime = timeParts[1];

        // Set the start and end times in the input fields (24-hour format)
        document.getElementById('startTime').value = convertTo24HourFormat(startTime); 
        document.getElementById('endTime').value = convertTo24HourFormat(endTime);

        // Show the modal
        document.getElementById('timeModal').style.display = 'block';

        // Save button functionality
        document.getElementById('saveTimeButton').onclick = () => saveTimeSlot(this);
    });
});

// Convert 12-hour time format (e.g., 01:00 PM) to 24-hour format (e.g., 13:00)
function convertTo24HourFormat(time12hr) {
    const [time, period] = time12hr.split(' ');
    let [hour, minute] = time.split(':');
    hour = parseInt(hour, 10);
    
    if (period === 'PM' && hour !== 12) {
        hour += 12;
    } else if (period === 'AM' && hour === 12) {
        hour = 0;
    }

    return `${hour.toString().padStart(2, '0')}:${minute}`;
}

function saveTimeSlot(cell) {
    const startTime24 = document.getElementById('startTime').value;
    const endTime24 = document.getElementById('endTime').value;

    // Convert both start and end times to 12-hour format
    const formattedStartTime = convertTo12HourFormat(startTime24); 
    const formattedEndTime = convertTo12HourFormat(endTime24);

    // Set the new time slot in the table (example: "09:00 AM - 10:00 AM")
    const newTimeSlot = `${formattedStartTime} - ${formattedEndTime}`;
    cell.innerText = newTimeSlot;

    // Validate that the start time is earlier than the end time
    const startTimeDate = new Date(`1970-01-01T${startTime24}:00Z`);
    const endTimeDate = new Date(`1970-01-01T${endTime24}:00Z`);

    if (startTimeDate >= endTimeDate) {
        alert('Start time must be earlier than End time.');
        return;
    }

    // Log the data being sent
    console.log('Sending request to insert new time slot:', {
        startTime: startTime24,
        endTime: endTime24
    });

    // Send the new time slot to the backend to insert it into the database
    fetch('/insert-time-slot', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            startTime: startTime24,
            endTime: endTime24
        })
    })
    .then(response => {
        console.log('Response status:', response.status); // Log the response status
        return response.json(); // Parse the response as JSON
    })
    .then(data => {
        console.log('Received response data:', data); // Log the response data
        if (data.message) {
            alert(data.message); // Alert success message
        } else if (data.error) {
            alert(data.error); // Alert error message
        } else {
            alert('Error inserting time slot.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error inserting time slot.');
    });

    // Close the modal after saving
    document.getElementById('timeModal').style.display = 'none';
}
