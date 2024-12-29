# sudo systemctl start schema_backyardbrains.service
# sudo systemctl stop schema_backyardbrains.service
# defined in /etc/systemd/system/schema_backyardbrains.service
from flask import Flask, request
import json
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

UPLOAD_DIRECTORY = '/var/www/schema.backyardbrains.com/uploads'

@app.route('/data', methods=['POST'])
def receive_data():
    data = request.get_json()

    # Get the filename from the JSON data. If it doesn't exist, use 'data_log.json' as a default
    uuid = data.get('UUID', 'data_log')
    expname = data.get('experiment', 'exp')
    filename = f"{expname}_{uuid}.json"
    filepath = os.path.join(UPLOAD_DIRECTORY, filename)

    # Ensure the upload directory exists
    if not os.path.exists(UPLOAD_DIRECTORY):
        os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)

    try:
        with open(filepath, 'w') as f:
            f.write(json.dumps(data, indent=4))
            f.write("\n")
    except PermissionError:
        return 'Permission denied: Unable to write to the directory', 500

    return 'OK', 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
