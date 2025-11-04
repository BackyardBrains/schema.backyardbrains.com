# /var/www/schema.backyardbrains.com/app.py
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from datetime import datetime
import os, json, fnmatch
import base64, hmac, io, zipfile
from functools import wraps

app = Flask(__name__)
CORS(app)

UPLOAD_DIRECTORY = '/var/www/schema.backyardbrains.com/uploads'
RESULTS_PASSWORD = os.environ.get('RESULTS_PASSWORD')

def ensure_upload_dir():
    os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)

def _constant_time_eq(a: str, b: str) -> bool:
    try:
        return hmac.compare_digest(a, b)
    except Exception:
        return False

def require_results_auth(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        # If no password configured, allow access (useful for local/testing)
        if not RESULTS_PASSWORD:
            return func(*args, **kwargs)

        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Basic '):
            try:
                decoded = base64.b64decode(auth_header.split(' ', 1)[1]).decode('utf-8', 'ignore')
            except Exception:
                decoded = ''
            # Expect "username:password"; username is ignored
            password = decoded.split(':', 1)[1] if ':' in decoded else decoded
            if _constant_time_eq(password, RESULTS_PASSWORD):
                return func(*args, **kwargs)

        resp = Response('Authentication required', 401)
        resp.headers['WWW-Authenticate'] = 'Basic realm="Results"'
        return resp
    return wrapper

# ---- POST /data : save one submission ----
@app.post('/data')
def receive_data():
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"status": "error", "error": "invalid JSON"}), 400

        uuid = payload.get('UUID') or 'nouuid'
        exp  = payload.get('experiment') or 'exp'
        ts   = datetime.utcnow().strftime('%Y%m%d-%H%M%S')  # timestamp in name
        fname = f"{exp}_{uuid}_{ts}.json"
        final_path = os.path.join(UPLOAD_DIRECTORY, fname)

        ensure_upload_dir()

        # atomic write to avoid partial files
        tmp_path = final_path + '.tmp'
        with open(tmp_path, 'w') as f:
            json.dump(payload, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, final_path)

        # fsync the dir so the file appears immediately in listings
        dir_fd = os.open(UPLOAD_DIRECTORY, os.O_DIRECTORY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)

        app.logger.info(f"saved {final_path}")
        return jsonify({"status": "ok", "saved": final_path}), 200

    except PermissionError:
        app.logger.exception("permission")
        return jsonify({"status":"error","error":"permission denied"}), 500
    except Exception as e:
        app.logger.exception("save error")
        return jsonify({"status":"error","error":str(e)}), 500

# ---- GET /api/uploads : list files (JSON or simple HTML) ----
def _list_files(pattern=None, ext=None, sort='date', order='desc',
               limit=200, offset=0, min_size=0, max_size=None,
               since=None, until=None):
    ensure_upload_dir()
    files=[]
    since_ts = datetime.fromisoformat(since).timestamp() if since else None
    until_ts = datetime.fromisoformat(until).timestamp() if until else None

    with os.scandir(UPLOAD_DIRECTORY) as it:
        for e in it:
            if not e.is_file(): 
                continue
            name = e.name
            if pattern and not fnmatch.fnmatch(name, pattern): 
                continue
            if ext and not name.lower().endswith(ext.lower()): 
                continue
            st = e.stat()
            if st.st_size < int(min_size): 
                continue
            if max_size is not None and st.st_size > int(max_size): 
                continue
            if since_ts and st.st_mtime < since_ts: 
                continue
            if until_ts and st.st_mtime > until_ts: 
                continue
            files.append({
                "name": name,
                "size": st.st_size,
                "mtime": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
                "url": f"/uploads/{name}",
            })

    key = {"date":"mtime","name":"name","size":"size"}.get(sort, "mtime")
    reverse = (order == 'desc')
    files.sort(key=lambda x: x[key], reverse=reverse)
    return files[int(offset): int(offset)+int(limit)]

@app.get('/api/uploads')
def api_uploads():
    q = request.args
    files = _list_files(
        pattern=q.get('pattern'),
        ext=q.get('ext'),
        sort=q.get('sort','date'),
        order=q.get('order','desc'),
        limit=q.get('limit',200),
        offset=q.get('offset',0),
        min_size=q.get('min_size',0),
        max_size=q.get('max_size'),
        since=q.get('since'),
        until=q.get('until'),
    )
    if q.get('format') == 'html':
        rows = "\n".join(
            f'<tr><td><a href="{f["url"]}">{f["name"]}</a></td>'
            f'<td style="text-align:right">{f["size"]}</td>'
            f'<td>{f["mtime"]}</td></tr>' for f in files
        )
        html = f"""<!doctype html><meta charset="utf-8"><title>Uploads</title>
        <style>body{{font-family:system-ui,Arial}} table{{border-collapse:collapse}} td,th{{padding:6px 10px;border-bottom:1px solid #ddd}}</style>
        <h1>Uploads</h1>
        <table><thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead><tbody>{rows}</tbody></table>"""
        return Response(html, mimetype="text/html")
    return jsonify({"count": len(files), "files": files})

# ---- RESULTS SPA & API ----
@app.get('/results')
@require_results_auth
def results_page():
    # Serve the static SPA
    return send_from_directory(os.path.join(app.root_path, 'static', 'results'), 'index.html')


@app.get('/api/results/list')
@require_results_auth
def results_list():
    q = request.args
    files = _list_files(
        pattern=q.get('pattern'),
        ext=q.get('ext', '.json'),
        sort=q.get('sort', 'date'),
        order=q.get('order', 'desc'),
        limit=q.get('limit', 200),
        offset=q.get('offset', 0),
        min_size=q.get('min_size', 0),
        max_size=q.get('max_size'),
        since=q.get('since'),
        until=q.get('until'),
    )
    return jsonify({"count": len(files), "files": files})


def _safe_join_uploads(name: str) -> str:
    # prevent path traversal; only allow plain filenames within UPLOAD_DIRECTORY
    if not name or '/' in name or '\\' in name or '..' in name:
        raise ValueError('invalid name')
    path = os.path.realpath(os.path.join(UPLOAD_DIRECTORY, name))
    base = os.path.realpath(UPLOAD_DIRECTORY)
    if not path.startswith(base + os.sep):
        raise ValueError('invalid path')
    return path


@app.get('/api/results/file/<path:name>')
@require_results_auth
def results_file(name):
    try:
        if not name.lower().endswith('.json'):
            return jsonify({"status": "error", "error": "not a JSON file"}), 400
        file_path = _safe_join_uploads(name)
        with open(file_path, 'rb') as f:
            data = f.read()
        return Response(data, mimetype='application/json')
    except FileNotFoundError:
        return jsonify({"status": "error", "error": "not found"}), 404
    except ValueError:
        return jsonify({"status": "error", "error": "invalid name"}), 400
    except Exception as e:
        app.logger.exception('file preview error')
        return jsonify({"status": "error", "error": str(e)}), 500


@app.get('/api/results/zip')
@require_results_auth
def results_zip():
    q = request.args
    max_files = int(q.get('max_files', 500))
    files = _list_files(
        pattern=q.get('pattern'),
        ext=q.get('ext', '.json'),
        sort=q.get('sort', 'date'),
        order=q.get('order', 'desc'),
        limit=q.get('limit', 200),
        offset=q.get('offset', 0),
        min_size=q.get('min_size', 0),
        max_size=q.get('max_size'),
        since=q.get('since'),
        until=q.get('until'),
    )
    files = files[:max_files]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for fmeta in files:
            name = fmeta.get('name')
            try:
                file_path = _safe_join_uploads(name)
                zf.write(file_path, arcname=name)
            except Exception:
                # skip problematic files but continue
                app.logger.exception(f"zip add failed for {name}")
                continue

    buf.seek(0)
    ts = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    resp = Response(buf.read(), mimetype='application/zip')
    resp.headers['Content-Disposition'] = f'attachment; filename="results-{ts}.zip"'
    return resp

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
