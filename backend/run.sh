#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
venv_dir="${QMO_VENV_DIR:-$project_dir/.venv}"
requirements_file="$script_dir/requirements.txt"
requirements_snapshot="$venv_dir/.qmo-requirements.txt"

python_command=""
for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
        python_command="$candidate"
        break
    fi
done

if [[ -z "$python_command" ]]; then
    echo "Python 3 is required but was not found. Install Python 3, then run this script again." >&2
    exit 1
fi

if [[ ! -x "$venv_dir/bin/python" ]]; then
    echo "Creating the backend Python environment in $venv_dir"
    "$python_command" -m venv "$venv_dir"
fi

venv_python="$venv_dir/bin/python"

if ! cmp -s "$requirements_file" "$requirements_snapshot" \
    || ! "$venv_python" -c "import fastapi, pydantic, uvicorn" >/dev/null 2>&1; then
    echo "Installing backend dependencies"
    "$venv_python" -m pip install --disable-pip-version-check -r "$requirements_file"
    cp "$requirements_file" "$requirements_snapshot"
fi

echo "Starting QMO API at http://${QMO_BACKEND_HOST:-127.0.0.1}:${QMO_BACKEND_PORT:-8000}"
cd "$project_dir"

uvicorn_arguments=(
    backend.main:app
    --host "${QMO_BACKEND_HOST:-127.0.0.1}"
    --port "${QMO_BACKEND_PORT:-8000}"
)

if [[ -f "$script_dir/.env" ]]; then
    uvicorn_arguments+=(--env-file "$script_dir/.env")
fi

if [[ "${QMO_BACKEND_RELOAD:-1}" == "1" ]]; then
    uvicorn_arguments+=(--reload)
fi

exec "$venv_python" -m uvicorn "${uvicorn_arguments[@]}"
