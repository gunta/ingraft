const std = @import("std");

const Allocator = std.mem.Allocator;
const Io = std.Io;

const dependency_sections = [_][]const u8{
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
};

const ignored_dirs = [_][]const u8{
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
};

const git_trailer_url = "vendor-source-url";
const git_log_format = "%H%x00%cI%x00%(trailers:key=git-subtree-dir,valueonly)%x00%(trailers:key=vendor-source-url,valueonly)%x00%(trailers:key=vendor-source-ref,valueonly)%x00%(trailers:key=vendor-strategy,valueonly)%x00%(trailers:key=vendor-action,valueonly)%x00%(trailers:key=vendor-filter,valueonly)%x00%(trailers:key=vendor-sync-package,valueonly)%x00%(trailers:key=vendor-resolved-ref,valueonly)%x1e";

const Cli = struct {
    root: []const u8,
    npm_registry: []const u8,
};

const Dependency = struct {
    manifestPath: []const u8,
    packageName: []const u8,
    packageSpec: []const u8,
    section: []const u8,
    source: []const u8,
    syncPackage: []const u8,
};

const Candidate = struct {
    manifestPath: []const u8,
    packageName: []const u8,
    packageSpec: []const u8,
    reason: ?[]const u8 = null,
    remoteVersion: ?[]const u8 = null,
    repositoryUrl: ?[]const u8 = null,
    section: []const u8,
    source: []const u8,
    status: []const u8,
    suggestedName: ?[]const u8 = null,
    syncPackage: []const u8,
    version: ?[]const u8 = null,
    versionSource: ?[]const u8 = null,
};

const VersionReport = struct {
    local: []const u8,
    remote: []const u8,
    status: []const u8,
    vendor: []const u8,
};

const Task = struct {
    action: []const u8,
    existingName: ?[]const u8,
    packageNames: []const []const u8,
    primaryPackageName: []const u8,
    repositoryUrl: []const u8,
    suggestedName: ?[]const u8 = null,
    syncPackage: []const u8,
    versions: VersionReport,
};

const Output = struct {
    candidates: []const Candidate,
    tasks: []const Task,
};

const NpmMetadata = struct {
    repositoryUrl: ?[]const u8,
    version: []const u8,
};

const ProjectVersion = struct {
    source: []const u8,
    version: ?[]const u8,
};

const VendoredRepo = struct {
    name: []const u8,
    prefix: []const u8,
    ref: []const u8,
    syncPackage: ?[]const u8,
    url: []const u8,
};

pub fn main(init: std.process.Init) !void {
    const arena = init.arena.allocator();
    const cli = try parseArgs(arena, init);
    const output = try runDeps(arena, init.io, cli);

    var stdout_buffer: [8192]u8 = undefined;
    var stdout_file_writer: Io.File.Writer = .init(.stdout(), init.io, &stdout_buffer);
    var json_writer: std.json.Stringify = .{
        .writer = &stdout_file_writer.interface,
        .options = .{},
    };
    try json_writer.write(output);
    try stdout_file_writer.interface.writeAll("\n");
    try stdout_file_writer.interface.flush();
}

fn runDeps(allocator: Allocator, io: Io, cli: Cli) !Output {
    var root_dir = if (std.fs.path.isAbsolute(cli.root))
        try Io.Dir.openDirAbsolute(io, cli.root, .{ .iterate = true })
    else
        try Io.Dir.cwd().openDir(io, cli.root, .{ .iterate = true });
    defer root_dir.close(io);

    const dependencies = try listDependencies(allocator, io, root_dir);
    var client: std.http.Client = .{
        .allocator = allocator,
        .io = io,
    };
    defer client.deinit();

    const bun_lock_text = root_dir.readFileAlloc(
        io,
        "bun.lock",
        allocator,
        Io.Limit.limited(64 * 1024 * 1024),
    ) catch null;

    var candidates: std.ArrayList(Candidate) = .empty;
    for (dependencies) |dependency| {
        try candidates.append(allocator, try scanDependency(allocator, io, root_dir, &client, cli, bun_lock_text, dependency));
    }

    const repos = try listVendoredRepos(allocator, io, cli.root);
    const vendored_versions = try detectVendoredVersions(allocator, io, cli.root, repos, candidates.items);
    const tasks = try dependencyVendorTasks(allocator, candidates.items, repos, vendored_versions);
    return .{
        .candidates = try candidates.toOwnedSlice(allocator),
        .tasks = tasks,
    };
}

fn listDependencies(allocator: Allocator, io: Io, root_dir: Io.Dir) ![]const Dependency {
    var dependencies: std.ArrayList(Dependency) = .empty;
    defer dependencies.deinit(allocator);

    var walker = try root_dir.walkSelectively(allocator);
    defer walker.deinit();

    while (try walker.next(io)) |entry| {
        switch (entry.kind) {
            .directory => {
                if (!isIgnoredDir(entry.basename)) try walker.enter(io, entry);
            },
            .file => {
                if (std.mem.eql(u8, entry.basename, "package.json")) {
                    appendPackageManifestDependencies(allocator, io, root_dir, entry.path, &dependencies) catch |err| switch (err) {
                        error.OutOfMemory => return error.OutOfMemory,
                        else => {},
                    };
                }
            },
            else => {},
        }
    }

    std.sort.pdq(Dependency, dependencies.items, {}, dependencyLessThan);
    var seen: std.StringHashMap(void) = .init(allocator);
    var deduped: std.ArrayList(Dependency) = .empty;
    for (dependencies.items) |dependency| {
        const key = try std.fmt.allocPrint(allocator, "{s}\x00{s}\x00{s}", .{ dependency.source, dependency.packageName, dependency.packageSpec });
        if (seen.contains(key)) continue;
        try seen.put(key, {});
        try deduped.append(allocator, dependency);
    }
    return deduped.toOwnedSlice(allocator);
}

fn appendPackageManifestDependencies(
    allocator: Allocator,
    io: Io,
    root_dir: Io.Dir,
    manifest_path: []const u8,
    dependencies: *std.ArrayList(Dependency),
) !void {
    const manifest_text = try root_dir.readFileAlloc(
        io,
        manifest_path,
        allocator,
        Io.Limit.limited(8 * 1024 * 1024),
    );
    const parsed = try std.json.parseFromSliceLeaky(std.json.Value, allocator, manifest_text, .{});
    switch (parsed) {
        .object => |object| {
            const manifest_path_copy = try allocator.dupe(u8, manifest_path);
            for (dependency_sections) |section_name| {
                const section_value = object.get(section_name) orelse continue;
                try appendSectionDependencies(allocator, manifest_path_copy, section_name, section_value, dependencies);
            }
        },
        else => {},
    }
}

fn appendSectionDependencies(
    allocator: Allocator,
    manifest_path: []const u8,
    section_name: []const u8,
    section_value: std.json.Value,
    dependencies: *std.ArrayList(Dependency),
) !void {
    switch (section_value) {
        .object => |section| {
            var iterator = section.iterator();
            while (iterator.next()) |entry| {
                const spec = switch (entry.value_ptr.*) {
                    .string => |value| value,
                    else => continue,
                };
                if (std.mem.trim(u8, spec, " \t\r\n").len == 0) continue;
                const package_name = entry.key_ptr.*;
                const source = ecosystemForPackage(package_name);
                const package_name_copy = try allocator.dupe(u8, package_name);
                try dependencies.append(allocator, .{
                    .manifestPath = manifest_path,
                    .packageName = package_name_copy,
                    .packageSpec = try allocator.dupe(u8, spec),
                    .section = section_name,
                    .source = source,
                    .syncPackage = try syncPackageFor(allocator, source, package_name_copy),
                });
            }
        },
        else => {},
    }
}

fn scanDependency(
    allocator: Allocator,
    io: Io,
    root_dir: Io.Dir,
    client: *std.http.Client,
    cli: Cli,
    bun_lock_text: ?[]const u8,
    dependency: Dependency,
) !Candidate {
    const detected = try detectProjectPackageVersion(allocator, io, root_dir, bun_lock_text, dependency.packageName);
    if (std.mem.startsWith(u8, dependency.packageSpec, "npm:")) {
        return unavailableCandidate(dependency, "npm metadata did not include a usable version", detected.source);
    }
    const metadata = fetchProjectMetadata(allocator, client, cli.npm_registry, dependency.packageName, detected);
    const remote_metadata = fetchNpmMetadata(allocator, client, cli.npm_registry, dependency.packageName, "latest");

    var candidate = if (metadata) |value|
        try candidateFromMetadata(allocator, dependency, value)
    else
        unavailableCandidate(dependency, "npm metadata did not include a usable version", detected.source);
    candidate.version = detected.version orelse candidate.version;
    candidate.versionSource = detected.source;
    if (remote_metadata) |value| candidate.remoteVersion = value.version;
    return candidate;
}

fn candidateFromMetadata(allocator: Allocator, dependency: Dependency, metadata: NpmMetadata) !Candidate {
    if (metadata.repositoryUrl) |repository_url| {
        return .{
            .manifestPath = dependency.manifestPath,
            .packageName = dependency.packageName,
            .packageSpec = dependency.packageSpec,
            .remoteVersion = null,
            .repositoryUrl = repository_url,
            .section = dependency.section,
            .source = dependency.source,
            .status = "matched",
            .suggestedName = try suggestedNameFromRepositoryUrl(allocator, repository_url),
            .syncPackage = dependency.syncPackage,
            .version = metadata.version,
            .versionSource = null,
        };
    }
    return .{
        .manifestPath = dependency.manifestPath,
        .packageName = dependency.packageName,
        .packageSpec = dependency.packageSpec,
        .reason = "npm metadata does not include a repository URL",
        .section = dependency.section,
        .source = dependency.source,
        .status = "missing-repository",
        .syncPackage = dependency.syncPackage,
        .version = metadata.version,
        .versionSource = null,
    };
}

fn unavailableCandidate(dependency: Dependency, reason: []const u8, source: []const u8) Candidate {
    return .{
        .manifestPath = dependency.manifestPath,
        .packageName = dependency.packageName,
        .packageSpec = dependency.packageSpec,
        .reason = reason,
        .section = dependency.section,
        .source = dependency.source,
        .status = "metadata-unavailable",
        .syncPackage = dependency.syncPackage,
        .versionSource = source,
    };
}

fn detectProjectPackageVersion(
    allocator: Allocator,
    io: Io,
    root_dir: Io.Dir,
    bun_lock_text: ?[]const u8,
    package_name: []const u8,
) !ProjectVersion {
    const node_modules_path = try std.fmt.allocPrint(allocator, "node_modules/{s}/package.json", .{package_name});
    if (readPackageVersion(allocator, io, root_dir, node_modules_path)) |version| {
        return .{ .source = "node_modules", .version = version };
    }
    if (parseBunLockVersion(allocator, bun_lock_text, package_name)) |version| {
        return .{ .source = "bun-lock", .version = version };
    }
    return .{ .source = "package-json", .version = null };
}

fn readPackageVersion(allocator: Allocator, io: Io, dir: Io.Dir, path: []const u8) ?[]const u8 {
    const text = dir.readFileAlloc(io, path, allocator, Io.Limit.limited(8 * 1024 * 1024)) catch return null;
    const parsed = std.json.parseFromSliceLeaky(std.json.Value, allocator, text, .{}) catch return null;
    const object = switch (parsed) {
        .object => |object| object,
        else => return null,
    };
    const version = jsonString(object.get("version") orelse return null) orelse return null;
    return cleanVersion(allocator, version);
}

fn parseBunLockVersion(allocator: Allocator, bun_lock_text: ?[]const u8, package_name: []const u8) ?[]const u8 {
    const text = bun_lock_text orelse return null;
    const direct = std.fmt.allocPrint(allocator, "\"{s}\": [\"{s}@", .{ package_name, package_name }) catch return null;
    if (versionAfterBunLockPattern(allocator, text, direct)) |version| return version;
    const nested = std.fmt.allocPrint(allocator, "/{s}\": [\"{s}@", .{ package_name, package_name }) catch return null;
    return versionAfterBunLockPattern(allocator, text, nested);
}

fn versionAfterBunLockPattern(allocator: Allocator, text: []const u8, pattern: []const u8) ?[]const u8 {
    const start = (std.mem.indexOf(u8, text, pattern) orelse return null) + pattern.len;
    const tail = text[start..];
    const end = std.mem.indexOfScalar(u8, tail, '"') orelse return null;
    return cleanVersion(allocator, tail[0..end]);
}

fn cleanVersion(allocator: Allocator, value: []const u8) ?[]const u8 {
    const trimmed = std.mem.trim(u8, value, " \t\r\n");
    var start: usize = 0;
    while (start < trimmed.len and !std.ascii.isDigit(trimmed[start])) : (start += 1) {}
    if (start >= trimmed.len) return null;
    var end = start;
    while (end < trimmed.len and trimmed[end] != '(') : (end += 1) {}
    return allocator.dupe(u8, std.mem.trim(u8, trimmed[start..end], " \t\r\n")) catch null;
}

fn fetchProjectMetadata(
    allocator: Allocator,
    client: *std.http.Client,
    registry: []const u8,
    package_name: []const u8,
    detected: ProjectVersion,
) ?NpmMetadata {
    if (detected.version) |version| {
        if (fetchNpmMetadata(allocator, client, registry, package_name, version)) |metadata| return metadata;
    }
    return fetchNpmMetadata(allocator, client, registry, package_name, "latest");
}

fn fetchNpmMetadata(
    allocator: Allocator,
    client: *std.http.Client,
    registry: []const u8,
    package_name: []const u8,
    selector: []const u8,
) ?NpmMetadata {
    const encoded_package = encodePathComponent(allocator, package_name) catch return null;
    const encoded_selector = encodePathComponent(allocator, selector) catch return null;
    const url = std.fmt.allocPrint(allocator, "{s}/{s}/{s}", .{
        trimRightByte(registry, '/'),
        encoded_package,
        encoded_selector,
    }) catch return null;

    var body: std.Io.Writer.Allocating = .init(allocator);
    const result = client.fetch(.{
        .location = .{ .url = url },
        .response_writer = &body.writer,
    }) catch return null;
    const status_code: u16 = @intFromEnum(result.status);
    if (status_code < 200 or status_code >= 300) return null;
    return parseNpmMetadata(allocator, body.written());
}

fn parseNpmMetadata(allocator: Allocator, text: []const u8) ?NpmMetadata {
    const parsed = std.json.parseFromSliceLeaky(std.json.Value, allocator, text, .{}) catch return null;
    const value = switch (parsed) {
        .array => |array| if (array.items.len == 0) return null else array.items[array.items.len - 1],
        else => parsed,
    };
    const object = switch (value) {
        .object => |object| object,
        else => return null,
    };
    const version = tryDupe(allocator, jsonString(object.get("version") orelse return null) orelse return null) orelse return null;
    const repository_url = repositoryUrlFromValue(allocator, object.get("repository"));
    return .{ .repositoryUrl = repository_url, .version = version };
}

fn repositoryUrlFromValue(allocator: Allocator, value: ?std.json.Value) ?[]const u8 {
    const repository = value orelse return null;
    const raw = switch (repository) {
        .string => |text| text,
        .object => |object| jsonString(object.get("url") orelse return null) orelse return null,
        else => return null,
    };
    return normalizeRepositoryUrl(allocator, raw);
}

fn normalizeRepositoryUrl(allocator: Allocator, raw: []const u8) ?[]const u8 {
    var value = std.mem.trim(u8, raw, " \t\r\n");
    if (std.mem.startsWith(u8, value, "git+")) value = value[4..];
    if (std.mem.indexOfScalar(u8, value, '#')) |hash| value = value[0..hash];
    if (value.len == 0) return null;
    return allocator.dupe(u8, value) catch null;
}

fn encodePathComponent(allocator: Allocator, value: []const u8) ![]const u8 {
    const hex = "0123456789ABCDEF";
    var encoded: std.ArrayList(u8) = .empty;
    for (value) |byte| {
        if (std.ascii.isAlphanumeric(byte)) {
            try encoded.append(allocator, byte);
        } else {
            try encoded.append(allocator, '%');
            try encoded.append(allocator, hex[byte >> 4]);
            try encoded.append(allocator, hex[byte & 0x0f]);
        }
    }
    return encoded.toOwnedSlice(allocator);
}

fn suggestedNameFromRepositoryUrl(allocator: Allocator, url: []const u8) ![]const u8 {
    var value = url;
    if (std.mem.indexOfScalar(u8, value, '#')) |hash| value = value[0..hash];
    value = trimRightByte(value, '/');
    const slash = std.mem.lastIndexOfAny(u8, value, "/:") orelse return allocator.dupe(u8, value);
    var name = value[slash + 1 ..];
    if (std.mem.endsWith(u8, name, ".git")) name = name[0 .. name.len - 4];
    name = trimLeftByte(name, '@');
    return allocator.dupe(u8, name);
}

fn listVendoredRepos(allocator: Allocator, io: Io, root: []const u8) ![]const VendoredRepo {
    const grep_arg = try std.fmt.allocPrint(allocator, "--grep=^{s}:", .{git_trailer_url});
    const format_arg = try std.fmt.allocPrint(allocator, "--format={s}", .{git_log_format});
    const result = std.process.run(allocator, io, .{
        .argv = &.{ "git", "log", grep_arg, "--extended-regexp", format_arg },
        .cwd = .{ .path = root },
        .stdout_limit = Io.Limit.limited(32 * 1024 * 1024),
        .stderr_limit = Io.Limit.limited(1024 * 1024),
    }) catch return &.{};
    switch (result.term) {
        .exited => |code| if (code != 0) return &.{},
        else => return &.{},
    }

    var repos: std.ArrayList(VendoredRepo) = .empty;
    var seen: std.StringHashMap(void) = .init(allocator);
    var records = std.mem.splitScalar(u8, result.stdout, 0x1e);
    while (records.next()) |record| {
        const trimmed = std.mem.trim(u8, record, " \t\r\n");
        if (trimmed.len == 0) continue;
        var parts = std.mem.splitScalar(u8, trimmed, 0);
        _ = parts.next();
        _ = parts.next();
        const prefix = std.mem.trim(u8, parts.next() orelse "", " \t\r\n");
        const url = std.mem.trim(u8, parts.next() orelse "", " \t\r\n");
        const ref = nonEmptyOr(std.mem.trim(u8, parts.next() orelse "", " \t\r\n"), "HEAD");
        _ = parts.next();
        const action = std.mem.trim(u8, parts.next() orelse "", " \t\r\n");
        _ = parts.next();
        const sync_package_raw = std.mem.trim(u8, parts.next() orelse "", " \t\r\n");
        if (prefix.len == 0 or url.len == 0 or seen.contains(prefix)) continue;
        try seen.put(try allocator.dupe(u8, prefix), {});
        if (std.mem.eql(u8, action, "remove")) continue;
        try repos.append(allocator, .{
            .name = try basename(allocator, prefix),
            .prefix = try allocator.dupe(u8, prefix),
            .ref = try allocator.dupe(u8, ref),
            .syncPackage = if (sync_package_raw.len == 0) null else try allocator.dupe(u8, sync_package_raw),
            .url = try allocator.dupe(u8, url),
        });
    }
    std.sort.pdq(VendoredRepo, repos.items, {}, repoLessThan);
    return repos.toOwnedSlice(allocator);
}

fn detectVendoredVersions(
    allocator: Allocator,
    io: Io,
    root: []const u8,
    repos: []const VendoredRepo,
    candidates: []const Candidate,
) !std.StringHashMap([]const u8) {
    var versions: std.StringHashMap([]const u8) = .init(allocator);
    for (repos) |repo| {
        const vendor_root_path = try std.fs.path.join(allocator, &.{ root, repo.prefix });
        var vendor_root = if (std.fs.path.isAbsolute(vendor_root_path))
            Io.Dir.openDirAbsolute(io, vendor_root_path, .{ .iterate = true }) catch continue
        else
            Io.Dir.cwd().openDir(io, vendor_root_path, .{ .iterate = true }) catch continue;
        defer vendor_root.close(io);
        for (candidates) |candidate| {
            if (!std.mem.eql(u8, candidate.status, "matched")) continue;
            const version = detectVendoredPackageVersion(allocator, io, vendor_root, candidate.packageName) catch null;
            if (version) |value| {
                const key = try std.fmt.allocPrint(allocator, "{s}\x00{s}", .{ repo.name, candidate.packageName });
                try versions.put(key, value);
            }
        }
    }
    return versions;
}

fn detectVendoredPackageVersion(allocator: Allocator, io: Io, vendor_root: Io.Dir, package_name: []const u8) !?[]const u8 {
    var walker = try vendor_root.walkSelectively(allocator);
    defer walker.deinit();
    while (try walker.next(io)) |entry| {
        switch (entry.kind) {
            .directory => if (!isIgnoredDir(entry.basename)) try walker.enter(io, entry),
            .file => {
                if (!std.mem.eql(u8, entry.basename, "package.json")) continue;
                const text = vendor_root.readFileAlloc(io, entry.path, allocator, Io.Limit.limited(8 * 1024 * 1024)) catch continue;
                const parsed = std.json.parseFromSliceLeaky(std.json.Value, allocator, text, .{}) catch continue;
                const object = switch (parsed) {
                    .object => |object| object,
                    else => continue,
                };
                const name = jsonString(object.get("name") orelse continue) orelse continue;
                if (!std.mem.eql(u8, name, package_name)) continue;
                const version = jsonString(object.get("version") orelse continue) orelse continue;
                return cleanVersion(allocator, version);
            },
            else => {},
        }
    }
    return null;
}

fn dependencyVendorTasks(
    allocator: Allocator,
    candidates: []const Candidate,
    repos: []const VendoredRepo,
    vendored_versions: std.StringHashMap([]const u8),
) ![]const Task {
    var tasks: std.ArrayList(Task) = .empty;
    for (candidates) |candidate| {
        if (!std.mem.eql(u8, candidate.status, "matched") or candidate.repositoryUrl == null) continue;
        const existing = findExistingRepo(candidate, repos);
        const repository_url = candidate.repositoryUrl.?;
        if (findTaskIndex(tasks.items, candidate, existing)) |index| {
            var task = &tasks.items[index];
            const updated_names = try appendName(allocator, task.packageNames, candidate.packageName);
            task.packageNames = updated_names;
            if (shouldDisplayCandidateVersions(candidate, existing)) {
                task.primaryPackageName = candidate.packageName;
                task.syncPackage = candidate.syncPackage;
                task.versions = try packageVersionReport(allocator, candidate, existing, vendored_versions);
            }
            continue;
        }
        try tasks.append(allocator, .{
            .action = if (existing != null) "update" else "add",
            .existingName = if (existing) |repo| repo.name else null,
            .packageNames = try appendName(allocator, &.{}, candidate.packageName),
            .primaryPackageName = candidate.packageName,
            .repositoryUrl = repository_url,
            .suggestedName = candidate.suggestedName,
            .syncPackage = candidate.syncPackage,
            .versions = try packageVersionReport(allocator, candidate, existing, vendored_versions),
        });
    }
    return tasks.toOwnedSlice(allocator);
}

fn findTaskIndex(tasks: []const Task, candidate: Candidate, existing: ?VendoredRepo) ?usize {
    for (tasks, 0..) |task, index| {
        if (existing) |repo| {
            if (std.mem.eql(u8, task.action, "update") and task.existingName != null and std.mem.eql(u8, task.existingName.?, repo.name)) return index;
        } else if (std.mem.eql(u8, task.action, "add") and std.mem.eql(u8, task.repositoryUrl, candidate.repositoryUrl.?)) {
            return index;
        }
    }
    return null;
}

fn appendName(allocator: Allocator, names: []const []const u8, name: []const u8) ![]const []const u8 {
    var updated = try allocator.alloc([]const u8, names.len + 1);
    @memcpy(updated[0..names.len], names);
    updated[names.len] = name;
    return updated;
}

fn findExistingRepo(candidate: Candidate, repos: []const VendoredRepo) ?VendoredRepo {
    for (repos) |repo| {
        if ((repo.syncPackage != null and std.mem.eql(u8, repo.syncPackage.?, candidate.syncPackage)) or
            (repo.syncPackage != null and std.mem.eql(u8, repo.syncPackage.?, candidate.packageName)) or
            (candidate.repositoryUrl != null and std.mem.eql(u8, repo.url, candidate.repositoryUrl.?)))
        {
            return repo;
        }
    }
    return null;
}

fn shouldDisplayCandidateVersions(candidate: Candidate, existing: ?VendoredRepo) bool {
    if (existing) |repo| {
        return std.mem.eql(u8, repo.name, candidate.packageName) or
            (repo.syncPackage != null and std.mem.eql(u8, repo.syncPackage.?, candidate.packageName));
    }
    return false;
}

fn packageVersionReport(
    allocator: Allocator,
    candidate: Candidate,
    existing: ?VendoredRepo,
    vendored_versions: std.StringHashMap([]const u8),
) !VersionReport {
    const local_source = if (candidate.versionSource == null or std.mem.eql(u8, candidate.versionSource.?, "package-json"))
        "package.json range"
    else
        candidate.versionSource.?;
    var vendor_version: ?[]const u8 = null;
    if (existing) |repo| {
        const key = try std.fmt.allocPrint(allocator, "{s}\x00{s}", .{ repo.name, candidate.packageName });
        vendor_version = vendored_versions.get(key);
    }
    const status: []const u8 = if (existing == null)
        "not-vendored"
    else if (candidate.version == null or vendor_version == null)
        "unknown"
    else if (!std.mem.eql(u8, candidate.version.?, vendor_version.?))
        "local-vendor-drift"
    else if (candidate.remoteVersion != null and !std.mem.eql(u8, candidate.remoteVersion.?, candidate.version.?))
        "remote-drift"
    else
        "synced";
    return .{
        .local = try packageVersionLabel(allocator, candidate.packageName, candidate.version, local_source),
        .remote = try packageVersionLabel(allocator, candidate.packageName, candidate.remoteVersion, try std.fmt.allocPrint(allocator, "{s} latest", .{candidate.source})),
        .status = status,
        .vendor = if (existing == null)
            "not vendored"
        else if (vendor_version == null)
            try std.fmt.allocPrint(allocator, "unknown (ref {s})", .{existing.?.ref})
        else
            try packageVersionLabel(allocator, candidate.packageName, vendor_version, "vendored source"),
    };
}

fn packageVersionLabel(allocator: Allocator, package_name: []const u8, version: ?[]const u8, source: []const u8) ![]const u8 {
    return std.fmt.allocPrint(allocator, "{s}@{s} ({s})", .{ package_name, version orelse "unknown", source });
}

fn parseArgs(allocator: Allocator, init: std.process.Init) !Cli {
    const args = try init.minimal.args.toSlice(allocator);
    var root: []const u8 = ".";
    var npm_registry: []const u8 = "https://registry.npmjs.org";

    var index: usize = 1;
    while (index < args.len) : (index += 1) {
        const arg = args[index];
        if (std.mem.eql(u8, arg, "--root") or std.mem.eql(u8, arg, "-r")) {
            index += 1;
            if (index >= args.len) return error.MissingRootPath;
            root = args[index];
            continue;
        }
        if (std.mem.eql(u8, arg, "--npm-registry")) {
            index += 1;
            if (index >= args.len) return error.MissingNpmRegistry;
            npm_registry = args[index];
            continue;
        }
        return error.InvalidArgument;
    }

    return .{ .root = root, .npm_registry = npm_registry };
}

fn isIgnoredDir(name: []const u8) bool {
    inline for (ignored_dirs) |ignored| {
        if (std.mem.eql(u8, name, ignored)) return true;
    }
    return false;
}

fn ecosystemForPackage(name: []const u8) []const u8 {
    if (std.mem.eql(u8, name, "react")) return "react";
    if (std.mem.eql(u8, name, "react-native") or std.mem.startsWith(u8, name, "@react-native/")) return "react-native";
    if (std.mem.eql(u8, name, "expo") or
        std.mem.startsWith(u8, name, "expo-") or
        std.mem.startsWith(u8, name, "@expo/"))
    {
        return "expo";
    }
    return "npm";
}

fn syncPackageFor(allocator: Allocator, ecosystem: []const u8, package_name: []const u8) ![]const u8 {
    if (std.mem.eql(u8, ecosystem, "npm")) return package_name;
    return std.fmt.allocPrint(allocator, "{s}:{s}", .{ ecosystem, package_name });
}

fn dependencyLessThan(_: void, lhs: Dependency, rhs: Dependency) bool {
    const manifest_order = std.mem.order(u8, lhs.manifestPath, rhs.manifestPath);
    if (manifest_order != .eq) {
        if (std.mem.eql(u8, lhs.manifestPath, "package.json")) return true;
        if (std.mem.eql(u8, rhs.manifestPath, "package.json")) return false;
        return manifest_order == .lt;
    }
    const section_order = std.mem.order(u8, lhs.section, rhs.section);
    if (section_order != .eq) return section_order == .lt;
    return std.mem.order(u8, lhs.packageName, rhs.packageName) == .lt;
}

fn repoLessThan(_: void, lhs: VendoredRepo, rhs: VendoredRepo) bool {
    return std.mem.order(u8, lhs.prefix, rhs.prefix) == .lt;
}

fn jsonString(value: std.json.Value) ?[]const u8 {
    return switch (value) {
        .string => |text| text,
        else => null,
    };
}

fn tryDupe(allocator: Allocator, value: []const u8) ?[]const u8 {
    return allocator.dupe(u8, value) catch null;
}

fn basename(allocator: Allocator, path: []const u8) ![]const u8 {
    const trimmed = trimRightByte(path, '/');
    const index = std.mem.lastIndexOfScalar(u8, trimmed, '/') orelse return allocator.dupe(u8, trimmed);
    return allocator.dupe(u8, trimmed[index + 1 ..]);
}

fn nonEmptyOr(value: []const u8, fallback: []const u8) []const u8 {
    return if (value.len == 0) fallback else value;
}

fn trimRightByte(value: []const u8, byte: u8) []const u8 {
    var end = value.len;
    while (end > 0 and value[end - 1] == byte) : (end -= 1) {}
    return value[0..end];
}

fn trimLeftByte(value: []const u8, byte: u8) []const u8 {
    var start: usize = 0;
    while (start < value.len and value[start] == byte) : (start += 1) {}
    return value[start..];
}

test "metadata parser normalizes npm repository forms" {
    var arena_state = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena_state.deinit();

    const metadata = parseNpmMetadata(arena_state.allocator(),
        \\{"version":"1.2.3","repository":{"url":"git+https://github.com/acme/pkg.git#main"}}
    ).?;

    try std.testing.expectEqualStrings("1.2.3", metadata.version);
    try std.testing.expectEqualStrings("https://github.com/acme/pkg.git", metadata.repositoryUrl.?);
}

test "bun lock parser extracts package versions" {
    var arena_state = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena_state.deinit();

    const version = versionAfterBunLockPattern(
        arena_state.allocator(),
        \\{ "packages": { "effect": ["effect@4.0.0-beta.66", ""] } }
    ,
        "\"effect\": [\"effect@",
    ).?;
    try std.testing.expectEqualStrings("4.0.0-beta.66", version);
}
