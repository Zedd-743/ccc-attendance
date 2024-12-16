// Get references to the elements from the HTML
const toggleButton = document.getElementById('toggleLoginMethod');
const manualLoginDiv = document.getElementById('manualLogin');
const barcodeLoginDiv = document.getElementById('barcodeLogin');
const startScannerButton = document.getElementById('startScanner');
const stopScannerButton = document.getElementById('stopScanner');
const videoElement = document.getElementById('camera'); // Directly reference the video element in HTML
const barcodeInput = document.getElementById('barcodeInput');
const manualCodeInput = document.getElementById('manualCodeInput');

// Variables for the barcode scanner and media stream

let mediaStream = null; // To track the media stream

// Create a canvas element to pass to WebCodeCamJS
const canvasElement = document.createElement('canvas');
canvasElement.style.display = 'none'; // Hide canvas element from the user
document.body.appendChild(canvasElement); // Add the canvas to the document

// Toggle between manual login and barcode scanner login
toggleButton.addEventListener('click', () => {
    if (manualLoginDiv.style.display === 'block') {
        // Switch to barcode login view
        manualLoginDiv.style.display = 'none';
        barcodeLoginDiv.style.display = 'block';
        toggleButton.textContent = 'Switch to Manual Login';
        stopCamera(); // Ensure the camera stops when switching to manual login
    } else {
        // Switch to manual login view
        manualLoginDiv.style.display = 'block';
        barcodeLoginDiv.style.display = 'none';
        toggleButton.textContent = 'Switch to Barcode Login';
    }
});
function submitBarcode(barcode) {
    fetch('/barcode-login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ barcode: barcode })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // No success message, just redirect
            if (data.redirectTo) {
                window.location.href = data.redirectTo; // Redirect to the professor's dashboard
            }
        } else {
            // Show the error message for unsuccessful login
            alert(data.message); // Display the error message
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred. Please try again.');
    });
}

// Debounce timeout to wait for the full barcode scan
let barcodeTimeout;
document.getElementById('startScanBtn').addEventListener('click', function() {
    const barcodeInput = document.getElementById('barcodeInput');
    barcodeInput.disabled = false;
    barcodeInput.value = "";  // Clear any existing text, such as "Scanning..."
    barcodeInput.focus();  // Focus on the input field

    barcodeInput.addEventListener('input', function() {
        const barcode = barcodeInput.value.trim();
        const hiddenBarcode = document.getElementById('hiddenBarcode');

        console.log("Current Barcode:", barcode);

        clearTimeout(barcodeTimeout);

        if (barcode.length > 0) {
            hiddenBarcode.value = barcode;

            barcodeTimeout = setTimeout(function() {
                submitBarcode(barcode); // Call the function to submit the barcode
                barcodeInput.disabled = true; // Optionally disable the input field after submitting
            }, 500); // Delay to wait for full barcode input
        }
    });
});


// Event listener to start the scanner when the button is clicked
startScannerButton.addEventListener('click', () => {
    startScannerButton.style.display = 'none';
    stopScannerButton.style.display = 'block';

    console.log("Requesting camera permission...");

    // Request camera permission
    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            console.log("Camera permission granted");

            // Store the media stream so we can stop it later
            mediaStream = stream;

            // Attach the stream to the video element
            videoElement.srcObject = stream;

            // Initialize WebCodeCamJS with the canvas
            scanner = new WebCodeCamJS(canvasElement)
            .init({
                success: (decodedText) => {
                    console.log('Found Barcode (success):', decodedText);

                    // If a valid barcode is found, submit it for validation
                    if (decodedText && decodedText.length > 0) {
                        barcodeInput.value = decodedText; // Fill the barcode input field
                        submitBarcodeForValidation(decodedText); // Automatically validate the barcode
                    } else {
                        console.warn('No barcode detected. Please try again.');
                    }
                    
                    stopCamera(); // Stop scanning after a successful read
                },
                scanningMode: 'active',
                resultFunction: (result) => {
                    console.log('Found Barcode (resultFunction):', result);

                    // If a valid barcode is detected, submit it for validation
                    if (result.code && result.code.length > 0) {
                        barcodeInput.value = result.code; // Fill the barcode input field
                        submitBarcodeForValidation(result.code); // Automatically validate the barcode
                    } else {
                        console.warn('No barcode detected. Please try again.');
                    }
                    
                    stopCamera(); // Stop scanning after a successful read
                },
                zoom: 0.1, // Zoom level for the camera
                scanPeriod: 5, // Time in milliseconds between scans
                beep: true, // Enable beep sound on successful scan
                barrierDetection: true, // Enable barrier detection (for multiple barcodes)
                canvasElement: canvasElement, // Pass the canvas to the scanner
                decoderWorker: 'node_modules/webcodecamjs/js/DecoderWorker.js' // Path to the decoder worker
            });

            console.log('WebCodeCamJS initialized with decoderWorker:', 'node_modules/webcodecamjs/js/DecoderWorker.js');

            // Start the scanner after a short delay
            setTimeout(() => {
                try {
                    scanner.play();
                } catch (e) {
                    console.error('Error starting play():', e);
                    alert('Failed to initialize the camera.');
                    stopScannerButton.style.display = 'none';
                    startScannerButton.style.display = 'block';
                }
            }, 500); // Delay to allow camera setup
        })
        .catch((error) => {
            console.error("Camera access denied:", error);
            alert('Camera access is required. Please allow camera permissions to continue.');
            startScannerButton.style.display = 'block';
            stopScannerButton.style.display = 'none';
        });
});

// Event listener to stop the scanner when the button is clicked
stopScannerButton.addEventListener('click', () => {
    console.log("Stop Scanner button clicked");
    stopCamera(); // Call the stopCamera function
    startScannerButton.style.display = 'block'; // Show start scanner button
    stopScannerButton.style.display = 'none'; // Hide stop scanner button
});

// Function to stop the camera and scanner
function stopCamera() {
    console.log("Stop camera function triggered");

    // Stop the scanner if it exists
    if (scanner) {
        try {
            scanner.stop();
            console.log("Scanner stopped");
        } catch (e) {
            console.error("Error stopping the scanner:", e);
        }
    }

    // Stop all media tracks
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => {
            track.stop(); // Stop each track
            console.log("Stopped media track");
        });
        mediaStream = null; // Clear media stream reference
    }

    // Clear the video source
    videoElement.srcObject = null;

    console.log("Camera stopped and scanner cleared.");
}

// Manual login function for manual code input
function manualLogin() {
    const code = manualCodeInput.value.trim();
    if (code) {
        fetch('/manual-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code: code })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = "/dashboard"; // Redirect on successful login
            } else {
                alert("Invalid manual code. Please try again.");
            }
        })
        .catch(error => console.error("Error:", error));
    }
}

// Cleanup resources when the page is unloaded
window.addEventListener('beforeunload', stopCamera);
