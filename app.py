# /var/www/schema.backyardbrains.com/app.py
from flask import Flask, request, jsonify, Response, send_from_directory
from flask import redirect, url_for, session
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from datetime import datetime
import os, json, fnmatch
import base64, hmac, io, zipfile
from functools import wraps

# Load environment from a local .env when present (useful for dev)
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass
 
# Optional Auth0 dependencies
try:
    from jose import jwt
    import requests
except Exception:
    jwt = None  # type: ignore
    requests = None  # type: ignore

app = Flask(__name__)
CORS(app)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

UPLOAD_DIRECTORY = os.environ.get('UPLOAD_DIRECTORY', '/var/www/schema.backyardbrains.com/uploads')
RESULTS_PASSWORD = os.environ.get('RESULTS_PASSWORD')
AUTH0_DOMAIN = os.environ.get('AUTH0_DOMAIN')  # e.g. backyardbrains.us.auth0.com
AUTH0_AUDIENCE = os.environ.get('AUTH0_AUDIENCE')  # e.g. https://schema.backyardbrains.com/api
AUTH0_CLIENT_ID = os.environ.get('AUTH0_CLIENT_ID')
AUTH0_CLIENT_SECRET = os.environ.get('AUTH0_CLIENT_SECRET')

# Flask session config (required for server-side login)
app.secret_key = os.environ.get('SECRET_KEY', os.environ.get('FLASK_SECRET_KEY', 'dev-insecure'))
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = True

_JWKS_CACHE = None

def _get_auth0_jwks():
    global _JWKS_CACHE
    if _JWKS_CACHE is not None:
        return _JWKS_CACHE
    if not (requests and AUTH0_DOMAIN):
        return None
    try:
        url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        _JWKS_CACHE = resp.json()
        return _JWKS_CACHE
    except Exception:
        return None

def _verify_auth0_jwt(token: str):
    if not (jwt and AUTH0_DOMAIN and AUTH0_AUDIENCE):
        raise ValueError('auth0 not configured')
    unverified_header = jwt.get_unverified_header(token)
    jwks = _get_auth0_jwks()
    if not jwks:
        raise ValueError('jwks unavailable')
    rsa_key = {}
    for key in jwks.get('keys', []):
        if key.get('kid') == unverified_header.get('kid'):
            rsa_key = {
                'kty': key.get('kty'),
                'kid': key.get('kid'),
                'use': key.get('use'),
                'n': key.get('n'),
                'e': key.get('e')
            }
            break
    if not rsa_key:
        raise ValueError('no matching jwk')
    issuer = f"https://{AUTH0_DOMAIN}/"
    payload = jwt.decode(
        token,
        rsa_key,
        algorithms=['RS256'],
        audience=AUTH0_AUDIENCE,
        issuer=issuer,
    )
    return payload

def _verify_auth0_id_token(token: str):
    if not (jwt and AUTH0_DOMAIN and AUTH0_CLIENT_ID):
        raise ValueError('auth0 not configured')
    unverified_header = jwt.get_unverified_header(token)
    jwks = _get_auth0_jwks()
    if not jwks:
        raise ValueError('jwks unavailable')
    rsa_key = {}
    for key in jwks.get('keys', []):
        if key.get('kid') == unverified_header.get('kid'):
            rsa_key = {
                'kty': key.get('kty'),
                'kid': key.get('kid'),
                'use': key.get('use'),
                'n': key.get('n'),
                'e': key.get('e')
            }
            break
    if not rsa_key:
        raise ValueError('no matching jwk')
    issuer = f"https://{AUTH0_DOMAIN}/"
    payload = jwt.decode(
        token,
        rsa_key,
        algorithms=['RS256'],
        audience=AUTH0_CLIENT_ID,
        issuer=issuer,
    )
    return payload

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
        # Accept an existing Flask session login
        if session.get('user'):
            return func(*args, **kwargs)

        # Otherwise, require a valid Auth0 JWT (Bearer token)
        authz = request.headers.get('Authorization', '')
        if authz.startswith('Bearer '):
            token = authz.split(' ', 1)[1]
            try:
                _verify_auth0_jwt(token)
                return func(*args, **kwargs)
            except Exception:
                pass
        resp = Response('Unauthorized', 401)
        resp.headers['WWW-Authenticate'] = 'Bearer realm="Results"'
        return resp
    return wrapper


# --------- Auth (server-side session with Auth0) ---------

def _abs_url(path: str) -> str:
    # Respect proxy headers for scheme/host
    root = request.url_root.rstrip('/')
    if not path.startswith('/'):
        path = '/' + path
    return root + path


@app.get('/api/auth/login')
def auth_login():
    if not (AUTH0_DOMAIN and AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET):
        return jsonify({"status":"error","error":"auth0 not configured"}), 500
    # Generate state to mitigate CSRF
    state = base64.urlsafe_b64encode(os.urandom(24)).decode('ascii')
    session['oauth_state'] = state
    # Optional nonce for ID token
    nonce = base64.urlsafe_b64encode(os.urandom(24)).decode('ascii')
    session['oauth_nonce'] = nonce

    # Build OIDC scopes; include API permission if audience is configured
    scope = 'openid profile email'
    if AUTH0_AUDIENCE:
        scope += ' read:results'

    params = {
        'response_type': 'code',
        'client_id': AUTH0_CLIENT_ID,
        'redirect_uri': _abs_url('/api/auth/callback'),
        'scope': scope,
        'state': state,
        'nonce': nonce,
        'prompt': 'login'
    }
    if AUTH0_AUDIENCE:
        params['audience'] = AUTH0_AUDIENCE
    q = '&'.join(f"{k}={requests.utils.quote(v)}" for k, v in params.items() if v)
    return redirect(f"https://{AUTH0_DOMAIN}/authorize?{q}")


@app.get('/api/auth/callback')
def auth_callback():
    if not (AUTH0_DOMAIN and AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET and requests):
        return jsonify({"status":"error","error":"auth0 not configured"}), 500
    code = request.args.get('code')
    state = request.args.get('state')
    if not code or not state or state != session.get('oauth_state'):
        return jsonify({"status":"error","error":"invalid state or code"}), 400
    # Exchange code for tokens
    token_url = f"https://{AUTH0_DOMAIN}/oauth/token"
    data = {
        'grant_type': 'authorization_code',
        'client_id': AUTH0_CLIENT_ID,
        'client_secret': AUTH0_CLIENT_SECRET,
        'code': code,
        'redirect_uri': _abs_url('/api/auth/callback'),
    }
    try:
        resp = requests.post(token_url, json=data, timeout=10)
        resp.raise_for_status()
        tok = resp.json()
    except Exception as e:
        return jsonify({"status":"error","error":"token exchange failed"}), 400

    id_token = tok.get('id_token')
    if not id_token:
        return jsonify({"status":"error","error":"missing id_token"}), 400
    try:
        claims = _verify_auth0_id_token(id_token)
    except Exception:
        # If verification fails, do not log in
        return jsonify({"status":"error","error":"invalid id_token"}), 400

    # Store minimal user session
    session.pop('oauth_state', None)
    session.pop('oauth_nonce', None)
    session['user'] = {
        'sub': claims.get('sub'),
        'email': claims.get('email'),
        'name': claims.get('name') or claims.get('nickname'),
    }

    # Optional: store access_token if present (not sent to client)
    if 'access_token' in tok:
        session['access_token'] = tok['access_token']

    # Redirect back to results
    return redirect('/results')


@app.get('/api/auth/logout')
def auth_logout():
    session.clear()
    # Optional: Log out from Auth0 as well
    if AUTH0_DOMAIN and AUTH0_CLIENT_ID:
        return_to = _abs_url('/results')
        logout_url = (
            f"https://{AUTH0_DOMAIN}/v2/logout?client_id={AUTH0_CLIENT_ID}"
            f"&returnTo={requests.utils.quote(return_to)}"
        )
        return redirect(logout_url)
    return redirect('/results')


@app.get('/api/auth/me')
def auth_me():
    user = session.get('user')
    if not user:
        return jsonify({"authenticated": False}), 401
    return jsonify({"authenticated": True, "user": user})


def _has_scope(payload: dict, required_scope: str) -> bool:
    try:
        # Require RBAC permissions in access token
        perms = payload.get('permissions')
        if isinstance(perms, list):
            return required_scope in perms
        # If permissions claim missing, treat as not authorized
        return False
    except Exception:
        return False


def require_results_scope(required_scope: str):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Check Bearer token if provided
            authz = request.headers.get('Authorization', '')
            if authz.startswith('Bearer '):
                token = authz.split(' ', 1)[1]
                try:
                    payload = _verify_auth0_jwt(token)
                    app.logger.info('authz check: bearer token; perms=%s', payload.get('permissions'))
                    if _has_scope(payload, required_scope):
                        app.logger.info('authz allow: bearer with scope %s', required_scope)
                        return func(*args, **kwargs)
                    app.logger.info('authz deny: bearer missing permissions or scope %s', required_scope)
                    return jsonify({"status":"error","error":"forbidden","missing_scope": required_scope}), 403
                except Exception:
                    app.logger.info('authz deny: bearer invalid')
                    pass

            # Check session access token
            token = session.get('access_token')
            if token:
                try:
                    payload = _verify_auth0_jwt(token)
                    app.logger.info('authz check: session token; perms=%s', payload.get('permissions'))
                    if _has_scope(payload, required_scope):
                        app.logger.info('authz allow: session with scope %s', required_scope)
                        return func(*args, **kwargs)
                    app.logger.info('authz deny: session missing permissions or scope %s', required_scope)
                    return jsonify({"status":"error","error":"forbidden","missing_scope": required_scope}), 403
                except Exception:
                    app.logger.info('authz deny: session token invalid')
                    return jsonify({"status":"error","error":"unauthorized"}), 401

            app.logger.info('authz deny: no auth presented')
            return jsonify({"status":"error","error":"unauthorized"}), 401
        return wrapper
    return decorator

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


@app.get('/results/<path:filename>')
@require_results_auth
def results_assets(filename):
    base_dir = os.path.join(app.root_path, 'static', 'results')
    return send_from_directory(base_dir, filename)


@app.get('/api/results/list')
@require_results_scope('read:results')
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
@require_results_scope('read:results')
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
