use ignore::WalkBuilder;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::error::Error;
use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

const IGNORED_DIRS: &[&str] = &[
    ".git",
    ".jj",
    ".moon",
    ".next",
    ".nx",
    ".pants.d",
    ".rush",
    ".turbo",
    ".zig-cache",
    ".gradle",
    "_build",
    "bazel-bin",
    "bazel-out",
    "bazel-testlogs",
    "build",
    "coverage",
    "deps",
    "dist",
    "node_modules",
    "target",
    "vendor",
    "zig-out",
];

const DEPENDENCY_SECTIONS: &[&str] = &[
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
];

#[derive(Clone)]
struct Cli {
    root: PathBuf,
    npm_registry: String,
}

#[derive(Clone)]
struct Dependency {
    manifest_path: String,
    name: String,
    section: String,
    source: String,
    spec: String,
    sync_package: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Candidate {
    manifest_path: String,
    package_name: String,
    package_spec: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    remote_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    repository_url: Option<String>,
    section: String,
    source: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    suggested_name: Option<String>,
    sync_package: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version_source: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Task {
    action: String,
    existing_name: Option<String>,
    package_names: Vec<String>,
    primary_package_name: String,
    repository_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    suggested_name: Option<String>,
    sync_package: String,
    versions: VersionReport,
}

#[derive(Clone, Serialize)]
struct VersionReport {
    local: String,
    remote: String,
    status: String,
    vendor: String,
}

#[derive(Serialize)]
struct Output {
    candidates: Vec<Candidate>,
    tasks: Vec<Task>,
}

#[derive(Clone)]
struct VendoredRepo {
    name: String,
    prefix: String,
    ref_name: String,
    sync_package: Option<String>,
    url: String,
}

#[derive(Clone)]
struct ProjectVersion {
    source: &'static str,
    version: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(untagged)]
enum NpmRepository {
    String(String),
    Object { url: String },
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NpmMetadata {
    repository: Option<NpmRepository>,
    version: String,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let cli = parse_args()?;
    let dependencies = list_project_dependencies(&cli.root)?;
    let agent = ureq::Agent::config_builder()
        .user_agent("ingraft-optimized-deps/0.1")
        .build()
        .into();
    let candidates: Vec<Candidate> = dependencies
        .par_iter()
        .map(|dependency| scan_dependency(&agent, &cli, dependency))
        .collect();
    let repos = list_vendored_repos(&cli.root);
    let vendored_versions = detect_vendored_versions(&cli.root, &repos, &candidates);
    let tasks = dependency_vendor_tasks(&candidates, &repos, &vendored_versions);

    let output = Output { candidates, tasks };
    let stdout = std::io::stdout();
    let mut handle = stdout.lock();
    serde_json::to_writer(&mut handle, &output)?;
    handle.write_all(b"\n")?;
    Ok(())
}

fn parse_args() -> Result<Cli, Box<dyn Error>> {
    let mut args = std::env::args().skip(1);
    let mut root = PathBuf::from(".");
    let mut npm_registry = String::from("https://registry.npmjs.org");
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--root" | "-r" => {
                let Some(value) = args.next() else {
                    return Err("missing value for --root".into());
                };
                root = PathBuf::from(value);
            }
            "--npm-registry" => {
                let Some(value) = args.next() else {
                    return Err("missing value for --npm-registry".into());
                };
                npm_registry = value;
            }
            "--help" | "-h" => {
                println!("Usage: ingraft-deps-rust [--root <path>] [--npm-registry <url>]");
                std::process::exit(0);
            }
            _ => return Err(format!("unknown argument: {arg}").into()),
        }
    }
    Ok(Cli {
        root: root.canonicalize()?,
        npm_registry,
    })
}

fn list_project_dependencies(root: &Path) -> Result<Vec<Dependency>, Box<dyn Error>> {
    let mut dependencies = Vec::new();
    for manifest_path in collect_manifest_paths(root)? {
        dependencies.extend(read_manifest_dependencies(root, &manifest_path)?);
    }

    let mut seen = HashSet::new();
    dependencies.retain(|dependency| {
        seen.insert(format!(
            "{}\0{}\0{}",
            dependency.source, dependency.name, dependency.spec
        ))
    });
    Ok(dependencies)
}

fn collect_manifest_paths(root: &Path) -> Result<Vec<PathBuf>, Box<dyn Error>> {
    let mut paths = Vec::new();
    let mut walker = WalkBuilder::new(root);
    walker.git_ignore(false);
    walker.git_global(false);
    walker.git_exclude(false);
    walker.hidden(false);
    walker.parents(false);
    walker.ignore(false);
    walker.require_git(false);
    walker.threads(std::thread::available_parallelism().map_or(1, |count| count.get()));
    walker.filter_entry(|entry| {
        entry
            .file_type()
            .is_none_or(|file_type| !file_type.is_dir())
            || !is_ignored_name(entry.file_name())
    });

    for result in walker.build() {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        if entry
            .file_type()
            .is_none_or(|file_type| !file_type.is_file())
        {
            continue;
        }
        if entry.path().file_name() != Some(OsStr::new("package.json")) {
            continue;
        }

        let relative = match entry.path().strip_prefix(root) {
            Ok(path) => path,
            Err(_) => continue,
        };
        if is_ignored_manifest_path(relative) {
            continue;
        }
        paths.push(relative.to_path_buf());
    }

    paths.sort_by(|left, right| compare_manifest_paths(left, right));
    Ok(paths)
}

fn compare_manifest_paths(left: &Path, right: &Path) -> Ordering {
    let left_str = normalize_path(left);
    let right_str = normalize_path(right);
    match (left_str.as_str(), right_str.as_str()) {
        ("package.json", "package.json") => Ordering::Equal,
        ("package.json", _) => Ordering::Less,
        (_, "package.json") => Ordering::Greater,
        _ => left_str.cmp(&right_str),
    }
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn is_ignored_manifest_path(path: &Path) -> bool {
    let normalized = normalize_path(path);
    normalized.starts_with("common/temp/")
        || normalized
            .split('/')
            .any(|segment| IGNORED_DIRS.contains(&segment))
}

fn is_ignored_name(name: &OsStr) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    IGNORED_DIRS.contains(&name)
}

fn read_manifest_dependencies(
    root: &Path,
    manifest_path: &Path,
) -> Result<Vec<Dependency>, Box<dyn Error>> {
    let text = fs::read_to_string(root.join(manifest_path))?;
    let value: Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(_) => return Ok(Vec::new()),
    };
    let Some(object) = value.as_object() else {
        return Ok(Vec::new());
    };

    let manifest_path = normalize_path(manifest_path);
    let mut dependencies = Vec::new();
    for section in DEPENDENCY_SECTIONS {
        let Some(section_object) = object.get(*section).and_then(Value::as_object) else {
            continue;
        };
        let ordered: BTreeMap<&str, &Value> = section_object
            .iter()
            .map(|(package_name, spec)| (package_name.as_str(), spec))
            .collect();
        for (package_name, spec) in ordered {
            let Some(spec) = spec.as_str().map(str::trim).filter(|spec| !spec.is_empty()) else {
                continue;
            };
            let source = package_json_dependency_ecosystem(package_name).to_string();
            dependencies.push(Dependency {
                manifest_path: manifest_path.clone(),
                name: package_name.to_string(),
                section: (*section).to_string(),
                source: source.clone(),
                spec: spec.to_string(),
                sync_package: sync_package_name(&source, package_name),
            });
        }
    }
    Ok(dependencies)
}

fn package_json_dependency_ecosystem(package_name: &str) -> &'static str {
    if package_name == "react" {
        "react"
    } else if package_name == "react-native" || package_name.starts_with("@react-native/") {
        "react-native"
    } else if package_name == "expo"
        || package_name.starts_with("expo-")
        || package_name.starts_with("@expo/")
    {
        "expo"
    } else {
        "npm"
    }
}

fn sync_package_name(ecosystem: &str, package_name: &str) -> String {
    if ecosystem == "npm" {
        package_name.to_string()
    } else {
        format!("{ecosystem}:{package_name}")
    }
}

fn scan_dependency(agent: &ureq::Agent, cli: &Cli, dependency: &Dependency) -> Candidate {
    let detected = detect_project_package_version(&cli.root, dependency);
    if dependency.spec.starts_with("npm:") {
        return unavailable_candidate(
            dependency,
            "npm metadata did not include a usable version",
            detected.source,
        );
    }
    let metadata = metadata_for_project_version(agent, &cli.npm_registry, dependency, &detected);
    let remote_metadata = fetch_npm_metadata(agent, &cli.npm_registry, &dependency.name, "latest");

    let mut candidate = match metadata {
        Some(metadata) => candidate_from_metadata(dependency, &metadata),
        None => unavailable_candidate(
            dependency,
            "npm metadata did not include a usable version",
            detected.source,
        ),
    };
    candidate.version = detected.version.clone().or(candidate.version);
    candidate.version_source = Some(detected.source.to_string());
    candidate.remote_version = remote_metadata.map(|metadata| metadata.version);
    candidate
}

fn unavailable_candidate(dependency: &Dependency, reason: &str, source: &str) -> Candidate {
    Candidate {
        manifest_path: dependency.manifest_path.clone(),
        package_name: dependency.name.clone(),
        package_spec: dependency.spec.clone(),
        reason: Some(reason.to_string()),
        remote_version: None,
        repository_url: None,
        section: dependency.section.clone(),
        source: dependency.source.clone(),
        status: "metadata-unavailable".to_string(),
        suggested_name: None,
        sync_package: dependency.sync_package.clone(),
        version: None,
        version_source: Some(source.to_string()),
    }
}

fn candidate_from_metadata(dependency: &Dependency, metadata: &NpmMetadata) -> Candidate {
    let repository_url = metadata.repository.as_ref().and_then(repository_url_value);
    match repository_url {
        Some(repository_url) => Candidate {
            manifest_path: dependency.manifest_path.clone(),
            package_name: dependency.name.clone(),
            package_spec: dependency.spec.clone(),
            reason: None,
            remote_version: None,
            repository_url: Some(repository_url.clone()),
            section: dependency.section.clone(),
            source: dependency.source.clone(),
            status: "matched".to_string(),
            suggested_name: Some(suggested_name_from_repository_url(&repository_url)),
            sync_package: dependency.sync_package.clone(),
            version: Some(metadata.version.clone()),
            version_source: None,
        },
        None => Candidate {
            manifest_path: dependency.manifest_path.clone(),
            package_name: dependency.name.clone(),
            package_spec: dependency.spec.clone(),
            reason: Some("npm metadata does not include a repository URL".to_string()),
            remote_version: None,
            repository_url: None,
            section: dependency.section.clone(),
            source: dependency.source.clone(),
            status: "missing-repository".to_string(),
            suggested_name: None,
            sync_package: dependency.sync_package.clone(),
            version: Some(metadata.version.clone()),
            version_source: None,
        },
    }
}

fn detect_project_package_version(root: &Path, dependency: &Dependency) -> ProjectVersion {
    if let Some(version) =
        read_package_version(&root.join(node_modules_package_path(&dependency.name)))
    {
        return ProjectVersion {
            source: "node_modules",
            version: Some(version),
        };
    }
    if let Some(version) = parse_bun_lock_version(root, &dependency.name) {
        return ProjectVersion {
            source: "bun-lock",
            version: Some(version),
        };
    }
    ProjectVersion {
        source: "package-json",
        version: None,
    }
}

fn read_package_version(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    clean_version(value.get("version")?.as_str()?)
}

fn node_modules_package_path(package_name: &str) -> PathBuf {
    ["node_modules", package_name, "package.json"]
        .iter()
        .collect()
}

fn parse_bun_lock_version(root: &Path, package_name: &str) -> Option<String> {
    let text = fs::read_to_string(root.join("bun.lock")).ok()?;
    let direct = format!("\"{package_name}\": [\"{package_name}@");
    if let Some(version) = version_after_bun_lock_pattern(&text, &direct) {
        return Some(version);
    }
    let nested = format!("/{package_name}\": [\"{package_name}@");
    version_after_bun_lock_pattern(&text, &nested)
}

fn version_after_bun_lock_pattern(text: &str, pattern: &str) -> Option<String> {
    let start = text.find(pattern)? + pattern.len();
    let tail = &text[start..];
    let end = tail.find('"')?;
    clean_version(&tail[..end])
}

fn clean_version(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let start = trimmed.find(|char: char| char.is_ascii_digit())?;
    let version = trimmed[start..]
        .split('(')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if version
        .chars()
        .next()
        .is_some_and(|char| char.is_ascii_digit())
    {
        Some(version)
    } else {
        None
    }
}

fn metadata_for_project_version(
    agent: &ureq::Agent,
    registry: &str,
    dependency: &Dependency,
    detected: &ProjectVersion,
) -> Option<NpmMetadata> {
    detected
        .version
        .as_ref()
        .and_then(|version| fetch_npm_metadata(agent, registry, &dependency.name, version))
        .or_else(|| fetch_npm_metadata(agent, registry, &dependency.name, "latest"))
}

fn fetch_npm_metadata(
    agent: &ureq::Agent,
    registry: &str,
    package_name: &str,
    selector: &str,
) -> Option<NpmMetadata> {
    let url = format!(
        "{}/{}/{}",
        registry.trim_end_matches('/'),
        encode_path_component(package_name),
        encode_path_component(selector)
    );
    let mut response = agent.get(&url).call().ok()?;
    if !response.status().is_success() {
        return None;
    }
    let text = response.body_mut().read_to_string().ok()?;
    parse_npm_metadata(&text)
}

fn parse_npm_metadata(text: &str) -> Option<NpmMetadata> {
    let value: Value = serde_json::from_str(text).ok()?;
    let raw = value
        .as_array()
        .and_then(|items| items.last())
        .unwrap_or(&value);
    serde_json::from_value(raw.clone()).ok()
}

fn encode_path_component(value: &str) -> String {
    utf8_percent_encode(value, NON_ALPHANUMERIC).to_string()
}

fn repository_url_value(repository: &NpmRepository) -> Option<String> {
    let value = match repository {
        NpmRepository::String(value) => value,
        NpmRepository::Object { url } => url,
    };
    normalize_repository_url(value)
}

fn normalize_repository_url(url: &str) -> Option<String> {
    let normalized = url
        .trim()
        .strip_prefix("git+")
        .unwrap_or(url.trim())
        .split('#')
        .next()
        .unwrap_or("")
        .to_string();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn suggested_name_from_repository_url(url: &str) -> String {
    url.split('#')
        .next()
        .unwrap_or(url)
        .trim_end_matches('/')
        .split(&['/', ':'][..])
        .next_back()
        .unwrap_or(url)
        .trim_end_matches(".git")
        .trim_start_matches('@')
        .to_string()
}

fn list_vendored_repos(root: &Path) -> Vec<VendoredRepo> {
    let format = "%H%x00%cI%x00%(trailers:key=git-subtree-dir,valueonly)%x00%(trailers:key=vendor-source-url,valueonly)%x00%(trailers:key=vendor-source-ref,valueonly)%x00%(trailers:key=vendor-strategy,valueonly)%x00%(trailers:key=vendor-action,valueonly)%x00%(trailers:key=vendor-filter,valueonly)%x00%(trailers:key=vendor-sync-package,valueonly)%x00%(trailers:key=vendor-resolved-ref,valueonly)%x1e";
    let pretty = format!("--format=format:{format}");
    let output = Command::new("git")
        .args(["log", &pretty])
        .current_dir(root)
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut by_prefix: HashMap<String, Option<VendoredRepo>> = HashMap::new();
    for record in stdout
        .split('\x1e')
        .map(str::trim)
        .filter(|record| !record.is_empty())
    {
        let parts: Vec<&str> = record.split('\0').map(str::trim).collect();
        let prefix = parts.get(2).copied().unwrap_or("");
        let url = parts.get(3).copied().unwrap_or("");
        if prefix.is_empty() || url.is_empty() {
            continue;
        }
        if by_prefix.contains_key(prefix) {
            continue;
        }
        let action = parts.get(6).copied().unwrap_or("");
        if action == "remove" {
            by_prefix.insert(prefix.to_string(), None);
            continue;
        }
        let name = prefix
            .trim_end_matches('/')
            .split('/')
            .next_back()
            .unwrap_or("")
            .to_string();
        by_prefix.insert(
            prefix.to_string(),
            Some(VendoredRepo {
                name,
                prefix: prefix.to_string(),
                ref_name: parts
                    .get(4)
                    .copied()
                    .filter(|value| !value.is_empty())
                    .unwrap_or("HEAD")
                    .to_string(),
                sync_package: parts
                    .get(8)
                    .copied()
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                url: url.to_string(),
            }),
        );
    }
    let mut repos: Vec<VendoredRepo> = by_prefix.into_values().flatten().collect();
    repos.sort_by(|left, right| left.prefix.cmp(&right.prefix));
    repos
}

fn detect_vendored_versions(
    root: &Path,
    repos: &[VendoredRepo],
    candidates: &[Candidate],
) -> HashMap<String, String> {
    let mut versions = HashMap::new();
    for repo in repos {
        for candidate in candidates
            .iter()
            .filter(|candidate| candidate.status == "matched")
        {
            if let Some(version) =
                detect_vendored_package_version(root, repo, &candidate.package_name)
            {
                versions.insert(
                    vendored_version_key(&repo.name, &candidate.package_name),
                    version,
                );
            }
        }
    }
    versions
}

fn detect_vendored_package_version(
    root: &Path,
    repo: &VendoredRepo,
    package_name: &str,
) -> Option<String> {
    let vendor_root = root.join(&repo.prefix);
    for manifest_path in collect_manifest_paths_for_vendor(&vendor_root).ok()? {
        let text = fs::read_to_string(vendor_root.join(&manifest_path)).ok()?;
        let value: Value = serde_json::from_str(&text).ok()?;
        let Some(name) = value.get("name").and_then(Value::as_str) else {
            continue;
        };
        if name != package_name {
            continue;
        }
        let Some(version) = value.get("version").and_then(Value::as_str) else {
            continue;
        };
        return clean_version(version);
    }
    None
}

fn collect_manifest_paths_for_vendor(root: &Path) -> Result<Vec<PathBuf>, Box<dyn Error>> {
    let mut paths = Vec::new();
    let mut walker = WalkBuilder::new(root);
    walker.git_ignore(false);
    walker.git_global(false);
    walker.git_exclude(false);
    walker.hidden(false);
    walker.parents(false);
    walker.ignore(false);
    walker.require_git(false);
    walker.filter_entry(|entry| {
        entry
            .file_type()
            .is_none_or(|file_type| !file_type.is_dir())
            || !is_ignored_name(entry.file_name())
    });
    for result in walker.build() {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if entry.path().file_name() != Some(OsStr::new("package.json")) {
            continue;
        }
        if let Ok(relative) = entry.path().strip_prefix(root) {
            paths.push(relative.to_path_buf());
        }
    }
    paths.sort_by(|left, right| compare_manifest_paths(left, right));
    Ok(paths)
}

fn dependency_vendor_tasks(
    candidates: &[Candidate],
    repos: &[VendoredRepo],
    vendored_versions: &HashMap<String, String>,
) -> Vec<Task> {
    let mut order = Vec::new();
    let mut tasks: HashMap<String, Task> = HashMap::new();
    for candidate in candidates
        .iter()
        .filter(|candidate| candidate.status == "matched" && candidate.repository_url.is_some())
    {
        let existing = find_existing_repo(candidate, repos);
        let key = if let Some(existing) = existing {
            format!("update:{}", existing.name)
        } else {
            format!("add:{}", candidate.repository_url.as_ref().unwrap())
        };
        if let Some(task) = tasks.get_mut(&key) {
            task.package_names.push(candidate.package_name.clone());
            if should_display_candidate_versions(candidate, existing) {
                task.primary_package_name = candidate.package_name.clone();
                task.sync_package = candidate.sync_package.clone();
                task.versions = package_version_report(candidate, existing, vendored_versions);
            }
            continue;
        }
        order.push(key.clone());
        tasks.insert(
            key,
            Task {
                action: if existing.is_some() { "update" } else { "add" }.to_string(),
                existing_name: existing.map(|repo| repo.name.clone()),
                package_names: vec![candidate.package_name.clone()],
                primary_package_name: candidate.package_name.clone(),
                repository_url: candidate.repository_url.clone().unwrap(),
                suggested_name: candidate.suggested_name.clone(),
                sync_package: candidate.sync_package.clone(),
                versions: package_version_report(candidate, existing, vendored_versions),
            },
        );
    }
    order
        .into_iter()
        .filter_map(|key| tasks.remove(&key))
        .collect()
}

fn find_existing_repo<'a>(
    candidate: &Candidate,
    repos: &'a [VendoredRepo],
) -> Option<&'a VendoredRepo> {
    repos.iter().find(|repo| {
        repo.sync_package.as_deref() == Some(candidate.sync_package.as_str())
            || repo.sync_package.as_deref() == Some(candidate.package_name.as_str())
            || Some(repo.url.as_str()) == candidate.repository_url.as_deref()
    })
}

fn should_display_candidate_versions(
    candidate: &Candidate,
    existing: Option<&VendoredRepo>,
) -> bool {
    existing.is_some_and(|repo| {
        repo.name == candidate.package_name
            || repo.sync_package.as_deref() == Some(candidate.package_name.as_str())
    })
}

fn package_version_report(
    candidate: &Candidate,
    existing: Option<&VendoredRepo>,
    vendored_versions: &HashMap<String, String>,
) -> VersionReport {
    let local_source = match candidate.version_source.as_deref() {
        None | Some("package-json") => "package.json range",
        Some(source) => source,
    };
    let vendor_version = existing.and_then(|repo| {
        vendored_versions
            .get(&vendored_version_key(&repo.name, &candidate.package_name))
            .cloned()
    });
    let has_vendor = existing.is_some();
    let status = if !has_vendor {
        "not-vendored"
    } else if candidate.version.is_none() || vendor_version.is_none() {
        "unknown"
    } else if candidate.version != vendor_version {
        "local-vendor-drift"
    } else if candidate.remote_version.is_some() && candidate.remote_version != candidate.version {
        "remote-drift"
    } else {
        "synced"
    };
    VersionReport {
        local: package_version_label(
            &candidate.package_name,
            candidate.version.as_deref(),
            local_source,
        ),
        remote: package_version_label(
            &candidate.package_name,
            candidate.remote_version.as_deref(),
            &format!("{} latest", candidate.source),
        ),
        status: status.to_string(),
        vendor: match (existing, vendor_version) {
            (None, _) => "not vendored".to_string(),
            (Some(repo), None) => format!("unknown (ref {})", repo.ref_name),
            (_, Some(version)) => {
                package_version_label(&candidate.package_name, Some(&version), "vendored source")
            }
        },
    }
}

fn package_version_label(package_name: &str, version: Option<&str>, source: &str) -> String {
    format!(
        "{}@{} ({})",
        package_name,
        version.unwrap_or("unknown"),
        source
    )
}

fn vendored_version_key(repo_name: &str, package_name: &str) -> String {
    format!("{repo_name}\0{package_name}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_npm_metadata_repository_forms() {
        let metadata = parse_npm_metadata(
            r#"{"version":"1.2.3","repository":{"url":"git+https://github.com/acme/pkg.git#main"}}"#,
        )
        .expect("metadata");

        let repository = metadata.repository.as_ref().and_then(repository_url_value);
        assert_eq!(metadata.version, "1.2.3");
        assert_eq!(
            repository.as_deref(),
            Some("https://github.com/acme/pkg.git")
        );
    }

    #[test]
    fn parses_bun_lock_versions_without_full_jsonc() {
        let text = r#"{ "packages": { "effect": ["effect@4.0.0-beta.66", ""], "nested/effect": ["effect@3.0.0", ""] } }"#;
        assert_eq!(
            version_after_bun_lock_pattern(text, "\"effect\": [\"effect@").as_deref(),
            Some("4.0.0-beta.66")
        );
    }
}
