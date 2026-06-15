# Deploy the static ISD Structure Tool on Railway via Python's http.server.
# Build context is the repo root; this copies only the isd-tool/ folder.
# The isd-tool service sets RAILWAY_DOCKERFILE_PATH=isd-tool/Dockerfile so this
# is used instead of the repo-root nixpacks build (which is the Flask app).
FROM python:3.12-slim
WORKDIR /site
COPY isd-tool/ /site/
# Railway injects $PORT at runtime; bind all interfaces.
CMD ["sh", "-c", "python3 -m http.server ${PORT:-8080} --bind 0.0.0.0"]
