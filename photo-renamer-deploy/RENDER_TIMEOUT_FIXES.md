# Fixing Render Deployment Timeouts

Your deployment is timing out. Here are the fixes to upload to GitHub:

## Updated Files to Add/Replace

### 1. Update Your Render Configuration

In your Render web service settings, change the **Start Command** to:
```
gunicorn --bind 0.0.0.0:$PORT --workers 1 --timeout 60 --preload main:app
```

### 2. Add These New Files to GitHub

**File: `render_gunicorn.conf.py`** (optimized Gunicorn config)
**File: `startup.py`** (alternative startup method)

### 3. Update requirements.txt

Make sure your `requirements.txt` contains exactly:
```
Flask==3.0.3
Flask-SQLAlchemy==3.1.1
Pillow==10.4.0
Werkzeug==3.0.3
gunicorn==23.0.0
psycopg2-binary==2.9.9
email-validator==2.2.0
```

## Alternative Render Settings (Try if still timing out)

**Build Command:**
```
pip install --no-cache-dir -r requirements.txt
```

**Start Command Option 1:**
```
python startup.py
```

**Start Command Option 2:**
```
gunicorn --config render_gunicorn.conf.py main:app
```

**Start Command Option 3 (Most Basic):**
```
python -m gunicorn main:app --bind 0.0.0.0:$PORT
```

## Environment Variables (Double-check these)

Make sure you have:
- `SESSION_SECRET` (any random string)
- `DATABASE_URL` (from your Render PostgreSQL database)

## Common Timeout Causes & Solutions

### 1. Missing Database Connection
**Problem**: App can't connect to database during startup
**Fix**: Verify DATABASE_URL is correct (copy full URL from database info page)

### 2. Large Dependencies
**Problem**: Pillow takes long to install
**Fix**: Use the optimized build command above with `--no-cache-dir`

### 3. Wrong Port
**Problem**: App trying to use port 5000 instead of Render's assigned port
**Fix**: Start commands above use `$PORT` environment variable

### 4. Gunicorn Configuration Issues
**Problem**: Default Gunicorn settings don't work well with Render
**Fix**: Use the optimized start commands above

## Step-by-Step Fix Process

1. **Upload the new files** (`render_gunicorn.conf.py`, `startup.py`) to GitHub
2. **Update your Render web service**:
   - Go to Settings → Build & Deploy
   - Change Build Command to: `pip install --no-cache-dir -r requirements.txt`
   - Change Start Command to: `gunicorn --bind 0.0.0.0:$PORT --workers 1 --timeout 60 --preload main:app`
3. **Trigger manual deploy** in Render
4. **Watch the logs** - deployment should complete in 2-3 minutes

## If Still Timing Out

Try these start commands in order:
1. `python startup.py`
2. `python -m flask run --host=0.0.0.0 --port=$PORT`
3. `python main.py`

The key is using Render's assigned `$PORT` variable instead of hardcoded port 5000.

## Success Indicators

When deployment works, you'll see:
```
==> Listening at: http://0.0.0.0:[PORT]
==> Your service is live 🎉
```