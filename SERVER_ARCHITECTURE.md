# schema.backyardbrains.com Server Architecture

This repo is deployed on the production server at:

```text
/var/www/schema.backyardbrains.com
```

The public domain is:

```text
https://schema.backyardbrains.com
```

## Runtime Pieces

- Nginx terminates HTTPS and routes requests.
- Static experiment files are served directly by nginx from `static/`.
- Flask runs `app.py` behind systemd and handles API-style routes.
- A webhook listener on port `9000` receives GitHub deploy hooks.
- Uploaded data is stored under `uploads/` and exposed by nginx.

## Nginx Routing

Production nginx is configured roughly like this:

```nginx
server {
    server_name schema.backyardbrains.com;

    location / {
       alias /var/www/schema.backyardbrains.com/static/;
    }

    location /uploads/ {
        alias /var/www/schema.backyardbrains.com/uploads/;
        autoindex on;
        autoindex_exact_size off;
        autoindex_localtime on;
    }

    location /data {
        proxy_pass http://127.0.0.1:8000/data;
    }

    location /github-hook/ {
       proxy_pass http://127.0.0.1:9000/hooks/github-deploy-schema.backyardbrains.com;
    }

    location /api/ {
       proxy_pass http://127.0.0.1:8000;
       proxy_http_version 1.1;
       proxy_set_header Host              $host;
       proxy_set_header X-Real-IP         $remote_addr;
       proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/schema.backyardbrains.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/schema.backyardbrains.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = schema.backyardbrains.com) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name schema.backyardbrains.com;
    return 404;
}
```

## Important Consequences

Because `location /` uses `alias /var/www/schema.backyardbrains.com/static/`, most browser page requests are served directly from the filesystem by nginx. They do not hit Flask unless they are routed through `/api/`, `/data`, or another proxied path.

That means:

- Updating static HTML, CSS, or JS usually only requires updating the production checkout.
- Updating Flask routes or API behavior requires restarting the systemd service.
- A Git force-push rollback is not enough by itself if production is already ahead locally. Run `git reset --hard origin/main` on the production checkout.

## Production Commands

Check production git state:

```bash
cd /var/www/schema.backyardbrains.com
git status
git rev-parse --short HEAD
git rev-parse --short origin/main
```

Sync production to GitHub exactly:

```bash
cd /var/www/schema.backyardbrains.com
git fetch origin main
git reset --hard origin/main
```

Restart Flask:

```bash
sudo systemctl restart schema.backyardbrains.com
sudo systemctl status schema.backyardbrains.com
```

## Auth0 Configuration

`app.py` reads Auth0 settings from environment variables at process startup. It also calls `load_dotenv()`, so a `.env` file in `/var/www/schema.backyardbrains.com` can provide those values when systemd starts the app from that working directory.

The required login variables are:

```bash
AUTH0_DOMAIN=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
```

The API/JWT flow also expects:

```bash
AUTH0_AUDIENCE=...
```

If these are missing, `/api/auth/login` returns:

```json
{"error":"auth0 not configured","status":"error"}
```

After changing environment values or `.env`, restart the service:

```bash
sudo systemctl restart schema.backyardbrains.com
```

## Deployment Gotcha

After a force-push rollback, this is not enough:

```bash
git pull
```

If the production branch is ahead of the rewritten remote history, `git pull` can report `Already up to date` while the working tree still has the wrong commits. Use:

```bash
git fetch origin main
git reset --hard origin/main
sudo systemctl restart schema.backyardbrains.com
```
