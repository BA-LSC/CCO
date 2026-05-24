# Shared Docker build helpers for deploy scripts. Source from repo root:
#   source deploy/lib/build.sh

# Resolve which compose services to build.
# Prints space-separated service names (e.g. "migrate api" or "web").
cco_resolve_build_services() {
  local mode="auto"
  local since_ref=""

  while (("$#")); do
    case "$1" in
      --all)
        mode="all"
        shift
        ;;
      --api-only)
        mode="api"
        shift
        ;;
      --web-only)
        mode="web"
        shift
        ;;
      --since)
        since_ref="${2:-}"
        shift 2
        ;;
      *)
        echo "Unknown build option: $1" >&2
        return 1
        ;;
    esac
  done

  case "$mode" in
    all)
      printf '%s\n' "migrate api web"
      return 0
      ;;
    api)
      printf '%s\n' "migrate api"
      return 0
      ;;
    web)
      printf '%s\n' "web"
      return 0
      ;;
  esac

  local build_api=0
  local build_web=0
  local compare_ref="${since_ref:-HEAD~1}"

  if ! git rev-parse "$compare_ref" >/dev/null 2>&1; then
    printf '%s\n' "migrate api web"
    return 0
  fi

  local path
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    case "$path" in
      apps/web/*)
        build_web=1
        ;;
      services/api/* | packages/*)
        build_api=1
        ;;
      deploy/Dockerfile.* | deploy/docker-compose*.yml | deploy/lib/build.sh)
        build_api=1
        build_web=1
        ;;
      bun.lock | package.json | apps/web/package.json | services/api/package.json | packages/*/package.json)
        build_api=1
        build_web=1
        ;;
    esac
  done < <(git diff --name-only "$compare_ref" HEAD)

  if (( ! build_api && ! build_web )); then
    build_api=1
    build_web=1
  fi

  if (( build_api )); then
    printf 'migrate api'
    (( build_web )) && printf ' web'
    printf '\n'
  elif (( build_web )); then
    printf '%s\n' "web"
  fi
}

cco_compose_build() {
  local -n _files=$1
  shift
  local services=("$@")

  if ((${#services[@]} == 0)); then
    echo "No services selected for build." >&2
    return 1
  fi

  export DOCKER_BUILDKIT=1
  export COMPOSE_DOCKER_CLI_BUILD=1

  echo "  Services: ${services[*]}"

  if [[ -n "${CCO_BUILD_CACHE_IMAGE:-}" ]]; then
    cco_build_with_registry_cache _files "${services[@]}"
    return $?
  fi

  docker compose "${_files[@]}" build "${services[@]}"
}

cco_build_with_registry_cache() {
  local -n _files=$1
  shift
  local services=("$@")
  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

  local svc
  for svc in "${services[@]}"; do
    local dockerfile target image_ref
    case "$svc" in
      migrate)
        dockerfile="${root}/deploy/Dockerfile.api"
        target="migrate"
        image_ref="${CCO_BUILD_CACHE_IMAGE}-migrate"
        ;;
      api | reconcile)
        dockerfile="${root}/deploy/Dockerfile.api"
        target="runner"
        image_ref="${CCO_BUILD_CACHE_IMAGE}-api"
        ;;
      web)
        dockerfile="${root}/deploy/Dockerfile.web"
        target="runner"
        image_ref="${CCO_BUILD_CACHE_IMAGE}-web"
        ;;
      *)
        echo "Unsupported service for registry cache build: ${svc}" >&2
        return 1
        ;;
    esac

    local build_args=(
      --file "$dockerfile"
      --target "$target"
      --tag "cco-${svc}"
      --cache-from "type=registry,ref=${image_ref}"
      --cache-to "type=registry,ref=${image_ref},mode=max"
      --load
    )

    if [[ "$svc" == "web" ]]; then
      build_args+=(
        --build-arg "NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL:-}"
        --build-arg "NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL:-}"
        --build-arg "CCO_BUILD_ID=${CCO_BUILD_ID:-dev}"
      )
    fi

    docker buildx build "${build_args[@]}" "$root"
  done
}
