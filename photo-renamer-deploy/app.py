import os
import io
import json
import zipfile
import logging
from datetime import datetime
from flask import Flask, request, send_file, render_template, flash, redirect, url_for, jsonify, session
from werkzeug.utils import secure_filename
from PIL import Image
from PIL.ExifTags import TAGS

# Configure logging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key-change-in-production")
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # 25MB Flask upload limit to match deployment

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB per file
MAX_TOTAL_BATCH_SIZE = 25 * 1024 * 1024  # 25MB total batch size

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Global progress tracking
progress_store = {}

def allowed_file(filename):
    """Check if the file extension is allowed."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_exif_date_taken(img):
    """Extract the date taken from EXIF data."""
    try:
        exif = img._getexif()
        if exif:
            for tag, value in exif.items():
                decoded = TAGS.get(tag, tag)
                if decoded == "DateTimeOriginal":
                    return datetime.strptime(value, '%Y:%m:%d %H:%M:%S')
                elif decoded == "DateTime":
                    return datetime.strptime(value, '%Y:%m:%d %H:%M:%S')
    except Exception as e:
        logging.debug(f"Error extracting EXIF date: {e}")
    return None

def handle_zip_combination(request):
    """Handle combining multiple ZIP files into one."""
    try:
        zip_files = []
        for key in request.files.keys():
            if key.startswith('zip_'):
                zip_file = request.files[key]
                if zip_file and zip_file.filename:
                    zip_files.append(zip_file)
        
        if not zip_files:
            return jsonify({'error': 'No ZIP files provided'}), 400
        
        # Create combined ZIP in memory
        combined_zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(combined_zip_buffer, 'w', zipfile.ZIP_DEFLATED) as combined_zip:
            for zip_file in zip_files:
                # Read the uploaded ZIP file
                zip_content = zip_file.read()
                zip_file.seek(0)  # Reset file pointer
                
                # Extract contents from each ZIP and add to combined ZIP
                with zipfile.ZipFile(io.BytesIO(zip_content), 'r') as source_zip:
                    for file_info in source_zip.infolist():
                        if not file_info.is_dir():
                            file_data = source_zip.read(file_info.filename)
                            combined_zip.writestr(file_info.filename, file_data)
        
        combined_zip_buffer.seek(0)
        
        return send_file(
            combined_zip_buffer,
            as_attachment=True,
            download_name='all_photos_combined.zip',
            mimetype='application/zip'
        )
        
    except Exception as e:
        logging.error(f"Error combining ZIP files: {e}")
        return jsonify({'error': 'Failed to combine ZIP files'}), 500

def process_image_file(file, location):
    """Process a single image file and return tuple of (file_path, date_taken, original_name)."""
    if not file or not file.filename:
        return None
    
    if not allowed_file(file.filename):
        logging.warning(f"File {file.filename} has invalid extension")
        return None
    
    filename = secure_filename(file.filename)
    if not filename:
        logging.warning(f"Invalid filename: {file.filename}")
        return None
    
    # Create unique filename to avoid conflicts
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_filename = f"{timestamp}_{filename}"
    img_path = os.path.join(UPLOAD_FOLDER, safe_filename)
    
    try:
        file.save(img_path)
        
        # Verify it's a valid image
        with Image.open(img_path) as img:
            img.verify()
        
        # Reopen for EXIF processing (verify() closes the file)
        with Image.open(img_path) as img:
            date_taken = get_exif_date_taken(img)
            if date_taken is None:
                # Use file modification time as fallback
                stat = os.stat(img_path)
                date_taken = datetime.fromtimestamp(stat.st_mtime)
        
        return (img_path, date_taken, filename)
    
    except Exception as e:
        logging.error(f"Error processing {filename}: {e}")
        # Clean up file if processing failed
        if os.path.exists(img_path):
            os.remove(img_path)
        return None

@app.route('/', methods=['GET', 'POST'])
def index():
    """Main route for photo upload and processing."""
    if request.method == 'POST':
        try:
            # Log request details for debugging
            content_length = request.content_length
            logging.info(f"Received POST request with content length: {content_length} bytes")
            
            if content_length and content_length > app.config['MAX_CONTENT_LENGTH']:
                logging.warning(f"Content length {content_length} exceeds limit {app.config['MAX_CONTENT_LENGTH']}")
                flash('Upload size too large. Please reduce the number of files.', 'error')
                return redirect(url_for('index'))
        except Exception as e:
            logging.error(f"Error checking request size: {e}")
            flash('Error processing upload. Please try again.', 'error')
            return redirect(url_for('index'))
        locations = request.form.getlist('locations[]')
        # Check if this is a request to combine existing ZIP files
        if 'combine_zips' in request.form:
            return handle_zip_combination(request)
            
        if not locations or all(not loc.strip() for loc in locations):
            flash('Please enter at least one location name.', 'error')
            return redirect(url_for('index'))
        
        all_processed_photos = []
        error_count = 0
        total_photos = 0
        total_batch_size = 0
        
        # Check if sequence numbers are provided (from batch upload)
        sequence_numbers = None
        if 'sequence_numbers' in request.form:
            try:
                sequence_numbers = json.loads(request.form['sequence_numbers'])
            except:
                sequence_numbers = None
        
        # Generate unique session ID for progress tracking
        session_id = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        progress_store[session_id] = {
            'current': 0,
            'total': 0,
            'status': 'starting',
            'message': 'Initializing...'
        }
        
        # Count total files first for progress tracking
        total_files_count = 0
        for group_idx, location in enumerate(locations):
            if location.strip():
                files = request.files.getlist(f'photos_{group_idx}')
                total_files_count += len([f for f in files if f and f.filename])
        
        progress_store[session_id]['total'] = total_files_count
        
        # Process each photo group
        for group_idx, location in enumerate(locations):
            location = location.strip()
            if not location:
                continue
                
            # Clean the location name for use in filenames (allow spaces)
            import re
            # Extract base location name (remove batch suffix if present)
            base_location = re.sub(r'_batch\d+$', '', location).strip()
            safe_location = re.sub(r'[^\w\s-]', '', base_location).strip()
            if not safe_location:
                flash(f'Location "{location}" contains invalid characters and was skipped.', 'warning')
                continue
            
            # Get files for this group
            files = request.files.getlist(f'photos_{group_idx}')
            if not files or all(not f.filename for f in files):
                continue
            
            # Check batch size before processing
            group_size = sum(f.content_length or 0 for f in files if f.filename)
            if total_batch_size + group_size > MAX_TOTAL_BATCH_SIZE:
                flash(f'Total batch size would exceed {MAX_TOTAL_BATCH_SIZE // (1024*1024)}MB limit. Please reduce the number of files.', 'error')
                return redirect(url_for('index'))
            
            total_batch_size += group_size
            
            # Process each uploaded file for this location
            file_index = 0
            for file in files:
                if file and file.filename:
                    total_photos += 1
                    
                    # Update progress
                    progress_store[session_id]['current'] = total_photos
                    progress_store[session_id]['status'] = 'processing'
                    progress_store[session_id]['message'] = f'Processing {file.filename}...'
                    
                    result = process_image_file(file, safe_location)
                    if result:
                        # Add location to the result tuple
                        file_path, date_taken, original_name = result
                        
                        # Get sequence number if provided (for batch uploads)
                        sequence_num = None
                        if sequence_numbers and file_index < len(sequence_numbers):
                            sequence_num = sequence_numbers[file_index]
                        
                        all_processed_photos.append((file_path, date_taken, original_name, safe_location, sequence_num))
                        file_index += 1
                    else:
                        error_count += 1
        
        if not all_processed_photos:
            flash('No valid images were processed. Please check your files and try again.', 'error')
            return redirect(url_for('index'))
        
        if error_count > 0:
            flash(f'{error_count} file(s) could not be processed due to errors.', 'warning')
        
        # Sort all photos by date taken (chronological order across all locations)
        all_processed_photos.sort(key=lambda x: x[1])
        
        # Create counters for each location to number photos sequentially per location
        location_counters = {}
        
        # Update progress for ZIP creation
        progress_store[session_id]['status'] = 'creating_zip'
        progress_store[session_id]['message'] = 'Creating ZIP file...'
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        
        try:
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                zip_progress = 0
                total_zip_files = len(all_processed_photos)
                
                for photo_data in all_processed_photos:
                    # Handle both old format (4 items) and new format (5 items with sequence number)
                    if len(photo_data) == 5:
                        file_path, date_taken, original_name, location, sequence_num = photo_data
                    else:
                        file_path, date_taken, original_name, location = photo_data
                        sequence_num = None
                    
                    zip_progress += 1
                    
                    # Update ZIP creation progress
                    progress_store[session_id]['message'] = f'Adding to ZIP: {original_name} ({zip_progress}/{total_zip_files})'
                    
                    # Use provided sequence number or increment counter for this location
                    if sequence_num is not None:
                        # Use the pre-calculated sequence number from batch upload
                        photo_number = sequence_num
                    else:
                        # Increment counter for this location (manual upload)
                        if location not in location_counters:
                            location_counters[location] = 1
                        else:
                            location_counters[location] += 1
                        photo_number = location_counters[location]
                    
                    # Get file extension
                    _, ext = os.path.splitext(original_name)
                    
                    # Create new filename with date, location, and sequence number
                    new_name = f"{date_taken.strftime('%Y.%m.%d')} {location} {photo_number:03d}{ext}"
                    
                    # Add file to ZIP with new name
                    zipf.write(file_path, new_name)
            
            zip_buffer.seek(0)
            
            # Clean up temporary files
            for photo_data in all_processed_photos:
                try:
                    file_path = photo_data[0]  # First element is always file_path
                    if os.path.exists(file_path):
                        os.remove(file_path)
                except Exception as e:
                    logging.error(f"Error removing temporary file {photo_data[0]}: {e}")
            
            # Generate download filename with multiple locations
            unique_locations = list(set(photo[3] for photo in all_processed_photos))
            if len(unique_locations) == 1:
                download_name = f"{unique_locations[0]}_photos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
            else:
                download_name = f"multi_location_photos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
            
            # Mark progress as complete
            progress_store[session_id]['status'] = 'complete'
            progress_store[session_id]['message'] = 'Download ready!'
            
            flash(f'Successfully processed {len(all_processed_photos)} photos from {len(unique_locations)} location(s)!', 'success')
            
            # Store session ID for progress tracking
            session['progress_id'] = session_id
            
            return send_file(
                zip_buffer,
                mimetype='application/zip',
                download_name=download_name,
                as_attachment=True
            )
        
        except Exception as e:
            logging.error(f"Error creating ZIP file: {e}")
            # Clean up temporary files on error
            for photo_data in all_processed_photos:
                try:
                    file_path = photo_data[0]  # First element is always file_path
                    if os.path.exists(file_path):
                        os.remove(file_path)
                except:
                    pass
            
            flash('An error occurred while creating the download file. Please try again.', 'error')
            return redirect(url_for('index'))
    
    return render_template('index.html')

@app.route('/progress/<session_id>')
def get_progress(session_id):
    """API endpoint to get processing progress."""
    if session_id in progress_store:
        return jsonify(progress_store[session_id])
    else:
        return jsonify({
            'current': 0,
            'total': 0,
            'status': 'not_found',
            'message': 'Session not found'
        }), 404

@app.errorhandler(413)
def too_large(e):
    """Handle file too large error."""
    logging.warning(f"413 error triggered: {e}")
    flash('Upload too large. The total batch size limit is 2GB. Please reduce the number of files or compress your images.', 'error')
    return redirect(url_for('index'))

@app.errorhandler(500)
def internal_error(e):
    """Handle internal server errors."""
    flash('An internal error occurred. Please try again.', 'error')
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
