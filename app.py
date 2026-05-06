# /var/www/schema.backyardbrains.com/app.py
from flask import Flask, request, jsonify, Response, send_from_directory
from flask import redirect, url_for, session
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from datetime import datetime
import os, json, fnmatch, csv, re, uuid
import base64, hmac, io, zipfile
from functools import wraps
from urllib.parse import parse_qs, quote, urlparse

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
AUTH0_MGMT_CLIENT_ID = os.environ.get('AUTH0_MGMT_CLIENT_ID')
AUTH0_MGMT_CLIENT_SECRET = os.environ.get('AUTH0_MGMT_CLIENT_SECRET')
AUTH0_MGMT_DOMAIN = os.environ.get('AUTH0_MGMT_DOMAIN')  # e.g. backyardbrains.us.auth0.com
AUTH0_MGMT_AUDIENCE = os.environ.get('AUTH0_MGMT_AUDIENCE')  # e.g. https://backyardbrains.us.auth0.com/api/v2/
AUTH0_READ_RESULTS_ROLE_ID = os.environ.get('AUTH0_READ_RESULTS_ROLE_ID')  # optional: role that includes read:results
GOOGLE_SHEETS_API_KEY = os.environ.get('GOOGLE_SHEETS_API_KEY')
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')

# Flask session config (required for server-side login)
app.secret_key = os.environ.get('SECRET_KEY', os.environ.get('FLASK_SECRET_KEY', 'dev-insecure'))
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = True

_JWKS_CACHE = None
_MGMT_TOKEN_CACHE = None
_MGMT_TOKEN_EXP = 0
_GOOGLE_TOKEN_CACHE = None
_GOOGLE_TOKEN_EXP = 0

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

def _get_mgmt_token() -> str:
    # Fetch a Management API token using client credentials; cache briefly
    global _MGMT_TOKEN_CACHE, _MGMT_TOKEN_EXP
    import time
    now = int(time.time())
    if _MGMT_TOKEN_CACHE and now < _MGMT_TOKEN_EXP - 30:
        return _MGMT_TOKEN_CACHE
    mgmt_domain = AUTH0_MGMT_DOMAIN or AUTH0_DOMAIN
    mgmt_audience = AUTH0_MGMT_AUDIENCE or (f"https://{AUTH0_MGMT_DOMAIN}/api/v2/" if AUTH0_MGMT_DOMAIN else f"https://{AUTH0_DOMAIN}/api/v2/")
    if not (requests and mgmt_domain and AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET):
        raise RuntimeError('management api not configured')
    token_url = f"https://{mgmt_domain}/oauth/token"
    data = {
        'grant_type': 'client_credentials',
        'client_id': AUTH0_MGMT_CLIENT_ID,
        'client_secret': AUTH0_MGMT_CLIENT_SECRET,
        'audience': mgmt_audience,
    }
    # Optionally request specific scopes (app must be authorized for them)
    # read:users_by_email for users-by-email; read:users for search; update:users for granting permissions
    try:
        resp = requests.post(token_url, json=data, timeout=10)
        resp.raise_for_status()
    except Exception:
        app.logger.exception('mgmt token fetch failed')
        raise
    j = resp.json()
    _MGMT_TOKEN_CACHE = j.get('access_token')
    _MGMT_TOKEN_EXP = now + int(j.get('expires_in', 300))
    return _MGMT_TOKEN_CACHE

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


def _safe_auth_return_path(path: str, default: str = '/results') -> str:
    if not path or not path.startswith('/') or path.startswith('//'):
        return default
    return path


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
    session['auth_return_to'] = _safe_auth_return_path(request.args.get('next', ''), '/results')

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

    return_to = session.pop('auth_return_to', '/results')
    return redirect(_safe_auth_return_path(return_to, '/results'))


@app.get('/api/auth/logout')
def auth_logout():
    return_to = _safe_auth_return_path(request.args.get('next', ''), '/results')
    session.clear()
    # Optional: Log out from Auth0 as well
    if AUTH0_DOMAIN and AUTH0_CLIENT_ID:
        return_to = _abs_url(return_to)
        logout_url = (
            f"https://{AUTH0_DOMAIN}/v2/logout?client_id={AUTH0_CLIENT_ID}"
            f"&returnTo={requests.utils.quote(return_to)}"
        )
        return redirect(logout_url)
    return redirect(return_to)


@app.get('/api/auth/me')
def auth_me():
    user = session.get('user')
    if not user:
        return jsonify({"authenticated": False}), 401
    
    permissions = []
    token = session.get('access_token')
    if token:
        try:
            payload = _verify_auth0_jwt(token)
            permissions = payload.get('permissions', [])
        except Exception:
            # Token might be expired or invalid; just return empty perms
            pass

    return jsonify({"authenticated": True, "user": user, "permissions": permissions})


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


def require_admin_permission(required_permission: str):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            token = session.get('access_token')
            if not token:
                return jsonify({"status":"error","error":"unauthorized"}), 401
            try:
                payload = _verify_auth0_jwt(token)
                app.logger.info('admin check perms=%s need=%s', payload.get('permissions'), required_permission)
                if _has_scope(payload, required_permission):
                    return func(*args, **kwargs)
                return jsonify({"status":"error","error":"forbidden","missing_scope": required_permission}), 403
            except Exception:
                return jsonify({"status":"error","error":"unauthorized"}), 401
        return wrapper
    return decorator


# --------- Admin APIs (via Auth0 Management API) ---------

@app.get('/api/admin/search_user')
@require_admin_permission('read:users')
def admin_search_user():
    email = request.args.get('email', '').strip()
    if not email:
        return jsonify({"status":"error","error":"invalid email"}), 400
    try:
        token = _get_mgmt_token()
        mgmt_domain = AUTH0_MGMT_DOMAIN or AUTH0_DOMAIN
        headers = {'Authorization': f'Bearer {token}'}
        # Always use v3 search to keep required scope to read:users only
        url = f"https://{mgmt_domain}/api/v2/users"
        # If the input contains '@', prefer an exact email match; otherwise wildcard partial
        q = f"email:\"{email}\"" if '@' in email else f"email:*{email}*"
        r = requests.get(url, params={'q': q, 'search_engine': 'v3', 'fields': 'user_id,email,name,nickname,identities', 'include_fields': 'true'}, headers=headers, timeout=10)
        r.raise_for_status()
        users = r.json() or []
        out = [{
            'user_id': u.get('user_id'),
            'email': u.get('email'),
            'name': u.get('name') or u.get('nickname'),
            'connection': (u.get('identities') or [{}])[0].get('connection')
        } for u in users]
        return jsonify({"status":"ok","users": out})
    except requests.HTTPError as he:
        try:
            txt = he.response.text
        except Exception:
            txt = ''
        app.logger.error('admin search_user failed %s %s', getattr(he.response, 'status_code', '?'), txt)
        code = getattr(he.response, 'status_code', 500) or 500
        return jsonify({"status":"error","error":"search failed","upstream_status": code}), 502
    except Exception:
        app.logger.exception('admin search_user failed')
        return jsonify({"status":"error","error":"search failed"}), 500


@app.post('/api/admin/grant_read_results')
@require_admin_permission('write:users')
def admin_grant_read_results():
    try:
        body = request.get_json(silent=True) or {}
        user_id = (body.get('user_id') or '').strip()
        email = (body.get('email') or '').strip()
        token = _get_mgmt_token()
        # Resolve user_id from email if not provided
        mgmt_domain = AUTH0_MGMT_DOMAIN or AUTH0_DOMAIN
        if not user_id:
            if not email or '@' not in email:
                return jsonify({"status":"error","error":"invalid email or user_id"}), 400
            url = f"https://{mgmt_domain}/api/v2/users-by-email"
            r = requests.get(url, params={'email': email}, headers={'Authorization': f'Bearer {token}'}, timeout=10)
            r.raise_for_status()
            users = r.json() or []
            if not users:
                return jsonify({"status":"error","error":"user not found"}), 404
            user_id = users[0].get('user_id')
        # Assign permission directly
        perm = {
            'permission_name': 'read:results',
            'resource_server_identifier': AUTH0_AUDIENCE or ''
        }
        if not perm['resource_server_identifier']:
            return jsonify({"status":"error","error":"AUTH0_AUDIENCE not set"}), 500
        purl = f"https://{mgmt_domain}/api/v2/users/{requests.utils.quote(user_id, safe='')}/permissions"
        pr = requests.post(purl, json={'permissions': [perm]}, headers={'Authorization': f'Bearer {token}'}, timeout=10)
        if pr.status_code not in (200, 201, 204):
            app.logger.error('grant failed: %s %s', pr.status_code, pr.text)
            return jsonify({"status":"error","error":"grant failed"}), 500
        return jsonify({"status":"ok","granted": True, "user_id": user_id})
    except Exception:
        app.logger.exception('admin grant_read_results failed')
        return jsonify({"status":"error","error":"internal error"}), 500


@app.get('/api/admin/users_with_permission')
@require_admin_permission('read:users')
def admin_users_with_permission():
    permission = request.args.get('permission', 'read:results')
    audience = request.args.get('audience') or (AUTH0_AUDIENCE or '')
    role_id = request.args.get('role_id') or (AUTH0_READ_RESULTS_ROLE_ID if permission == 'read:results' else None)
    per_page = int(request.args.get('per_page', 50))
    page = int(request.args.get('page', 0))
    try:
        token = _get_mgmt_token()
        headers = {'Authorization': f'Bearer {token}'}
        mgmt_domain = AUTH0_MGMT_DOMAIN or AUTH0_DOMAIN
        users = []
        if role_id:
            # If a role is provided, list users by role
            url = f"https://{mgmt_domain}/api/v2/roles/{requests.utils.quote(role_id, safe='')}/users"
            r = requests.get(url, params={'per_page': per_page, 'page': page}, headers=headers, timeout=15)
            r.raise_for_status()
            users = r.json() or []
        else:
            # Scan a page of users and filter by permission
            url = f"https://{mgmt_domain}/api/v2/users"
            r = requests.get(url, params={'per_page': per_page, 'page': page, 'fields': 'user_id,email,name,nickname,identities', 'include_fields': 'true'}, headers=headers, timeout=15)
            r.raise_for_status()
            candidates = r.json() or []
            for u in candidates:
                uid = u.get('user_id')
                if not uid:
                    continue
                purl = f"https://{mgmt_domain}/api/v2/users/{requests.utils.quote(uid, safe='')}/permissions"
                pr = requests.get(purl, headers=headers, timeout=10)
                if pr.status_code != 200:
                    continue
                perms = pr.json() or []
                has = any((p.get('permission_name') == permission and (not audience or p.get('resource_server_identifier') == audience)) for p in perms)
                if has:
                    users.append(u)
        out = [{
            'user_id': u.get('user_id'),
            'email': u.get('email'),
            'name': u.get('name') or u.get('nickname'),
            'connection': (u.get('identities') or [{}])[0].get('connection')
        } for u in users]
        return jsonify({"status":"ok","users": out, "page": page, "per_page": per_page})
    except requests.HTTPError as he:
        try:
            txt = he.response.text
        except Exception:
            txt = ''
        app.logger.error('admin users_with_permission failed %s %s', getattr(he.response, 'status_code', '?'), txt)
        code = getattr(he.response, 'status_code', 500) or 500
        return jsonify({"status":"error","error":"list failed","upstream_status": code}), 502
    except Exception:
        app.logger.exception('admin users_with_permission failed')
        return jsonify({"status":"error","error":"list failed"}), 500

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
    total_count = len(files)
    return files[int(offset): int(offset)+int(limit)], total_count

@app.get('/api/uploads')
def api_uploads():
    q = request.args
    files, total_count = _list_files(
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
        <h1>Uploads ({total_count} total)</h1>
        <table><thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead><tbody>{rows}</tbody></table>"""
        return Response(html, mimetype="text/html")
    return jsonify({"count": len(files), "total_count": total_count, "files": files})


# ---- RESEARCH: RHI Temperature data collection and viewer ----
RHI_TEMP_SITES = ('wrist', 'index', 'pinky')
RHI_TEMP_CONDITIONS = ('control', 'rhi')
RHI_TEMP_CSV_FIELDS = (
    'participant_id', 'session', 'condition', 'site', 'timepoint', 'temperature',
    'participant_name', 'age', 'sex', 'who_note', 'description',
    'participant_note', 'question_1', 'question_2', 'question_3',
    'question_4', 'question_5', 'question_6', 'question_7',
    'question_8', 'question_9', 'notes', 'source', 'collector', 'created_at'
)


def _rhi_temp_dir():
    return os.path.join(UPLOAD_DIRECTORY, 'research', 'rhi-temp')


def _rhi_temp_path():
    return os.path.join(_rhi_temp_dir(), 'records.jsonl')


def _ensure_rhi_temp_dir():
    os.makedirs(_rhi_temp_dir(), exist_ok=True)


def _clean_key(value):
    return re.sub(r'[^a-z0-9]+', '', str(value or '').lower())


def _parse_temperature(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace('°', '').replace('F', '').replace('f', '').replace('C', '').replace('c', '')
    text = text.replace(',', '.')
    match = re.search(r'-?\d+(?:\.\d+)?', text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _find_row_value(row, candidates):
    wanted = {_clean_key(c) for c in candidates}
    for key, value in row.items():
        if _clean_key(key) in wanted:
            return value
    return ''


def _normalize_condition(value):
    text = _clean_key(value)
    if 'rhi' in text or 'rubberhand' in text or 'illusion' in text:
        return 'rhi'
    if 'control' in text or 'ctrl' in text or 'baseline' in text:
        return 'control'
    return ''


def _normalize_site(value):
    text = _clean_key(value)
    if text in ('w', 'wrist'):
        return 'wrist'
    if text in ('i', 'index', 'indexfinger'):
        return 'index'
    if text in ('p', 'pinky', 'pinkie'):
        return 'pinky'
    for site in RHI_TEMP_SITES:
        if site in text:
            return site
    return ''


def _extract_timepoint(*values):
    text = ' '.join(str(v or '') for v in values).lower()
    match = re.search(r'(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds)\b', text)
    if match:
        minutes = float(match.group(1))
        seconds = float(match.group(2))
        total_minutes = minutes + (seconds / 60)
        return f"{total_minutes:g}m"
    match = re.search(r'(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\b', text)
    if match:
        return f"{match.group(1)}m"
    match = re.search(r'\b(\d+):([0-5]\d)\b', text)
    if match:
        return f"{match.group(1)}:{match.group(2)}"
    match = re.search(r'\b(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)\b', text)
    if match:
        return f"{match.group(1)}s"
    match = re.search(r'\b([5-7](?:\.\d+)?)\b', text)
    if match:
        return f"{match.group(1)}m"
    return ''


def _new_rhi_temp_record(participant_id, condition, site, timepoint, temperature,
                         session_number='', participant_metadata=None, notes='',
                         source='manual', collector=''):
    participant_metadata = participant_metadata or {}
    return {
        'id': str(uuid.uuid4()),
        'participant_id': str(participant_id or '').strip(),
        'session': str(session_number or '').strip(),
        'condition': condition,
        'site': site,
        'timepoint': str(timepoint or '').strip(),
        'temperature': float(temperature),
        'participant_name': str(participant_metadata.get('name') or '').strip(),
        'age': str(participant_metadata.get('age') or '').strip(),
        'sex': str(participant_metadata.get('sex') or '').strip(),
        'who_note': str(participant_metadata.get('who_note') or '').strip(),
        'description': str(participant_metadata.get('description') or '').strip(),
        'participant_note': str(participant_metadata.get('note') or '').strip(),
        'question_1': str(participant_metadata.get('question_1') or '').strip(),
        'question_2': str(participant_metadata.get('question_2') or '').strip(),
        'question_3': str(participant_metadata.get('question_3') or '').strip(),
        'question_4': str(participant_metadata.get('question_4') or '').strip(),
        'question_5': str(participant_metadata.get('question_5') or '').strip(),
        'question_6': str(participant_metadata.get('question_6') or '').strip(),
        'question_7': str(participant_metadata.get('question_7') or '').strip(),
        'question_8': str(participant_metadata.get('question_8') or '').strip(),
        'question_9': str(participant_metadata.get('question_9') or '').strip(),
        'notes': str(notes or '').strip(),
        'source': str(source or 'manual').strip(),
        'collector': str(collector or '').strip(),
        'created_at': datetime.utcnow().isoformat(timespec='seconds') + 'Z',
    }


def _append_rhi_temp_records(records):
    if not records:
        return
    _ensure_rhi_temp_dir()
    path = _rhi_temp_path()
    with open(path, 'a') as f:
        for record in records:
            f.write(json.dumps(record, separators=(',', ':')) + '\n')
        f.flush()
        os.fsync(f.fileno())
    dir_fd = os.open(_rhi_temp_dir(), os.O_DIRECTORY)
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)


def _load_rhi_temp_records():
    path = _rhi_temp_path()
    if not os.path.exists(path):
        return []
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict):
                records.append(record)
    return records


def _clear_rhi_temp_records():
    path = _rhi_temp_path()
    if os.path.exists(path):
        os.remove(path)
        dir_fd = os.open(_rhi_temp_dir(), os.O_DIRECTORY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)


def _summarize_rhi_temp(records):
    participants = sorted({r.get('participant_id') for r in records if r.get('participant_id')})
    sites = sorted({r.get('site') for r in records if r.get('site')})
    timepoints = sorted({r.get('timepoint') for r in records if r.get('timepoint')})
    values = {}
    for record in records:
        key = (
            record.get('participant_id'),
            record.get('site'),
            record.get('timepoint'),
            record.get('condition'),
        )
        values.setdefault(key, []).append(float(record.get('temperature', 0)))

    means = {key: sum(vals) / len(vals) for key, vals in values.items() if vals}
    diffs = []
    for participant_id in participants:
        for site in sites:
            for timepoint in timepoints:
                control = means.get((participant_id, site, timepoint, 'control'))
                rhi = means.get((participant_id, site, timepoint, 'rhi'))
                if control is None or rhi is None:
                    continue
                diffs.append({
                    'participant_id': participant_id,
                    'site': site,
                    'timepoint': timepoint,
                    'difference': control - rhi,
                })

    grouped = {}
    for diff in diffs:
        key = (diff['site'], diff['timepoint'])
        grouped.setdefault(key, []).append(diff['difference'])

    mean_difference = []
    for (site, timepoint), vals in sorted(grouped.items()):
        mean_difference.append({
            'site': site,
            'timepoint': timepoint,
            'n': len(vals),
            'mean_difference': sum(vals) / len(vals),
        })

    return {
        'record_count': len(records),
        'participant_count': len(participants),
        'participants': participants,
        'sites': sites,
        'timepoints': timepoints,
        'mean_difference': mean_difference,
    }


def _is_truthy(value):
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in ('true', 'yes', 'y', '1', 'exclude', 'excluded')


def _participant_metadata_from_rows(headers, rows):
    metadata = {}
    if not headers:
        return metadata
    for values in rows:
        row = {
            str(header or '').strip(): values[idx] if idx < len(values) else ''
            for idx, header in enumerate(headers)
            if str(header or '').strip()
        }
        subject = str(_find_row_value(row, ('subject', 'participant_id', 'participant', 'user_id')) or '').strip()
        if not subject:
            continue
        item = {
            'subject': subject,
            'exclude': _is_truthy(_find_row_value(row, ('exclude',))),
            'name': _find_row_value(row, ('name',)),
            'age': _find_row_value(row, ('age',)),
            'sex': _find_row_value(row, ('sex',)),
            'who_note': _find_row_value(row, ('who note', 'who_note')),
            'description': _find_row_value(row, ('description of what they felt', 'description')),
            'note': _find_row_value(row, ('note',)),
        }
        for idx in range(1, 10):
            item[f'question_{idx}'] = _find_row_value(row, (f'question {idx}', f'question_{idx}', f'q{idx}'))
        metadata[subject] = item
    return metadata


def _parse_rhi_temp_rows(headers, rows, collector='', source='csv', participant_metadata=None):
    if not headers:
        return []

    participant_metadata = participant_metadata or {}
    records = []
    metadata_headers = {
        'subject', 'age', 'session', 'trial', 'position', 'averagetemp',
        'average', 'difference', 'whattimedidtheyfeeltheillusion'
    }
    for row_index, values in enumerate(rows, start=2):
        row = {
            str(header or '').strip(): values[idx] if idx < len(values) else ''
            for idx, header in enumerate(headers)
            if str(header or '').strip()
        }
        participant_id = _find_row_value(row, ('participant_id', 'participant', 'user', 'user_id', 'subject', 'subject_id', 'id', 'Subject')) or f"row-{row_index}"
        metadata = participant_metadata.get(str(participant_id).strip(), {})
        if metadata.get('exclude'):
            continue
        session_number = _find_row_value(row, ('session', 'session_number', 'session_id', 'Session'))
        row_condition = _normalize_condition(_find_row_value(row, ('condition', 'trial_condition', 'group')))
        if not row_condition:
            row_condition = _normalize_condition(_find_row_value(row, ('trial', 'Trial')))
        row_site = _normalize_site(_find_row_value(row, ('site', 'body_site', 'location', 'position', 'Position')))
        row_timepoint = _find_row_value(row, ('timepoint', 'time', 'minute', 'minutes', 'timestamp'))
        row_temp = _parse_temperature(_find_row_value(row, ('temperature', 'temp', 'value', 'reading')))
        notes = _find_row_value(row, ('notes', 'note', 'comment', 'comments'))

        if row_temp is not None and row_condition and row_site:
            records.append(_new_rhi_temp_record(
                participant_id, row_condition, row_site, row_timepoint,
                row_temp, session_number=session_number, participant_metadata=metadata,
                notes=notes, source=source, collector=collector
            ))
            continue

        for header, value in row.items():
            clean_header = _clean_key(header)
            if clean_header in metadata_headers:
                continue
            temp = _parse_temperature(value)
            if temp is None:
                continue
            condition = _normalize_condition(header) or row_condition
            site = _normalize_site(header) or row_site
            timepoint = _extract_timepoint(header) or str(row_timepoint or '').strip()
            if not timepoint:
                continue
            if not (condition and site):
                continue
            records.append(_new_rhi_temp_record(
                participant_id, condition, site, timepoint, temp,
                session_number=session_number, participant_metadata=metadata,
                notes=notes, source=source, collector=collector
            ))
    return records


def _parse_google_sheet_url(sheet_url):
    parsed = urlparse(str(sheet_url or '').strip())
    if parsed.scheme not in ('http', 'https') or parsed.netloc != 'docs.google.com':
        raise ValueError('Enter a Google Sheets URL from docs.google.com')
    match = re.search(r'/spreadsheets/d/([^/]+)', parsed.path)
    if not match:
        raise ValueError('Could not find the spreadsheet id in that URL')
    sheet_id = match.group(1)
    params = parse_qs(parsed.query)
    gid = (params.get('gid') or ['0'])[0]
    return sheet_id, gid


def _parse_rhi_temp_csv(text, collector='', source='csv'):
    stream = io.StringIO(text, newline='')
    reader = csv.reader(stream)
    try:
        headers = next(reader)
    except StopIteration:
        return []
    return _parse_rhi_temp_rows(headers, list(reader), collector=collector, source=source)


def _load_google_service_account():
    if GOOGLE_SERVICE_ACCOUNT_JSON:
        try:
            return json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
        except json.JSONDecodeError:
            raise RuntimeError('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON')
    if GOOGLE_APPLICATION_CREDENTIALS:
        with open(GOOGLE_APPLICATION_CREDENTIALS) as f:
            return json.load(f)
    local_credentials = os.path.join(app.root_path, 'api.googlekey.json')
    if os.path.exists(local_credentials):
        with open(local_credentials) as f:
            return json.load(f)
    return None


def _google_sheets_auth():
    if GOOGLE_SHEETS_API_KEY:
        return {}, {'key': GOOGLE_SHEETS_API_KEY}

    service_account = _load_google_service_account()
    if not service_account:
        raise PermissionError(
            'Google Sheets API credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON '
            'or GOOGLE_APPLICATION_CREDENTIALS for a service account, then share this sheet with that service account email.'
        )

    token = _google_service_account_token(service_account)
    return {'Authorization': f'Bearer {token}'}, {}


def _google_service_account_token(service_account):
    global _GOOGLE_TOKEN_CACHE, _GOOGLE_TOKEN_EXP
    import time
    now = int(time.time())
    if _GOOGLE_TOKEN_CACHE and now < _GOOGLE_TOKEN_EXP - 60:
        return _GOOGLE_TOKEN_CACHE
    if not jwt:
        raise RuntimeError('python-jose is required for Google service account auth')
    client_email = service_account.get('client_email')
    private_key = service_account.get('private_key')
    if not client_email or not private_key:
        raise RuntimeError('Google service account JSON must include client_email and private_key')
    claims = {
        'iss': client_email,
        'scope': 'https://www.googleapis.com/auth/spreadsheets.readonly',
        'aud': 'https://oauth2.googleapis.com/token',
        'iat': now,
        'exp': now + 3600,
    }
    assertion = jwt.encode(claims, private_key, algorithm='RS256')
    resp = requests.post(
        'https://oauth2.googleapis.com/token',
        data={
            'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion': assertion,
        },
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    _GOOGLE_TOKEN_CACHE = data.get('access_token')
    _GOOGLE_TOKEN_EXP = now + int(data.get('expires_in', 3600))
    return _GOOGLE_TOKEN_CACHE


def _google_service_account_email():
    try:
        service_account = _load_google_service_account()
    except Exception:
        return ''
    if not service_account:
        return ''
    return service_account.get('client_email') or ''


def _fetch_google_sheet_values(sheet_url):
    if not requests:
        raise RuntimeError('requests is not available')
    sheet_id, gid = _parse_google_sheet_url(sheet_url)
    headers, params = _google_sheets_auth()
    meta_url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}"
    meta_resp = requests.get(
        meta_url,
        headers=headers,
        params={**params, 'fields': 'sheets(properties(sheetId,title))'},
        timeout=20,
    )
    meta_resp.raise_for_status()
    metadata = meta_resp.json()
    sheets = metadata.get('sheets') or []
    selected_title = ''
    for sheet in sheets:
        props = sheet.get('properties') or {}
        if str(props.get('sheetId')) == str(gid):
            selected_title = props.get('title') or ''
            break
    if not selected_title:
        for sheet in sheets:
            props = sheet.get('properties') or {}
            if props.get('title') == 'exp 1 Data':
                selected_title = props.get('title') or ''
                break
    if not selected_title:
        selected_title = (sheets[0].get('properties') or {}).get('title') if sheets else ''
    if not selected_title:
        raise ValueError('No readable tabs found in that Google Sheet')

    range_name = quote(selected_title, safe='')
    values_url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{range_name}"
    values_resp = requests.get(
        values_url,
        headers=headers,
        params={**params, 'majorDimension': 'ROWS', 'valueRenderOption': 'UNFORMATTED_VALUE'},
        timeout=20,
    )
    values_resp.raise_for_status()
    values = values_resp.json().get('values') or []
    if not values:
        return [], [], selected_title
    return values[0], values[1:], selected_title


def _fetch_google_participant_metadata(sheet_url):
    if not requests:
        return {}
    sheet_id, _ = _parse_google_sheet_url(sheet_url)
    headers, params = _google_sheets_auth()
    for title in ('Partipants', 'Participants'):
        values_url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{quote(title, safe='')}"
        response = requests.get(
            values_url,
            headers=headers,
            params={**params, 'majorDimension': 'ROWS', 'valueRenderOption': 'UNFORMATTED_VALUE'},
            timeout=20,
        )
        if response.status_code == 404:
            continue
        response.raise_for_status()
        values = response.json().get('values') or []
        if not values:
            return {}
        # Row 2 contains question text; row 1 contains machine-friendly labels.
        return _participant_metadata_from_rows(values[0], values[2:] if len(values) > 2 else values[1:])
    return {}


@app.get('/research')
@require_results_auth
def research_page():
    return send_from_directory(os.path.join(app.root_path, 'static', 'research'), 'index.html')


@app.get('/research/')
@require_results_auth
def research_page_slash():
    return research_page()


@app.get('/research/RHITemp')
@require_results_auth
def rhi_temp_page():
    return send_from_directory(os.path.join(app.root_path, 'static', 'research', 'RHITemp'), 'index.html')


@app.get('/research/RHITemp/')
@require_results_auth
def rhi_temp_page_slash():
    return rhi_temp_page()


@app.get('/research/<path:filename>')
@require_results_auth
def research_assets(filename):
    base_dir = os.path.join(app.root_path, 'static', 'research')
    return send_from_directory(base_dir, filename)


@app.get('/api/research/rhi-temp/data')
@require_results_auth
def rhi_temp_data():
    records = _load_rhi_temp_records()
    return jsonify({
        'status': 'ok',
        'records': records,
        'summary': _summarize_rhi_temp(records),
    })


@app.post('/api/research/rhi-temp/clear')
@require_results_auth
def rhi_temp_clear():
    _clear_rhi_temp_records()
    records = []
    return jsonify({
        'status': 'ok',
        'cleared': True,
        'records': records,
        'summary': _summarize_rhi_temp(records),
    })


@app.post('/api/research/rhi-temp/entry')
@require_results_auth
def rhi_temp_entry():
    body = request.get_json(silent=True) or {}
    user = session.get('user') or {}
    collector = user.get('email') or user.get('name') or user.get('sub') or ''
    participant_id = body.get('participant_id') or body.get('participant') or body.get('user_id')
    session_number = body.get('session') or body.get('session_number') or ''
    condition_order = body.get('condition_order') or {}
    timepoint = body.get('timepoint') or body.get('time') or ''
    notes = body.get('notes') or ''
    readings = body.get('readings') or {}
    records = []

    for condition in RHI_TEMP_CONDITIONS:
        condition_values = readings.get(condition, {}) if isinstance(readings, dict) else {}
        for site in RHI_TEMP_SITES:
            value = condition_values.get(site) if isinstance(condition_values, dict) else None
            order = condition_order.get(condition) if isinstance(condition_order, dict) else ''
            order = order or session_number
            if isinstance(value, dict):
                for reading_timepoint, reading_value in value.items():
                    temp = _parse_temperature(reading_value)
                    if temp is None:
                        continue
                    records.append(_new_rhi_temp_record(
                        participant_id, condition, site, reading_timepoint, temp,
                        session_number=order, notes=notes, source='manual', collector=collector
                    ))
                continue
            if value is None:
                value = body.get(f"{condition}_{site}")
            temp = _parse_temperature(value)
            if temp is None:
                continue
            records.append(_new_rhi_temp_record(
                participant_id, condition, site, timepoint, temp,
                session_number=order, notes=notes, source='manual', collector=collector
            ))

    if not participant_id:
        return jsonify({"status": "error", "error": "participant_id is required"}), 400
    if not records:
        return jsonify({"status": "error", "error": "no valid temperatures supplied"}), 400

    _append_rhi_temp_records(records)
    all_records = _load_rhi_temp_records()
    return jsonify({
        'status': 'ok',
        'added': len(records),
        'records': all_records,
        'summary': _summarize_rhi_temp(all_records),
    })


@app.post('/api/research/rhi-temp/import-csv')
@require_results_auth
def rhi_temp_import_csv():
    user = session.get('user') or {}
    collector = user.get('email') or user.get('name') or user.get('sub') or ''
    csv_text = ''
    if 'file' in request.files:
        csv_text = request.files['file'].read().decode('utf-8-sig')
    else:
        body = request.get_json(silent=True) or {}
        csv_text = body.get('csv') or ''
    if not csv_text.strip():
        return jsonify({"status": "error", "error": "CSV data is required"}), 400

    records = _parse_rhi_temp_csv(csv_text, collector=collector)
    if not records:
        return jsonify({"status": "error", "error": "no RHI temperature rows found"}), 400
    _append_rhi_temp_records(records)
    all_records = _load_rhi_temp_records()
    return jsonify({
        'status': 'ok',
        'imported': len(records),
        'records': all_records,
        'summary': _summarize_rhi_temp(all_records),
    })


@app.post('/api/research/rhi-temp/import-sheet')
@require_results_auth
def rhi_temp_import_sheet():
    user = session.get('user') or {}
    collector = user.get('email') or user.get('name') or user.get('sub') or ''
    body = request.get_json(silent=True) or {}
    sheet_url = body.get('url') or body.get('sheet_url') or ''
    if not str(sheet_url).strip():
        return jsonify({"status": "error", "error": "Google Sheet URL is required"}), 400

    try:
        headers, rows, sheet_title = _fetch_google_sheet_values(sheet_url)
        participant_metadata = _fetch_google_participant_metadata(sheet_url)
    except PermissionError as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "service_account_email": _google_service_account_email(),
        }), 400
    except ValueError as e:
        return jsonify({"status": "error", "error": str(e)}), 400
    except Exception as e:
        if requests and isinstance(e, requests.HTTPError):
            status_code = getattr(e.response, 'status_code', None)
            service_account_email = _google_service_account_email()
            message = "Google Sheets API request failed"
            if status_code in (401, 403):
                message = "Google Sheets API does not have access to this sheet"
            return jsonify({
                "status": "error",
                "error": message,
                "upstream_status": status_code,
                "service_account_email": service_account_email,
            }), 502
        app.logger.exception('google sheet import failed')
        return jsonify({"status": "error", "error": "Google Sheet import failed"}), 500

    records = _parse_rhi_temp_rows(
        headers,
        rows,
        collector=collector,
        source='google-sheet',
        participant_metadata=participant_metadata,
    )
    if not records:
        return jsonify({
            "status": "error",
            "error": "No RHI temperature rows found in the Google Sheet tab",
            "sheet_title": sheet_title,
        }), 400
    _append_rhi_temp_records(records)
    all_records = _load_rhi_temp_records()
    return jsonify({
        'status': 'ok',
        'imported': len(records),
        'excluded': len([m for m in participant_metadata.values() if m.get('exclude')]),
        'sheet_title': sheet_title,
        'records': all_records,
        'summary': _summarize_rhi_temp(all_records),
    })


@app.get('/api/research/rhi-temp/export.csv')
@require_results_auth
def rhi_temp_export_csv():
    records = _load_rhi_temp_records()
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=RHI_TEMP_CSV_FIELDS, extrasaction='ignore')
    writer.writeheader()
    for record in records:
        writer.writerow(record)
    resp = Response(buf.getvalue(), mimetype='text/csv')
    ts = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    resp.headers['Content-Disposition'] = f'attachment; filename="rhi-temp-{ts}.csv"'
    return resp


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
    files, total_count = _list_files(
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
    return jsonify({"count": len(files), "total_count": total_count, "files": files})


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
    # Use a large max_files limit by default for zips, ignoring UI pagination
    max_files = int(q.get('max_files', 10000))
    files, total_count = _list_files(
        pattern=q.get('pattern'),
        ext=q.get('ext', '.json'),
        sort=q.get('sort', 'date'),
        order=q.get('order', 'desc'),
        limit=max_files,
        offset=0,
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
