#!/usr/bin/env python3
"""
Startup script for ml-service on Zoho Catalyst AppSail.

Catalyst's Python 3.10 stack auto-installs requirements.txt during the
BUILD phase — so we do NOT call pip at runtime.  We only attempt a pip
install as a last-resort fallback if a core import fails (e.g. the
build step was skipped or the image was rebuilt without deps).

IMPORTANT: Catalyst AppSail injects the listen port via
           X_ZOHO_CATALYST_LISTEN_PORT.
"""
import os
import sys

# Force unbuffered output so every print/log line streams to Catalyst logs immediately.
os.environ.setdefault("PYTHONUNBUFFERED", "1")


def _deps_available():
    """Quick smoke-test: can we import the heavyweight libraries?"""
    try:
        import flask          # noqa: F401
        import pandas         # noqa: F401
        import sklearn        # noqa: F401
        return True
    except ImportError:
        return False


def install_dependencies():
    """Fallback: install from requirements.txt if the build step missed them."""
    import subprocess
    req_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "requirements.txt")
    print(f"[ml-service] Dependencies missing — installing from {req_file} ...")
    result = subprocess.run(
        [
            sys.executable, "-m", "pip", "install",
            "--quiet",
            "--no-cache-dir",
            "--no-warn-script-location",
            "-r", req_file,
        ],
        cwd=os.path.dirname(os.path.abspath(__file__)),
    )
    if result.returncode != 0:
        print("[ml-service] ERROR: Failed to install dependencies. Aborting.")
        sys.exit(1)
    print("[ml-service] Dependencies installed successfully.")


def start_app():
    """Start the Flask application on the Catalyst-assigned port."""
    port = int(os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT", 9000))
    print(f"[ml-service] Starting Flask on 0.0.0.0:{port} ...")

    from app import app
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    if _deps_available():
        print("[ml-service] Dependencies already installed (build-phase). Skipping pip.")
    else:
        install_dependencies()
    start_app()
