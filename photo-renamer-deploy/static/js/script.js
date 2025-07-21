// Photo Renamer JavaScript functionality

document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const submitBtn = document.getElementById('submitBtn');
    const addGroupBtn = document.getElementById('addGroupBtn');
    const photoGroups = document.getElementById('photoGroups');
    const totalBatchSizeEl = document.getElementById('totalBatchSize');
    const batchSizeProgress = document.getElementById('batchSizeProgress');
    const progressContainer = document.getElementById('progressContainer');
    const processProgress = document.getElementById('processProgress');
    const progressText = document.getElementById('progressText');
    const progressCounter = document.getElementById('progressCounter');
    
    let groupCounter = 0;
    const MAX_BATCH_SIZE = 2 * 1024 * 1024 * 1024; // 2GB in bytes

    // Add group button handler
    if (addGroupBtn) {
        addGroupBtn.addEventListener('click', function() {
            addPhotoGroup();
        });
    }

    // Form submission handler
    if (uploadForm) {
        uploadForm.addEventListener('submit', function(e) {
            if (!validateForm()) {
                e.preventDefault();
                return false;
            }
            
            showProgressIndicator();
            
            // Reset button state after a delay to handle download completion
            setTimeout(() => {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i data-feather="download" class="me-2"></i>Process & Download';
                    if (progressContainer) {
                        progressContainer.style.display = 'none';
                    }
                    if (typeof feather !== 'undefined') {
                        feather.replace();
                    }
                }
            }, 3000); // Reset after 3 seconds
            
            // Don't prevent default - let form submit normally
        });
    }

    // Initialize existing group handlers
    initializeGroupHandlers();
    
    // Initialize batch size monitoring
    updateBatchSizeDisplay();

    function addPhotoGroup() {
        groupCounter++;
        const groupDiv = document.createElement('div');
        groupDiv.className = 'photo-group card mb-3';
        groupDiv.setAttribute('data-group', groupCounter);
        
        // Create the HTML content safely
        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header d-flex justify-content-between align-items-center';
        cardHeader.innerHTML = '<h6 class="mb-0"><i data-feather="folder" class="me-2"></i>Photo Group ' + (groupCounter + 1) + '</h6><button type="button" class="btn btn-sm btn-outline-danger remove-group"><i data-feather="trash-2" class="me-1"></i>Remove</button>';
        
        const cardBody = document.createElement('div');
        cardBody.className = 'card-body';
        
        const locationDiv = document.createElement('div');
        locationDiv.className = 'mb-3';
        locationDiv.innerHTML = '<label class="form-label"><i data-feather="map-pin" class="me-1"></i>Location Name</label><input type="text" class="form-control location-input" name="locations[]" placeholder="e.g., Site A, Vacation 2024, Wedding Photos" required pattern="[a-zA-Z0-9_\\s-]+" title="Letters, numbers, spaces, hyphens, and underscores are allowed"><div class="form-text">This will be used in the renamed filename. Letters, numbers, spaces, hyphens, and underscores are allowed.</div>';
        
        const photosDiv = document.createElement('div');
        photosDiv.className = 'mb-3';
        photosDiv.innerHTML = '<label class="form-label"><i data-feather="image" class="me-1"></i>Select Photos for this Location</label><input type="file" class="form-control photos-input" name="photos_' + groupCounter + '" multiple accept=".jpg,.jpeg,.png,.gif,.bmp,.tiff,.webp" required><div class="form-text">Select multiple photos for this location (JPEG, PNG, GIF, BMP, TIFF, WebP). Maximum file size: 16MB per file.</div>';
        
        const previewDiv = document.createElement('div');
        previewDiv.className = 'file-preview';
        previewDiv.style.display = 'none';
        previewDiv.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h6 class="mb-0">Selected Files:</h6><button type="button" class="btn btn-sm btn-outline-primary add-more-photos"><i data-feather="plus" class="me-1"></i>Add More Photos</button></div><div class="file-list"></div>';
        
        cardBody.appendChild(locationDiv);
        cardBody.appendChild(photosDiv);
        cardBody.appendChild(previewDiv);
        
        groupDiv.appendChild(cardHeader);
        groupDiv.appendChild(cardBody);
        
        photoGroups.appendChild(groupDiv);
        
        // Show remove buttons for all groups if we have more than one
        updateRemoveButtons();
        
        // Initialize handlers for the new group
        initializeGroupHandlers();
        
        // Initialize drag and drop for new group
        initializeDragDrop();
        
        // Re-initialize feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    function updateRemoveButtons() {
        const groups = document.querySelectorAll('.photo-group');
        groups.forEach(group => {
            const removeBtn = group.querySelector('.remove-group');
            if (groups.length > 1) {
                removeBtn.style.display = 'inline-block';
            } else {
                removeBtn.style.display = 'none';
            }
        });
    }

    function initializeGroupHandlers() {
        // Location input validation
        document.querySelectorAll('.location-input').forEach(input => {
            input.removeEventListener('input', handleLocationInput);
            input.addEventListener('input', handleLocationInput);
        });

        // File input change handlers
        document.querySelectorAll('.photos-input').forEach(input => {
            input.removeEventListener('change', handleFileChange);
            input.addEventListener('change', handleFileChange);
        });

        // Remove group handlers
        document.querySelectorAll('.remove-group').forEach(btn => {
            btn.removeEventListener('click', handleRemoveGroup);
            btn.addEventListener('click', handleRemoveGroup);
        });

        // Add more photos handlers
        document.querySelectorAll('.add-more-photos').forEach(btn => {
            btn.removeEventListener('click', handleAddMorePhotos);
            btn.addEventListener('click', handleAddMorePhotos);
        });
    }

    function handleLocationInput(e) {
        const value = e.target.value;
        const sanitized = value.replace(/[^a-zA-Z0-9_\s-]/g, '');
        if (value !== sanitized) {
            e.target.value = sanitized;
        }
    }

    function handleFileChange(e) {
        const files = Array.from(e.target.files);
        const group = e.target.closest('.photo-group');
        const filePreview = group.querySelector('.file-preview');
        const fileList = group.querySelector('.file-list');
        
        displayFilePreview(files, filePreview, fileList);
        updateBatchSizeDisplay();
    }

    function handleRemoveGroup(e) {
        const group = e.target.closest('.photo-group');
        group.remove();
        updateRemoveButtons();
        updateBatchSizeDisplay();
    }

    function handleAddMorePhotos(e) {
        const group = e.target.closest('.photo-group');
        const fileInput = group.querySelector('.photos-input');
        fileInput.click();
    }

    function updateBatchSizeDisplay() {
        let totalSize = 0;
        
        document.querySelectorAll('.photos-input').forEach(input => {
            if (input.files) {
                Array.from(input.files).forEach(file => {
                    totalSize += file.size;
                });
            }
        });

        const totalSizeMB = totalSize / (1024 * 1024);
        const maxSizeMB = MAX_BATCH_SIZE / (1024 * 1024);
        
        if (totalBatchSizeEl) {
            totalBatchSizeEl.textContent = totalSizeMB.toFixed(1) + ' MB';
        }
        
        if (batchSizeProgress) {
            const percentage = (totalSize / MAX_BATCH_SIZE) * 100;
            batchSizeProgress.style.width = percentage + '%';
        }
    }

    function showProgressIndicator() {
        if (progressContainer) {
            progressContainer.style.display = 'block';
        }
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
        }
        
        // Scroll to progress indicator
        progressContainer.scrollIntoView({ behavior: 'smooth' });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function displayFilePreview(files, previewElement, listElement) {
        if (files.length === 0) {
            previewElement.style.display = 'none';
            return;
        }

        listElement.innerHTML = '';
        
        files.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item d-flex justify-content-between align-items-center p-2 border rounded mb-1';
            
            const fileName = document.createElement('span');
            fileName.textContent = file.name;
            fileName.className = 'file-name';
            
            const fileSize = document.createElement('small');
            fileSize.textContent = formatFileSize(file.size);
            fileSize.className = 'text-muted';
            
            fileItem.appendChild(fileName);
            fileItem.appendChild(fileSize);
            listElement.appendChild(fileItem);
        });

        previewElement.style.display = 'block';
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function validateForm() {
        // Check if at least one location has files
        const groups = document.querySelectorAll('.photo-group');
        let hasFiles = false;
        
        groups.forEach(group => {
            const locationInput = group.querySelector('.location-input');
            const fileInput = group.querySelector('.photos-input');
            
            if (locationInput.value.trim() && fileInput.files && fileInput.files.length > 0) {
                hasFiles = true;
            }
        });
        
        if (!hasFiles) {
            showAlert('Please add at least one location with photos.', 'danger');
            return false;
        }
        
        return true;
    }

    function showAlert(message, type) {
        const alertContainer = document.querySelector('.container') || document.body;
        const existingAlerts = alertContainer.querySelectorAll('.alert');
        
        // Remove existing alerts
        existingAlerts.forEach(alert => alert.remove());
        
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-' + type + ' alert-dismissible fade show';
        alertDiv.role = 'alert';
        
        const iconName = type === 'danger' ? 'alert-circle' : 
                        type === 'warning' ? 'alert-triangle' : 'check-circle';
        
        alertDiv.innerHTML = '<i data-feather="' + escapeHtml(iconName) + '" class="me-2"></i>' + escapeHtml(message) + '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>';
        
        alertContainer.insertBefore(alertDiv, alertContainer.firstChild);
        
        // Re-initialize feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
        
        // Auto-dismiss after 5 seconds for non-error alerts
        if (type !== 'danger') {
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.remove();
                }
            }, 5000);
        }
    }

    function initializeDragDrop() {
        // Placeholder for drag and drop functionality
    }
    
    // Mode switching functionality
    const manualMode = document.getElementById('manualMode');
    const batchMode = document.getElementById('batchMode');
    const manualUploadCard = document.getElementById('manualUploadCard');
    const batchUploadCard = document.getElementById('batchUploadCard');
    const batchDropZone = document.getElementById('batchDropZone');
    const batchFolderInput = document.getElementById('batchFolderInput');
    const batchPreview = document.getElementById('batchPreview');
    const batchLocationsList = document.getElementById('batchLocationsList');
    
    let batchFolderData = {};
    
    // Mode switching handlers
    if (manualMode && batchMode) {
        manualMode.addEventListener('change', function() {
            if (this.checked) {
                manualUploadCard.style.display = 'block';
                batchUploadCard.style.display = 'none';
            }
        });
        
        batchMode.addEventListener('change', function() {
            if (this.checked) {
                manualUploadCard.style.display = 'none';
                batchUploadCard.style.display = 'block';
            }
        });
    }
    
    // Batch folder upload functionality
    if (batchDropZone && batchFolderInput) {
        // Drag and drop for batch folder
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            batchDropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            batchDropZone.addEventListener(eventName, () => {
                batchDropZone.classList.add('drag-over');
            }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            batchDropZone.addEventListener(eventName, () => {
                batchDropZone.classList.remove('drag-over');
            }, false);
        });
        
        batchDropZone.addEventListener('drop', handleBatchDrop, false);
        batchFolderInput.addEventListener('change', handleBatchFileSelect, false);
        
        async function handleBatchDrop(e) {
            const items = e.dataTransfer.items;
            await processBatchItems(items);
        }
        
        async function handleBatchFileSelect(e) {
            const files = e.target.files;
            await processBatchFiles(files);
        }
        
        async function processBatchItems(items) {
            batchFolderData = {};
            
            for (let item of items) {
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                    if (entry && entry.isDirectory) {
                        await processBatchDirectoryEntry(entry, '');
                    }
                }
            }
            
            displayBatchPreview();
        }
        
        async function processBatchFiles(files) {
            batchFolderData = {};
            
            for (let file of files) {
                if (file.type.startsWith('image/')) {
                    const pathParts = file.webkitRelativePath.split('/');
                    if (pathParts.length > 1) {
                        // Remove the root folder name and get the immediate subfolder
                        const location = pathParts[1] || 'Root';
                        
                        if (!batchFolderData[location]) {
                            batchFolderData[location] = [];
                        }
                        batchFolderData[location].push(file);
                    }
                }
            }
            
            displayBatchPreview();
        }
        
        async function processBatchDirectoryEntry(directoryEntry, parentPath) {
            return new Promise((resolve) => {
                const reader = directoryEntry.createReader();
                reader.readEntries(async (entries) => {
                    for (let entry of entries) {
                        if (entry.isFile) {
                            await processBatchFileEntry(entry, parentPath);
                        } else if (entry.isDirectory) {
                            const newPath = parentPath ? parentPath + '/' + entry.name : entry.name;
                            await processBatchDirectoryEntry(entry, newPath);
                        }
                    }
                    resolve();
                });
            });
        }
        
        async function processBatchFileEntry(fileEntry, parentPath) {
            return new Promise((resolve) => {
                fileEntry.file((file) => {
                    if (file.type.startsWith('image/')) {
                        const location = parentPath || 'Root';
                        
                        if (!batchFolderData[location]) {
                            batchFolderData[location] = [];
                        }
                        batchFolderData[location].push(file);
                    }
                    resolve();
                });
            });
        }
        
        function displayBatchPreview() {
            batchLocationsList.innerHTML = '';
            
            if (Object.keys(batchFolderData).length === 0) {
                batchPreview.style.display = 'none';
                return;
            }
            
            batchPreview.style.display = 'block';
            
            for (const [location, files] of Object.entries(batchFolderData)) {
                const locationCard = document.createElement('div');
                locationCard.className = 'col-md-4 mb-3';
                locationCard.innerHTML = '<div class="card batch-location-card h-100"><div class="card-body"><h6 class="card-title"><i data-feather="map-pin" class="me-2"></i>' + escapeHtml(location) + '</h6><p class="card-text text-muted">' + files.length + ' photo' + (files.length !== 1 ? 's' : '') + '</p><small class="text-muted">Total size: ' + formatFileSize(files.reduce((total, file) => total + file.size, 0)) + '</small></div></div>';
                batchLocationsList.appendChild(locationCard);
            }
            
            // Re-initialize feather icons
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
            
            // Add submit button for batch processing
            addBatchSubmitButton();
        }
        
        function addBatchSubmitButton() {
            let existingBtn = document.getElementById('batchSubmitBtn');
            if (existingBtn) {
                existingBtn.remove();
            }
            
            const submitBtn = document.createElement('button');
            submitBtn.type = 'button';
            submitBtn.id = 'batchSubmitBtn';
            submitBtn.className = 'btn btn-success btn-lg mt-4 w-100';
            submitBtn.innerHTML = '<i data-feather="download" class="me-2"></i>Process All Locations';
            
            submitBtn.addEventListener('click', function(e) {
                e.preventDefault();
                submitBatchUpload();
            });
            
            batchPreview.appendChild(submitBtn);
            
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        }
        
        async function submitBatchUpload() {
            if (!batchFolderData || Object.keys(batchFolderData).length === 0) {
                alert('No folders detected. Please try again.');
                return;
            }
            
            // Calculate total size and files
            let totalSize = 0;
            let totalFiles = 0;
            for (const files of Object.values(batchFolderData)) {
                for (const file of files) {
                    totalSize += file.size;
                    totalFiles++;
                }
            }
            
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
            alert('Starting chunked upload for ' + totalFiles + ' photos (' + totalSizeMB + ' MB)...');
            
            try {
                // Process locations one at a time to avoid server limits
                const locationEntries = Object.entries(batchFolderData);
                let allZipBlobs = [];
                let processedLocations = 0;
                
                alert('Processing ' + locationEntries.length + ' locations one at a time to avoid server limits...');
                
                // First, collect and sort ALL photos across ALL locations chronologically
                let allPhotosWithMetadata = [];
                
                for (const [location, files] of locationEntries) {
                    for (const file of files) {
                        allPhotosWithMetadata.push({
                            file: file,
                            location: location,
                            // Use file modification time as proxy for date taken
                            dateTime: new Date(file.lastModified)
                        });
                    }
                }
                
                // Sort all photos chronologically across all locations
                allPhotosWithMetadata.sort((a, b) => a.dateTime - b.dateTime);
                
                // Create location counters for proper sequential numbering
                const locationCounters = {};
                allPhotosWithMetadata.forEach(photo => {
                    if (!locationCounters[photo.location]) {
                        locationCounters[photo.location] = 0;
                    }
                    locationCounters[photo.location]++;
                    photo.sequenceNumber = locationCounters[photo.location];
                });
                
                // Reset counters for actual processing
                Object.keys(locationCounters).forEach(loc => locationCounters[loc] = 0);
                
                // Now process each location maintaining the chronological sequence numbers
                for (const [location, files] of locationEntries) {
                    const locationPhotos = allPhotosWithMetadata.filter(p => p.location === location);
                    
                    // Split large locations into batches while preserving sequence numbers
                    const MAX_BATCH_SIZE = 20 * 1024 * 1024; // 20MB per batch to avoid server limits
                    const batches = [];
                    let currentBatch = [];
                    let currentBatchSize = 0;
                    
                    for (const photoData of locationPhotos) {
                        if (currentBatchSize + photoData.file.size > MAX_BATCH_SIZE && currentBatch.length > 0) {
                            batches.push(currentBatch);
                            currentBatch = [photoData];
                            currentBatchSize = photoData.file.size;
                        } else {
                            currentBatch.push(photoData);
                            currentBatchSize += photoData.file.size;
                        }
                    }
                    if (currentBatch.length > 0) {
                        batches.push(currentBatch);
                    }
                    
                    // Process each batch for this location
                    let locationBlobs = [];
                    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                        const batch = batches[batchIndex];
                        const batchSizeMB = (batch.reduce((sum, photoData) => sum + photoData.file.size, 0) / (1024 * 1024)).toFixed(1);
                        
                        // Create form for this batch
                        const formData = new FormData();
                        const batchLocation = batches.length > 1 ? location + '_batch' + (batchIndex + 1) : location;
                        formData.append('locations[]', batchLocation);
                        
                        // Add sequence number metadata for server-side processing
                        const sequenceNumbers = [];
                        batch.forEach(photoData => {
                            formData.append('photos_0', photoData.file);
                            sequenceNumbers.push(photoData.sequenceNumber);
                        });
                        
                        // Send sequence numbers so server can use them for naming
                        formData.append('sequence_numbers', JSON.stringify(sequenceNumbers));
                        
                        processedLocations++;
                        const batchInfo = batches.length > 1 ? ' (batch ' + (batchIndex + 1) + '/' + batches.length + ')' : '';
                        const locationNum = Math.ceil(processedLocations/batches.length);
                        alert('Processing location ' + locationNum + '/' + locationEntries.length + ': "' + location + '"' + batchInfo + ' (' + batch.length + ' photos, ' + batchSizeMB + ' MB)');
                        
                        try {
                            const response = await uploadChunk(formData);
                            if (response.success) {
                                locationBlobs.push({
                                    location: batchLocation,
                                    blob: response.data,
                                    originalLocation: location,
                                    batchIndex: batchIndex
                                });
                            } else {
                                alert('Failed to process ' + location + batchInfo);
                            }
                        } catch (locationError) {
                            alert('Error processing "' + location + '"' + batchInfo + ': ' + locationError.message);
                            continue;
                        }
                    }
                    
                    // Add all batches for this location
                    allZipBlobs.push(...locationBlobs);
                }
                
                // Download all processed locations
                if (allZipBlobs.length > 0) {
                    if (allZipBlobs.length === 1) {
                        // Single location - download directly
                        downloadBlob(allZipBlobs[0].blob, allZipBlobs[0].location + '_photos.zip');
                        alert('Photos processed successfully! Download started.');
                    } else {
                        // Multiple locations - download each separately
                        const totalSizeMB = (allZipBlobs.reduce((sum, obj) => sum + obj.blob.size, 0) / (1024 * 1024)).toFixed(1);
                        alert('Processing complete! Downloading ' + allZipBlobs.length + ' separate ZIP files (' + totalSizeMB + ' MB total)...');
                        allZipBlobs.forEach((obj, index) => {
                            setTimeout(() => {
                                downloadBlob(obj.blob, obj.location + '_photos.zip');
                            }, index * 1000); // Stagger downloads by 1 second
                        });
                    }
                } else {
                    alert('No locations were successfully processed.');
                }
                
            } catch (error) {
                console.error('Chunked upload error:', error);
                alert('Chunked upload failed: ' + error.message + '\n\nTry using Manual Upload mode with smaller batches (5-10 photos at a time) for better reliability.');
            }
        }
        
        function uploadChunk(formData) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/', true);
                xhr.responseType = 'blob';
                xhr.timeout = 300000; // 5 minute timeout per chunk
                
                xhr.onload = function() {
                    if (xhr.status === 200) {
                        resolve({ success: true, data: xhr.response });
                    } else {
                        reject(new Error('Server error: ' + xhr.status));
                    }
                };
                
                xhr.onerror = function() {
                    reject(new Error('Network error'));
                };
                
                xhr.ontimeout = function() {
                    reject(new Error('Upload timeout'));
                };
                
                xhr.send(formData);
            });
        }
        
        function downloadBlob(blob, filename) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    }
    
    // Initialize drag and drop for existing groups
    initializeDragDrop();
});

// Global error handling
window.addEventListener('error', function(e) {
    console.error('JavaScript error:', e.error);
});

// Handle back button after download
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        // Reset form if page is loaded from cache
        const form = document.getElementById('uploadForm');
        if (form) {
            form.reset();
            const filePreview = document.getElementById('filePreview');
            if (filePreview) {
                filePreview.style.display = 'none';
            }
        }
    }
});