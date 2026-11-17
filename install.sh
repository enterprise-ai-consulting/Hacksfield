#!/usr/bin/env bash
# Install a separate, membership-free local studio. No EAIC accounts or keys are included.
set -euo pipefail

hacksfield_tmp=""
cleanup() { if [[ -n "$hacksfield_tmp" ]]; then rm -rf -- "$hacksfield_tmp"; fi; }
fail() { printf 'Hacksfield: %s\n' "$*" >&2; exit 1; }
download() { curl --fail --silent --show-error --location --retry 2 --proto '=https' --tlsv1.2 "$1" -o "$2"; }

node_supported() {
  local version major minor
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || return 1
  version="$(node --version 2>/dev/null)" || return 1
  [[ "$version" =~ ^v([0-9]+)\.([0-9]+)\. ]] || return 1
  major="${BASH_REMATCH[1]}"; minor="${BASH_REMATCH[2]}"
  (( major > 22 || (major == 22 && minor >= 13) ))
}

main() {
  local install_dir="${HACKSFIELD_INSTALL_DIR:-${HOME}/Hacksfield}"
  local start_app=1 os arch node_version="v24.22.3" filename expected actual node_dir
  case "${1:-}" in
    --no-start) start_app=0; shift ;;
    --help|-h) printf '%s\n' 'Install: bash install.sh [--no-start]' 'Optional: HACKSFIELD_INSTALL_DIR=/path/to/new-folder'; return ;;
  esac
  [[ $# -eq 0 ]] || fail 'Unknown option. Use --help.'
  [[ ! -e "$install_dir" && ! -L "$install_dir" ]] || fail "$install_dir already exists. Nothing was overwritten. Use its start.sh or choose a new HACKSFIELD_INSTALL_DIR."
  for tool in curl tar; do command -v "$tool" >/dev/null 2>&1 || fail "Install $tool first, then run this command again."; done
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) fail 'This installer supports macOS and Linux. See the GitHub README for manual setup.' ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) fail 'This installer supports Intel/AMD 64-bit and ARM64 machines.' ;; esac

  umask 077
  hacksfield_tmp="$(mktemp -d "${TMPDIR:-/tmp}/hacksfield-install.XXXXXX")"
  trap cleanup EXIT
  printf '%s\n' 'Downloading the open-source Hacksfield studio…'
  download 'https://github.com/enterprise-ai-consulting/Hacksfield/archive/refs/heads/main.tar.gz' "$hacksfield_tmp/source.tar.gz"
  mkdir -p "$(dirname "$install_dir")"
  mkdir "$install_dir"
  tar -xzf "$hacksfield_tmp/source.tar.gz" --strip-components=1 -C "$install_dir"
  cd "$install_dir"
  install_dir="$(pwd -P)"
  [[ -f package.json && -f package-lock.json ]] || fail 'The source download did not contain the expected package files.'
  mkdir -p .hacksfield

  if ! node_supported; then
    printf '%s\n' 'Installing a private Node.js runtime for Hacksfield…'
    filename="node-${node_version}-${os}-${arch}.tar.gz"
    download "https://nodejs.org/dist/${node_version}/SHASUMS256.txt" "$hacksfield_tmp/SHASUMS256.txt"
    download "https://nodejs.org/dist/${node_version}/${filename}" "$hacksfield_tmp/node.tar.gz"
    expected="$(awk -v name="$filename" '$2 == name { print $1 }' "$hacksfield_tmp/SHASUMS256.txt")"
    [[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]] || fail 'The official Node.js checksum was missing.'
    if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$hacksfield_tmp/node.tar.gz" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then actual="$(shasum -a 256 "$hacksfield_tmp/node.tar.gz" | awk '{print $1}')"
    else fail 'Install sha256sum or shasum to verify the Node.js download.'; fi
    [[ "$actual" == "$expected" ]] || fail 'Node.js download checksum mismatch. Installation stopped.'
    mkdir -p .hacksfield/runtime
    tar -xzf "$hacksfield_tmp/node.tar.gz" --strip-components=1 -C .hacksfield/runtime
    export PATH="$install_dir/.hacksfield/runtime/bin:$PATH"
    node_supported || fail 'The Node.js runtime could not run on this machine. See the manual setup instructions.'
  fi
  node_dir="$(dirname "$(command -v node)")"
  printf '%s\n' "$node_dir" > .hacksfield/node-bin

  cat > start.sh <<'START'
#!/usr/bin/env bash
set -euo pipefail
app_dir="$(cd "$(dirname "$0")" && pwd)"
node_dir="$(cat "$app_dir/.hacksfield/node-bin")"
export PATH="$node_dir:$PATH"
cd "$app_dir"
[[ -f .next/BUILD_ID ]] || { printf '%s\n' 'Build Hacksfield with npm run build before starting.' >&2; exit 1; }
unset HACKSFIELD_TEAM_EMAILS NEXT_PUBLIC_HACKSFIELD_TEAM_MODE PARALLAX_ORIGIN COOKIE_SECURE
export PARALLAX_PERSONAL_MODE=1 NEXT_PUBLIC_PARALLAX_PERSONAL_MODE=1 NEXT_PUBLIC_PARALLAX_PROVIDER=byteplus
export PARALLAX_DATA_DIR="${HACKSFIELD_DATA_DIR:-$app_dir/data}"
printf '%s\n' "Open http://127.0.0.1:${HACKSFIELD_PORT:-3000} and connect your own provider keys in Generation settings."
exec npm start -- -p "${HACKSFIELD_PORT:-3000}"
START
  chmod 0700 start.sh
  # A fresh personal install must not inherit another installation's team or data settings.
  unset HACKSFIELD_TEAM_EMAILS NEXT_PUBLIC_HACKSFIELD_TEAM_MODE PARALLAX_DATA_DIR PARALLAX_ORIGIN COOKIE_SECURE
  export PARALLAX_PERSONAL_MODE=1 NEXT_PUBLIC_PARALLAX_PERSONAL_MODE=1 NEXT_PUBLIC_PARALLAX_PROVIDER=byteplus
  printf '%s\n' 'Installing locked dependencies without dependency install scripts…'
  npm ci --ignore-scripts --include=dev
  npm run build
  printf '\n%s\n' 'Hacksfield is ready. No membership fee. Bring your own provider keys; provider usage may cost money.'
  printf 'To start this copy again: '; printf '%q\n' "$install_dir/start.sh"
  if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
    printf '%s\n' 'Install FFmpeg and ffprobe for soundtrack extraction and local video tools; see the README.'
  fi
  cleanup; hacksfield_tmp=""; trap - EXIT
  if [[ "$start_app" -eq 1 ]]; then exec "$install_dir/start.sh"; fi
}

main "$@"
