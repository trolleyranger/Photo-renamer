#!/usr/bin/env python3
"""
Universal entry point for Render deployment
This file should work with any start command
"""
import os
from flask import Flask

# Create simple Flask app
app = Flask(__name__)

@app.route('/')
def home():
    return '''
    <h1>🎉 Photo Renamer Deployment Successful!</h1>
    <p>Your Flask app is running on Render.</p>
    <p>Port: {}</p>
    <p>Environment: Production</p>
    <a href="/health">Health Check</a>
    '''.format(os.environ.get('PORT', 'Unknown'))

@app.route('/health')
def health():
    return {
        'status': 'healthy', 
        'port': os.environ.get('PORT', 'Unknown'),
        'message': 'Ready for photo renaming!'
    }

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting app on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)