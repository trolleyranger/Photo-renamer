from flask import Flask
import os

app = Flask(__name__)

@app.route('/')
def hello():
    return '<h1>Photo Renamer App is Working!</h1><p>If you see this, your deployment is successful.</p>'

@app.route('/health')
def health():
    return {'status': 'ok'}

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)