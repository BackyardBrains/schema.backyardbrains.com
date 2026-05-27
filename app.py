# /var/www/schema.backyardbrains.com/app.py
from flask import Flask, request, jsonify, Response, send_from_directory
from flask import redirect, url_for, session
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from datetime import datetime
import os, json, fnmatch, csv, re, uuid, math, wave, struct
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
LOCAL_AUTH_BYPASS = os.environ.get('LOCAL_AUTH_BYPASS', '').lower() in ('1', 'true', 'yes')

# Flask session config (required for server-side login)
app.secret_key = os.environ.get('SECRET_KEY', os.environ.get('FLASK_SECRET_KEY', 'dev-insecure'))
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', 'true').lower() not in ('0', 'false', 'no')

_JWKS_CACHE = None
_MGMT_TOKEN_CACHE = None
_MGMT_TOKEN_EXP = 0
_GOOGLE_TOKEN_CACHE = None
_GOOGLE_TOKEN_EXP = 0
_GOOGLE_SCOPE_TOKEN_CACHE = {}

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
        if LOCAL_AUTH_BYPASS and request.remote_addr in ('127.0.0.1', '::1', 'localhost'):
            session.setdefault('user', {'email': 'local-preview@backyardbrains.com', 'name': 'Local Preview'})
            return func(*args, **kwargs)

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
                    'difference': rhi - control,
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


# ---- RESEARCH: Grab-nose proprioception data collection and viewer ----
GRAB_NOSE_CSV_FIELDS = (
    'participant_id', 'participant_name', 'age', 'sex', 'starting_angle',
    'ending_angle', 'angle_difference', 'attempts', 'location', 'comments',
    'source', 'collector', 'created_at'
)
GRAB_NOSE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/13FRF6_zxYc20K1N2sfxAXrXpJCjtyUGvLms9Lrq8_u4/edit?gid=0#gid=0'


def _grab_nose_dir():
    return os.path.join(UPLOAD_DIRECTORY, 'research', 'grab-nose')


def _grab_nose_path():
    return os.path.join(_grab_nose_dir(), 'records.jsonl')


def _ensure_grab_nose_dir():
    os.makedirs(_grab_nose_dir(), exist_ok=True)


def _parse_number(value):
    parsed = _parse_temperature(value)
    return parsed


def _parse_attempts(value):
    parsed = _parse_number(value)
    return int(parsed) if parsed is not None else None


def _parse_grab_nose_subject(value, index=0):
    text = str(value or '').strip()
    match = re.search(r'\(([^)]*)\)', text)
    name = re.sub(r'\s*\([^)]*\)\s*', ' ', text).strip() or f'Participant {index + 1}'
    age = ''
    sex = ''
    if match:
        details = match.group(1)
        age_match = re.search(r'\b(\d{1,3})\b', details)
        sex_match = re.search(r'\b([mMfF])\b', details)
        if age_match:
            age = age_match.group(1)
        if sex_match:
            sex = sex_match.group(1).upper()
    participant_id = re.sub(r'[^A-Za-z0-9]+', '-', name).strip('-').lower() or f'participant-{index + 1}'
    return participant_id, name, age, sex


def _new_grab_nose_record(participant_id, participant_name, starting_angle, ending_angle,
                          angle_difference=None, attempts=None, age='', sex='',
                          location='', comments='', source='manual', collector=''):
    start = _parse_number(starting_angle)
    end = _parse_number(ending_angle)
    diff = _parse_number(angle_difference)
    if start is None or end is None:
        return None
    if diff is None:
        diff = end - start
    return {
        'id': str(uuid.uuid4()),
        'participant_id': str(participant_id or participant_name or '').strip(),
        'participant_name': str(participant_name or participant_id or '').strip(),
        'age': str(age or '').strip(),
        'sex': str(sex or '').strip(),
        'starting_angle': float(start),
        'ending_angle': float(end),
        'angle_difference': float(diff),
        'attempts': _parse_attempts(attempts),
        'location': str(location or '').strip(),
        'comments': str(comments or '').strip(),
        'source': str(source or 'manual').strip(),
        'collector': str(collector or '').strip(),
        'created_at': datetime.utcnow().isoformat(timespec='seconds') + 'Z',
    }


def _append_grab_nose_records(records):
    if not records:
        return
    _ensure_grab_nose_dir()
    path = _grab_nose_path()
    with open(path, 'a') as f:
        for record in records:
            f.write(json.dumps(record, separators=(',', ':')) + '\n')
        f.flush()
        os.fsync(f.fileno())
    dir_fd = os.open(_grab_nose_dir(), os.O_DIRECTORY)
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)


def _load_grab_nose_records():
    path = _grab_nose_path()
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


def _clear_grab_nose_records():
    path = _grab_nose_path()
    if os.path.exists(path):
        os.remove(path)
        dir_fd = os.open(_grab_nose_dir(), os.O_DIRECTORY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)


def _parse_grab_nose_rows(headers, rows, collector='', source='google-sheet'):
    records = []
    for index, row_values in enumerate(rows):
        row = {str(headers[i] if i < len(headers) else f'column_{i + 1}'): row_values[i]
               for i in range(len(row_values))}
        subject = _find_row_value(row, ('Subject', 'Participant', 'Name'))
        start = _find_row_value(row, ('Starting Angle', 'Start Angle', 'Before Angle', 'Before'))
        end = _find_row_value(row, ('Ending Angle', 'End Angle', 'After Angle', 'After'))
        if not subject and _parse_number(start) is None and _parse_number(end) is None:
            continue
        participant_id, name, age, sex = _parse_grab_nose_subject(subject, index)
        record = _new_grab_nose_record(
            participant_id,
            name,
            start,
            end,
            angle_difference=_find_row_value(row, ('Angle Difference', 'Difference', 'Change')),
            attempts=_find_row_value(row, ('Amount of attempts to grab nose', 'Attempts', 'Nose Attempts')),
            age=age,
            sex=sex,
            location=_find_row_value(row, ('Location', 'Place')),
            comments=_find_row_value(row, ('Comments: ', 'Comments', 'Comment', 'Notes')),
            source=source,
            collector=collector,
        )
        if record:
            records.append(record)
    return records


def _parse_structured_grab_nose_rows(data_headers, data_rows, participant_headers, participant_rows,
                                    collector='', source='google-sheet'):
    participants = {}
    for index, row_values in enumerate(participant_rows):
        row = {str(participant_headers[i] if i < len(participant_headers) else f'column_{i + 1}'): row_values[i]
               for i in range(len(row_values))}
        subject_id = str(_find_row_value(row, ('Subject ID', 'Subject', 'ID')) or index + 1).strip()
        if not subject_id:
            continue
        name = str(_find_row_value(row, ('Name', 'Participant')) or '').strip()
        if not name:
            name = f'Subject {subject_id}'
        participants[subject_id] = {
            'subject_id': subject_id,
            'participant_id': f'subject-{subject_id}',
            'participant_name': name,
            'age': _find_row_value(row, ('Age',)),
            'sex': _find_row_value(row, ('Sex',)),
            'attempts': _find_row_value(row, ('Attempts', 'Amount of attempts to grab nose')),
            'location': _find_row_value(row, ('Location', 'Place')),
            'comments': _find_row_value(row, ('Comments', 'Comments: ', 'Comment', 'Notes')),
        }

    records = []
    for index, row_values in enumerate(data_rows):
        row = {str(data_headers[i] if i < len(data_headers) else f'column_{i + 1}'): row_values[i]
               for i in range(len(row_values))}
        subject_id = str(_find_row_value(row, ('Subject ID', 'Subject', 'ID')) or '').strip()
        if not subject_id:
            continue
        participant = participants.get(subject_id, {
            'participant_id': f'subject-{subject_id}',
            'participant_name': f'Subject {subject_id}',
            'age': '',
            'sex': '',
            'attempts': None,
            'location': '',
            'comments': '',
        })
        record = _new_grab_nose_record(
            participant.get('participant_id'),
            participant.get('participant_name'),
            _find_row_value(row, ('Starting Angle', 'Start', 'Start Angle', 'Before Angle', 'Before')),
            _find_row_value(row, ('Ending Angle', 'End', 'End Angle', 'After Angle', 'After')),
            angle_difference=_find_row_value(row, ('Angle Difference', 'Change', 'Difference')),
            attempts=_find_row_value(row, ('Grab Attempts', 'Attempts', 'Nose Attempts')) or participant.get('attempts'),
            age=participant.get('age'),
            sex=participant.get('sex'),
            location=participant.get('location'),
            comments=participant.get('comments'),
            source=source,
            collector=collector,
        )
        if record:
            record['subject_id'] = subject_id
            records.append(record)
    return records


def _summarize_grab_nose(records):
    locations = sorted({r.get('location') for r in records if r.get('location')})
    diffs = [float(r.get('angle_difference')) for r in records if r.get('angle_difference') is not None]
    attempts = [int(r.get('attempts')) for r in records if r.get('attempts') is not None]
    positive = [value for value in diffs if value > 0]
    mean_diff = sum(diffs) / len(diffs) if diffs else None
    if len(diffs) > 1 and mean_diff is not None:
        variance = sum((value - mean_diff) ** 2 for value in diffs) / (len(diffs) - 1)
        sd_diff = variance ** 0.5
    else:
        sd_diff = 0 if diffs else None
    return {
        'record_count': len(records),
        'participant_count': len({r.get('participant_id') for r in records if r.get('participant_id')}),
        'locations': locations,
        'mean_angle_difference': mean_diff,
        'sd_angle_difference': sd_diff,
        'mean_attempts': sum(attempts) / len(attempts) if attempts else None,
        'positive_difference_count': len(positive),
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


def _google_sheet_values_range(title):
    escaped_title = str(title or '').replace("'", "''")
    return quote(f"'{escaped_title}'!A:ZZ", safe='')


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


def _google_service_account_token_for_scope(service_account, scope):
    global _GOOGLE_SCOPE_TOKEN_CACHE
    import time
    now = int(time.time())
    cache_entry = _GOOGLE_SCOPE_TOKEN_CACHE.get(scope)
    if cache_entry and now < cache_entry.get('exp', 0) - 60:
        return cache_entry.get('token')
    if not jwt:
        raise RuntimeError('python-jose is required for Google service account auth')
    client_email = service_account.get('client_email')
    private_key = service_account.get('private_key')
    if not client_email or not private_key:
        raise RuntimeError('Google service account JSON must include client_email and private_key')
    claims = {
        'iss': client_email,
        'scope': scope,
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
    token = data.get('access_token')
    _GOOGLE_SCOPE_TOKEN_CACHE[scope] = {
        'token': token,
        'exp': now + int(data.get('expires_in', 3600))
    }
    return token


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

    range_name = _google_sheet_values_range(selected_title)
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


def _fetch_google_sheet_tab_values(sheet_url, title):
    if not requests:
        raise RuntimeError('requests is not available')
    sheet_id, _ = _parse_google_sheet_url(sheet_url)
    headers, params = _google_sheets_auth()
    values_url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{_google_sheet_values_range(title)}"
    response = requests.get(
        values_url,
        headers=headers,
        params={**params, 'majorDimension': 'ROWS', 'valueRenderOption': 'UNFORMATTED_VALUE'},
        timeout=20,
    )
    response.raise_for_status()
    values = response.json().get('values') or []
    if not values:
        return [], []
    return values[0], values[1:]


def _fetch_grab_nose_sheet_records(sheet_url=GRAB_NOSE_SHEET_URL):
    data_headers, data_rows = _fetch_google_sheet_tab_values(sheet_url, 'Data')
    participant_headers, participant_rows = _fetch_google_sheet_tab_values(sheet_url, 'Participants')
    records = _parse_structured_grab_nose_rows(data_headers, data_rows, participant_headers, participant_rows)
    if records:
        return records
    return _parse_grab_nose_rows(data_headers, data_rows)


def _fetch_google_participant_metadata(sheet_url):
    if not requests:
        return {}
    sheet_id, _ = _parse_google_sheet_url(sheet_url)
    headers, params = _google_sheets_auth()
    for title in ('Partipants', 'Participants'):
        values_url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{_google_sheet_values_range(title)}"
        response = requests.get(
            values_url,
            headers=headers,
            params={**params, 'majorDimension': 'ROWS', 'valueRenderOption': 'UNFORMATTED_VALUE'},
            timeout=20,
        )
        if response.status_code in (400, 404):
            continue
        response.raise_for_status()
        values = response.json().get('values') or []
        if not values:
            return {}
        # Row 2 contains question text; row 1 contains machine-friendly labels.
        return _participant_metadata_from_rows(values[0], values[2:] if len(values) > 2 else values[1:])
    return {}


# ---- RESEARCH: RHI Temperature (hand + foot follow-up; Experiment 4) ----
RHI_HF_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1DY7DoEd7KOQ6fqQpQNmbxy2GjwJC5B3tqmHr9GgOFMA/edit'
RHI_HF_DATA_TAB = 'Exp 1 Data'
RHI_HF_VIVIDNESS_TAB = '[RHI] Vividness data'
RHI_HF_LOCATIONAL_TAB = 'Locational Table Temperature'
RHI_HF_PARTICIPANTS_TAB = 'Participants'

RHI_HF_CONDITIONS = ['ctrl1', 'rhi', 'ctrl2']
RHI_HF_SITES = ['hand', 'foot']

# 30 readings per condition, every 10 seconds for 5 minutes.
RHI_HF_TIMEPOINTS_S = [i * 10 for i in range(1, 31)]

# Per the methods: 60-second epoch means at 90-150s and 240-300s of each condition.
RHI_HF_EPOCHS_S = [(90, 150), (240, 300)]


def _rhi_hf_seconds_from_header(value):
    text = str(value or '').strip().lower()
    if not text:
        return None
    m = re.match(r'^(\d+)\s*min\s*(\d+)\s*sec\s*$', text)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    m = re.match(r'^(\d+)\s*min\s*$', text)
    if m:
        return int(m.group(1)) * 60
    m = re.match(r'^(\d+)\s*sec\s*$', text)
    if m:
        return int(m.group(1))
    return None


def _rhi_hf_normalize_position(value):
    text = _clean_key(value)
    if text in ('hand', 'righthand', 'backhand'):
        return 'hand'
    # The source sheet labels the lower-body site "leg"; the published methods
    # call it "foot" (anterior right ankle). Surface the methods' term.
    if text in ('leg', 'foot', 'ankle', 'rightleg', 'rightfoot', 'rightankle'):
        return 'foot'
    return ''


def _rhi_hf_condition_from_trial(trial_value):
    text = str(trial_value or '').strip()
    if text == '1':
        return 'ctrl1'
    if text == '2':
        return 'rhi'
    if text == '3':
        return 'ctrl2'
    return ''


def _rhi_hf_meta_for(subject, participants_by_subject):
    if not subject:
        return {}
    direct = participants_by_subject.get(subject)
    if direct:
        return direct
    target = _clean_key(subject)
    if not target:
        return {}
    for meta in participants_by_subject.values():
        name = str(meta.get('name') or '').strip()
        if not name:
            continue
        if _clean_key(name) == target:
            return meta
        first = name.split()[0] if name.split() else ''
        if first and _clean_key(first) == target:
            return meta
    return {}


def _parse_rhi_hf_data_rows(headers, rows, participants_by_subject=None):
    if not headers or not rows:
        return []
    participants_by_subject = participants_by_subject or {}
    header_names = [str(h or '').strip() for h in headers]
    time_columns = [(idx, sec) for idx, h in enumerate(header_names)
                    for sec in [_rhi_hf_seconds_from_header(h)] if sec is not None]
    col = {h.lower(): idx for idx, h in enumerate(header_names) if h}
    subject_col = col.get('subject')
    session_col = col.get('session')
    trial_col = col.get('trial')
    position_col = col.get('position')
    if subject_col is None or trial_col is None or position_col is None or not time_columns:
        return []

    records = []
    for values in rows:
        if not values:
            continue
        subject = str(values[subject_col] if subject_col < len(values) else '' or '').strip()
        if not subject or subject.lower() == 'subject':
            continue
        condition = _rhi_hf_condition_from_trial(values[trial_col] if trial_col < len(values) else '')
        if not condition:
            continue
        site = _rhi_hf_normalize_position(values[position_col] if position_col < len(values) else '')
        if not site:
            continue
        meta = _rhi_hf_meta_for(subject, participants_by_subject)
        if meta.get('exclude'):
            continue
        session_val = values[session_col] if (session_col is not None and session_col < len(values)) else ''
        for idx, seconds in time_columns:
            raw = values[idx] if idx < len(values) else None
            temp = _parse_temperature(raw)
            if temp is None:
                continue
            records.append({
                'participant_id': subject,
                'participant_name': str(meta.get('name') or '').strip() or subject,
                'condition': condition,
                'session': str(session_val or '').strip(),
                'site': site,
                'time_s': seconds,
                'temperature_f': temp,
            })
    return records


def _build_rhi_hf_canonical_subject_lookup(temp_records):
    lookup = {}
    for r in temp_records:
        sid = r.get('participant_id')
        if not sid:
            continue
        keys = {_clean_key(sid)}
        parts = sid.split()
        if parts:
            keys.add(_clean_key(parts[0]))
        for k in keys:
            if k and k not in lookup:
                lookup[k] = sid
    return lookup


def _parse_rhi_hf_vividness_rows(headers, rows, temp_records, participants_by_subject=None):
    if not headers or not rows:
        return []
    participants_by_subject = participants_by_subject or {}
    header_names = [str(h or '').strip() for h in headers]
    time_columns = [(idx, sec) for idx, h in enumerate(header_names)
                    for sec in [_rhi_hf_seconds_from_header(h)] if sec is not None]
    if not time_columns:
        return []
    canonical = _build_rhi_hf_canonical_subject_lookup(temp_records)

    records = []
    for values in rows:
        if not values:
            continue
        subject_text = str(values[0] or '').strip()
        if not subject_text or subject_text.lower() == 'subject':
            continue
        canonical_id = canonical.get(_clean_key(subject_text)) or subject_text
        meta = _rhi_hf_meta_for(canonical_id, participants_by_subject)
        if meta.get('exclude'):
            continue
        for idx, seconds in time_columns:
            raw = values[idx] if idx < len(values) else None
            if raw is None or raw == '':
                continue
            try:
                rating = float(raw)
            except (TypeError, ValueError):
                continue
            # Sheet uses a 0-10 scale; clamp the occasional 11 that slipped in.
            rating = max(0.0, min(10.0, rating))
            records.append({
                'participant_id': canonical_id,
                'participant_name': str(meta.get('name') or '').strip() or canonical_id,
                'time_s': seconds,
                'rating': rating,
            })
    return records


def _parse_rhi_hf_ambient_rows(headers, rows, temp_records, participants_by_subject=None):
    """Parse the 'Locational Table Temperature' tab.

    Each row is a participant with several ambient readings followed by an 'AVG' column
    per condition. There are three 'AVG' columns, one each for ctrl1, rhi, ctrl2 in
    chronological order. Subject codes (e.g. 'CL', 'TS', 'DH') are resolved to the
    canonical participant_id used by the main data tab so callers can join cleanly.
    """
    if not headers or not rows:
        return {}
    participants_by_subject = participants_by_subject or {}
    avg_indices = [i for i, h in enumerate(headers)
                   if str(h or '').strip().upper() == 'AVG']
    if len(avg_indices) < 3:
        return {}
    canonical = _build_rhi_hf_canonical_subject_lookup(temp_records)

    def resolve(code):
        direct = canonical.get(_clean_key(code))
        if direct:
            return direct
        meta = participants_by_subject.get(code) or _rhi_hf_meta_for(code, participants_by_subject)
        if meta:
            name = str(meta.get('name') or '').strip()
            for candidate in (name, name.split()[0] if name.split() else ''):
                resolved = canonical.get(_clean_key(candidate)) if candidate else None
                if resolved:
                    return resolved
        return code

    out = {}
    for values in rows:
        if not values:
            continue
        subject_text = str(values[0] or '').strip()
        if not subject_text or subject_text.lower() == 'subject':
            continue
        try:
            ctrl1_avg = float(values[avg_indices[0]])
            rhi_avg = float(values[avg_indices[1]])
            ctrl2_avg = float(values[avg_indices[2]])
        except (IndexError, TypeError, ValueError):
            continue
        canonical_id = resolve(subject_text)
        out[canonical_id] = {
            'subject_code': subject_text,
            'ctrl1_ambient_f': ctrl1_avg,
            'rhi_ambient_f': rhi_avg,
            'ctrl2_ambient_f': ctrl2_avg,
            'drift_rhi_f': rhi_avg - ctrl1_avg,
            'drift_ctrl2_f': ctrl2_avg - ctrl1_avg,
        }
    return out


def _compute_rhi_hf_epoch_means(temp_records, epochs=RHI_HF_EPOCHS_S):
    grouped = {}
    for r in temp_records:
        ts = r.get('time_s')
        if ts is None:
            continue
        for epoch_index, (start, end) in enumerate(epochs):
            if ts < start or ts > end:
                continue
            key = (r['participant_id'], r['condition'], r['site'], epoch_index)
            grouped.setdefault(key, []).append(r['temperature_f'])
    out = []
    for (participant_id, condition, site, epoch_index), vals in grouped.items():
        if not vals:
            continue
        start, end = epochs[epoch_index]
        out.append({
            'participant_id': participant_id,
            'condition': condition,
            'site': site,
            'epoch_index': epoch_index,
            'epoch_start_s': start,
            'epoch_end_s': end,
            'mean_temperature_f': sum(vals) / len(vals),
            'n': len(vals),
        })
    return out


def _summarize_rhi_hf(temp_records, vividness_records):
    participants_with_data = sorted({r['participant_id'] for r in temp_records})
    epoch_means = _compute_rhi_hf_epoch_means(temp_records)
    agg = {}
    for m in epoch_means:
        key = (m['condition'], m['site'], m['epoch_index'])
        agg.setdefault(key, []).append(m['mean_temperature_f'])
    group_means = []
    for (condition, site, epoch_index), vals in agg.items():
        n = len(vals)
        mean = sum(vals) / n
        var = sum((v - mean) ** 2 for v in vals) / (n - 1) if n > 1 else 0.0
        sd = var ** 0.5
        sem = sd / (n ** 0.5) if n > 1 else 0.0
        start, end = RHI_HF_EPOCHS_S[epoch_index]
        group_means.append({
            'condition': condition,
            'site': site,
            'epoch_index': epoch_index,
            'epoch_start_s': start,
            'epoch_end_s': end,
            'n': n,
            'mean': mean,
            'sd': sd,
            'sem': sem,
        })

    by_time = {}
    for v in vividness_records:
        by_time.setdefault(v['time_s'], []).append(v['rating'])
    vividness_means = []
    for time_s in sorted(by_time):
        vals = by_time[time_s]
        n = len(vals)
        mean = sum(vals) / n
        var = sum((v - mean) ** 2 for v in vals) / (n - 1) if n > 1 else 0.0
        sem = (var ** 0.5) / (n ** 0.5) if n > 1 else 0.0
        vividness_means.append({'time_s': time_s, 'n': n, 'mean': mean, 'sem': sem})

    return {
        'temp_record_count': len(temp_records),
        'vividness_record_count': len(vividness_records),
        'participant_count': len(participants_with_data),
        'participants': participants_with_data,
        'epoch_means_by_participant': epoch_means,
        'epoch_means_group': group_means,
        'vividness_over_time': vividness_means,
    }


def _fetch_rhi_hf_sheet_data():
    sheet_url = RHI_HF_SHEET_URL
    participants = {}
    try:
        ph, pr = _fetch_google_sheet_tab_values(sheet_url, RHI_HF_PARTICIPANTS_TAB)
        participants = _participant_metadata_from_rows(ph, pr)
    except Exception:
        app.logger.exception('rhi-handfoot participants tab failed')
    data_headers, data_rows = _fetch_google_sheet_tab_values(sheet_url, RHI_HF_DATA_TAB)
    temp_records = _parse_rhi_hf_data_rows(data_headers, data_rows, participants_by_subject=participants)
    vividness_records = []
    try:
        vh, vr = _fetch_google_sheet_tab_values(sheet_url, RHI_HF_VIVIDNESS_TAB)
        vividness_records = _parse_rhi_hf_vividness_rows(vh, vr, temp_records, participants_by_subject=participants)
    except Exception:
        app.logger.exception('rhi-handfoot vividness tab failed')
    ambient = {}
    try:
        amh, amr = _fetch_google_sheet_tab_values(sheet_url, RHI_HF_LOCATIONAL_TAB)
        ambient = _parse_rhi_hf_ambient_rows(amh, amr, temp_records, participants_by_subject=participants)
    except Exception:
        app.logger.exception('rhi-handfoot ambient tab failed')
    summary = _summarize_rhi_hf(temp_records, vividness_records)
    return temp_records, vividness_records, participants, ambient, summary


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


@app.get('/research/GrabNose')
@require_results_auth
def grab_nose_page():
    return send_from_directory(os.path.join(app.root_path, 'static', 'research', 'GrabNose'), 'index.html')


@app.get('/research/GrabNose/')
@require_results_auth
def grab_nose_page_slash():
    return grab_nose_page()


@app.get('/research/MovementIllusions')
@require_results_auth
def movement_illusions_page():
    return send_from_directory(os.path.join(app.root_path, 'static', 'research', 'MovementIllusions'), 'index.html')


@app.get('/research/MovementIllusions/')
@require_results_auth
def movement_illusions_page_slash():
    return movement_illusions_page()


@app.get('/research/RHITempHandFoot')
@require_results_auth
def rhi_handfoot_page():
    return send_from_directory(os.path.join(app.root_path, 'static', 'research', 'RHITempHandFoot'), 'index.html')


@app.get('/research/RHITempHandFoot/')
@require_results_auth
def rhi_handfoot_page_slash():
    return rhi_handfoot_page()


@app.get('/research/<path:filename>')
@require_results_auth
def research_assets(filename):
    base_dir = os.path.join(app.root_path, 'static', 'research')
    return send_from_directory(base_dir, filename)


@app.get('/api/research/rhi-temp-handfoot/data')
@require_results_auth
def rhi_handfoot_data():
    try:
        temp_records, vividness_records, participants, ambient, summary = _fetch_rhi_hf_sheet_data()
    except Exception:
        app.logger.exception('rhi-handfoot source sheet load failed')
        return jsonify({
            'status': 'error',
            'error': 'Could not load RHI hand+foot records from the source Google Sheet',
            'service_account_email': _google_service_account_email(),
        }), 502
    return jsonify({
        'status': 'ok',
        'source': 'google-sheet',
        'sheet_url': RHI_HF_SHEET_URL,
        'epochs_s': RHI_HF_EPOCHS_S,
        'sites': RHI_HF_SITES,
        'conditions': RHI_HF_CONDITIONS,
        'timepoints_s': RHI_HF_TIMEPOINTS_S,
        'participants': participants,
        'ambient': ambient,
        'records': temp_records,
        'vividness': vividness_records,
        'summary': summary,
    })


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
            upstream_error = ''
            try:
                upstream_error = e.response.text
            except Exception:
                upstream_error = ''
            service_account_email = _google_service_account_email()
            message = "Google Sheets API request failed"
            if status_code in (401, 403):
                message = "Google Sheets API does not have access to this sheet"
            return jsonify({
                "status": "error",
                "error": message,
                "upstream_status": status_code,
                "upstream_error": upstream_error[:1000],
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


@app.get('/api/research/grab-nose/data')
@require_results_auth
def grab_nose_data():
    try:
        records = _fetch_grab_nose_sheet_records()
    except Exception as e:
        app.logger.exception('grab-nose source sheet load failed')
        return jsonify({
            'status': 'error',
            'error': 'Could not load grab-nose records from the source Google Sheet',
            'service_account_email': _google_service_account_email(),
        }), 502
    return jsonify({
        'status': 'ok',
        'source': 'google-sheet',
        'records': records,
        'summary': _summarize_grab_nose(records),
    })


@app.post('/api/research/grab-nose/clear')
@require_results_auth
def grab_nose_clear():
    _clear_grab_nose_records()
    records = []
    return jsonify({
        'status': 'ok',
        'cleared': True,
        'records': records,
        'summary': _summarize_grab_nose(records),
    })


@app.post('/api/research/grab-nose/entry')
@require_results_auth
def grab_nose_entry():
    body = request.get_json(silent=True) or {}
    user = session.get('user') or {}
    collector = user.get('email') or user.get('name') or user.get('sub') or ''
    record = _new_grab_nose_record(
        body.get('participant_id') or body.get('participant_name'),
        body.get('participant_name') or body.get('participant_id'),
        body.get('starting_angle'),
        body.get('ending_angle'),
        angle_difference=body.get('angle_difference'),
        attempts=body.get('attempts'),
        age=body.get('age'),
        sex=body.get('sex'),
        location=body.get('location'),
        comments=body.get('comments') or body.get('notes'),
        source='manual',
        collector=collector,
    )
    if not record:
        return jsonify({"status": "error", "error": "starting and ending angles are required"}), 400
    _append_grab_nose_records([record])
    records = _load_grab_nose_records()
    return jsonify({
        'status': 'ok',
        'added': 1,
        'records': records,
        'summary': _summarize_grab_nose(records),
    })


@app.post('/api/research/grab-nose/import-sheet')
@require_results_auth
def grab_nose_import_sheet():
    user = session.get('user') or {}
    collector = user.get('email') or user.get('name') or user.get('sub') or ''
    body = request.get_json(silent=True) or {}
    sheet_url = body.get('url') or body.get('sheet_url') or ''
    if not str(sheet_url).strip():
        return jsonify({"status": "error", "error": "Google Sheet URL is required"}), 400

    try:
        headers, rows, sheet_title = _fetch_google_sheet_values(sheet_url)
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
            try:
                upstream_error = e.response.text
            except Exception:
                upstream_error = ''
            message = "Google Sheets API request failed"
            if status_code in (401, 403):
                message = "Google Sheets API does not have access to this sheet"
            return jsonify({
                "status": "error",
                "error": message,
                "upstream_status": status_code,
                "upstream_error": upstream_error[:1000],
                "service_account_email": _google_service_account_email(),
            }), 502
        app.logger.exception('grab-nose google sheet import failed')
        return jsonify({"status": "error", "error": "Google Sheet import failed"}), 500

    records = _parse_grab_nose_rows(headers, rows, collector=collector)
    if not records:
        return jsonify({
            "status": "error",
            "error": "No grab-nose angle rows found in the Google Sheet tab",
            "sheet_title": sheet_title,
        }), 400
    _append_grab_nose_records(records)
    all_records = _load_grab_nose_records()
    return jsonify({
        'status': 'ok',
        'imported': len(records),
        'sheet_title': sheet_title,
        'records': all_records,
        'summary': _summarize_grab_nose(all_records),
    })


@app.get('/api/research/grab-nose/export.csv')
@require_results_auth
def grab_nose_export_csv():
    records = _load_grab_nose_records()
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=GRAB_NOSE_CSV_FIELDS, extrasaction='ignore')
    writer.writeheader()
    for record in records:
        writer.writerow(record)
    resp = Response(buf.getvalue(), mimetype='text/csv')
    ts = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    resp.headers['Content-Disposition'] = f'attachment; filename="grab-nose-{ts}.csv"'
    return resp


# ---- RESEARCH: Finger EMG video response analysis ----
FINGER_EMG_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/u/0/folders/1Cy7k1XoaeUnDM5AKn-EoVq70p2kTmrtV'
FINGER_EMG_PARTICIPANT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1SiTJao8CUXHAUaL0aOs6J2KWYRChEV9DGytwjWotTMA/edit?gid=0#gid=0'
FINGER_EVENT_DEBOUNCE_SEC = 0.18


def _finger_emg_dir():
    return os.path.join(UPLOAD_DIRECTORY, 'research', 'finger-emg')


def _finger_emg_raw_dir():
    return os.path.join(_finger_emg_dir(), 'raw')


def _finger_emg_manifest_path():
    return os.path.join(_finger_emg_dir(), 'manifest.json')


def _finger_emg_summary_path():
    return os.path.join(_finger_emg_dir(), 'summary.json')


def _ensure_finger_emg_dir():
    os.makedirs(_finger_emg_raw_dir(), exist_ok=True)


def _safe_slug(value, fallback='unknown'):
    cleaned = re.sub(r'[^a-zA-Z0-9._-]+', '-', str(value or '').strip()).strip('-').lower()
    return cleaned or fallback


def _parse_drive_folder_id(folder_url):
    text = str(folder_url or '').strip()
    match = re.search(r'/folders/([a-zA-Z0-9_-]+)', text)
    if not match:
        raise ValueError('Google Drive folder URL must include /folders/<id>')
    return match.group(1)


def _google_drive_auth():
    if GOOGLE_SHEETS_API_KEY:
        return {}, {'key': GOOGLE_SHEETS_API_KEY}
    service_account = _load_google_service_account()
    if not service_account:
        raise PermissionError(
            'Google Drive credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON '
            'or GOOGLE_APPLICATION_CREDENTIALS and share the folder with that service account email.'
        )
    token = _google_service_account_token_for_scope(service_account, 'https://www.googleapis.com/auth/drive.readonly')
    return {'Authorization': f'Bearer {token}'}, {}


def _drive_list_files(folder_id):
    if not requests:
        raise RuntimeError('requests is not available')
    headers, params = _google_drive_auth()
    pending = [folder_id]
    files = []
    while pending:
        current_folder = pending.pop(0)
        page_token = None
        while True:
            query = f"'{current_folder}' in parents and trashed=false"
            response = requests.get(
                'https://www.googleapis.com/drive/v3/files',
                headers=headers,
                params={
                    **params,
                    'q': query,
                    'fields': 'nextPageToken,files(id,name,mimeType,modifiedTime,size)',
                    'pageSize': 1000,
                    'pageToken': page_token,
                    'supportsAllDrives': 'true',
                    'includeItemsFromAllDrives': 'true',
                },
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json() or {}
            for item in payload.get('files') or []:
                if item.get('mimeType') == 'application/vnd.google-apps.folder':
                    pending.append(item.get('id'))
                else:
                    files.append(item)
            page_token = payload.get('nextPageToken')
            if not page_token:
                break
    return files


def _drive_download_file(file_id):
    headers, params = _google_drive_auth()
    response = requests.get(
        f'https://www.googleapis.com/drive/v3/files/{file_id}',
        headers=headers,
        params={**params, 'alt': 'media', 'supportsAllDrives': 'true'},
        timeout=60,
    )
    response.raise_for_status()
    return response.content


def _finger_load_manifest():
    path = _finger_emg_manifest_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _finger_save_manifest(manifest):
    _ensure_finger_emg_dir()
    with open(_finger_emg_manifest_path(), 'w') as f:
        json.dump(manifest, f, indent=2)


def _finger_session_token_from_name(name):
    text = str(name or '')
    match = re.search(r'finger_([a-f0-9-]{8,})_(\d{8}-\d{6})', text, re.IGNORECASE)
    if match:
        return f"{match.group(1).lower()}_{match.group(2)}", match.group(1).lower(), match.group(2)
    byb_match = re.search(r'(\d{4})-(\d{2})-(\d{2})[_\s](\d{2})\.(\d{2})\.(\d{2})', text)
    if byb_match:
        timestamp = f"{byb_match.group(1)}{byb_match.group(2)}{byb_match.group(3)}-{byb_match.group(4)}{byb_match.group(5)}{byb_match.group(6)}"
        return f"session_{timestamp}", '', timestamp
    timestamp_match = re.search(r'(\d{8}-\d{6})', text)
    timestamp = timestamp_match.group(1) if timestamp_match else 'unknown'
    return f"session_{timestamp}_{_safe_slug(text)[:16]}", '', timestamp


def _finger_guess_role(name, content):
    lower = str(name or '').lower()
    if lower.endswith('.wav'):
        return 'emg'
    if lower.endswith('.json'):
        try:
            parsed = json.loads(content.decode('utf-8', errors='ignore'))
            if isinstance(parsed, dict):
                joined_keys = ' '.join(parsed.keys()).lower()
                if 'event' in joined_keys or 'marker' in joined_keys:
                    return 'events'
            return 'metadata'
        except Exception:
            return 'metadata'
    if lower.endswith('.csv') or lower.endswith('.txt'):
        return 'events'
    return 'misc'


def _finger_sync_drive_files(folder_url):
    folder_id = _parse_drive_folder_id(folder_url)
    _ensure_finger_emg_dir()
    manifest = _finger_load_manifest()
    file_index = manifest.setdefault('files', {})
    synced = 0
    renamed = 0
    listed = _drive_list_files(folder_id)
    for item in listed:
        file_id = item.get('id')
        if not file_id:
            continue
        name = item.get('name') or ''
        modified = item.get('modifiedTime') or ''
        existing = file_index.get(file_id) or {}
        session_token, uuid_token, timestamp_token = _finger_session_token_from_name(name)
        if existing.get('modifiedTime') == modified and os.path.exists(existing.get('local_path', '')):
            # Keep manifest naming/session metadata in sync even when file bytes are unchanged.
            role = existing.get('role') or _finger_guess_role(name, b'')
            existing.update({
                'name': name,
                'session_token': session_token,
                'uuid_token': uuid_token,
                'timestamp_token': timestamp_token,
                'role': role,
            })
            continue
        content = _drive_download_file(file_id)
        role = _finger_guess_role(name, content)
        ext = os.path.splitext(name)[1].lower() or '.bin'
        canonical_name = f"{_safe_slug(session_token)}__{role}__{_safe_slug(file_id)}{ext}"
        local_path = os.path.join(_finger_emg_raw_dir(), canonical_name)
        with open(local_path, 'wb') as f:
            f.write(content)
        previous_local = existing.get('local_path')
        if previous_local and previous_local != local_path and os.path.exists(previous_local):
            try:
                os.remove(previous_local)
                renamed += 1
            except Exception:
                pass
        file_index[file_id] = {
            'name': name,
            'modifiedTime': modified,
            'local_path': local_path,
            'session_token': session_token,
            'uuid_token': uuid_token,
            'timestamp_token': timestamp_token,
            'role': role,
        }
        synced += 1
    _finger_save_manifest(manifest)
    return {'listed': len(listed), 'synced': synced, 'renamed': renamed, 'manifest': manifest}


def _finger_collect_session_files():
    manifest = _finger_load_manifest()
    file_index = (manifest or {}).get('files') or {}
    sessions = {}
    for file_info in file_index.values():
        local_path = file_info.get('local_path')
        if not local_path or not os.path.exists(local_path):
            continue
        session_token = file_info.get('session_token') or 'session_unknown'
        bucket = sessions.setdefault(session_token, {'files': [], 'uuid_token': file_info.get('uuid_token') or '', 'timestamp_token': file_info.get('timestamp_token') or ''})
        bucket['files'].append(file_info)
    return sessions


def _finger_extract_events_from_json(value, out):
    if isinstance(value, dict):
        time_candidates = ('time', 'timestamp', 't', 'seconds', 'second', 'time_sec')
        code_candidates = ('event', 'marker', 'code', 'value', 'event_code', 'label')
        time_value = None
        code_value = None
        for key in time_candidates:
            if key in value:
                time_value = value.get(key)
                break
        for key in code_candidates:
            if key in value:
                code_value = value.get(key)
                break
        try:
            t = float(time_value)
            code = int(float(code_value))
            out.append((t, code))
        except Exception:
            pass
        for child in value.values():
            _finger_extract_events_from_json(child, out)
    elif isinstance(value, list):
        if len(value) >= 2:
            try:
                t = float(value[0])
                code = int(float(value[1]))
                out.append((t, code))
            except Exception:
                pass
        for child in value:
            _finger_extract_events_from_json(child, out)


def _finger_extract_events(session_files):
    events = []
    for file_info in session_files:
        role = file_info.get('role')
        if role not in ('events', 'metadata'):
            continue
        path = file_info.get('local_path')
        if not path or not os.path.exists(path):
            continue
        name = file_info.get('name') or ''
        if str(name).lower().endswith('.json'):
            try:
                with open(path) as f:
                    payload = json.load(f)
                _finger_extract_events_from_json(payload, events)
            except Exception:
                continue
        else:
            try:
                with open(path) as f:
                    for line in f:
                        match = re.search(r'(-?\d+(?:\.\d+)?)[,\s;]+(-?\d+(?:\.\d+)?)', line)
                        if not match:
                            continue
                        events.append((float(match.group(1)), int(float(match.group(2)))))
            except Exception:
                continue
    events.sort(key=lambda row: row[0])
    debounced = []
    last_by_code = {}
    for t, code in events:
        prev_t = last_by_code.get(code)
        if prev_t is not None and (t - prev_t) < FINGER_EVENT_DEBOUNCE_SEC:
            continue
        debounced.append((t, code))
        last_by_code[code] = t
    return debounced


def _finger_extract_trial_order(session_files):
    def walk(value):
        if isinstance(value, dict):
            ordered_keys = [str(k).strip().lower() for k in value.keys()]
            if set(ordered_keys) >= {'control', 'experiment'}:
                try:
                    control_order = int(float(value.get('control')))
                    experiment_order = int(float(value.get('experiment')))
                    return ['control', 'experiment'] if control_order <= experiment_order else ['experiment', 'control']
                except Exception:
                    pass
            if set(ordered_keys) >= {'control', 'gross'}:
                try:
                    control_order = int(float(value.get('control')))
                    gross_order = int(float(value.get('gross')))
                    return ['control', 'experiment'] if control_order <= gross_order else ['experiment', 'control']
                except Exception:
                    pass
            for child in value.values():
                result = walk(child)
                if result:
                    return result
            return None
        if isinstance(value, list):
            labels = []
            for item in value:
                text = str(item).strip().lower()
                if text in ('control', 'non-gross', 'nongross'):
                    labels.append('control')
                elif text in ('experiment', 'gross'):
                    labels.append('experiment')
                if len(labels) >= 2:
                    return labels[:2]
            for child in value:
                result = walk(child)
                if result:
                    return result
            return None
        return None

    for file_info in session_files:
        if file_info.get('role') != 'metadata':
            continue
        path = file_info.get('local_path')
        if not path or not os.path.exists(path):
            continue
        if not str(path).lower().endswith('.json'):
            continue
        try:
            with open(path) as f:
                payload = json.load(f)
            result = walk(payload)
            if result and len(result) >= 2:
                return result[:2]
        except Exception:
            continue
    return []


def _finger_wav_read(path):
    with wave.open(path, 'rb') as wf:
        channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        fs = wf.getframerate()
        frames = wf.getnframes()
        raw = wf.readframes(frames)
    if channels < 1:
        raise ValueError('WAV file has no channels')
    if sample_width == 2:
        fmt = '<' + ('h' * (frames * channels))
        data = struct.unpack(fmt, raw)
        scale = 32768.0
    elif sample_width == 1:
        fmt = '<' + ('B' * (frames * channels))
        unsigned = struct.unpack(fmt, raw)
        data = [v - 128 for v in unsigned]
        scale = 128.0
    else:
        raise ValueError('Only 8-bit and 16-bit PCM WAV files are supported')
    ch1 = []
    ch2 = []
    for index in range(frames):
        base = index * channels
        ch1.append(float(data[base]) / scale)
        ch2.append(float(data[base + 1]) / scale if channels > 1 else 0.0)
    return fs, ch1, ch2


def _biquad_coeffs_highpass(fs, cutoff_hz, q=0.707):
    w0 = 2 * math.pi * cutoff_hz / fs
    cos_w0 = math.cos(w0)
    sin_w0 = math.sin(w0)
    alpha = sin_w0 / (2 * q)
    b0 = (1 + cos_w0) / 2
    b1 = -(1 + cos_w0)
    b2 = (1 + cos_w0) / 2
    a0 = 1 + alpha
    a1 = -2 * cos_w0
    a2 = 1 - alpha
    return (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)


def _biquad_coeffs_lowpass(fs, cutoff_hz, q=0.707):
    w0 = 2 * math.pi * cutoff_hz / fs
    cos_w0 = math.cos(w0)
    sin_w0 = math.sin(w0)
    alpha = sin_w0 / (2 * q)
    b0 = (1 - cos_w0) / 2
    b1 = 1 - cos_w0
    b2 = (1 - cos_w0) / 2
    a0 = 1 + alpha
    a1 = -2 * cos_w0
    a2 = 1 - alpha
    return (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)


def _biquad_coeffs_notch(fs, center_hz, q=30.0):
    w0 = 2 * math.pi * center_hz / fs
    cos_w0 = math.cos(w0)
    sin_w0 = math.sin(w0)
    alpha = sin_w0 / (2 * q)
    b0 = 1
    b1 = -2 * cos_w0
    b2 = 1
    a0 = 1 + alpha
    a1 = -2 * cos_w0
    a2 = 1 - alpha
    return (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)


def _apply_biquad(signal, coeffs):
    b0, b1, b2, a1, a2 = coeffs
    out = []
    x1 = x2 = 0.0
    y1 = y2 = 0.0
    for x0 in signal:
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out.append(y0)
        x2, x1 = x1, x0
        y2, y1 = y1, y0
    return out


def _filter_emg(signal, fs):
    filtered = _apply_biquad(signal, _biquad_coeffs_highpass(fs, 300.0))
    filtered = _apply_biquad(filtered, _biquad_coeffs_lowpass(fs, 1000.0))
    harmonic = 60.0
    while harmonic < (fs * 0.5):
        filtered = _apply_biquad(filtered, _biquad_coeffs_notch(fs, harmonic))
        harmonic *= 2.0
    return filtered


def _power_trace(signal, fs, start_s, end_s, win_s=0.25, step_s=0.05):
    start_i = max(0, int(start_s * fs))
    end_i = min(len(signal), int(end_s * fs))
    if end_i <= start_i + 4:
        return []
    win = max(8, int(win_s * fs))
    step = max(1, int(step_s * fs))
    out = []
    i = start_i
    while (i + win) <= end_i:
        segment = signal[i:i + win]
        mean_power = sum(v * v for v in segment) / len(segment)
        out.append({'t': (i - start_i) / fs, 'p': mean_power})
        i += step
    return out


def _sample_trace_at(trace, t, default=None):
    if not trace:
        return default
    if t <= trace[0]['t']:
        return trace[0]['p']
    if t >= trace[-1]['t']:
        return trace[-1]['p']
    lo = 0
    hi = len(trace) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if trace[mid]['t'] < t:
            lo = mid
        else:
            hi = mid
    t0 = trace[lo]['t']
    t1 = trace[hi]['t']
    if t1 <= t0:
        return trace[lo]['p']
    ratio = (t - t0) / (t1 - t0)
    return trace[lo]['p'] + ratio * (trace[hi]['p'] - trace[lo]['p'])


def _window_mean_power(trace, start_s, end_s):
    vals = [point['p'] for point in trace if start_s <= point['t'] <= end_s]
    return (sum(vals) / len(vals)) if vals else None


def _finger_valid_participants(sheet_url):
    headers, rows, _ = _fetch_google_sheet_values(sheet_url)
    valid_entries = []
    for values in rows:
        row = {str(headers[i] if i < len(headers) else f'column_{i + 1}'): values[i] for i in range(len(values))}
        valid_flag = _find_row_value(row, ('valid', 'is_valid', 'include', 'usable', 'good_data', 'good data'))
        exclude_flag = _find_row_value(row, ('exclude', 'excluded', 'drop', 'invalid'))
        is_valid = _is_truthy(valid_flag) or (str(valid_flag or '').strip().lower() in ('valid', 'yes', 'y', '1', 'true'))
        is_excluded = _is_truthy(exclude_flag)
        if is_excluded or not is_valid:
            continue
        participant_id = str(_find_row_value(row, ('participant_id', 'subject', 'uuid', 'id', 'user_id')) or '').strip()
        participant_name = str(_find_row_value(row, ('name', 'participant_name')) or participant_id).strip()
        valid_entries.append({'participant_id': participant_id, 'participant_name': participant_name})
    tokens = { _clean_key(item.get('participant_id')) for item in valid_entries if item.get('participant_id') }
    return valid_entries, tokens


def _looks_like_uuid_token(value):
    token = _clean_key(value or '')
    return bool(re.fullmatch(r'[a-f0-9]{8}-[a-f0-9-]{9,}', token))


def _finger_analyze_session(session_token, session, valid_tokens):
    emg_files = [file_info for file_info in session.get('files', []) if file_info.get('role') == 'emg']
    if not emg_files:
        return None
    wav_path = emg_files[0].get('local_path')
    if not wav_path or not os.path.exists(wav_path):
        return None
    fs, ch1, ch2 = _finger_wav_read(wav_path)
    duration_s = len(ch1) / fs if fs else 0
    if duration_s < 2:
        return None
    events = _finger_extract_events(session.get('files', []))
    white_starts = [t for t, code in events if code == 5]
    if not white_starts:
        return None
    white_start = white_starts[0]
    condition_markers = [t for t, code in events if code in (3, 4) and t > white_start]
    if len(condition_markers) < 2:
        # Fallback for older recordings where one marker appears before event 5.
        condition_markers = [t for t, code in events if code in (3, 4)]
    if len(condition_markers) < 2:
        return None
    first_start = condition_markers[0]
    second_start = condition_markers[1]
    if second_start <= first_start:
        return None
    trial_order = _finger_extract_trial_order(session.get('files', []))
    if not trial_order:
        trial_order = ['control', 'experiment']

    first_end = second_start
    second_end = duration_s
    if first_end <= first_start + 0.5 or second_end <= second_start + 0.5:
        return None

    windows = {
        trial_order[0]: (first_start, first_end),
        trial_order[1]: (second_start, second_end),
    }
    control_start, control_end = windows.get('control', (first_start, first_end))
    experiment_start, experiment_end = windows.get('experiment', (second_start, second_end))
    if experiment_end <= experiment_start + 0.5 or control_end <= control_start + 0.5:
        return None

    uuid_token = _clean_key(session.get('uuid_token') or '')
    if valid_tokens and uuid_token:
        # Some participant sheets list human-readable IDs (e.g. names) instead of UUIDs.
        # Only enforce strict UUID allow-listing when the allow-list itself contains UUID-like IDs.
        has_uuid_like_allow_list = any(_looks_like_uuid_token(token) for token in valid_tokens)
        if has_uuid_like_allow_list and uuid_token not in valid_tokens:
            return None

    f1 = _filter_emg(ch1, fs)
    f2 = _filter_emg(ch2, fs)
    trace1 = _power_trace(f1, fs, 0, duration_s)
    trace2 = _power_trace(f2, fs, 0, duration_s)
    control_mean_1 = _window_mean_power(trace1, control_start, control_end)
    control_mean_2 = _window_mean_power(trace2, control_start, control_end)
    experiment_mean_1 = _window_mean_power(trace1, experiment_start, experiment_end)
    experiment_mean_2 = _window_mean_power(trace2, experiment_start, experiment_end)
    if control_mean_1 is None or experiment_mean_1 is None:
        return None

    def normalized_trace(trace, start, end, max_points=240):
        points = [row for row in trace if start <= row['t'] <= end]
        if len(points) <= max_points:
            return [{'t': row['t'] - start, 'p': row['p']} for row in points]
        step = max(1, len(points) // max_points)
        subset = points[::step][:max_points]
        return [{'t': row['t'] - start, 'p': row['p']} for row in subset]

    peri_window = (-2.0, 8.0)
    peri_step = 0.05
    peri_times = []
    current = peri_window[0]
    while current <= peri_window[1] + 1e-9:
        peri_times.append(round(current, 3))
        current += peri_step

    def peri_trace(trace, center):
        return [{'t': t, 'p': _sample_trace_at(trace, center + t)} for t in peri_times]

    return {
        'session_id': session_token,
        'uuid_token': session.get('uuid_token') or '',
        'timestamp_token': session.get('timestamp_token') or '',
        'sample_rate_hz': fs,
        'duration_s': duration_s,
        'event_count': len(events),
        'events': [{'time': t, 'code': code} for t, code in events[:100]],
        'trial_order': trial_order,
        'control_start_s': control_start,
        'control_end_s': control_end,
        'white_start_s': white_start,
        'experiment_start_s': experiment_start,
        'experiment_end_s': experiment_end,
        'control_mean_power_ch1': control_mean_1,
        'control_mean_power_ch2': control_mean_2,
        'experiment_mean_power_ch1': experiment_mean_1,
        'experiment_mean_power_ch2': experiment_mean_2,
        'control_trace_ch1': normalized_trace(trace1, control_start, control_end),
        'control_trace_ch2': normalized_trace(trace2, control_start, control_end),
        'experiment_trace_ch1': normalized_trace(trace1, experiment_start, experiment_end),
        'experiment_trace_ch2': normalized_trace(trace2, experiment_start, experiment_end),
        'perievent_control_ch1': peri_trace(trace1, control_start),
        'perievent_control_ch2': peri_trace(trace2, control_start),
        'perievent_experiment_ch1': peri_trace(trace1, experiment_start),
        'perievent_experiment_ch2': peri_trace(trace2, experiment_start),
    }


def _finger_mean(values):
    clean = [float(v) for v in values if v is not None and math.isfinite(float(v))]
    if not clean:
        return None
    return sum(clean) / len(clean)


def _finger_group_perievent(sessions, key):
    by_time = {}
    for session in sessions:
        for row in session.get(key) or []:
            by_time.setdefault(row['t'], []).append(row['p'])
    return [{'t': t, 'p': _finger_mean(values)} for t, values in sorted(by_time.items()) if values]


def _finger_build_summary(participant_sheet_url=FINGER_EMG_PARTICIPANT_SHEET_URL):
    sessions_by_token = _finger_collect_session_files()
    valid_entries, valid_tokens = _finger_valid_participants(participant_sheet_url)
    sessions = []
    for session_token in sorted(sessions_by_token.keys()):
        analyzed = _finger_analyze_session(session_token, sessions_by_token[session_token], valid_tokens)
        if analyzed:
            sessions.append(analyzed)

    participant_by_token = {}
    for entry in valid_entries:
        participant_by_token[_clean_key(entry.get('participant_id'))] = entry
    for session in sessions:
        info = participant_by_token.get(_clean_key(session.get('uuid_token')))
        session['participant_id'] = (info or {}).get('participant_id', session.get('uuid_token') or session.get('session_id'))
        session['participant_name'] = (info or {}).get('participant_name', session['participant_id'])

    group = {
        'n_sessions': len(sessions),
        'mean_control_power_ch1': _finger_mean([row.get('control_mean_power_ch1') for row in sessions]),
        'mean_control_power_ch2': _finger_mean([row.get('control_mean_power_ch2') for row in sessions]),
        'mean_experiment_power_ch1': _finger_mean([row.get('experiment_mean_power_ch1') for row in sessions]),
        'mean_experiment_power_ch2': _finger_mean([row.get('experiment_mean_power_ch2') for row in sessions]),
        'perievent_control_ch1': _finger_group_perievent(sessions, 'perievent_control_ch1'),
        'perievent_control_ch2': _finger_group_perievent(sessions, 'perievent_control_ch2'),
        'perievent_experiment_ch1': _finger_group_perievent(sessions, 'perievent_experiment_ch1'),
        'perievent_experiment_ch2': _finger_group_perievent(sessions, 'perievent_experiment_ch2'),
    }
    if group['mean_control_power_ch1'] is not None and group['mean_experiment_power_ch1'] is not None:
        group['delta_power_ch1'] = group['mean_experiment_power_ch1'] - group['mean_control_power_ch1']
    else:
        group['delta_power_ch1'] = None
    if group['mean_control_power_ch2'] is not None and group['mean_experiment_power_ch2'] is not None:
        group['delta_power_ch2'] = group['mean_experiment_power_ch2'] - group['mean_control_power_ch2']
    else:
        group['delta_power_ch2'] = None

    summary = {
        'status': 'ok',
        'generated_at': datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        'source': {
            'drive_folder_url': FINGER_EMG_DRIVE_FOLDER_URL,
            'participant_sheet_url': participant_sheet_url
        },
        'valid_participant_count': len(valid_entries),
        'sessions': sessions,
        'group': group,
    }
    _ensure_finger_emg_dir()
    with open(_finger_emg_summary_path(), 'w') as f:
        json.dump(summary, f, indent=2)
    return summary


def _finger_load_summary():
    path = _finger_emg_summary_path()
    if not os.path.exists(path):
        return None
    with open(path) as f:
        data = json.load(f)
        return data if isinstance(data, dict) else None


@app.get('/research/FingerEMG')
@require_results_auth
def finger_emg_page():
    return send_from_directory(os.path.join(app.root_path, 'static', 'research', 'FingerEMG'), 'index.html')


@app.get('/research/FingerEMG/')
@require_results_auth
def finger_emg_page_slash():
    return finger_emg_page()


@app.get('/api/research/finger-emg/data')
@require_results_auth
def finger_emg_data():
    summary = _finger_load_summary()
    if summary is None:
        summary = _finger_build_summary(FINGER_EMG_PARTICIPANT_SHEET_URL)
    return jsonify(summary)


@app.post('/api/research/finger-emg/sync-drive')
@require_results_auth
def finger_emg_sync_drive():
    body = request.get_json(silent=True) or {}
    folder_url = body.get('folder_url') or FINGER_EMG_DRIVE_FOLDER_URL
    sheet_url = body.get('participant_sheet_url') or FINGER_EMG_PARTICIPANT_SHEET_URL
    try:
        sync_info = _finger_sync_drive_files(folder_url)
        summary = _finger_build_summary(sheet_url)
    except PermissionError as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'service_account_email': _google_service_account_email(),
        }), 400
    except Exception as e:
        app.logger.exception('finger-emg sync failed')
        return jsonify({'status': 'error', 'error': str(e)}), 500
    return jsonify({
        'status': 'ok',
        'sync': sync_info,
        'summary': summary,
    })


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
    # Keep service startup deterministic and avoid debug reloader restarts in production.
    app.run(host='0.0.0.0', port=8000, debug=False, use_reloader=False)
