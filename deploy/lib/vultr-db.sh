# Vultr managed PostgreSQL (VPC) prompts. Requires database.sh + prompt.sh.

cco_prompt_vultr_database() {
  local env_file="$1"
  echo ""
  echo "Vultr Managed PostgreSQL (VPC)"
  echo "  Vultr panel → Databases → your cluster → Connection Details → VPC"
  echo ""
  local host port user pass db encoded_pass url
  host="$(cco_prompt "VPC host (e.g. vtf-abc123.vultrdb.com)" "")"
  port="$(cco_prompt "Port" "16751")"
  user="$(cco_prompt "Username" "vultradmin")"
  pass="$(cco_prompt_secret "Password")"
  db="$(cco_prompt "Database name" "cco")"

  if [[ -z "$host" || -z "$pass" ]]; then
    echo "VPC host and password are required." >&2
    return 1
  fi

  encoded_pass="$(cco_urlencode "$pass")"
  url="postgresql://${user}:${encoded_pass}@${host}:${port}/${db}"
  url="$(cco_database_normalize_url "$url")"
  cco_env_upsert "DATABASE_URL" "$url" "$env_file"
  cco_env_upsert "EXTERNAL_DATABASE" "1" "$env_file"
}

cco_prompt_external_database_url() {
  local env_file="$1"
  echo ""
  echo "External PostgreSQL — paste a full connection URL."
  echo "  Example: postgresql://user:pass@db.example.com:5432/cco"
  echo ""
  local url
  url="$(cco_prompt "DATABASE_URL" "")"
  if [[ -z "$url" ]]; then
    echo "DATABASE_URL is required." >&2
    return 1
  fi
  url="$(cco_database_normalize_url "$url")"
  cco_env_upsert "DATABASE_URL" "$url" "$env_file"
  cco_env_upsert "EXTERNAL_DATABASE" "1" "$env_file"
}
