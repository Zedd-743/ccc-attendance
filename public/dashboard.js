const calendar = document.getElementById("calendar");
const fiscalYearDropdown = document.getElementById("fiscalYear");
const semesterDropdown = document.getElementById("semester");  // Add a new dropdown for semesters

// Initialize the current month and year
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

function populateFiscalYearDropdown(fiscalYears) {
  // Add a default empty option
  const defaultOption = document.createElement("option");
  defaultOption.value = ""; // Empty value
  defaultOption.innerText = "Select a Fiscal Year";
  defaultOption.selected = true; // Set as default selected
  fiscalYearDropdown.appendChild(defaultOption);

  // Populate the dropdown with available fiscal years
  fiscalYears.forEach(year => {
    const option = document.createElement("option");
    option.value = year.year_start; // Use the fiscal year start as the value
    option.innerText = year.year_name; // Display "2024-2025" format
    fiscalYearDropdown.appendChild(option);
  });
}

// Populate semester dropdown with semester name and start date
function populateSemesterDropdown(semesters) {
  semesterDropdown.innerHTML = ""; // Clear existing options

  const defaultOption = document.createElement("option");
  defaultOption.value = ""; // Empty value
  defaultOption.innerText = "Select a Semester";
  defaultOption.selected = true; // Set as default selected
  semesterDropdown.appendChild(defaultOption);

  semesters.forEach(semester => {
    const option = document.createElement("option");
    option.value = semester.id; // Use the semester ID
  
    // Log raw date received from the backend
    console.log("Raw start_date from backend:", semester.start_date);
  
    // Parse and format the start_date properly
    let formattedDate;
    try {
      const parsedDate = new Date(semester.start_date); // Parse the date
      console.log("Parsed date object:", parsedDate); // Log the parsed date object
  
      if (!isNaN(parsedDate)) {
        formattedDate = parsedDate.toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric', year: 'numeric' 
        }); // Convert to user-friendly format (e.g., Jan 1, 2024)
      } else {
        console.warn("Invalid Date for semester:", semester);
        formattedDate = "Invalid Date"; // Fallback if parsing fails
      }
    } catch (e) {
      console.error("Error parsing date:", semester.start_date, e);
      formattedDate = "Invalid Date"; // Fallback if parsing fails
    }
  
    // Display semester name and formatted start date
    option.innerText = `${semester.semester_name} - ${formattedDate}`;
    semesterDropdown.appendChild(option);
  });
  
}

// Function to generate the calendar and handle date click events
function generateCalendar(month, year) {
  calendar.innerHTML = "";
  
  const header = document.createElement("div");
  header.className = "header";
  
  const prevButton = document.createElement("button");
  prevButton.innerText = "<";
  prevButton.onclick = () => changeMonth(-1);
  
  const nextButton = document.createElement("button");
  nextButton.innerText = ">";
  nextButton.onclick = () => changeMonth(1);
  
  const title = document.createElement("span");
  title.innerText = `${new Date(year, month).toLocaleString("default", { month: "long" })} ${year}`;
  
  header.appendChild(prevButton);
  header.appendChild(title);
  header.appendChild(nextButton);
  
  const daysContainer = document.createElement("div");
  daysContainer.className = "days";
  
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  daysOfWeek.forEach((day) => {
    const dayElement = document.createElement("div");
    dayElement.style.fontWeight = "bold";
    dayElement.innerText = day;
    daysContainer.appendChild(dayElement);
  });
  
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  
  // Empty spaces before the start of the month
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    daysContainer.appendChild(empty);
  }
  
  // Days of the month
  for (let date = 1; date <= lastDate; date++) {
    const dateElement = document.createElement("div");
    dateElement.innerText = date;
    dateElement.onclick = () => {
      // Redirect to the schedule page with the clicked date as a query parameter
      window.location.href = `/schedule?date=${year}-${month + 1}-${date}`;
    };
    daysContainer.appendChild(dateElement);
  }
  
  calendar.appendChild(header);
  calendar.appendChild(daysContainer);
}

// Fetch semesters for the selected fiscal year
async function fetchSemesters(fiscalYearId) {
  try {
    const response = await fetch(`/api/semesters?fiscalYearId=${fiscalYearId}`);
    const data = await response.json();

    console.log("Fetched semesters response:", data); // Log the raw response

    if (data.success) {
      populateSemesterDropdown(data.semesters);
    } else {
      console.error("Failed to fetch semesters:", data.message);
    }
  } catch (error) {
    console.error("Error fetching semesters:", error);
  }
}

// Change the month and update the calendar
function changeMonth(offset) {
  currentMonth += offset;

  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  } else if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }

  generateCalendar(currentMonth, currentYear);
}

fiscalYearDropdown.addEventListener("change", (e) => {
  const fiscalYearId = e.target.value;

  if (fiscalYearId === "") {
    // Clear the calendar and semester dropdown if no fiscal year is selected
    calendar.innerHTML = "";
    semesterDropdown.innerHTML = '<option value="">Select a Semester</option>'; // Reset semesters

    // Clear the fiscal year in the session
    fetch(`/api/set-fiscal-year?fiscalYear=`, { method: 'GET' })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log("Fiscal year cleared.");
        } else {
          console.error("Failed to clear fiscal year.");
        }
      })
      .catch((error) => console.error("Error clearing fiscal year:", error));

    return; // Stop further processing
  }

  // If a fiscal year is selected, update the calendar and fetch semesters
  currentYear = parseInt(fiscalYearId);
  currentMonth = 0; // Reset to January for the new fiscal year

  fetch(`/api/set-fiscal-year?fiscalYear=${fiscalYearId}`, { method: 'GET' })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        generateCalendar(currentMonth, currentYear);
        fetchSemesters(fiscalYearId); // Fetch semesters for the updated fiscal year
      } else {
        console.error("Failed to set fiscal year.");
      }
    })
    .catch((error) => console.error("Error setting fiscal year:", error));
});


async function fetchFiscalYears() {
  try {
    const response = await fetch('/api/fiscal-years');
    const data = await response.json();

    if (data.success) {
      populateFiscalYearDropdown(data.fiscalYears);

      // Set the dropdown to the session's fiscal year if it exists
      const selectedFiscalYear = data.selectedFiscalYear || "";
      fiscalYearDropdown.value = selectedFiscalYear;
      
      if (selectedFiscalYear) {
        fetchSemesters(selectedFiscalYear); // Load semesters if a fiscal year is pre-selected
        generateCalendar(currentMonth, parseInt(selectedFiscalYear));
      }
    } else {
      console.error("Failed to load fiscal years.");
    }
  } catch (error) {
    console.error("Error fetching fiscal years:", error);
  }
}




// Initialize the calendar and dropdown
fetchFiscalYears();
generateCalendar(currentMonth, currentYear);

// Save semester selection in session
function saveSemester(semesterId) {
  fetch('/setSemester', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ semesterId }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        console.log("Semester saved:", semesterId);
      } else {
        console.error("Error saving semester:", data.message);
      }
    })
    .catch((err) => console.error("Error:", err));
}

// Attach event listener to semester dropdown
document.getElementById('semester').addEventListener('change', (event) => {
  const selectedSemester = event.target.value;
  saveSemester(selectedSemester);
});