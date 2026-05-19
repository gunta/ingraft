use ignore::WalkBuilder;
use serde::Serialize;
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::error::Error;
use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

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

#[derive(Serialize)]
struct Output {
    candidates: Vec<Candidate>,
    tasks: Vec<serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Candidate {
    manifest_path: String,
    package_name: String,
    package_spec: String,
    section: String,
    source: String,
    status: String,
    sync_package: String,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let cwd = parse_root_arg()?;
    let manifest_paths = collect_manifest_paths(&cwd)?;
    let mut candidates = Vec::new();

    for manifest_path in manifest_paths {
        candidates.extend(read_manifest_candidates(&cwd, &manifest_path)?);
    }

    let output = Output {
        candidates,
        tasks: Vec::new(),
    };

    let stdout = std::io::stdout();
    let mut handle = stdout.lock();
    serde_json::to_writer(&mut handle, &output)?;
    handle.write_all(b"\n")?;
    Ok(())
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

    let walker = walker.build();
    for result in walker {
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
    if normalized.starts_with("common/temp/") {
        return true;
    }

    normalized
        .split('/')
        .any(|segment| IGNORED_DIRS.contains(&segment))
}

fn is_ignored_name(name: &OsStr) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    IGNORED_DIRS.contains(&name)
}

fn read_manifest_candidates(
    root: &Path,
    manifest_path: &Path,
) -> Result<Vec<Candidate>, Box<dyn Error>> {
    let absolute_path = root.join(manifest_path);
    let text = fs::read_to_string(absolute_path)?;
    let value: Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(_) => return Ok(Vec::new()),
    };
    let Some(object) = value.as_object() else {
        return Ok(Vec::new());
    };

    let manifest_path = normalize_path(manifest_path);
    let mut candidates = Vec::new();

    for section in DEPENDENCY_SECTIONS {
        let Some(dependencies) = object.get(*section).and_then(Value::as_object) else {
            continue;
        };

        let sorted_dependencies: BTreeMap<&str, &Value> = dependencies
            .iter()
            .map(|(package_name, spec_value)| (package_name.as_str(), spec_value))
            .collect();

        for (package_name, spec_value) in sorted_dependencies {
            let Some(spec) = spec_value.as_str() else {
                continue;
            };
            let spec = spec.trim();
            if spec.is_empty() {
                continue;
            }

            let source = package_json_dependency_ecosystem(package_name);
            candidates.push(Candidate {
                manifest_path: manifest_path.clone(),
                package_name: package_name.to_string(),
                package_spec: spec.to_string(),
                section: (*section).to_string(),
                source: source.to_string(),
                status: "metadata-unavailable".to_string(),
                sync_package: sync_package_name(source, package_name),
            });
        }
    }

    Ok(candidates)
}

fn parse_root_arg() -> Result<PathBuf, Box<dyn Error>> {
    let mut args = std::env::args().skip(1);
    let mut root = PathBuf::from(".");
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--root" | "-r" => {
                let Some(value) = args.next() else {
                    return Err("missing value for --root".into());
                };
                root = PathBuf::from(value);
            }
            "--help" | "-h" => {
                println!("Usage: ingraft-deps-rust [--root <path>]");
                std::process::exit(0);
            }
            _ => return Err(format!("unknown argument: {arg}").into()),
        }
    }
    Ok(root.canonicalize()?)
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
