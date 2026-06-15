# Static ISD Structure Tool served via Python's http.server.
# The isd-tool Railway service sets Root Directory = isd-tool, so the build
# context is this folder and isd-tool/railway.toml selects this Dockerfile.
FROM python:3.12-slim
WORKDIR /site
COPY . /site/
# Railway injects $PORT at runtime; bind all interfaces.
CMD ["sh", "-c", "python3 -m http.server ${PORT:-8080} --bind 0.0.0.0"]
